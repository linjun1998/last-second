import { AudioManager, NearMissTier } from '../audio/AudioManager';
import {
  CHECKPOINT_INTERVAL_ROUNDS,
  CHECKPOINT_SAVE_RATIO,
  EventModifierId,
  getComboChallengeModifiers,
  getMultiplierForRound,
  getRhythmStage,
  LAST_SECOND_SCORE_MULTIPLIER,
  LAST_SECOND_WINDOW_SEC,
  MODIFIER_CONFIGS,
  RhythmStage,
} from '../data/difficultyConfig';
import { EventId } from '../data/eventConfig';
import { SparkSkinId } from '../data/progressionConfig';
import { ActiveEventFrame, HazardEventInstance } from '../events/HazardEvents';
import { HapticIntensity } from '../utils/haptics';
import { loadProgression, settleRunProgression } from '../utils/progressionStorage';
import {
  GameSettings,
  getTodayDailySeed,
  getReviveOfferThreshold,
  loadOnboarding,
  loadRecord,
  loadReviveDeclines,
  saveReviveDeclines,
  OnboardingState,
  saveOnboarding,
  updateRecord,
} from '../utils/storage';
import {
  CLOCK_MONO_FONT,
  CLOCK_SANS_FONT,
  ClockworkPatternSet,
  createClockworkPatterns,
  drawArenaClockDial,
  drawClockworkBackdrop,
  drawClockworkHazard,
  drawHorologicalClueZone,
  drawSafeEscapementZone,
  drawTimeSparkPlayer,
} from './ClockworkRenderer';
import {
  ARENA_RADIUS,
  evaluateHazards,
  HazardShape,
  PLAYER_RADIUS,
} from './CollisionSystem';
import { DifficultyAndEventManager, EventManagerSnapshot } from './EventManager';
import { EnginePhase, HudSnapshot, RunResultSummary } from './GameState';
import { PlayerController } from './PlayerController';
import { ReplaySnapshotFrame, ReplaySystem } from './ReplaySystem';
import { pick, t } from '../i18n';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  isShard?: boolean;
  rotation?: number;
  vRot?: number;
}

interface FlyingBankOrb {
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
}

interface ShockwaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  lineWidth: number;
}

interface FloatingCallout {
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  scale?: number;
}

interface ShadowAnomaly {
  angle: number;
  speed: number;
  arc: number;
  alpha: number;
}

export interface GameEngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onRunFinished: (summary: RunResultSummary) => void;
}

