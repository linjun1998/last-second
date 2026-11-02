import {
  EventModifierId,
  getComboChallengeModifiers,
  getStageForRound,
  RhythmStage,
} from '../data/difficultyConfig';
import { EVENT_CONFIGS, EventId } from '../data/eventConfig';
import { createHazardEvent, HazardEventInstance } from '../events/HazardEvents';
import { SeededRNG } from '../utils/random';
import { pick } from '../i18n';

export interface EventManagerSnapshot {
  rngState: number;
  cooldownEntries: Array<[EventId, number]>;
  lastEventId: EventId | null;
  lastFamily: string | null;
  roundsSinceHorror: number;
}

/** Mechanic families used by the no-same-family-twice-in-a-row pacing rule. */
export const EVENT_FAMILY: Record<EventId, string> = {
  closing_wall: 'press',
  shrinking_zone: 'shrink',
  moving_obstacle: 'sweep',
  rotating_blade: 'sweep',
  chain_sweep: 'sweep',
  frenzy_gauntlet: 'sweep',
  narrow_corridor: 'gap',
  razor_gate: 'gap',
  sudden_drop: 'drop',
  fake_safety: 'trick',
  direction_invert: 'trick',
  darkness_ambush: 'trick',
};

export class DifficultyAndEventManager {
  private rng: SeededRNG;
  private customSequence?: EventId[];
  private rookieRunIndex: number | null;
  private cooldowns: Map<EventId, number> = new Map();
  private lastEventId: EventId | null = null;
  private lastFamily: string | null = null;
  private roundsSinceHorror = 3;

  constructor(seed?: string, customSequence?: EventId[], rookieRunIndex: number | null = null) {
    this.rng = new SeededRNG(seed);
    this.customSequence =
      customSequence && customSequence.length > 0 ? [...customSequence] : undefined;
    this.rookieRunIndex = rookieRunIndex;
  }

  public getSeed(): string {
    return this.rng.seedString;
  }

  public snapshot(): EventManagerSnapshot {
    return {
      rngState: this.rng.getState(),
      cooldownEntries: Array.from(this.cooldowns.entries()),
      lastEventId: this.lastEventId,
      lastFamily: this.lastFamily,
      roundsSinceHorror: this.roundsSinceHorror,
    };
  }

  public restore(snap: EventManagerSnapshot): void {
    this.rng.setState(snap.rngState);
    this.cooldowns = new Map(snap.cooldownEntries);
    this.lastEventId = snap.lastEventId;
    this.lastFamily = snap.lastFamily ?? null;
    this.roundsSinceHorror = snap.roundsSinceHorror;
  }

