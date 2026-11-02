import {
  ACHIEVEMENTS,
  AchievementDef,
  DailyQuestTemplate,
  getDailyQuestTemplatesForDate,
  SPARK_SKINS,
  SparkSkinId,
} from '../data/progressionConfig';
import { getTodayDateKey, loadRecord } from './storage';
import { pick } from '../i18n';

export interface DailyQuestProgressItem {
  id: string;
  title: string;
  progress: number;
  target: number;
  rewardShards: number;
  completed: boolean;
}

export interface ProgressionState {
  shardsBalance: number;
  totalShardsEarned: number;
  unlockedSkins: SparkSkinId[];
  equippedSkin: SparkSkinId;
  unlockedAchievements: string[];
  dailyDateKey: string;
  dailyProgressMap: Record<string, number>;
  dailyRewardedIds: string[];
}

export interface RunSettlementInput {
  outcome: 'CASHED_OUT' | 'FAILED';
  survivedRounds: number;
  finalScore: number;
  maxCombo: number;
  closestMm: number | null;
  shardsCollectedInArena: number;
  lastSecondCount: number;
  maxConsecutiveLastSecond: number;
  nearMissTotalCount: number;
  untouchedThroughRound5: boolean;
  horrorEventsCleared: number;
  reviveUsed: boolean;
  isDailyChallenge: boolean;
}

export interface RunProgressionRewardReport {
  baseSurvivalShards: number;
  cashOutBonusShards: number;
  skillBonusShards: number;
  arenaPickedShards: number;
  questBonusShards: number;
  achievementBonusShards: number;
  totalEarnedThisRun: number;
  newBalance: number;
  newlyCompletedQuests: DailyQuestTemplate[];
  newlyUnlockedAchievements: AchievementDef[];
}

const PROGRESSION_STORAGE_KEY = 'last_second_progression_v1';

function createDefaultProgression(): ProgressionState {
  return {
    shardsBalance: 0,
    totalShardsEarned: 0,
    unlockedSkins: ['classic_spark'],
    equippedSkin: 'classic_spark',
    unlockedAchievements: [],
    dailyDateKey: getTodayDateKey(),
    dailyProgressMap: {},
    dailyRewardedIds: [],
  };
}

export function loadProgression(): ProgressionState {
  const today = getTodayDateKey();
  try {
    const raw = localStorage.getItem(PROGRESSION_STORAGE_KEY);
    if (!raw) {
      return createDefaultProgression();
    }
    const parsed = JSON.parse(raw);
    const unlockedSkins: SparkSkinId[] = Array.isArray(parsed.unlockedSkins)
      ? parsed.unlockedSkins
      : ['classic_spark'];
    if (!unlockedSkins.includes('classic_spark')) {
      unlockedSkins.unshift('classic_spark');
    }
    const equippedSkin: SparkSkinId = unlockedSkins.includes(parsed.equippedSkin)
      ? parsed.equippedSkin
      : 'classic_spark';

    const state: ProgressionState = {
      shardsBalance: Math.max(0, Number(parsed.shardsBalance) || 0),
      totalShardsEarned: Math.max(0, Number(parsed.totalShardsEarned) || 0),
      unlockedSkins,
      equippedSkin,
      unlockedAchievements: Array.isArray(parsed.unlockedAchievements)
        ? parsed.unlockedAchievements
        : [],
      dailyDateKey: typeof parsed.dailyDateKey === 'string' ? parsed.dailyDateKey : today,
      dailyProgressMap:
        parsed.dailyProgressMap && typeof parsed.dailyProgressMap === 'object'
          ? parsed.dailyProgressMap
          : {},
      dailyRewardedIds: Array.isArray(parsed.dailyRewardedIds) ? parsed.dailyRewardedIds : [],
    };

    // Reset daily quests automatically when the calendar day rolls over
    if (state.dailyDateKey !== today) {
      state.dailyDateKey = today;
      state.dailyProgressMap = {};
      state.dailyRewardedIds = [];
      saveProgression(state);
    }

    return state;
  } catch {
    return createDefaultProgression();
  }
}