const TWIST_INTRO_MESSAGES: Partial<Record<EventId, string>> = {
  fake_safety: 'engine.twist.fake_safety',
  direction_invert: 'engine.twist.direction_invert',
  darkness_ambush: 'engine.twist.darkness_ambush',
  sudden_drop: 'engine.twist.sudden_drop',
};

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audio: AudioManager;
  private settings: GameSettings;
  private onboarding: OnboardingState;
  private callbacks: GameEngineCallbacks;

  private player = new PlayerController();
  private replay = new ReplaySystem();
  private eventMgr = new DifficultyAndEventManager();
  private currentEvent: HazardEventInstance | null = null;
  private currentModifier: EventModifierId = 'NONE';
  private currentFrame: ActiveEventFrame | null = null;

  private clockPatterns: ClockworkPatternSet = { warningHatch: null, lethalKnurl: null };

  private rafId: number | null = null;
  private lastTimestamp = 0;

  private phase: EnginePhase = 'IDLE_DEMO';
  private round = 1;
  private unsettledScore = 0;
  private safeBankedScore = 0;
  private lastCheckpointDeposit = 0;
  private combo = 0;
  private maxCombo = 0;
  private maxMultiplier = 1;
  private rhythmStage: RhythmStage = 'PRESSURE';
  private stageLabel = '';
  private customSequence?: EventId[];

  private hasUsedRevive = false;
  private reviveDeclines = 0;
  private reviveOfferEligible = false;
  private preRoundEventMgrSnap: EventManagerSnapshot | null = null;
  private preRoundCombo = 0;
  private preRoundMaxCombo = 0;

  private pendingLastSecondSec: number | null = null;
  private lastSecondTriggeredThisRound = false;
  private lastSecondRemainingRecorded: number | null = null;
  private lastSecondCount = 0;
  private consecutiveLastSecond = 0;
  private maxConsecutiveLastSecond = 0;
  private preRoundConsecutiveLastSecond = 0;

  private nearMissTotalCount = 0;
  private anyNearMissThroughRound5 = false;
  private untouchedThroughRound5 = false;
  private horrorEventsCleared = 0;
  private equippedSkin: SparkSkinId = loadProgression().equippedSkin;

  private isRookieProtectedRun = false;
  private preRoundForceNearMiss = false;
  private isRevivingCurrentRound = false;
  private roundShardCollected = false;
  private roundShardCollectedAtSec: number | null = null;
  private shardsCollectedTotal = 0;

  private phaseTimer = 0;
  private slowMoTimer = 0;
  private slowMoFactor = 0.32;
  private hitstopTimer = 0;
  private shakeIntensity = 0;
  private nearMissEdgeFlash = 0;
  private screenTearTimer = 0;
  private reliefBloomProgress = 0;

  // Tactile game-feel & iOS haptic visual compensation state
  private mechanismTime = 0;
  private reviveRewindTimer = 0;
  private deathImpactHoldTimer = 0;
  private deathCrackOrigin: { x: number; y: number } | null = null;
  private screenFlashAlpha = 0;
  private screenFlashColor = '#fde047';
  private hapticKickScale = 0;
  private hapticBezelGlow = 0;
  private chargeMoteTimer = 0;
  private wasMaxChargedThisHold = false;
  private wasBulletTimeAudio = false;

  // Decision phase psychological pressure state
  private decisionElapsedSec = 0;
  private decisionHeartbeatTick = 0;
  private decisionBeatFlash = 0;

  // First-time twist slow-down & callout
  private activeFirstTwistCallout: string | null = null;
  private twistCoachTimer = 0;
  private twistSlowFactor = 0.52;
  private twistSlowThreshold = 1.8;

  private bestNearMissTierThisRound: NearMissTier | null = null;
  private roundClosestMargin = Infinity;
  private currentDangerProximity = Infinity;
  private horrorVariantCounter = 0;
  private warningTickTimer = 0;
  private hudSyncTimer = 0;
  private replaySampleTimer = 0;
  private runElapsedSec = 0;

  private deathReplayFrames: ReplaySnapshotFrame[] = [];
  private deathReplayCursor = 0;
  private pendingDeathResult: RunResultSummary | null = null;

  private flyingOrbs: FlyingBankOrb[] = [];
  private pendingCashOutResult: RunResultSummary | null = null;

  // Pre-allocated pools / capped arrays to minimize GC pauses on mobile
  private particles: Particle[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private callouts: FloatingCallout[] = [];
  private shadows: ShadowAnomaly[] = [];
  private demoPulseTime = 0;

  private scale = 1;
  private centerX = 0;
  private centerY = 0;
  private viewW = 800;
  private viewH = 600;

  constructor(
    canvas: HTMLCanvasElement,
    audio: AudioManager,
    settings: GameSettings,
    callbacks: GameEngineCallbacks
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Canvas 2D context unavailable');
    }
    this.ctx = context;
    this.audio = audio;
    this.settings = { ...settings };
    this.onboarding = loadOnboarding();
    this.reviveDeclines = loadReviveDeclines();
    this.callbacks = callbacks;

    // Hook iOS / non-vibrating browser visual haptic compensation
    this.audio.onVisualHapticCompensation = (intensity) => {
      this.triggerVisualHapticCompensation(intensity);
    };

    this.initShadows();
    this.initAssets();
    this.resize();
  }

  private canFlashAndShake(): boolean {
    return !this.settings.reduceFlashAndShake && !this.settings.reduceMotion;
  }

  private triggerScreenFlash(color: string, alpha: number): void {
    if (!this.canFlashAndShake()) return;
    this.screenFlashColor = color;
    this.screenFlashAlpha = Math.max(this.screenFlashAlpha, alpha);
  }

  private triggerVisualHapticCompensation(intensity: HapticIntensity): void {
    if (!this.canFlashAndShake()) return;
    const kick =
      intensity === 'CRITICAL'
        ? 0.022
        : intensity === 'HEAVY'
        ? 0.015
        : intensity === 'MEDIUM'
        ? 0.009
        : 0.005;
    const glow =
      intensity === 'CRITICAL'
        ? 0.65
        : intensity === 'HEAVY'
        ? 0.48
        : intensity === 'MEDIUM'
        ? 0.32
        : 0.18;
    this.hapticKickScale = Math.max(this.hapticKickScale, kick);
    this.hapticBezelGlow = Math.max(this.hapticBezelGlow, glow);
  }

  private initShadows(): void {
    this.shadows = [
      { angle: 0.4, speed: 0.35, arc: 0.55, alpha: 0.28 },
      { angle: 2.6, speed: -0.45, arc: 0.7, alpha: 0.22 },
      { angle: 4.5, speed: 0.28, arc: 0.45, alpha: 0.24 },
    ];
  }

  private initAssets(): void {
    this.clockPatterns = createClockworkPatterns(this.ctx);
  }

  public updateSettings(settings: GameSettings): void {
    this.settings = { ...settings };
    this.audio.updateSettings(settings);
    if (!settings.decisionPressure) {
      this.audio.stopDecisionHeartbeat();
      this.decisionBeatFlash = 0;
    }
  }

  public setEquippedSkin(skinId: SparkSkinId): void {
    this.equippedSkin = skinId;
  }

  public resize(): void {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const maxDpr = isTouchDevice ? 1.65 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(300, rect.width || window.innerWidth);
    const h = Math.max(300, rect.height || window.innerHeight);

    this.viewW = w;
    this.viewH = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.centerX = w / 2;
    this.centerY = h / 2;
    const minDim = Math.min(w, h);
    this.scale = (minDim * 0.405) / ARENA_RADIUS;
  }

  public startLoop(): void {
    if (this.rafId !== null) return;
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      this.step(dt);
      this.render(this.viewW, this.viewH);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public destroy(): void {
    this.stopLoop();
  }

  public setIdleDemo(): void {
    this.phase = 'IDLE_DEMO';
    this.currentEvent = null;
    this.currentModifier = 'NONE';
    this.currentFrame = null;
    this.player.reset();
    this.particles.length = 0;
    this.shockwaves.length = 0;
    this.callouts.length = 0;
    this.flyingOrbs.length = 0;
    this.deathReplayFrames = [];
    this.currentDangerProximity = Infinity;
    this.nearMissEdgeFlash = 0;
    this.screenTearTimer = 0;
    this.reliefBloomProgress = 0;
    this.activeFirstTwistCallout = null;
    this.pendingLastSecondSec = null;
    this.lastSecondTriggeredThisRound = false;
    this.lastSecondRemainingRecorded = null;
    this.audio.stopCharge();
    this.audio.stopAmbience();
  }

  public startNewRun(options?: { seed?: string; customSequence?: EventId[] }): void {
    this.audio.unlock();
    this.onboarding = loadOnboarding();
    this.reviveDeclines = loadReviveDeclines();
    this.customSequence = options?.customSequence;

    const careerTotalRuns = loadRecord().totalRuns;
    const isUnseededNormal =
      !options?.seed && (!options?.customSequence || options.customSequence.length === 0);
    const rookieIdx = isUnseededNormal && careerTotalRuns < 3 ? careerTotalRuns : null;
    this.isRookieProtectedRun = rookieIdx !== null;
    this.preRoundForceNearMiss = false;
    this.isRevivingCurrentRound = false;

    this.eventMgr = new DifficultyAndEventManager(
      options?.seed,
      options?.customSequence,
      rookieIdx
    );
    this.replay.reset();
    this.player.reset();

    this.round = 1;
    this.unsettledScore = 0;
    this.safeBankedScore = 0;
    this.lastCheckpointDeposit = 0;
    this.hasUsedRevive = false;
    this.preRoundEventMgrSnap = null;
    this.preRoundCombo = 0;
    this.preRoundMaxCombo = 0;
    this.pendingLastSecondSec = null;
    this.lastSecondTriggeredThisRound = false;
    this.lastSecondRemainingRecorded = null;
    this.lastSecondCount = 0;
    this.consecutiveLastSecond = 0;
    this.maxConsecutiveLastSecond = 0;
    this.preRoundConsecutiveLastSecond = 0;
    this.nearMissTotalCount = 0;
    this.anyNearMissThroughRound5 = false;
    this.untouchedThroughRound5 = false;
    this.horrorEventsCleared = 0;
    this.equippedSkin = loadProgression().equippedSkin;
    this.roundShardCollected = false;
    this.roundShardCollectedAtSec = null;
    this.shardsCollectedTotal = 0;

    this.combo = 0;
    this.maxCombo = 0;
    this.maxMultiplier = 1;
    this.rhythmStage = 'PRESSURE';
    this.particles.length = 0;
    this.shockwaves.length = 0;
    this.callouts.length = 0;
    this.flyingOrbs.length = 0;
    this.deathReplayFrames = [];
    this.pendingDeathResult = null;
    this.pendingCashOutResult = null;
    this.shakeIntensity = 0;
    this.slowMoTimer = 0;
    this.hitstopTimer = 0;
    this.reviveRewindTimer = 0;
    this.deathImpactHoldTimer = 0;
    this.deathCrackOrigin = null;
    this.screenFlashAlpha = 0;
    this.hapticKickScale = 0;
    this.hapticBezelGlow = 0;
    this.wasMaxChargedThisHold = false;
    this.nearMissEdgeFlash = 0;
    this.screenTearTimer = 0;
    this.reliefBloomProgress = 0;
    this.currentDangerProximity = Infinity;
    this.runElapsedSec = 0;
    this.activeFirstTwistCallout = null;

    this.audio.setIntensity('PRESSURE', 1, 1);
    this.audio.startAmbience();

    this.beginRound(1);
  }

  private beginRound(roundNum: number): void {
    this.audio.stopDecisionHeartbeat();
    this.round = roundNum;
    this.bestNearMissTierThisRound = null;
    this.pendingLastSecondSec = null;
    this.lastSecondTriggeredThisRound = false;
    this.lastSecondRemainingRecorded = null;
    this.lastCheckpointDeposit = 0;
    this.roundClosestMargin = Infinity;
    this.currentDangerProximity = Infinity;
    this.warningTickTimer = 0;
    this.replaySampleTimer = 0;
    this.decisionElapsedSec = 0;
    this.activeFirstTwistCallout = null;
    this.twistCoachTimer = 0;

    this.roundShardCollected = false;
    this.roundShardCollectedAtSec = null;

    // Save deterministic pre-round snapshot so 1-per-run Revive replays the exact same round cleanly
    this.preRoundEventMgrSnap = this.eventMgr.snapshot();
    this.preRoundCombo = this.combo;
    this.preRoundMaxCombo = this.maxCombo;
    this.preRoundConsecutiveLastSecond = this.consecutiveLastSecond;

    const forceFirst30sNearMiss = this.isRevivingCurrentRound
      ? this.preRoundForceNearMiss
      : this.isRookieProtectedRun &&
        roundNum === 2 &&
        this.runElapsedSec < 30 &&
        this.replay.getClosestMarginMm() === null;
    this.preRoundForceNearMiss = forceFirst30sNearMiss;
    this.isRevivingCurrentRound = false;

    const mult = getMultiplierForRound(this.round);
    this.maxMultiplier = Math.max(this.maxMultiplier, mult);

    const created = this.eventMgr.createEventForRound(
      this.round,
      this.combo,
      this.settings.reduceScare,
      forceFirst30sNearMiss
    );

    this.currentEvent = created.instance;
    this.currentModifier = created.modifier;
    this.stageLabel = created.stageName;
    this.rhythmStage = getRhythmStage(this.round, this.combo);
    this.audio.setIntensity(this.rhythmStage, this.currentEvent.meta.dangerLevel, this.round);

    // Check if this is the player's VERY FIRST time encountering a Horror / Reversal event!
    const evId = this.currentEvent.id;
    const twistMsg = TWIST_INTRO_MESSAGES[evId];
    if (twistMsg && !this.onboarding.seenTwistIds.includes(evId)) {
      this.onboarding.seenTwistIds = [...this.onboarding.seenTwistIds, evId];
      saveOnboarding(this.onboarding);
      this.activeFirstTwistCallout = t(twistMsg);
      // First encounter = low-risk trial: trick events (fake safety / invert / darkness)
      // get a longer, deeper slow-mo window so the player can learn the rule cheaply.
      const isTrickEvent =
        evId === 'fake_safety' || evId === 'direction_invert' || evId === 'darkness_ambush';
      this.twistCoachTimer = isTrickEvent ? 3.6 : 2.6;
      this.twistSlowFactor = isTrickEvent ? 0.55 : 0.52;
      this.twistSlowThreshold = isTrickEvent ? 1.2 : 1.8;
    }

    // Mark color semantic onboarding seen once player reaches Round 3
    if (this.round >= 3 && !this.onboarding.seenSemanticGuide) {
      this.onboarding.seenSemanticGuide = true;
      saveOnboarding(this.onboarding);
    }

    this.phase = 'ROUND_INTRO';
    this.phaseTimer = 0.36;
    this.currentFrame = null;

    this.spawnShockwave(0, 0, ARENA_RADIUS, 'rgba(34, 211, 238, 0.35)', 0.45, 2);
    this.audio.playWarning(this.currentEvent.meta.dangerLevel);
    this.emitHud(null, null);
  }

  public continueNextRound(): void {
    if (this.phase !== 'DECISION_PAUSE') return;
    this.beginRound(this.round + 1);
  }

  public skipPostRunAnimation(): void {
    if (this.phase === 'DEATH_REPLAY') {
      if (!this.hasUsedRevive) {
        this.phase = 'REVIVE_OFFER';
        this.emitHud(t('engine.reviveBanner'), null);
      } else {
        this.finalizeDefeatAndRecord();
      }
    } else if (this.phase === 'CASHING_OUT_RELIEF' && this.pendingCashOutResult) {
      const res = this.pendingCashOutResult;
      this.pendingCashOutResult = null;
      this.phase = 'CASHED_OUT';
      this.callbacks.onRunFinished(res);
    }
  }

  /**
   * 1-per-run Revive: Restores player to center and restarts the current failed round
   * with all unsettled & checkpoint scores intact and 100% seed determinism preserved.
   */
  public reviveCurrentRound(): boolean {
    if (
      (this.phase !== 'REVIVE_OFFER' && this.phase !== 'DEATH_REPLAY') ||
      this.hasUsedRevive
    ) {
      return false;
    }

    this.hasUsedRevive = true;
    this.reviveDeclines = 0;
    saveReviveDeclines(0);
    if (this.preRoundEventMgrSnap) {
      this.eventMgr.restore(this.preRoundEventMgrSnap);
    }
    this.combo = this.preRoundCombo;
    this.maxCombo = this.preRoundMaxCombo;
    this.consecutiveLastSecond = this.preRoundConsecutiveLastSecond;

    this.player.reset();
    this.particles.length = 0;
    this.shockwaves.length = 0;
    this.deathReplayFrames = [];
    this.pendingDeathResult = null;
    this.deathImpactHoldTimer = 0;
    this.deathCrackOrigin = null;
    this.screenTearTimer = 0;

    this.replay.logMoment({
      round: this.round,
      type: 'REVIVE',
      description: t('engine.reviveMoment', {
        round: this.round,
        score: this.unsettledScore.toLocaleString(),
      }),
    });

    this.audio.playReviveRewind();
    this.audio.startAmbience();
    this.isRevivingCurrentRound = true;
    this.beginRound(this.round);

    // Revive Game-Feel Package: Hitstop + Gear Time-Rewind + Graceful Slow-Mo + Shake + Particles!
    if (!this.settings.reduceMotion) {
      this.hitstopTimer = 0.052;
      this.reviveRewindTimer = 0.48;
      this.slowMoTimer = 0.56;
      this.slowMoFactor = 0.35;
    }
    if (this.canFlashAndShake()) {
      this.shakeIntensity = 7.5;
      this.triggerScreenFlash('#38bdf8', 0.22);
    }
    this.spawnBurst(0, 0, '#38bdf8', 28, 250);
    this.spawnShatterShards(0, 0, 12, '#fde047');
    this.spawnShockwave(0, 0, 105, 'rgba(56, 189, 248, 0.92)', 0.44, 3.2);
    this.spawnShockwave(0, 0, ARENA_RADIUS * 0.85, 'rgba(253, 224, 71, 0.65)', 0.56, 2.2);
    this.addCallout(t('engine.reviveCallout'), 0, -56, '#38bdf8', 1.18);
    this.emitHud(t('engine.reviveHud'), null);
    return true;
  }

  public declineReviveAndFinish(): void {
    if (this.phase !== 'REVIVE_OFFER' && this.phase !== 'DEATH_REPLAY') return;
    if (this.phase === 'REVIVE_OFFER') {
      this.reviveDeclines += 1;
      saveReviveDeclines(this.reviveDeclines);
    }
    this.finalizeDefeatAndRecord();
  }

  public cashOutNow(): void {
    if (this.phase !== 'DECISION_PAUSE' && this.phase !== 'ROUND_INTRO') return;
    const totalScore = this.safeBankedScore + this.unsettledScore;
    if (totalScore <= 0 && this.round <= 1) return;

    const wasIntro = this.phase === 'ROUND_INTRO';
    this.player.cancelInput();
    this.audio.playCashOut();
    this.audio.stopAmbience();

    const survived = wasIntro ? Math.max(1, this.round - 1) : this.round;
    this.replay.finalizeCashOutReplay();
    this.replay.logMoment({
      round: survived,
      type: 'CASH_OUT',
      description: t('engine.cashMoment', {
        round: survived,
        score: totalScore.toLocaleString(),
      }),
    });

    const highlight = this.replay.getHighlightSummary();
    const closestMm = this.replay.getClosestMarginMm();
    const closestTierLabel = this.replay.getClosestTierLabel();
    const prevBest = loadRecord().bestScore;
    const seed = this.eventMgr.getSeed();

    updateRecord({
      score: totalScore,
      lostScore: 0,
      round: survived,
      combo: this.maxCombo,
      multiplier: this.maxMultiplier,
      cashedOut: true,
      closestMm,
      seed,
      highlight,
    });

    const isDailyChallenge = seed === getTodayDailySeed();
    const progressionReport = settleRunProgression({
      outcome: 'CASHED_OUT',
      survivedRounds: survived,
      finalScore: totalScore,
      maxCombo: this.maxCombo,
      closestMm,
      shardsCollectedInArena: this.shardsCollectedTotal,
      lastSecondCount: this.lastSecondCount,
      maxConsecutiveLastSecond: this.maxConsecutiveLastSecond,
      nearMissTotalCount: this.nearMissTotalCount,
      untouchedThroughRound5: this.untouchedThroughRound5,
      horrorEventsCleared: this.horrorEventsCleared,
      reviveUsed: this.hasUsedRevive,
      isDailyChallenge,
    });

    this.pendingCashOutResult = {
      outcome: 'CASHED_OUT',
      survivedRounds: survived,
      finalScore: totalScore,
      safeBankedScore: this.safeBankedScore,
      lostUnsettledScore: 0,
      maxMultiplier: this.maxMultiplier,
      maxCombo: this.maxCombo,
      closestMm,
      closestTierLabel,
      highlightSummary: highlight,
      missedClueSummary: null,
      shardsCollected: this.shardsCollectedTotal,
      closestSnapshot: this.replay.getClosestCallSnapshot(),
      replayReel: this.replay.getReplayReel(),
      moments: this.replay.getMoments(),
      seed,
      isDailyChallenge,
      customSequence: this.customSequence,
      isNewBest: totalScore > prevBest && totalScore > 0,
      reviveUsed: this.hasUsedRevive,
      lastSecondCount: this.lastSecondCount,
      equippedSkin: this.equippedSkin,
      progressionReport,
    };

    this.phase = 'CASHING_OUT_RELIEF';
    this.phaseTimer = 1.15;
    this.reliefBloomProgress = 0.01;
    this.spawnShockwave(
      this.player.state.x,
      this.player.state.y,
      ARENA_RADIUS * 1.15,
      'rgba(52, 211, 153, 0.85)',
      0.75,
      3.5
    );
    this.spawnBurst(this.player.state.x, this.player.state.y, '#34d399', 36, 260);
    this.addCallout(
      t('engine.cashCallout', { score: totalScore.toLocaleString() }),
      0,
      -40,
      '#6ee7b7',
      1.25
    );

    const targetArenaX = (this.viewW * 0.36) / this.scale;
    const targetArenaY = (-this.viewH * 0.4) / this.scale;
    for (let i = 0; i < 18; i++) {
      const jitterX = (Math.random() - 0.5) * 75;
      const jitterY = (Math.random() - 0.5) * 75;
      this.flyingOrbs.push({
        x: this.player.state.x,
        y: this.player.state.y,
        startX: this.player.state.x + jitterX,
        startY: this.player.state.y + jitterY,
        targetX: targetArenaX,
        targetY: targetArenaY,
        progress: -i * 0.03,
        speed: 1.5 + Math.random() * 0.35,
      });
    }

    this.emitHud(t('engine.cashHud'), null);
  }

  public handlePointerDown(pointerId: number, clientX: number, clientY: number): void {
    if (this.phase === 'DEATH_REPLAY' || this.phase === 'CASHING_OUT_RELIEF') {
      return;
    }
    if (this.phase !== 'ACTIVE_HAZARD' && this.phase !== 'ROUND_INTRO') return;
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const ax = (sx - this.centerX) / this.scale;
    const ay = (sy - this.centerY) / this.scale;

    const started = this.player.onPointerDown(pointerId, sx, sy, ax, ay);
    if (started) {
      this.wasMaxChargedThisHold = false;
      this.chargeMoteTimer = 0;
      this.audio.startCharge();
      this.emitHud(null, null);
    }
  }

  public handlePointerMove(pointerId: number, clientX: number, clientY: number): void {
    if (this.phase !== 'ACTIVE_HAZARD' && this.phase !== 'ROUND_INTRO') return;
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const ax = (sx - this.centerX) / this.scale;
    const ay = (sy - this.centerY) / this.scale;
    this.player.onPointerMove(pointerId, sx, sy, ax, ay);
  }

  public handlePointerUp(pointerId: number): void {
    if (this.phase !== 'ACTIVE_HAZARD' && this.phase !== 'ROUND_INTRO') {
      this.player.cancelInput();
      this.audio.stopCharge();
      return;
    }
    const originX = this.player.state.x;
    const originY = this.player.state.y;
    const power = this.player.onPointerUp(pointerId);
    if (power !== null) {
      this.wasMaxChargedThisHold = false;
      if (!this.onboarding.completedCoreGuide) {
        this.onboarding.completedCoreGuide = true;
        saveOnboarding(this.onboarding);
      }
      this.audio.playDash(power);
      if (this.canFlashAndShake() && power >= 0.82) {
        this.shakeIntensity = Math.max(this.shakeIntensity, 3.6 * power);
      }
      this.spawnBurst(
        originX,
        originY,
        power >= 0.88 ? '#fde047' : '#38bdf8',
        Math.round(14 + power * 14),
        225
      );
      this.spawnShockwave(
        originX,
        originY,
        44 + power * 42,
        power >= 0.88 ? 'rgba(253, 224, 71, 0.85)' : 'rgba(56, 189, 248, 0.8)',
        0.26,
        2.5
      );

      // Check if player released dash within the final ~0.25s before warning turns lethal!
      const warnRem = this.currentFrame?.warningRemainingSec ?? null;
      if (
        !this.lastSecondTriggeredThisRound &&
        warnRem !== null &&
        warnRem > 0 &&
        warnRem <= LAST_SECOND_WINDOW_SEC + 0.015
      ) {
        this.pendingLastSecondSec = warnRem;
      }

      this.replay.logMoment({
        round: this.round,
        type: 'DASH',
        description: t('engine.dashMoment', { round: this.round }),
      });
      this.emitHud(null, null);
    }
  }

  public handlePointerCancel(): void {
    this.player.cancelInput();
    this.audio.stopCharge();
  }

  private step(rawDt: number): void {
    this.demoPulseTime += rawDt;
    this.runElapsedSec += rawDt;

    for (const s of this.shadows) {
      s.angle += s.speed * rawDt * (this.rhythmStage === 'FRENZY' ? 2.4 : 1);
    }

    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - rawDt * 30);
    }
    if (this.nearMissEdgeFlash > 0) {
      this.nearMissEdgeFlash = Math.max(0, this.nearMissEdgeFlash - rawDt * 2.1);
    }
    if (this.screenTearTimer > 0) {
      this.screenTearTimer = Math.max(0, this.screenTearTimer - rawDt);
    }
    if (this.decisionBeatFlash > 0) {
      this.decisionBeatFlash = Math.max(0, this.decisionBeatFlash - rawDt * 2.8);
    }
    if (this.screenFlashAlpha > 0) {
      this.screenFlashAlpha = Math.max(0, this.screenFlashAlpha - rawDt * 1.65);
    }
    if (this.hapticKickScale > 0) {
      this.hapticKickScale = Math.max(0, this.hapticKickScale - rawDt * 0.14);
    }
    if (this.hapticBezelGlow > 0) {
      this.hapticBezelGlow = Math.max(0, this.hapticBezelGlow - rawDt * 3.4);
    }
    if (this.reviveRewindTimer > 0) {
      this.reviveRewindTimer = Math.max(0, this.reviveRewindTimer - rawDt);
    }

    const inBulletTime = this.slowMoTimer > 0 || this.deathImpactHoldTimer > 0;
    if (inBulletTime !== this.wasBulletTimeAudio) {
      this.wasBulletTimeAudio = inBulletTime;
      this.audio.setBulletTimeAudio(inBulletTime);
    }

    // Hitstop freezes both gameplay simulation AND clockwork gear rotation!
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= rawDt;
      this.updateEffects(rawDt * 0.18);
      return;
    }

    let simDt = rawDt;
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= rawDt;
      simDt = rawDt * this.slowMoFactor;
    } else if (this.twistCoachTimer > 0) {
      this.twistCoachTimer -= rawDt;
      if (this.twistCoachTimer <= 0) {
        this.activeFirstTwistCallout = null;
      } else if (this.twistCoachTimer > this.twistSlowThreshold) {
        simDt = rawDt * this.twistSlowFactor;
      }
    } else if (
      !this.onboarding.completedCoreGuide &&
      this.round === 1 &&
      this.phase === 'ACTIVE_HAZARD'
    ) {
      simDt = rawDt * 0.55;
    }

    // Drive Giant Clockwork gears: reverse during Revive rewind, slow during Bullet-Time, normal otherwise!
    if (this.reviveRewindTimer > 0 && !this.settings.reduceMotion) {
      this.mechanismTime -= rawDt * 4.2;
    } else {
      this.mechanismTime += simDt;
    }

    this.updateEffects(this.deathImpactHoldTimer > 0 ? rawDt * 0.42 : rawDt);

    if (this.phase === 'IDLE_DEMO') {
      const orbitAng = this.demoPulseTime * 0.9;
      this.player.state.x = Math.cos(orbitAng) * 38;
      this.player.state.y = Math.sin(orbitAng) * 38;
      this.player.state.aimAngle = orbitAng + Math.PI / 2;
      this.player.state.trail = Array.from({ length: 6 }, (_, i) => {
        const backAng = orbitAng - (6 - i) * 0.14;
        return {
          x: Math.cos(backAng) * 38,
          y: Math.sin(backAng) * 38,
          angle: backAng + Math.PI / 2,
          stretch: 1.05,
          alpha: ((i + 1) / 7) * 0.82,
        };
      });
      return;
    }

    if (this.phase === 'CASHING_OUT_RELIEF') {
      this.reliefBloomProgress = Math.min(1, this.reliefBloomProgress + rawDt * 1.05);
      for (const orb of this.flyingOrbs) {
        orb.progress += rawDt * orb.speed;
        const p = Math.max(0, Math.min(1, orb.progress));
        const ease = p * p * (3 - 2 * p);
        orb.x = orb.startX + (orb.targetX - orb.startX) * ease;
        orb.y = orb.startY + (orb.targetY - orb.startY) * ease - Math.sin(p * Math.PI) * 35;
      }
      this.phaseTimer -= rawDt;
      if (this.phaseTimer <= 0 && this.pendingCashOutResult) {
        const res = this.pendingCashOutResult;
        this.pendingCashOutResult = null;
        this.phase = 'CASHED_OUT';
        this.callbacks.onRunFinished(res);
      }
      return;
    }

    if (this.phase === 'DEATH_REPLAY') {
      // Brief post-hitstop slow-motion shatter collapse before replay rewinds!
      if (this.deathImpactHoldTimer > 0) {
        this.deathImpactHoldTimer -= rawDt;
        return;
      }
      if (this.deathReplayFrames.length === 0) {
        this.skipPostRunAnimation();
        return;
      }
      const curIdx = Math.min(
        this.deathReplayFrames.length - 1,
        Math.floor(this.deathReplayCursor)
      );
      const curFrame = this.deathReplayFrames[curIdx];
      // Review fix: snappier replay playback (was 6.5 / 15 fps) — same slow-mo beats, less waiting.
      const playbackFps = curFrame?.isDecisionPoint ? 10 : 24;
      this.deathReplayCursor += rawDt * playbackFps;

      if (this.deathReplayCursor >= this.deathReplayFrames.length + 3) {
        this.skipPostRunAnimation();
      }
      return;
    }

    if (this.phase === 'ROUND_INTRO') {
      this.player.update(simDt);
      this.checkLandingFeedback();
      if (this.player.state.isCharging) {
        this.updateChargingFeedback(rawDt);
      }
      this.phaseTimer -= simDt;
      if (this.phaseTimer <= 0) {
        this.phase = 'ACTIVE_HAZARD';
        this.emitHud(null, null);
      }
      return;
    }

    if (this.phase === 'ACTIVE_HAZARD' && this.currentEvent) {
      this.player.update(simDt);
      this.checkLandingFeedback();
      if (this.player.state.isCharging) {
        this.updateChargingFeedback(rawDt);
      }

      const frame = this.currentEvent.update(simDt);
      this.currentFrame = frame;

      if (frame.triggerSilence) {
        this.audio.triggerSuddenSilence(950);
      }
      if (frame.deceptionAudioCue) {
        this.audio.playDeceptionCue(frame.deceptionAudioCue);
      }
      if (frame.triggerHorrorSound) {
        this.horrorVariantCounter++;
        this.audio.playHorrorTwist(this.horrorVariantCounter);
        this.spawnShockwave(0, 0, ARENA_RADIUS, 'rgba(244, 63, 94, 0.75)', 0.42, 3);
        if (this.canFlashAndShake()) {
          this.shakeIntensity = Math.max(this.shakeIntensity, 8.5);
        }
      }

      const anyWarning = frame.hazards.some((h) => !h.lethal);
      if (anyWarning) {
        this.warningTickTimer += simDt;
        if (this.warningTickTimer >= 0.42) {
          this.warningTickTimer = 0;
          this.audio.playWarning(this.currentEvent.meta.dangerLevel);
        }
      }

      // Greedy Option: Collectible Time Shard spawned near danger boundary!
      const shard = this.currentEvent.timeShard;
      if (shard && !this.roundShardCollected) {
        const distShard = Math.hypot(
          this.player.state.x - shard.x,
          this.player.state.y - shard.y
        );
        if (distShard <= PLAYER_RADIUS + shard.radius + 4) {
          this.roundShardCollected = true;
          this.roundShardCollectedAtSec = this.runElapsedSec;
          this.shardsCollectedTotal += 1;

          const mult = getMultiplierForRound(this.round);
          const comboMods = getComboChallengeModifiers(this.combo);
          const modMult = MODIFIER_CONFIGS[this.currentModifier].scoreMultiplier;
          const shardGain = Math.round(
            shard.bonusBasePts * comboMods.scoreBonusMultiplier * modMult * mult
          );
          this.unsettledScore += shardGain;

          this.audio.playShardPickup();
          if (!this.settings.reduceMotion) {
            this.slowMoTimer = Math.max(this.slowMoTimer, 0.2);
            this.slowMoFactor = 0.45;
          }
          this.spawnBurst(shard.x, shard.y, '#fbbf24', 24, 240);
          this.spawnShockwave(shard.x, shard.y, 78, 'rgba(251, 191, 36, 0.9)', 0.36, 2.8);
          this.addCallout(
            t('engine.shardCallout', { n: shardGain.toLocaleString() }),
            shard.x,
            shard.y - 26,
            '#fde047',
            1.12
          );
          this.replay.logMoment({
            round: this.round,
            type: 'TIME_SHARD',
            description: t('engine.shardMoment', {
              round: this.round,
              n: shardGain.toLocaleString(),
            }),
          });
          this.emitHud(t('engine.shardHud', { n: shardGain.toLocaleString() }), null);
        }
      }

      const check = evaluateHazards(
        this.player.state.x,
        this.player.state.y,
        PLAYER_RADIUS,
        frame.hazards
      );

      this.currentDangerProximity = Math.min(check.closestDistance, check.closestWarningDistance);

      this.replaySampleTimer += rawDt;
      if (
        this.replaySampleTimer >= 0.065 ||
        check.collided ||
        check.closestDistance < this.roundClosestMargin
      ) {
        this.replaySampleTimer = 0;
        this.replay.pushTimelineSample({
          timestampSec: this.runElapsedSec,
          playerX: this.player.state.x,
          playerY: this.player.state.y,
          aimAngle: this.player.state.aimAngle,
          hazards: frame.hazards,
          safeHints: frame.safeHints,
          clueZones: frame.clueZones,
          timeShard: shard
            ? {
                x: shard.x,
                y: shard.y,
                radius: shard.radius,
                collected: this.roundShardCollected,
              }
            : null,
          closestMarginPx: Math.max(0, check.closestDistance),
          round: this.round,
          eventId: this.currentEvent.id,
          eventName: pick(this.currentEvent.meta.name, this.currentEvent.meta.nameEn),
          label: check.collided
            ? t('engine.labelCollision')
            : check.closestDistance <= 8
            ? t('engine.labelGodlike')
            : check.closestDistance <= 16
            ? t('engine.labelExtreme')
            : check.closestDistance <= 24
            ? t('engine.labelClose')
            : t('engine.labelSafe'),
          isNearMiss: check.closestDistance > 0 && check.closestDistance <= 24,
        });
      }

      if (check.collided) {
        this.pendingLastSecondSec = null;
        this.triggerFailure(frame.hazards);
        return;
      }

      // Confirm "LAST SECOND" escape once hazard activates into lethal phase and player's dash landed safely!
      const anyLethalNow = frame.hazards.some((h) => h.lethal);
      if (
        this.pendingLastSecondSec !== null &&
        !this.lastSecondTriggeredThisRound &&
        anyLethalNow &&
        !this.player.state.isDashing
      ) {
        const sec = Math.max(0.01, this.pendingLastSecondSec);
        this.pendingLastSecondSec = null;
        this.lastSecondTriggeredThisRound = true;
        this.lastSecondRemainingRecorded = sec;
        this.lastSecondCount += 1;

        // "LAST SECOND" Tactile Game-Feel Package: Gear-Lock Hitstop + Bullet-Time + Damped Shake + Golden Spark Burst!
        this.audio.playLastSecondEscape();
        if (!this.settings.reduceMotion) {
          this.hitstopTimer = Math.max(this.hitstopTimer, 0.068);
          this.slowMoTimer = Math.max(this.slowMoTimer, 0.42);
          this.slowMoFactor = Math.min(this.slowMoFactor, 0.25);
        }
        if (this.canFlashAndShake()) {
          this.shakeIntensity = Math.max(this.shakeIntensity, 8.2);
          this.triggerScreenFlash('#fde047', 0.22);
        }
        this.spawnBurst(this.player.state.x, this.player.state.y, '#fde047', 28, 275);
        this.spawnShatterShards(this.player.state.x, this.player.state.y, 12, '#fffbeb');
        this.spawnShockwave(
          this.player.state.x,
          this.player.state.y,
          115,
          'rgba(253, 224, 71, 0.92)',
          0.42,
          3.2
        );
        this.spawnShockwave(
          0,
          0,
          ARENA_RADIUS,
          'rgba(56, 189, 248, 0.55)',
          0.48,
          2.2
        );
        this.addCallout(
          t('engine.lastSecondCallout', { sec: sec.toFixed(2) }),
          this.player.state.x,
          this.player.state.y - 38,
          '#fde047',
          1.24
        );
        this.replay.logMoment({
          round: this.round,
          type: 'LAST_SECOND',
          description: t('engine.lastSecondMoment', {
            round: this.round,
            sec: sec.toFixed(2),
          }),
        });
        this.emitHud(t('engine.lastSecondHud', { sec: sec.toFixed(2) }), null);
      }

      if (check.closestDistance < this.roundClosestMargin) {
        this.roundClosestMargin = check.closestDistance;
      }

      // 3-Tier Near-Miss System
      if (check.closestDistance > 0 && check.closestDistance <= 24) {
        const tier: NearMissTier =
          check.closestDistance < 8
            ? 'GODLIKE'
            : check.closestDistance < 16
            ? 'EXTREME'
            : 'CLOSE';

        const shouldUpgrade =
          this.bestNearMissTierThisRound === null ||
          (this.bestNearMissTierThisRound === 'CLOSE' && tier !== 'CLOSE') ||
          (this.bestNearMissTierThisRound === 'EXTREME' && tier === 'GODLIKE');

        if (shouldUpgrade) {
          const isFirstThisRound = this.bestNearMissTierThisRound === null;
          this.bestNearMissTierThisRound = tier;

          if (!this.settings.reduceMotion) {
            this.hitstopTimer = Math.max(
              this.hitstopTimer,
              tier === 'GODLIKE' ? 0.075 : tier === 'EXTREME' ? 0.05 : 0.028
            );
            this.slowMoTimer = Math.max(
              this.slowMoTimer,
              tier === 'GODLIKE' ? 0.46 : tier === 'EXTREME' ? 0.32 : 0.22
            );
            this.slowMoFactor = tier === 'GODLIKE' ? 0.21 : tier === 'EXTREME' ? 0.33 : 0.45;
          }
          if (this.canFlashAndShake()) {
            this.shakeIntensity = Math.max(
              this.shakeIntensity,
              tier === 'GODLIKE' ? 12.5 : tier === 'EXTREME' ? 8 : 4.5
            );
            this.nearMissEdgeFlash = tier === 'GODLIKE' ? 0.95 : tier === 'EXTREME' ? 0.68 : 0.42;
            if (tier === 'GODLIKE') {
              this.triggerScreenFlash('#f43f5e', 0.18);
            }
          }

          if (isFirstThisRound) {
            this.combo += 1;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
          }

          this.audio.playNearMiss(tier, this.combo);
          const mm = Math.max(0.1, +(check.closestDistance * 0.25).toFixed(1));
          const tierColor =
            tier === 'GODLIKE' ? '#f43f5e' : tier === 'EXTREME' ? '#fde047' : '#38bdf8';
          const tierName = t(
            tier === 'GODLIKE'
              ? 'engine.tierGodlike'
              : tier === 'EXTREME'
              ? 'engine.tierExtreme'
              : 'engine.tierClose'
          );

          this.spawnBurst(
            this.player.state.x,
            this.player.state.y,
            tierColor,
            tier === 'GODLIKE' ? 34 : 22,
            265
          );
          this.spawnShatterShards(
            this.player.state.x,
            this.player.state.y,
            tier === 'GODLIKE' ? 12 : 7,
            tierColor
          );
          this.spawnShockwave(
            this.player.state.x,
            this.player.state.y,
            tier === 'GODLIKE' ? 135 : 88,
            tier === 'GODLIKE' ? 'rgba(244, 63, 94, 0.92)' : 'rgba(250, 204, 21, 0.85)',
            0.42,
            3.2
          );
          this.addCallout(
            `${tierName} ${mm}mm!`,
            this.player.state.x,
            this.player.state.y - 28,
            tierColor,
            tier === 'GODLIKE' ? 1.25 : 1.05
          );

          this.replay.logMoment({
            round: this.round,
            type: 'NEAR_MISS',
            description: t('engine.nearMissMoment', { round: this.round, tier: tierName, mm }),
            marginPx: check.closestDistance,
          });
          this.emitHud(frame.bannerAlert || null, t('engine.nearMissHud', { tier: tierName, mm }));
        }
      }

      this.hudSyncTimer += rawDt;
      if (this.hudSyncTimer >= 0.065) {
        this.hudSyncTimer = 0;
        this.emitHud(frame.bannerAlert || null, null);
      }

      if (frame.isComplete) {
        this.completeRound();
      }
      return;
    }

    if (this.phase === 'DECISION_PAUSE') {
      this.player.update(simDt);
      this.checkLandingFeedback();
      this.decisionElapsedSec += rawDt;

      this.hudSyncTimer += rawDt;
      if (this.hudSyncTimer >= 0.08) {
        this.hudSyncTimer = 0;
        this.emitHud(null, null);
      }
    }
  }

  private updateChargingFeedback(rawDt: number): void {
    const ratio = this.player.state.chargeRatio;
    this.audio.updateCharge(ratio);

    // Spawn inward-converging mainspring energy motes around Time Spark as charge builds
    if (!this.settings.reduceMotion) {
      this.chargeMoteTimer += rawDt * (1 + ratio * 2.8);
      if (this.chargeMoteTimer >= 0.065) {
        this.chargeMoteTimer = 0;
        this.spawnInwardChargeMote(this.player.state.x, this.player.state.y, ratio);
      }
    }

    // Trigger crisp Full-Charge Lock Burst once when crossing 98% charge!
    if (ratio >= 0.98 && !this.wasMaxChargedThisHold) {
      this.wasMaxChargedThisHold = true;
      this.spawnShockwave(
        this.player.state.x,
        this.player.state.y,
        52,
        'rgba(253, 224, 71, 0.92)',
        0.24,
        2.6
      );
      this.spawnBurst(this.player.state.x, this.player.state.y, '#fde047', 10, 130);
    }
  }

  private checkLandingFeedback(): void {
    if (!this.player.state.justLanded) return;
    const power = this.player.state.landedImpactPower;
    this.audio.playLandingThud(power);
    this.spawnShockwave(
      this.player.state.x,
      this.player.state.y,
      26 + power * 28,
      'rgba(103, 232, 249, 0.65)',
      0.22,
      2
    );
    this.spawnBurst(this.player.state.x, this.player.state.y, '#67e8f9', 8, 95);
    if (this.canFlashAndShake() && power > 0.55) {
      this.shakeIntensity = Math.max(this.shakeIntensity, 3.0 * power);
    }
  }

  private completeRound(): void {
    this.player.cancelInput();
    this.audio.stopCharge();

    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    if (this.lastSecondTriggeredThisRound) {
      this.consecutiveLastSecond += 1;
      this.maxConsecutiveLastSecond = Math.max(
        this.maxConsecutiveLastSecond,
        this.consecutiveLastSecond
      );
    } else {
      this.consecutiveLastSecond = 0;
    }

    if (this.bestNearMissTierThisRound !== null) {
      this.nearMissTotalCount += 1;
      if (this.round <= 5) {
        this.anyNearMissThroughRound5 = true;
      }
    }
    if (this.round === 5 && !this.anyNearMissThroughRound5 && !this.hasUsedRevive) {
      this.untouchedThroughRound5 = true;
    }
    if (this.currentEvent?.meta.category === 'horror') {
      this.horrorEventsCleared += 1;
    }

    this.rhythmStage = getRhythmStage(this.round + 1, this.combo);
    const dangerLvl = this.currentEvent?.meta.dangerLevel || 1;
    this.audio.setIntensity(this.rhythmStage, dangerLvl, this.round + 1);

    const mult = getMultiplierForRound(this.round);
    const comboMods = getComboChallengeModifiers(this.combo);
    const modMult = MODIFIER_CONFIGS[this.currentModifier].scoreMultiplier;
    const lastSecMult = this.lastSecondTriggeredThisRound ? LAST_SECOND_SCORE_MULTIPLIER : 1.0;
    const basePts = 100;
    const nearMissBonus =
      this.bestNearMissTierThisRound === 'GODLIKE'
        ? 140
        : this.bestNearMissTierThisRound === 'EXTREME'
        ? 85
        : this.bestNearMissTierThisRound === 'CLOSE'
        ? 45
        : 0;
    const roundGain = Math.round(
      (basePts + nearMissBonus) * comboMods.scoreBonusMultiplier * modMult * lastSecMult * mult
    );

    this.unsettledScore += roundGain;

    // 5-Round Checkpoint Vault: Auto-lock 30% of current unsettled score so death cannot clear it!
    if (this.round % CHECKPOINT_INTERVAL_ROUNDS === 0 && this.unsettledScore > 0) {
      const deposit = Math.round(this.unsettledScore * CHECKPOINT_SAVE_RATIO);
      if (deposit > 0) {
        this.safeBankedScore += deposit;
        this.unsettledScore -= deposit;
        this.lastCheckpointDeposit = deposit;
        this.addCallout(
          t('engine.checkpointCallout', { n: deposit.toLocaleString() }),
          0,
          -66,
          '#34d399',
          1.15
        );
        this.replay.logMoment({
          round: this.round,
          type: 'CHECKPOINT',
          description: t('engine.checkpointMoment', {
            round: this.round,
            deposit: deposit.toLocaleString(),
            total: this.safeBankedScore.toLocaleString(),
          }),
        });
      }
    }

    this.audio.playRoundClear(this.combo);

    const burstColor =
      this.rhythmStage === 'FRENZY'
        ? '#f43f5e'
        : this.rhythmStage === 'EXCITEMENT'
        ? '#38bdf8'
        : '#2dd4bf';
    this.spawnBurst(this.player.state.x, this.player.state.y, burstColor, 26, 240);
    this.spawnShockwave(
      this.player.state.x,
      this.player.state.y,
      140,
      'rgba(45, 212, 191, 0.7)',
      0.45,
      2.5
    );
    this.addCallout(`+${roundGain}`, this.player.state.x, this.player.state.y - 22, '#34d399', 1.1);

    if (this.combo === 3 || this.combo === 6 || this.combo === 10) {
      this.addCallout(
        this.combo >= 6
          ? t('engine.comboFrenzy', { n: this.combo })
          : t('engine.comboBurst', { n: this.combo }),
        0,
        -95,
        '#fbbf24',
        1.2
      );
      this.replay.logMoment({
        round: this.round,
        type: 'COMBO_BURST',
        description: t('engine.comboMoment', { n: this.combo }),
      });
    }

    this.currentFrame = null;
    this.currentDangerProximity = Infinity;
    this.decisionElapsedSec = 0;
    this.phase = 'DECISION_PAUSE';

    // Decision pressure (setting: 决策阶段心跳与律动, default ON at half intensity).
    // When the player turns it off, deciding is completely silent and still.
    if (this.settings.decisionPressure) {
      this.audio.startDecisionHeartbeat(this.round, dangerLvl, () => {
        this.decisionHeartbeatTick += 1;
        if (this.canFlashAndShake()) {
          this.decisionBeatFlash = 0.5;
        }
        this.emitHud(null, null);
      });
    }

    const tierMsg =
      this.bestNearMissTierThisRound === 'GODLIKE'
        ? t('engine.bonusGodlike')
        : this.bestNearMissTierThisRound === 'EXTREME'
        ? t('engine.bonusExtreme')
        : this.bestNearMissTierThisRound === 'CLOSE'
        ? t('engine.bonusClose')
        : null;
    this.emitHud(null, tierMsg);
  }

  private finalizeDefeatAndRecord(): void {
    const lost = this.unsettledScore;
    const saved = this.safeBankedScore;
    this.replay.logMoment({
      round: this.round,
      type: 'FAIL',
      description:
        saved > 0
          ? t('engine.failMomentSaved', {
              round: this.round,
              event: this.currentEvent
                ? pick(this.currentEvent.meta.name, this.currentEvent.meta.nameEn)
                : t('engine.dangerFallback'),
              lost: lost.toLocaleString(),
              saved: saved.toLocaleString(),
            })
          : t('engine.failMoment', {
              round: this.round,
              event: this.currentEvent
                ? pick(this.currentEvent.meta.name, this.currentEvent.meta.nameEn)
                : t('engine.dangerFallback'),
              lost: lost.toLocaleString(),
            }),
    });

    const highlight = this.replay.getHighlightSummary();
    const closestMm = this.replay.getClosestMarginMm();
    const closestTierLabel = this.replay.getClosestTierLabel();
    const prevBest = loadRecord().bestScore;
    const seed = this.eventMgr.getSeed();

    updateRecord({
      score: saved,
      lostScore: lost,
      round: Math.max(0, this.round - 1),
      combo: this.maxCombo,
      multiplier: this.maxMultiplier,
      cashedOut: false,
      closestMm,
      seed,
      highlight,
    });

    const survivedRounds = Math.max(0, this.round - 1);
    const isDailyChallenge = seed === getTodayDailySeed();
    const progressionReport = settleRunProgression({
      outcome: 'FAILED',
      survivedRounds,
      finalScore: saved,
      maxCombo: this.maxCombo,
      closestMm,
      shardsCollectedInArena: this.shardsCollectedTotal,
      lastSecondCount: this.lastSecondCount,
      maxConsecutiveLastSecond: this.maxConsecutiveLastSecond,
      nearMissTotalCount: this.nearMissTotalCount,
      untouchedThroughRound5: this.untouchedThroughRound5,
      horrorEventsCleared: this.horrorEventsCleared,
      reviveUsed: this.hasUsedRevive,
      isDailyChallenge,
    });

    const summary: RunResultSummary = {
      outcome: 'FAILED',
      survivedRounds,
      finalScore: saved,
      safeBankedScore: saved,
      lostUnsettledScore: lost,
      maxMultiplier: this.maxMultiplier,
      maxCombo: this.maxCombo,
      closestMm,
      closestTierLabel,
      highlightSummary: highlight,
      missedClueSummary: this.replay.getMissedClueSummary(),
      shardsCollected: this.shardsCollectedTotal,
      closestSnapshot: this.replay.getClosestCallSnapshot(),
      replayReel: this.replay.getReplayReel(),
      moments: this.replay.getMoments(),
      seed,
      isDailyChallenge,
      customSequence: this.customSequence,
      isNewBest: saved > prevBest && saved > 0,
      reviveUsed: this.hasUsedRevive,
      lastSecondCount: this.lastSecondCount,
      equippedSkin: this.equippedSkin,
      progressionReport,
    };

    this.pendingDeathResult = null;
    this.phase = 'FAILED';
    this.callbacks.onRunFinished(summary);
  }

  private triggerFailure(hazards: HazardShape[]): void {
    this.player.cancelInput();
    this.wasMaxChargedThisHold = false;
    this.audio.playFail();
    this.audio.stopAmbience();

    this.deathCrackOrigin = { x: this.player.state.x, y: this.player.state.y };

    if (!this.settings.reduceMotion) {
      this.hitstopTimer = 0.092;
      this.deathImpactHoldTimer = 0.36;
    }
    if (this.canFlashAndShake()) {
      this.shakeIntensity = 17.5;
      this.screenTearTimer = 0.38;
      this.triggerScreenFlash('#f43f5e', 0.28);
    }

    this.spawnShatterShards(this.player.state.x, this.player.state.y, 32);
    this.spawnBurst(this.player.state.x, this.player.state.y, '#ef4444', 34, 340);
    this.spawnShockwave(
      this.player.state.x,
      this.player.state.y,
      195,
      'rgba(239, 68, 68, 0.95)',
      0.55,
      4.5
    );
    this.spawnShockwave(
      this.player.state.x,
      this.player.state.y,
      110,
      'rgba(254, 226, 226, 0.85)',
      0.38,
      2.6
    );

    const shard = this.currentEvent?.timeShard;
    const greedyOverride =
      shard &&
      this.roundShardCollectedAtSec !== null &&
      this.runElapsedSec - this.roundShardCollectedAtSec <= 2.2
        ? {
            x: shard.x,
            y: shard.y,
            radius: 26,
            text: t('engine.greedyClue'),
            color: 'AMBER' as const,
          }
        : undefined;

    const tailClip = this.replay.finalizeFailureReplay(
      greedyOverride,
      this.currentEvent
        ? pick(this.currentEvent.meta.clueHint, this.currentEvent.meta.clueHintEn)
        : undefined
    );
    // Pace rule: death NEVER auto-plays a replay. One step: revive offer, or straight to results.
    // (The replay reel is still recorded and can be watched on demand from the result screen.)
    this.deathReplayFrames = tailClip;
    this.deathReplayCursor = 0;
    void hazards;
    // Revive offer gating: only when the unsettled score is worth saving
    // (>= half of the player's recent average) and the revive is still unused.
    this.reviveOfferEligible =
      !this.hasUsedRevive && this.unsettledScore >= getReviveOfferThreshold();
    if (this.reviveOfferEligible) {
      this.phase = 'REVIVE_OFFER';
      this.emitHud(t('engine.reviveBanner'), null);
    } else {
      this.phase = 'FAILED';
      this.emitHud(
        this.safeBankedScore > 0
          ? t('engine.failHudSaved', { n: this.safeBankedScore.toLocaleString() })
          : t('engine.failHud'),
        null
      );
      window.setTimeout(() => {
        if (this.phase === 'FAILED') {
          this.finalizeDefeatAndRecord();
        }
      }, 450);
    }
  }

  private getActiveOnboardingStep():
    | 'HOLD_TO_CHARGE'
    | 'RELEASE_TO_DASH'
    | 'COLOR_SEMANTICS'
    | null {
    if (this.phase !== 'ACTIVE_HAZARD' && this.phase !== 'ROUND_INTRO') return null;
    if (!this.onboarding.completedCoreGuide && this.round <= 2) {
      return this.player.state.isCharging ? 'RELEASE_TO_DASH' : 'HOLD_TO_CHARGE';
    }
    if (!this.onboarding.seenSemanticGuide && this.round <= 2) {
      return 'COLOR_SEMANTICS';
    }
    return null;
  }

  private emitHud(bannerAlert: string | null, nearMissText: string | null): void {
    const meta = this.currentEvent?.meta;
    const estTotal = this.currentEvent?.totalDuration || 3.5;
    const prog = this.currentEvent
      ? Math.max(0, Math.min(1, this.currentEvent.elapsed / estTotal))
      : 0;
    const isLethal = Boolean(this.currentFrame?.hazards.some((h) => h.lethal));
    const comboMods = getComboChallengeModifiers(this.combo);
    const seed = this.eventMgr.getSeed();
    const modCfg = MODIFIER_CONFIGS[this.currentModifier];
    const lsBonusText =
      this.lastSecondTriggeredThisRound && this.lastSecondRemainingRecorded !== null
        ? t('engine.lastSecondBonus', { sec: this.lastSecondRemainingRecorded.toFixed(2) })
        : null;

    this.callbacks.onHudUpdate({
      phase: this.phase,
      round: this.round,
      unsettledScore: this.unsettledScore,
      safeBankedScore: this.safeBankedScore,
      lastCheckpointDeposit: this.lastCheckpointDeposit,
      bankedScore: loadRecord().bestScore,
      multiplier: getMultiplierForRound(this.round),
      nextMultiplier: getMultiplierForRound(this.round + 1),
      combo: this.combo,
      comboScoreBonusPct: Math.round((comboMods.scoreBonusMultiplier - 1) * 100),
      maxCombo: this.maxCombo,
      maxMultiplier: this.maxMultiplier,
      rhythmStage: this.rhythmStage,
      stageLabel: this.stageLabel,
      eventId: this.currentEvent?.id || null,
      eventName: meta ? pick(meta.name, meta.nameEn) : '',
      eventSubtitle: meta ? pick(meta.subtitle, meta.subtitleEn) : '',
      eventClue: meta ? pick(meta.clueHint, meta.clueHintEn) : '',
      modifier: this.currentModifier,
      modifierLabel: modCfg.name
        ? `${pick(modCfg.name, modCfg.nameEn)} (${pick(modCfg.shortDesc, modCfg.shortDescEn)})`
        : '',
      dangerLevel: meta?.dangerLevel || 1,
      roundProgress: prog,
      warningRemainingSec: this.currentFrame?.warningRemainingSec ?? null,
      isLethalActive: isLethal,
      bannerAlert,
      seed,
      isDailyChallenge: seed === getTodayDailySeed(),
      isCustomChallenge: Boolean(this.customSequence && this.customSequence.length > 0),
      onboardingStep: this.getActiveOnboardingStep(),
      firstTwistCallout: this.activeFirstTwistCallout,
      decisionElapsedSec: this.decisionElapsedSec,
      decisionHeartbeatTick: this.decisionHeartbeatTick,
      lastNearMissText: nearMissText,
      lastNearMissTier: this.bestNearMissTierThisRound,
      lastSecondTriggeredThisRound: this.lastSecondTriggeredThisRound,
      lastSecondBonusText: lsBonusText,
      lastMissedClueText:
        this.phase === 'DEATH_REPLAY' || this.phase === 'REVIVE_OFFER' || this.phase === 'FAILED'
          ? this.replay.getMissedClueSummary()
          : null,
      shardsCollected: this.shardsCollectedTotal,
      activeShardAvailable: Boolean(
        this.currentEvent?.timeShard &&
          !this.roundShardCollected &&
          (this.phase === 'ACTIVE_HAZARD' || this.phase === 'ROUND_INTRO')
      ),
      canRevive: !this.hasUsedRevive && this.reviveOfferEligible,
      reviveUsed: this.hasUsedRevive,
      reviveDemoted: this.reviveDeclines >= 3,
    });
  }

  private spawnInwardChargeMote(px: number, py: number, ratio: number): void {
    if (this.particles.length > 105) return;
    const ang = Math.random() * Math.PI * 2;
    const dist = 28 + Math.random() * (24 + ratio * 22);
    const sx = px + Math.cos(ang) * dist;
    const sy = py + Math.sin(ang) * dist;
    const life = 0.22;
    const speed = (dist / life) * 0.92;
    const color =
      ratio >= 0.85 ? '#fff1f2' : ratio >= 0.58 ? '#fde047' : '#7dd3fc';
    this.particles.push({
      x: sx,
      y: sy,
      vx: -Math.cos(ang) * speed,
      vy: -Math.sin(ang) * speed,
      life,
      maxLife: life,
      size: 1.5 + ratio * 1.8,
      color,
    });
  }

  private spawnBurst(x: number, y: number, color: string, count: number, maxSpeed: number): void {
    if (this.particles.length > 110) return;
    const actualCount = this.settings.reduceMotion ? Math.ceil(count * 0.35) : count;
    for (let i = 0; i < actualCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 35 + Math.random() * maxSpeed;
      const life = 0.28 + Math.random() * 0.38;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life,
        maxLife: life,
        size: 1.8 + Math.random() * 3.4,
        color,
      });
    }
  }

  private spawnShatterShards(
    x: number,
    y: number,
    count: number,
    overrideColor?: string
  ): void {
    if (this.particles.length > 120) return;
    const actualCount = this.settings.reduceMotion ? Math.min(6, count) : count;
    for (let i = 0; i < actualCount; i++) {
      const ang = (i / actualCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const spd = 90 + Math.random() * 310;
      const life = 0.52 + Math.random() * 0.44;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life,
        maxLife: life,
        size: 3.8 + Math.random() * 5.8,
        color:
          overrideColor ||
          (i % 3 === 0 ? '#fffbeb' : i % 2 === 0 ? '#fbbf24' : '#fb7185'),
        isShard: true,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 14,
      });
    }
  }

  private spawnShockwave(
    x: number,
    y: number,
    maxRadius: number,
    color: string,
    duration: number,
    lineWidth: number
  ): void {
    if (this.settings.reduceMotion || this.shockwaves.length > 10) return;
    this.shockwaves.push({
      x,
      y,
      radius: 8,
      maxRadius,
      life: duration,
      maxLife: duration,
      color,
      lineWidth,
    });
  }

  private addCallout(text: string, x: number, y: number, color: string, scale = 1): void {
    this.callouts.push({
      text,
      x,
      y,
      life: 1.05,
      maxLife: 1.05,
      color,
      scale,
    });
  }

  private updateEffects(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.93;
      p.vy *= 0.93;
      if (p.rotation !== undefined && p.vRot !== undefined) {
        p.rotation += p.vRot * dt;
      }
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      const progress = 1 - Math.max(0, sw.life / sw.maxLife);
      sw.radius = 8 + (sw.maxRadius - 8) * (1 - Math.pow(1 - progress, 3));
      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }

    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      c.y -= 28 * dt;
      c.life -= dt;
      if (c.life <= 0) {
        this.callouts.splice(i, 1);
      }
    }
  }

  private render(width: number, height: number): void {
    const ctx = this.ctx;
    ctx.save();

    const allowFlashShake = this.canFlashAndShake();

    // Synced Decision Heartbeat Pulse!
    const beatPulse =
      this.phase === 'DECISION_PAUSE' && allowFlashShake
        ? this.decisionBeatFlash * 0.25
        : 0;

    // 1. Procedural Giant Watchcase Backdrop & Round-Progressive Outer Gear Train
    const effectiveRound = this.phase === 'IDLE_DEMO' ? 2 : this.round;
    drawClockworkBackdrop(
      ctx,
      width,
      height,
      this.centerX,
      this.centerY,
      ARENA_RADIUS * this.scale,
      effectiveRound,
      this.rhythmStage,
      this.mechanismTime,
      this.phase === 'CASHING_OUT_RELIEF',
      beatPulse
    );

    const proxTension =
      this.phase === 'ACTIVE_HAZARD' && this.currentDangerProximity < 55
        ? Math.max(0, Math.min(1, 1 - this.currentDangerProximity / 55)) *
          (allowFlashShake ? 0.28 : 0.08)
        : 0;
    const chargeTensionEdge =
      allowFlashShake &&
      this.player.state.isCharging &&
      this.player.state.chargeRatio > 0.65
        ? ((this.player.state.chargeRatio - 0.65) / 0.35) * 0.2
        : 0;
    const redEdgeAlpha = allowFlashShake
      ? Math.max(proxTension, this.nearMissEdgeFlash * 0.48, beatPulse * 0.72)
      : proxTension;

    if (redEdgeAlpha > 0.01 || chargeTensionEdge > 0.01) {
      const vig = ctx.createRadialGradient(
        this.centerX,
        this.centerY,
        Math.min(width, height) * 0.24,
        this.centerX,
        this.centerY,
        Math.max(width, height) * 0.64
      );
      vig.addColorStop(0, 'rgba(225, 29, 72, 0)');
      if (chargeTensionEdge > redEdgeAlpha) {
        vig.addColorStop(1, `rgba(245, 158, 11, ${chargeTensionEdge})`);
      } else {
        vig.addColorStop(1, `rgba(225, 29, 72, ${redEdgeAlpha})`);
      }
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, width, height);
    }

    if (allowFlashShake && this.combo >= 4 && this.phase === 'ACTIVE_HAZARD') {
      const pulse = (0.5 + 0.5 * Math.sin(this.demoPulseTime * 8)) * 0.14;
      ctx.strokeStyle = `rgba(251, 191, 36, ${pulse})`;
      ctx.lineWidth = 5;
      ctx.strokeRect(6, 6, width - 12, height - 12);
    }

    if (this.phase === 'CASHING_OUT_RELIEF' && this.reliefBloomProgress > 0) {
      const maxBloom = allowFlashShake ? 0.24 : 0.05;
      const reliefAlpha = Math.sin(this.reliefBloomProgress * Math.PI) * maxBloom;
      ctx.fillStyle = `rgba(110, 231, 183, ${reliefAlpha})`;
      ctx.fillRect(0, 0, width, height);
    }

    if (allowFlashShake && this.screenFlashAlpha > 0.005) {
      ctx.save();
      ctx.globalAlpha = this.screenFlashAlpha;
      ctx.fillStyle = this.screenFlashColor;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    let shakeX = 0;
    let shakeY = 0;
    if (allowFlashShake) {
      // Smooth damped pseudo-harmonic shake + subtle high-charge micro-tension tremor
      const chargeTremor =
        this.player.state.isCharging && this.player.state.chargeRatio > 0.68
          ? ((this.player.state.chargeRatio - 0.68) / 0.32) * 1.85
          : 0;
      const totalShake = this.shakeIntensity + chargeTremor;
      if (totalShake > 0.05) {
        shakeX = Math.sin(this.demoPulseTime * 58) * totalShake * 0.72 + (Math.random() - 0.5) * totalShake * 0.55;
        shakeY = Math.cos(this.demoPulseTime * 67) * totalShake * 0.72 + (Math.random() - 0.5) * totalShake * 0.55;
      }
    }
    const heartScale = allowFlashShake
      ? 1 +
        (this.phase === 'DECISION_PAUSE' ? this.decisionBeatFlash * 0.022 : 0) +
        this.hapticKickScale
      : 1;

    ctx.translate(this.centerX + shakeX, this.centerY + shakeY);
    ctx.scale(this.scale * heartScale, this.scale * heartScale);

    // During DEATH_REPLAY: hold live shattered slow-mo impact for 0.36s first, then play rewind reel!
    if (
      this.phase === 'DEATH_REPLAY' &&
      this.deathImpactHoldTimer <= 0 &&
      this.deathReplayFrames.length > 0
    ) {
      this.renderDeathReplayArena(ctx);
      ctx.restore();
      return;
    }

    // Outer Escapement Tension Arcs
    if (!this.settings.reduceScare) {
      const roundRatio = Math.min(1, (effectiveRound - 1) / 12);
      for (const s of this.shadows) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, ARENA_RADIUS + 23, s.angle, s.angle + s.arc);
        ctx.strokeStyle =
          roundRatio > 0.5 || this.rhythmStage === 'FRENZY'
            ? `rgba(244, 63, 94, ${s.alpha + roundRatio * 0.12})`
            : `rgba(200, 169, 110, ${s.alpha * 0.85})`;
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw Outer Bezel 60-Second Graduations (driven by mechanismTime so hitstop/rewind works!)
    drawArenaClockDial(ctx, effectiveRound, this.rhythmStage, this.mechanismTime, true);

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
    ctx.clip();

    // Redraw clipped clock dial interior cleanly inside clip region
    drawArenaClockDial(ctx, effectiveRound, this.rhythmStage, this.mechanismTime, false);

    // Idle Demo Ambient Clock Hands when on Home Screen!
    if (this.phase === 'IDLE_DEMO') {
      ctx.save();
      // Subtle minute hand
      ctx.save();
      ctx.rotate(this.demoPulseTime * 0.08 - 0.9);
      ctx.strokeStyle = 'rgba(200, 169, 110, 0.26)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-24, 0);
      ctx.lineTo(152, 0);
      ctx.stroke();
      ctx.restore();

      // Sweeping second hand
      ctx.save();
      ctx.rotate(this.demoPulseTime * 0.55);
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.34)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-36, 0);
      ctx.lineTo(208, 0);
      ctx.stroke();
      ctx.restore();
      ctx.restore();
    }

    if (this.currentFrame) {
      const evId = this.currentEvent?.id || null;
      for (const h of this.currentFrame.hazards) {
        drawClockworkHazard(ctx, h, evId, this.clockPatterns, this.mechanismTime);
      }

      if (this.currentFrame.darknessAlpha > 0) {
        const darkAlpha = this.settings.reduceScare
          ? this.currentFrame.darknessAlpha * 0.55
          : this.currentFrame.darknessAlpha;
        ctx.save();
        const spotGrad = ctx.createRadialGradient(
          this.player.state.x,
          this.player.state.y,
          30,
          this.player.state.x,
          this.player.state.y,
          160
        );
        spotGrad.addColorStop(0, 'rgba(6, 7, 10, 0.06)');
        spotGrad.addColorStop(1, `rgba(3, 4, 7, ${darkAlpha})`);
        ctx.fillStyle = spotGrad;
        ctx.fillRect(
          -ARENA_RADIUS - 10,
          -ARENA_RADIUS - 10,
          ARENA_RADIUS * 2 + 20,
          ARENA_RADIUS * 2 + 20
        );
        ctx.restore();
      }

      for (const hint of this.currentFrame.safeHints) {
        drawSafeEscapementZone(ctx, hint, this.demoPulseTime);
      }

      if (this.currentFrame.clueZones) {
        for (const cz of this.currentFrame.clueZones) {
          drawHorologicalClueZone(ctx, cz, evId, this.demoPulseTime);
        }
      }

      // Render Darkness Sonar Compass Arc around Time Spark pointing toward true safe zone!
      if (this.currentFrame.compassTarget) {
        const tgt = this.currentFrame.compassTarget;
        const dx = tgt.x - this.player.state.x;
        const dy = tgt.y - this.player.state.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 28) {
          const ang = Math.atan2(dy, dx);
          const compR = PLAYER_RADIUS + 20;
          ctx.save();
          ctx.translate(this.player.state.x, this.player.state.y);
          ctx.beginPath();
          ctx.arc(0, 0, compR, ang - 0.45, ang + 0.45);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3;
          ctx.stroke();

          const tipX = Math.cos(ang) * (compR + 7);
          const tipY = Math.sin(ang) * (compR + 7);
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(
            Math.cos(ang - 0.22) * (compR + 1),
            Math.sin(ang - 0.22) * (compR + 1)
          );
          ctx.lineTo(
            Math.cos(ang + 0.22) * (compR + 1),
            Math.sin(ang + 0.22) * (compR + 1)
          );
          ctx.closePath();
          ctx.fillStyle = '#bae6fd';
          ctx.fill();
          ctx.restore();
        }
      }

      // Render Greedy Collectible Time Shard (Horological Escapement Jewel Shard) near danger boundary!
      if (this.currentEvent?.timeShard && !this.roundShardCollected) {
        const ts = this.currentEvent.timeShard;
        ctx.save();
        ctx.translate(ts.x, ts.y);

        const shardGlow = ctx.createRadialGradient(0, 0, 2, 0, 0, ts.radius * 2.1);
        shardGlow.addColorStop(0, 'rgba(253, 224, 71, 0.58)');
        shardGlow.addColorStop(0.55, 'rgba(217, 119, 6, 0.24)');
        shardGlow.addColorStop(1, 'rgba(217, 119, 6, 0)');
        ctx.fillStyle = shardGlow;
        ctx.beginPath();
        ctx.arc(0, 0, ts.radius * 2.1, 0, Math.PI * 2);
        ctx.fill();

        // Toothed mini-gear risk orbit ring
        ctx.beginPath();
        ctx.arc(0, 0, ts.radius + 5 + Math.sin(this.demoPulseTime * 8) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Rotating faceted golden hourglass/diamond crystal
        ctx.save();
        ctx.rotate(this.demoPulseTime * 2.4);
        const s = ts.radius * 0.94;
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.18);
        ctx.lineTo(s * 0.85, 0);
        ctx.lineTo(0, s * 1.18);
        ctx.lineTo(-s * 0.85, 0);
        ctx.closePath();
        ctx.fillStyle = '#fde047';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#fef08a';
        ctx.font = `700 10px ${CLOCK_MONO_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(t('engine.shardCanvasLabel'), 0, ts.radius + 17);
        ctx.restore();
      }

      // First-Run Interactive Animated Guide Arrow directly from Time Spark -> Safe Escapement Zone!
      if (
        !this.onboarding.completedCoreGuide &&
        this.round <= 2 &&
        !this.player.state.isCharging &&
        this.currentFrame.safeHints.length > 0
      ) {
        const targetHint = this.currentFrame.safeHints[0];
        ctx.save();
        const dashOffset = -(this.demoPulseTime * 48) % 24;
        ctx.beginPath();
        ctx.moveTo(this.player.state.x, this.player.state.y);
        ctx.lineTo(targetHint.x, targetHint.y);
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.88)';
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 12]);
        ctx.lineDashOffset = dashOffset;
        ctx.stroke();

        const ringPulse = 18 + Math.sin(this.demoPulseTime * 6) * 5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(this.player.state.x, this.player.state.y, ringPulse, 0, Math.PI * 2);
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const sw of this.shockwaves) {
      const alpha = Math.max(0, sw.life / sw.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = sw.lineWidth;
      ctx.stroke();
      ctx.restore();
    }

    // Escalating Horological Mainspring Charge Gauge & Aiming Trajectory Preview
    if (
      this.player.state.isCharging &&
      (this.phase === 'ACTIVE_HAZARD' || this.phase === 'ROUND_INTRO')
    ) {
      const landing = this.player.getPredictedLanding();
      const cRatio = this.player.state.chargeRatio;
      const isPeakCharge = cRatio >= 0.96;
      const isHighCharge = cRatio >= 0.68;

      let landingDanger: 'SAFE' | 'WARNING' | 'LETHAL' = 'SAFE';
      if (this.currentFrame) {
        const landCheck = evaluateHazards(
          landing.x,
          landing.y,
          PLAYER_RADIUS,
          this.currentFrame.hazards
        );
        if (landCheck.collided) {
          landingDanger = 'LETHAL';
        } else if (landCheck.closestWarningDistance <= 0) {
          landingDanger = 'WARNING';
        }
      }

      const corridorColor =
        landingDanger === 'LETHAL'
          ? 'rgba(244, 63, 94, 0.22)'
          : landingDanger === 'WARNING'
          ? 'rgba(251, 191, 36, 0.20)'
          : isPeakCharge
          ? 'rgba(253, 224, 71, 0.20)'
          : 'rgba(56, 189, 248, 0.16)';
      const lineStroke =
        landingDanger === 'LETHAL'
          ? '#fb7185'
          : landingDanger === 'WARNING'
          ? '#fbbf24'
          : isPeakCharge
          ? '#fde047'
          : '#38bdf8';

      ctx.save();
      const px = this.player.state.x;
      const py = this.player.state.y;
      const dx = landing.x - px;
      const dy = landing.y - py;
      const pathLen = Math.hypot(dx, dy);
      const pathAng = Math.atan2(dy, dx);

      if (pathLen > 2) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(pathAng);
        ctx.fillStyle = corridorColor;
        ctx.fillRect(0, -PLAYER_RADIUS, pathLen, PLAYER_RADIUS * 2);

        // Animated forward directional chevrons speeding up with chargeRatio!
        const chevSpacing = 36;
        const chevOffset = (this.demoPulseTime * (45 + cRatio * 125)) % chevSpacing;
        ctx.strokeStyle = lineStroke;
        ctx.globalAlpha = 0.45 + cRatio * 0.4;
        ctx.lineWidth = 1.6;
        for (let cxPos = chevOffset; cxPos < pathLen - 12; cxPos += chevSpacing) {
          ctx.beginPath();
          ctx.moveTo(cxPos - 5, -5);
          ctx.lineTo(cxPos + 2, 0);
          ctx.lineTo(cxPos - 5, 5);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 12-Notch Horological Mainspring Ratchet Gauge around Time Spark!
      const arcR = PLAYER_RADIUS + 11 + cRatio * 9;
      ctx.beginPath();
      ctx.arc(px, py, arcR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200, 169, 110, 0.22)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      const totalNotches = 12;
      const litNotches = Math.round(cRatio * totalNotches);
      for (let n = 0; n < totalNotches; n++) {
        const na = -Math.PI / 2 + (n / totalNotches) * Math.PI * 2;
        const isLit = n < litNotches;
        const rIn = arcR + 2;
        const rOut = arcR + (isLit ? 7.5 : 4.5);
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(na) * rIn, py + Math.sin(na) * rIn);
        ctx.lineTo(px + Math.cos(na) * rOut, py + Math.sin(na) * rOut);
        ctx.strokeStyle = !isLit
          ? 'rgba(148, 163, 184, 0.22)'
          : n >= 10
          ? '#fff1f2'
          : n >= 7
          ? '#fde047'
          : '#38bdf8';
        ctx.lineWidth = isLit ? 2.4 : 1.2;
        ctx.stroke();
      }

      // Continuous glowing tension arc
      ctx.beginPath();
      ctx.arc(px, py, arcR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cRatio);
      ctx.strokeStyle = isPeakCharge ? '#fff1f2' : isHighCharge ? '#fde047' : '#38bdf8';
      ctx.lineWidth = isPeakCharge ? 4 : 3.2;
      ctx.stroke();

      if (isPeakCharge) {
        ctx.fillStyle = '#fde047';
        ctx.font = `700 10px ${CLOCK_MONO_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('MAX', px, py - arcR - 11);
      }

      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(landing.x, landing.y);
      ctx.strokeStyle = lineStroke;
      ctx.lineWidth = 2.4;
      ctx.setLineDash(landingDanger === 'SAFE' ? [7, 5] : [4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(landing.x, landing.y, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = corridorColor;
      ctx.fill();
      ctx.strokeStyle = lineStroke;
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // Distinct Shape Marker inside Landing Reticle (Cross = Lethal, Triangle = Warning, Dot = Safe)
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 2;
      if (landingDanger === 'LETHAL') {
        ctx.beginPath();
        ctx.moveTo(landing.x - 5, landing.y - 5);
        ctx.lineTo(landing.x + 5, landing.y + 5);
        ctx.moveTo(landing.x + 5, landing.y - 5);
        ctx.lineTo(landing.x - 5, landing.y + 5);
        ctx.stroke();
      } else if (landingDanger === 'WARNING') {
        ctx.beginPath();
        ctx.moveTo(landing.x, landing.y - 5.5);
        ctx.lineTo(landing.x + 5, landing.y + 4);
        ctx.lineTo(landing.x - 5, landing.y + 4);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(landing.x, landing.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Sapphire Watch-Crystal Fracture Lines during Death Slow-Mo Hold!
    if (this.deathImpactHoldTimer > 0 && this.deathCrackOrigin) {
      const { x: cx, y: cy } = this.deathCrackOrigin;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 228, 230, 0.78)';
      ctx.lineWidth = 1.8;
      const rays = [0.2, 1.05, 1.92, 2.75, 3.68, 4.55, 5.42];
      for (let r = 0; r < rays.length; r++) {
        const a = rays[r];
        const len = 42 + (r % 3) * 28;
        const midX = cx + Math.cos(a + 0.14) * (len * 0.52);
        const midY = cy + Math.sin(a + 0.14) * (len * 0.52);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(midX, midY);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Glowing Time Spark Player + Comet Trail (hidden once shattered during death hold/offer)
    if (
      this.phase !== 'FAILED' &&
      this.phase !== 'REVIVE_OFFER' &&
      !(this.phase === 'DEATH_REPLAY' && this.deathImpactHoldTimer > 0)
    ) {
      const squash = this.player.state.isCharging
        ? 1 - this.player.state.chargeRatio * 0.25
        : this.player.state.isDashing
        ? 1.34
        : 1;
      drawTimeSparkPlayer(
        ctx,
        this.player.state.x,
        this.player.state.y,
        this.player.state.aimAngle,
        squash,
        this.combo,
        this.demoPulseTime,
        this.player.state.trail,
        this.equippedSkin
      );
    }

    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.isShard) {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation || 0);
        ctx.beginPath();
        ctx.moveTo(-p.size, -p.size * 0.5);
        ctx.lineTo(p.size, 0);
        ctx.lineTo(-p.size * 0.4, p.size * 0.7);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore(); // End arena clip

    if (this.phase === 'CASHING_OUT_RELIEF') {
      for (const orb of this.flyingOrbs) {
        if (orb.progress < 0 || orb.progress > 1) continue;
        ctx.save();
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fde68a';
        ctx.shadowColor = '#34d399';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.restore();
      }
    }

    // Metallic Watchcase Bezel Rim + iOS Visual Haptic Tactile Rim Pulse
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
    const rimColor =
      this.phase === 'FAILED'
        ? '#ef4444'
        : this.phase === 'CASHING_OUT_RELIEF'
        ? '#34d399'
        : this.phase === 'DECISION_PAUSE'
        ? allowFlashShake && this.decisionBeatFlash > 0.4
          ? '#fb7185'
          : '#c8a96e'
        : this.rhythmStage === 'FRENZY'
        ? '#f43f5e'
        : 'rgba(200, 169, 110, 0.55)';
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = this.rhythmStage === 'FRENZY' ? 3.8 : 2.6;
    ctx.stroke();

    // iOS / Non-Vibration Visual Haptic Compensation Ring
    if (allowFlashShake && this.hapticBezelGlow > 0.02) {
      ctx.beginPath();
      ctx.arc(0, 0, ARENA_RADIUS + 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(253, 224, 71, ${this.hapticBezelGlow * 0.85})`;
      ctx.lineWidth = 2 + this.hapticBezelGlow * 3.5;
      ctx.stroke();
    }

    if (this.phase === 'ACTIVE_HAZARD' && this.currentEvent) {
      const ratio = Math.max(
        0,
        Math.min(1, this.currentEvent.elapsed / this.currentEvent.totalDuration)
      );
      const isLethal = Boolean(this.currentFrame?.hazards.some((h) => h.lethal));

      ctx.beginPath();
      ctx.arc(0, 0, ARENA_RADIUS + 4.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.strokeStyle = isLethal ? '#f43f5e' : '#fbbf24';
      ctx.lineWidth = 3.2;
      ctx.stroke();
    }

    const tearStrength =
      this.screenTearTimer > 0
        ? this.screenTearTimer / 0.42
        : this.currentFrame?.glitchIntensity || 0;
    if (tearStrength > 0 && allowFlashShake) {
      ctx.fillStyle = `rgba(244, 63, 94, ${tearStrength * 0.30})`;
      ctx.fillRect(-ARENA_RADIUS - 30, -55, ARENA_RADIUS * 2 + 60, 9);
      ctx.fillStyle = `rgba(251, 191, 36, ${tearStrength * 0.25})`;
      ctx.fillRect(-ARENA_RADIUS - 20, 48, ARENA_RADIUS * 2 + 40, 7);
    }
    ctx.restore();

    for (const c of this.callouts) {
      const alpha = Math.max(0, c.life / c.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(c.x, c.y);
      if (c.scale) ctx.scale(c.scale, c.scale);
      ctx.font = `700 16px ${CLOCK_SANS_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  private renderDeathReplayArena(ctx: CanvasRenderingContext2D): void {
    const idx = Math.min(
      this.deathReplayFrames.length - 1,
      Math.floor(this.deathReplayCursor)
    );
    const frame = this.deathReplayFrames[idx];
    if (!frame) return;

    drawArenaClockDial(ctx, frame.round, this.rhythmStage, this.demoPulseTime, true);

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
    ctx.clip();

    drawArenaClockDial(ctx, frame.round, this.rhythmStage, this.demoPulseTime, false);

    const evId = frame.eventId ?? this.currentEvent?.id ?? null;
    for (const h of frame.hazards) {
      drawClockworkHazard(ctx, h, evId, this.clockPatterns, this.demoPulseTime);
    }

    for (const hint of frame.safeHints) {
      drawSafeEscapementZone(ctx, hint, this.demoPulseTime);
    }

    if (frame.timeShard && !frame.timeShard.collected) {
      ctx.save();
      ctx.translate(frame.timeShard.x, frame.timeShard.y);
      const s = frame.timeShard.radius * 0.85;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.8, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.8, 0);
      ctx.closePath();
      ctx.fillStyle = '#fde047';
      ctx.fill();
      ctx.restore();
    }

    // Highlight the exact Clue the player missed ("让玩家死得明白")!
    if (frame.missedClue) {
      const mc = frame.missedClue;
      const pulse = 1 + Math.sin(this.demoPulseTime * 11) * 0.1;
      const hlColor =
        mc.color === 'MAGENTA' ? '#e879f9' : mc.color === 'CYAN' ? '#38bdf8' : '#fbbf24';
      const r = mc.radius * pulse;

      ctx.save();
      const spot = ctx.createRadialGradient(mc.x, mc.y, 4, mc.x, mc.y, r * 1.45);
      spot.addColorStop(0, 'rgba(251, 191, 36, 0.34)');
      spot.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = spot;
      ctx.beginPath();
      ctx.arc(mc.x, mc.y, r * 1.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(mc.x, mc.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = hlColor;
      ctx.lineWidth = 3.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(mc.x, mc.y, r + 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      const tagX = Math.max(-155, Math.min(155, mc.x));
      const tagY = mc.y > 120 ? mc.y - r - 12 : mc.y + r + 18;
      ctx.fillStyle = '#fde047';
      ctx.font = `700 13px ${CLOCK_SANS_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(t('engine.missedTag'), tagX, tagY);
      ctx.restore();
    }

    if (
      frame.isDecisionPoint &&
      frame.optimalEscapeX !== undefined &&
      frame.optimalEscapeY !== undefined
    ) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(frame.playerX, frame.playerY, PLAYER_RADIUS + 18, 0, Math.PI * 2);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(frame.playerX, frame.playerY);
      ctx.lineTo(frame.optimalEscapeX, frame.optimalEscapeY);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(frame.optimalEscapeX, frame.optimalEscapeY, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#fde047';
      ctx.font = `700 14px ${CLOCK_SANS_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(t('engine.escapeHint'), frame.playerX, frame.playerY - 30);
      ctx.restore();
    }

    const isCollisionFrame = idx === this.deathReplayFrames.length - 1;
    if (isCollisionFrame) {
      ctx.beginPath();
      ctx.arc(frame.playerX, frame.playerY, PLAYER_RADIUS * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffe4e6';
      ctx.stroke();
    } else {
      drawTimeSparkPlayer(
        ctx,
        frame.playerX,
        frame.playerY,
        frame.aimAngle,
        1,
        0,
        this.demoPulseTime,
        [],
        this.equippedSkin
      );
    }

    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = frame.isDecisionPoint ? '#fde047' : '#fb7185';
    ctx.lineWidth = 3.2;
    ctx.stroke();
  }
}
