import { EventId } from './eventConfig';

export type RhythmStage = 'PRESSURE' | 'EXCITEMENT' | 'FRENZY';

export type EventModifierId =
  | 'NONE'
  | 'OVERCLOCK'   // 极速过载: Warning faster (+18%), Score +25%
  | 'DOUBLE_ECHO' // 双波余震: Secondary lethal pulse wave right after first strike, Score +35%
  | 'TUNNEL_FOG'  // 迷雾限视: Restricted spotlight vision, Score +30%
  | 'MIRROR_SPIN'; // 镜像旋移: Arena hazards slowly rotate during active phase, Score +30%

export interface ModifierMeta {
  id: EventModifierId;
  name: string;
  nameEn: string;
  shortDesc: string;
  shortDescEn: string;
  scoreMultiplier: number;
}

export const MODIFIER_CONFIGS: Record<EventModifierId, ModifierMeta> = {
  NONE: {
    id: 'NONE',
    name: '',
    nameEn: '',
    shortDesc: '',
    shortDescEn: '',
    scoreMultiplier: 1.0,
  },
  OVERCLOCK: {
    id: 'OVERCLOCK',
    name: '极速过载',
    nameEn: 'Overclocked',
    shortDesc: '预警提速 15% · 奖励 +25%',
    shortDescEn: 'Warning 15% faster · reward +25%',
    scoreMultiplier: 1.25,
  },
  DOUBLE_ECHO: {
    id: 'DOUBLE_ECHO',
    name: '双波余震',
    nameEn: 'Double Echo',
    shortDesc: '中心爆发二次余震环 · 奖励 +35%',
    shortDescEn: 'Second aftershock ring from center · reward +35%',
    scoreMultiplier: 1.35,
  },
  TUNNEL_FOG: {
    id: 'TUNNEL_FOG',
    name: '战术限视',
    nameEn: 'Tactical Fog',
    shortDesc: '周边视野受限 · 奖励 +30%',
    shortDescEn: 'Limited peripheral vision · reward +30%',
    scoreMultiplier: 1.3,
  },
  MIRROR_SPIN: {
    id: 'MIRROR_SPIN',
    name: '空间旋移',
    nameEn: 'Spatial Drift',
    shortDesc: '危险轨迹持续偏转 · 奖励 +30%',
    shortDescEn: 'Hazard paths keep rotating · reward +30%',
    scoreMultiplier: 1.3,
  },
};

export interface StageConfig {
  minRound: number;
  maxRound: number;
  stageName: string;
  stageNameEn: string;
  rhythm: RhythmStage;
  speedScale: number;
  generosityScale: number;
  allowedEvents: EventId[];
  horrorCurveBase: number;
  modifierChance: number;
  allowedModifiers: EventModifierId[];
}

export const CHECKPOINT_INTERVAL_ROUNDS = 5;
export const CHECKPOINT_SAVE_RATIO = 0.5; // Auto-bank 50% of unsettled score every 5 rounds
export const LAST_SECOND_WINDOW_SEC = 0.25; // Final ~0.25s before warning turns lethal
export const LAST_SECOND_SCORE_MULTIPLIER = 1.5; // +50% round score bonus for Last-Second escape

/**
 * Smooth, strictly monotonically increasing multiplier formula (zero plateaus):
 * M(r) = round(1.24^(r-1) * (1 + 0.42 * (r-1)))
 * R1..R20: 1, 2, 3, 4, 6, 9, 13, 18, 24, 33, 45, 60, 80, 106, 140, 184, 241, 315, 411, 535...
 */
export function getMultiplierForRound(round: number): number {
  const n = Math.max(0, Math.floor(round) - 1);
  return Math.round(Math.pow(1.24, n) * (1 + 0.42 * n));
}

export const ROUND_MULTIPLIERS: number[] = Array.from({ length: 20 }, (_, idx) =>
  getMultiplierForRound(idx + 1)
);

export function getRhythmStage(round: number, combo: number): RhythmStage {
  if (round >= 6 || combo >= 5) return 'FRENZY';
  if (round >= 3 || combo >= 2) return 'EXCITEMENT';
  return 'PRESSURE';
}