export function saveProgression(state: ProgressionState): void {
  try {
    localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function getTodayDailyQuestsStatus(
  stateInput?: ProgressionState
): DailyQuestProgressItem[] {
  const state = stateInput || loadProgression();
  const templates = getDailyQuestTemplatesForDate(state.dailyDateKey);
  return templates.map((tpl) => {
    const progress = Math.min(tpl.target, state.dailyProgressMap[tpl.id] || 0);
    const completed = state.dailyRewardedIds.includes(tpl.id) || progress >= tpl.target;
    return {
      id: tpl.id,
      title: pick(tpl.title, tpl.titleEn),
      progress,
      target: tpl.target,
      rewardShards: tpl.rewardShards,
      completed,
    };
  });
}

export function hasAffordableLockedSkin(stateInput?: ProgressionState): boolean {
  const state = stateInput || loadProgression();
  return SPARK_SKINS.some(
    (s) => !state.unlockedSkins.includes(s.id) && state.shardsBalance >= s.cost
  );
}

export function equipSparkSkin(skinId: SparkSkinId): ProgressionState {
  const state = loadProgression();
  if (!state.unlockedSkins.includes(skinId)) return state;
  state.equippedSkin = skinId;
  saveProgression(state);
  return state;
}

export function unlockAndEquipSparkSkin(skinId: SparkSkinId): {
  success: boolean;
  state: ProgressionState;
  unlockedAchievements: AchievementDef[];
} {
  const state = loadProgression();
  const cfg = SPARK_SKINS.find((s) => s.id === skinId);
  if (!cfg) return { success: false, state, unlockedAchievements: [] };

  if (state.unlockedSkins.includes(skinId)) {
    state.equippedSkin = skinId;
    saveProgression(state);
    return { success: true, state, unlockedAchievements: [] };
  }

  if (state.shardsBalance < cfg.cost) {
    return { success: false, state, unlockedAchievements: [] };
  }

  state.shardsBalance -= cfg.cost;
  state.unlockedSkins = [...state.unlockedSkins, skinId];
  state.equippedSkin = skinId;

  // Check skin collector achievement immediately!
  const newlyUnlockedAchievements: AchievementDef[] = [];
  if (
    state.unlockedSkins.length >= 3 &&
    !state.unlockedAchievements.includes('unlock_3_skins')
  ) {
    const ach = ACHIEVEMENTS.find((a) => a.id === 'unlock_3_skins');
    if (ach) {
      state.unlockedAchievements = [...state.unlockedAchievements, ach.id];
      state.shardsBalance += ach.rewardShards;
      state.totalShardsEarned += ach.rewardShards;
      newlyUnlockedAchievements.push(ach);
    }
  }

  saveProgression(state);
  return { success: true, state, unlockedAchievements: newlyUnlockedAchievements };
}

/**
 * Settles a finished run into local progression storage:
 * 1. Calculates performance-based Time Shards
 * 2. Updates today's 3 Daily Quests & pays quest bonuses
 * 3. Evaluates all 16 Achievements & pays achievement bonuses
 */
export function settleRunProgression(
  input: RunSettlementInput
): RunProgressionRewardReport {
  const state = loadProgression();
  const career = loadRecord();

  // 1. Performance Shard Formula
  const baseSurvivalShards = Math.max(2, input.survivedRounds * 3);
  const cashOutBonusShards =
    input.outcome === 'CASHED_OUT' ? 8 + Math.round(input.survivedRounds * 1.5) : 0;
  const skillBonusShards = input.lastSecondCount * 6 + input.nearMissTotalCount * 3;
  const arenaPickedShards = input.shardsCollectedInArena * 10;

  // 2. Daily Quests Update
  const todayTemplates = getDailyQuestTemplatesForDate(state.dailyDateKey);
  const newlyCompletedQuests: DailyQuestTemplate[] = [];
  let questBonusShards = 0;

  for (const tpl of todayTemplates) {
    const prev = state.dailyProgressMap[tpl.id] || 0;
    let delta = 0;
    switch (tpl.metric) {
      case 'PLAY_RUNS':
        delta = 1;
        break;
      case 'CASH_OUTS':
        delta = input.outcome === 'CASHED_OUT' ? 1 : 0;
        break;
      case 'PLAY_DAILY':
        delta = input.isDailyChallenge ? 1 : 0;
        break;
      case 'NEAR_MISSES':
        delta = input.nearMissTotalCount;
        break;
      case 'LAST_SECONDS':
        delta = input.lastSecondCount;
        break;
      case 'COLLECT_SHARDS':
        delta = input.shardsCollectedInArena;
        break;
      case 'REACH_ROUND_4':
        delta = input.survivedRounds >= 4 ? 1 : 0;
        break;
      case 'TOTAL_ROUNDS':
        delta = input.survivedRounds;
        break;
      case 'REACH_COMBO_4':
        delta = input.maxCombo >= 4 ? 1 : 0;
        break;
    }

    const nextVal = Math.min(tpl.target, prev + delta);
    state.dailyProgressMap[tpl.id] = nextVal;

    if (nextVal >= tpl.target && !state.dailyRewardedIds.includes(tpl.id)) {
      state.dailyRewardedIds = [...state.dailyRewardedIds, tpl.id];
      questBonusShards += tpl.rewardShards;
      newlyCompletedQuests.push(tpl);
    }
  }

  // 3. Achievements Evaluation (16 total)
  const newlyUnlockedAchievements: AchievementDef[] = [];
  let achievementBonusShards = 0;

  const tryUnlock = (id: string, condition: boolean) => {
    if (!condition || state.unlockedAchievements.includes(id)) return;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return;
    state.unlockedAchievements = [...state.unlockedAchievements, id];
    achievementBonusShards += def.rewardShards;
    newlyUnlockedAchievements.push(def);
  };

  tryUnlock('first_cash_out', input.outcome === 'CASHED_OUT' || career.totalCashOuts >= 1);
  tryUnlock('last_second_streak_3', input.maxConsecutiveLastSecond >= 3);
  tryUnlock('untouched_round_5', input.untouchedThroughRound5);
  tryUnlock('survive_round_5', input.survivedRounds >= 5 || career.bestRound >= 5);
  tryUnlock('survive_round_10', input.survivedRounds >= 10 || career.bestRound >= 10);
  tryUnlock('survive_round_15', input.survivedRounds >= 15 || career.bestRound >= 15);
  tryUnlock(
    'godlike_margin',
    (input.closestMm !== null && input.closestMm <= 1.5) ||
      (career.closestEverMm !== null && career.closestEverMm <= 1.5)
  );
  tryUnlock('combo_8', input.maxCombo >= 8 || career.bestCombo >= 8);
  tryUnlock('greedy_shards_3', input.shardsCollectedInArena >= 3);
  tryUnlock('score_5000', input.finalScore >= 5000 || career.bestScore >= 5000);
  tryUnlock('score_15000', input.finalScore >= 15000 || career.bestScore >= 15000);
  tryUnlock('revive_comeback', input.reviveUsed && input.outcome === 'CASHED_OUT');
  tryUnlock('daily_complete', input.isDailyChallenge);
  tryUnlock('deception_clear_3', input.horrorEventsCleared >= 3);
  tryUnlock('unlock_3_skins', state.unlockedSkins.length >= 3);
  tryUnlock('career_20_runs', career.totalRuns >= 20);

  const totalEarnedThisRun =
    baseSurvivalShards +
    cashOutBonusShards +
    skillBonusShards +
    arenaPickedShards +
    questBonusShards +
    achievementBonusShards;

  state.shardsBalance += totalEarnedThisRun;
  state.totalShardsEarned += totalEarnedThisRun;
  saveProgression(state);

  return {
    baseSurvivalShards,
    cashOutBonusShards,
    skillBonusShards,
    arenaPickedShards,
    questBonusShards,
    achievementBonusShards,
    totalEarnedThisRun,
    newBalance: state.shardsBalance,
    newlyCompletedQuests,
    newlyUnlockedAchievements,
  };
}