  public createEventForRound(
    round: number,
    combo: number,
    reduceScare: boolean,
    forceFirst30sNearMiss = false
  ): {
    instance: HazardEventInstance;
    modifier: EventModifierId;
    stageName: string;
    rhythm: RhythmStage;
    isBreatherAfterFrenzy: boolean;
  } {
    for (const [key, val] of this.cooldowns.entries()) {
      if (val <= 1) {
        this.cooldowns.delete(key);
      } else {
        this.cooldowns.set(key, val - 1);
      }
    }

    const stage = getStageForRound(round);
    const comboMods = getComboChallengeModifiers(combo);
    // Breather rounds only in endless play (13+): rounds 8-12 are staged debut
    // rounds (new modifier/event each) and must not be suppressed or slowed.
    const isBreatherAfterFrenzy = round > 12 && round % 4 === 1;

    // Gentler curve during a player's very first 3 normal runs (unseeded)
    let rookieSpeedMult = 1.0;
    let rookieWarnMult = 1.0;
    let rookieGenMult = 1.0;
    if (this.rookieRunIndex === 0) {
      rookieSpeedMult = 0.8;
      rookieWarnMult = 1.22;
      rookieGenMult = 1.18;
    } else if (this.rookieRunIndex === 1) {
      rookieSpeedMult = 0.88;
      rookieWarnMult = 1.14;
      rookieGenMult = 1.1;
    } else if (this.rookieRunIndex === 2) {
      rookieSpeedMult = 0.94;
      rookieWarnMult = 1.07;
      rookieGenMult = 1.05;
    }

    const effectiveSpeed =
      // Breather relief stays inside a +/-6% band so speed never jumps between rounds.
      (isBreatherAfterFrenzy ? stage.speedScale * 0.95 : stage.speedScale) * rookieSpeedMult;
    const effectiveWarningScale = comboMods.warningScale * rookieWarnMult;
    const effectiveGenerosity = stage.generosityScale * comboMods.safeWindowScale * rookieGenMult;

    let chosenId: EventId;

    if (this.customSequence && this.customSequence.length > 0) {
      chosenId = this.customSequence[(round - 1) % this.customSequence.length];
    } else {
      let pool = [...stage.allowedEvents];

      // Delay horror deception events until Round 4+ on the player's very first run so core controls click first
      const delayHorrorForRookie = this.rookieRunIndex === 0 && round <= 3;

      if (reduceScare || delayHorrorForRookie) {
        const nonHorror = pool.filter((id) => EVENT_CONFIGS[id].category !== 'horror');
        if (nonHorror.length > 0) pool = nonHorror;
      } else {
        const horrorPool = pool.filter((id) => EVENT_CONFIGS[id].category === 'horror');
        const actionPool = pool.filter((id) => EVENT_CONFIGS[id].category !== 'horror');

        if (horrorPool.length > 0 && actionPool.length > 0) {
          let horrorProb = 0;
          if (this.roundsSinceHorror >= 1) {
            horrorProb = Math.min(
              0.68,
              stage.horrorCurveBase * (0.65 + this.roundsSinceHorror * 0.35)
            );
          }
          const wantHorror = this.rng.chance(horrorProb);
          pool = wantHorror ? horrorPool : actionPool;
        }
      }

      const available = pool.filter(
        (id) => id !== this.lastEventId && !this.cooldowns.has(id)
      );
      let candidates =
        available.length > 0 ? available : pool.filter((id) => id !== this.lastEventId);
      if (candidates.length === 0) candidates = pool;
      // Pacing rule: never repeat a mechanic family two rounds in a row
      // when the pool offers a different family.
      if (this.lastFamily) {
        const diffFamily = candidates.filter((id) => EVENT_FAMILY[id] !== this.lastFamily);
        if (diffFamily.length > 0) candidates = diffFamily;
      }
      chosenId = this.rng.pick(candidates);

      // Guarantee a safe, thrilling shoulder-graze Near-Miss within the first 30 seconds for newcomers!
      if (forceFirst30sNearMiss) {
        chosenId = 'moving_obstacle';
      }
    }

    if (EVENT_CONFIGS[chosenId].category === 'horror') {
      this.roundsSinceHorror = 0;
    } else {
      this.roundsSinceHorror += 1;
    }

    // Roll late-game Event Modifier deterministically from seed!
    let modifier: EventModifierId = 'NONE';
    const suppressModifierForRookie = this.rookieRunIndex === 0 && round <= 5;
    if (
      !forceFirst30sNearMiss &&
      !suppressModifierForRookie &&
      !isBreatherAfterFrenzy &&
      stage.allowedModifiers.length > 0 &&
      this.rng.chance(stage.modifierChance)
    ) {
      let modPool = [...stage.allowedModifiers];
      // Avoid stacking TUNNEL_FOG on darkness_ambush or DOUBLE_ECHO on fake_safety to keep encounters crisp
      if (chosenId === 'darkness_ambush') {
        modPool = modPool.filter((m) => m !== 'TUNNEL_FOG');
      }
      // Fairness: direction_invert must never combine with the vision-limiting TUNNEL_FOG.
      if (chosenId === 'direction_invert') {
        modPool = modPool.filter((m) => m !== 'TUNNEL_FOG');
      }
      if (chosenId === 'fake_safety') {
        modPool = modPool.filter((m) => m !== 'DOUBLE_ECHO');
      }
      if (modPool.length > 0) {
        modifier = this.rng.pick(modPool);
      }
    }

    this.lastEventId = chosenId;
    this.lastFamily = EVENT_FAMILY[chosenId];
    this.cooldowns.set(chosenId, EVENT_CONFIGS[chosenId].cooldownRounds);

    const allowShard =
      round >= (this.rookieRunIndex === 0 ? 3 : 2) && !forceFirst30sNearMiss;
    const shardChance = stage.rhythm === 'FRENZY' ? 0.55 : 0.45;

    const instance = createHazardEvent(
      chosenId,
      modifier,
      this.rng,
      effectiveSpeed,
      effectiveWarningScale,
      effectiveGenerosity,
      {
        allowTimeShard: allowShard,
        shardSpawnChance: shardChance,
        forceRookieNearMissSetpiece: forceFirst30sNearMiss,
      }
    );

    return {
      instance,
      modifier,
      stageName: isBreatherAfterFrenzy
        ? pick('喘息窗口 · 重整态势', 'Breather Window · Regroup')
        : pick(stage.stageName, stage.stageNameEn),
      rhythm: isBreatherAfterFrenzy ? 'EXCITEMENT' : stage.rhythm,
      isBreatherAfterFrenzy,
    };
  }
}
