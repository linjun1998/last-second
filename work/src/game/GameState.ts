import { NearMissTier } from '../audio/AudioManager';
import { EventModifierId, RhythmStage } from '../data/difficultyConfig';
import { EventId } from '../data/eventConfig';
import { SparkSkinId } from '../data/progressionConfig';
import { RunProgressionRewardReport } from '../utils/progressionStorage';
import { ReplaySnapshotFrame, KeyMomentLog } from './ReplaySystem';

export type ScreenMode = 'HOME' | 'PLAYING' | 'RESULT';

export type EnginePhase =
  | 'IDLE_DEMO'
  | 'ROUND_INTRO'
  | 'ACTIVE_HAZARD'
  | 'DECISION_PAUSE'
  | 'CASHING_OUT_RELIEF'
  | 'DEATH_REPLAY'
  | 'REVIVE_OFFER'
  | 'CASHED_OUT'
  | 'FAILED';

export interface HudSnapshot {
  phase: EnginePhase;
  round: number;
  unsettledScore: number;
  safeBankedScore: number;
  lastCheckpointDeposit: number;
  bankedScore: number;
  multiplier: number;
  nextMultiplier: number;
  combo: number;
  comboScoreBonusPct: number;
  maxCombo: number;
  maxMultiplier: number;
  rhythmStage: RhythmStage;
  stageLabel: string;
  eventId: EventId | null;
  eventName: string;
  eventSubtitle: string;
  eventClue: string;
  modifier: EventModifierId;
  modifierLabel: string;
  dangerLevel: number;
  roundProgress: number;
  warningRemainingSec: number | null;
  isLethalActive: boolean;
  bannerAlert: string | null;
  seed: string;
  isDailyChallenge: boolean;
  isCustomChallenge: boolean;
  // Interactive Onboarding & First-Time Twist Coachmarks
  onboardingStep: 'HOLD_TO_CHARGE' | 'RELEASE_TO_DASH' | 'COLOR_SEMANTICS' | null;
  firstTwistCallout: string | null;
  // Decision phase psychological pressure
  decisionElapsedSec: number;
  decisionHeartbeatTick: number;
  lastNearMissText: string | null;
  lastNearMissTier: NearMissTier | null;
  // Last-Second escape bonus, Time Shards & 1-per-run Revive state
  lastSecondTriggeredThisRound: boolean;
  lastSecondBonusText: string | null;
  lastMissedClueText: string | null;
  shardsCollected: number;
  activeShardAvailable: boolean;
  canRevive: boolean;
  reviveUsed: boolean;
  reviveDemoted: boolean;
}

export interface RunResultSummary {
  outcome: 'CASHED_OUT' | 'FAILED';
  survivedRounds: number;
  finalScore: number;
  safeBankedScore: number;
  lostUnsettledScore: number;
  maxMultiplier: number;
  maxCombo: number;
  closestMm: number | null;
  closestTierLabel: string;
  highlightSummary: string;
  missedClueSummary: string | null;
  shardsCollected: number;
  closestSnapshot: ReplaySnapshotFrame | null;
  replayReel: ReplaySnapshotFrame[];
  moments: KeyMomentLog[];
  seed: string;
  isDailyChallenge: boolean;
  customSequence?: EventId[];
  isNewBest: boolean;
  reviveUsed: boolean;
  lastSecondCount: number;
  equippedSkin: SparkSkinId;
  progressionReport: RunProgressionRewardReport;
}