export function getComboChallengeModifiers(combo: number): {
  warningScale: number;
  safeWindowScale: number;
  scoreBonusMultiplier: number;
} {
  const clamped = Math.max(0, Math.min(combo, 12));
  return {
    warningScale: 1 - clamped * 0.01,
    safeWindowScale: 1 - clamped * 0.006,
    scoreBonusMultiplier: 1 + clamped * 0.08,
  };
}

export const DIFFICULTY_STAGES: StageConfig[] = [
  {
    minRound: 1,
    maxRound: 1,
    stageName: '第一阶段 · 初次试炼',
    stageNameEn: 'Stage 1 · First Trial',
    rhythm: 'PRESSURE',
    speedScale: 0.75,
    generosityScale: 1.3,
    allowedEvents: ['shrinking_zone', 'closing_wall'],
    horrorCurveBase: 0,
    modifierChance: 0,
    allowedModifiers: [],
  },
  {
    minRound: 2,
    maxRound: 2,
    stageName: '第二阶段 · 机械苏醒',
    stageNameEn: 'Stage 2 · The Movement Wakes',
    rhythm: 'PRESSURE',
    speedScale: 0.87,
    generosityScale: 1.16,
    allowedEvents: ['moving_obstacle', 'rotating_blade', 'closing_wall'],
    horrorCurveBase: 0,
    modifierChance: 0,
    allowedModifiers: [],
  },
  {
    minRound: 3,
    maxRound: 3,
    stageName: '第三阶段 · 毫厘缝隙',
    stageNameEn: 'Stage 3 · Hairline Gaps',
    rhythm: 'EXCITEMENT',
    speedScale: 0.98,
    generosityScale: 1.05,
    allowedEvents: ['narrow_corridor', 'sudden_drop', 'rotating_blade', 'moving_obstacle'],
    horrorCurveBase: 0.14,
    modifierChance: 0,
    allowedModifiers: [],
  },
  {
    // Review fix: trick events are introduced ONE at a time (was: all three at round 4).
    // Round 4 teaches only Fake Safety, at a gentler speed with wider safe zones.
    minRound: 4,
    maxRound: 4,
    stageName: '第四阶段 · 真假出口',
    stageNameEn: 'Stage 4 · True & False Exits',
    rhythm: 'EXCITEMENT',
    speedScale: 1.0,
    generosityScale: 1.12,
    allowedEvents: ['fake_safety', 'chain_sweep', 'narrow_corridor', 'sudden_drop'],
    horrorCurveBase: 0.22,
    modifierChance: 0,
    allowedModifiers: [],
  },
  {
    // Round 5: ONLY new thing = Darkness Ambush. Modifiers deferred (de-overlap rule:
    // a round that introduces something new never introduces a second new thing).
    minRound: 5,
    maxRound: 5,
    stageName: '第五阶段 · 暗夜伏击',
    stageNameEn: 'Stage 5 · Night Ambush',
    rhythm: 'EXCITEMENT',
    speedScale: 1.04,
    generosityScale: 1.02,
    allowedEvents: ['darkness_ambush', 'fake_safety', 'chain_sweep', 'narrow_corridor'],
    horrorCurveBase: 0.3,
    modifierChance: 0,
    allowedModifiers: [],
  },
  {
    // Round 6: ONLY new thing = Direction Invert. No modifiers yet.
    minRound: 6,
    maxRound: 6,
    stageName: '第六阶段 · 倒转之轮',
    stageNameEn: 'Stage 6 · The Inverted Wheel',
    rhythm: 'FRENZY',
    speedScale: 1.1,
    generosityScale: 1.0,
    allowedEvents: [
      'direction_invert',
      'fake_safety',
      'darkness_ambush',
      'chain_sweep',
      'narrow_corridor',
      'sudden_drop',
    ],
    horrorCurveBase: 0.28,
    modifierChance: 0,
    allowedModifiers: [],
  },
  {
    // Round 7: ONLY new thing = OVERCLOCK modifier.
    minRound: 7,
    maxRound: 7,
    stageName: '第七阶段 · 过载初现',
    stageNameEn: 'Stage 7 · First Overclock',
    rhythm: 'FRENZY',
    speedScale: 1.15,
    generosityScale: 0.98,
    allowedEvents: [
      'direction_invert',
      'fake_safety',
      'darkness_ambush',
      'chain_sweep',
      'narrow_corridor',
      'sudden_drop',
    ],
    horrorCurveBase: 0.28,
    modifierChance: 0.4,
    allowedModifiers: ['OVERCLOCK'],
  },
  {
    // Round 8: ONLY new thing = TUNNEL_FOG modifier.
    minRound: 8,
    maxRound: 8,
    stageName: '第八阶段 · 雾中回轮',
    stageNameEn: 'Stage 8 · Gears in Fog',
    rhythm: 'FRENZY',
    speedScale: 1.18,
    generosityScale: 0.98,
    allowedEvents: [
      'direction_invert',
      'fake_safety',
      'darkness_ambush',
      'chain_sweep',
      'narrow_corridor',
      'sudden_drop',
    ],
    horrorCurveBase: 0.28,
    modifierChance: 0.45,
    allowedModifiers: ['OVERCLOCK', 'TUNNEL_FOG'],
  },
  {
    // Round 9: ONLY new thing = MIRROR_SPIN modifier.
    minRound: 9,
    maxRound: 9,
    stageName: '第九阶段 · 旋移之舞',
    stageNameEn: 'Stage 9 · The Drifting Dance',
    rhythm: 'FRENZY',
    speedScale: 1.22,
    generosityScale: 0.96,
    allowedEvents: [
      'direction_invert',
      'fake_safety',
      'darkness_ambush',
      'chain_sweep',
      'narrow_corridor',
      'sudden_drop',
    ],
    horrorCurveBase: 0.3,
    modifierChance: 0.55,
    allowedModifiers: ['OVERCLOCK', 'TUNNEL_FOG', 'MIRROR_SPIN'],
  },
  {
    // Round 10: ONLY new thing = Frenzy Gauntlet event.
    minRound: 10,
    maxRound: 10,
    stageName: '第十阶段 · 报时风暴',
    stageNameEn: 'Stage 10 · Chime Storm',
    rhythm: 'FRENZY',
    speedScale: 1.24,
    generosityScale: 0.96,
    allowedEvents: [
      'frenzy_gauntlet',
      'direction_invert',
      'fake_safety',
      'darkness_ambush',
      'chain_sweep',
      'narrow_corridor',
      'sudden_drop',
    ],
    horrorCurveBase: 0.3,
    modifierChance: 0.6,
    allowedModifiers: ['OVERCLOCK', 'TUNNEL_FOG', 'MIRROR_SPIN'],
  },
  {
    // Round 11: ONLY new thing = DOUBLE_ECHO modifier.
    minRound: 11,
    maxRound: 11,
    stageName: '第十一阶段 · 双波余震',
    stageNameEn: 'Stage 11 · Double Echo',
    rhythm: 'FRENZY',
    speedScale: 1.26,
    generosityScale: 0.96,
    allowedEvents: [
      'frenzy_gauntlet',
      'direction_invert',
      'fake_safety',
      'darkness_ambush',
      'chain_sweep',
      'narrow_corridor',
      'sudden_drop',
    ],
    horrorCurveBase: 0.3,
    modifierChance: 0.7,
    allowedModifiers: ['OVERCLOCK', 'TUNNEL_FOG', 'MIRROR_SPIN', 'DOUBLE_ECHO'],
  },
  {
    // Round 12+: ONLY new thing at 12 = Razor Gate; afterwards the full sandbox (all 12 events x 4 modifiers).
    minRound: 12,
    maxRound: 999,
    stageName: '极限阶段 · 异变终局',
    stageNameEn: 'Final Stage · Mutant Endgame',
    rhythm: 'FRENZY',
    speedScale: 1.28,
    generosityScale: 0.96,
    allowedEvents: [
      'razor_gate',
      'frenzy_gauntlet',
      'direction_invert',
      'fake_safety',
      'darkness_ambush',
      'chain_sweep',
      'narrow_corridor',
      'sudden_drop',
      'rotating_blade',
      'moving_obstacle',
      'closing_wall',
      'shrinking_zone',
    ],
    horrorCurveBase: 0.3,
    modifierChance: 0.85,
    allowedModifiers: ['OVERCLOCK', 'DOUBLE_ECHO', 'TUNNEL_FOG', 'MIRROR_SPIN'],
  },
];

export function getStageForRound(round: number): StageConfig {
  for (const stage of DIFFICULTY_STAGES) {
    if (round >= stage.minRound && round <= stage.maxRound) {
      return stage;
    }
  }
  return DIFFICULTY_STAGES[DIFFICULTY_STAGES.length - 1];
}
