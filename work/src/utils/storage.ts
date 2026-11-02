import { EventId } from '../data/eventConfig';
import { t } from '../i18n';
import { SeededRNG } from './random';

export interface GameSettings {
  decisionPressure: boolean;
  soundEnabled: boolean;
  musicEnabled: boolean;
  vibrationEnabled: boolean;
  reduceScare: boolean;
  reduceMotion: boolean;
  reduceFlashAndShake: boolean;
}

export interface RunHistoryEntry {
  id: string;
  timestamp: number;
  outcome: 'CASHED_OUT' | 'FAILED';
  score: number;
  lostScore: number;
  round: number;
  maxMultiplier: number;
  maxCombo: number;
  closestMm: number | null;
  seed: string;
  highlight: string;
}

export interface BestRecord {
  bestScore: number;
  bestRound: number;
  bestCombo: number;
  bestMultiplier: number;
  closestEverMm: number | null;
  totalCashOuts: number;
  totalRuns: number;
  recentHistory: RunHistoryEntry[];
}

export interface OnboardingState {
  completedCoreGuide: boolean;
  seenSemanticGuide: boolean;
  seenTwistIds: EventId[];
}

export interface DailyLeaderboardRow {
  rank: number;
  name: string;
  score: number;
  round: number;
  closestMm: number;
  isPlayer?: boolean;
  isReferenceTarget?: boolean;
}

const SETTINGS_KEY = 'last_second_settings_v2';
const RECORD_KEY = 'last_second_records_v2';
const ONBOARDING_KEY = 'last_second_onboarding_v1';
const DAILY_BEST_PREFIX = 'last_second_daily_v1_';

export const DEFAULT_SETTINGS: GameSettings = {
  decisionPressure: true,
  soundEnabled: true,
  musicEnabled: true,
  vibrationEnabled: true,
  reduceScare: false,
  reduceMotion: false,
  reduceFlashAndShake: false,
};

export const DEFAULT_RECORD: BestRecord = {
  bestScore: 0,
  bestRound: 0,
  bestCombo: 0,
  bestMultiplier: 1,
  closestEverMm: null,
  totalCashOuts: 0,
  totalRuns: 0,
  recentHistory: [],
};

export const DEFAULT_ONBOARDING: OnboardingState = {
  completedCoreGuide: false,
  seenSemanticGuide: false,
  seenTwistIds: [],
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore
  }
}

export function loadRecord(): BestRecord {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (!raw) return { ...DEFAULT_RECORD };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_RECORD,
      ...parsed,
      recentHistory: Array.isArray(parsed.recentHistory) ? parsed.recentHistory : [],
    };
  } catch {
    return { ...DEFAULT_RECORD };
  }
}

export function updateRecord(partial: {
  score: number;
  lostScore: number;
  round: number;
  combo: number;
  multiplier: number;
  cashedOut: boolean;
  closestMm: number | null;
  seed: string;
  highlight: string;
}): BestRecord {
  const current = loadRecord();
  const nextClosest =
    partial.closestMm !== null
      ? current.closestEverMm !== null
        ? Math.min(current.closestEverMm, partial.closestMm)
        : partial.closestMm
      : current.closestEverMm;

  const entry: RunHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    outcome: partial.cashedOut ? 'CASHED_OUT' : 'FAILED',
    score: partial.score,
    lostScore: partial.lostScore,
    round: partial.round,
    maxMultiplier: partial.multiplier,
    maxCombo: partial.combo,
    closestMm: partial.closestMm,
    seed: partial.seed,
    highlight: partial.highlight,
  };

  const next: BestRecord = {
    bestScore: Math.max(current.bestScore, partial.score),
    bestRound: Math.max(current.bestRound, partial.round),
    bestCombo: Math.max(current.bestCombo, partial.combo),
    bestMultiplier: Math.max(current.bestMultiplier, partial.multiplier),
    closestEverMm: nextClosest,
    totalCashOuts: current.totalCashOuts + (partial.cashedOut ? 1 : 0),
    totalRuns: current.totalRuns + 1,
    recentHistory: [entry, ...current.recentHistory].slice(0, 10),
  };
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }

  // Also record daily best if seed matches today's daily seed!
  const todaySeed = getTodayDailySeed();
  if (partial.seed === todaySeed) {
    saveDailyPlayerEntry({
      score: partial.score,
      round: partial.round,
      closestMm: partial.closestMm ?? 9.9,
    });
  }

  return next;
}

const REVIVE_DECLINES_KEY = 'last_second_revive_declines_v1';

/** How many times in a row the player has declined the revive offer (persisted). */
export function loadReviveDeclines(): number {
  try {
    const n = Number(localStorage.getItem(REVIVE_DECLINES_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function saveReviveDeclines(n: number): void {
  try {
    localStorage.setItem(REVIVE_DECLINES_KEY, String(Math.max(0, Math.floor(n))));
  } catch {
    // Ignore
  }
}

/**
 * Revive offers only appear when the unsettled score is worth saving:
 * at least half of the player's average score over their last 10 recorded runs.
 * With no history yet, a flat 150-point floor applies.
 */
export function getReviveOfferThreshold(): number {
  const scores = loadRecord()
    .recentHistory.map((e) => e.score)
    .filter((v) => v > 0);
  if (scores.length === 0) return 150;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg * 0.5);
}

export function loadOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return { ...DEFAULT_ONBOARDING };
    const parsed = JSON.parse(raw);
    return {
      completedCoreGuide: Boolean(parsed.completedCoreGuide),
      seenSemanticGuide: Boolean(parsed.seenSemanticGuide),
      seenTwistIds: Array.isArray(parsed.seenTwistIds) ? parsed.seenTwistIds : [],
    };
  } catch {
    return { ...DEFAULT_ONBOARDING };
  }
}

export function saveOnboarding(next: OnboardingState): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
}

/** Deterministic Daily Challenge Seed (e.g. DAILY20261101) */
export function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function getTodayDailySeed(): string {
  return `DAY${getTodayDateKey().slice(2)}`; // e.g., DAY261101
}

export function saveDailyPlayerEntry(entry: {
  score: number;
  round: number;
  closestMm: number;
}): void {
  const key = DAILY_BEST_PREFIX + getTodayDateKey();
  try {
    const prevRaw = localStorage.getItem(key);
    const prev = prevRaw ? JSON.parse(prevRaw) : null;
    const prevRuns: Array<{ score: number; round: number; closestMm: number }> =
      prev && Array.isArray(prev.runs)
        ? prev.runs
        : prev && typeof prev.score === 'number'
        ? [{ score: prev.score, round: prev.round, closestMm: prev.closestMm }]
        : [];

    const nextRuns = [entry, ...prevRuns]
      .sort((a, b) => b.score - a.score || b.round - a.round)
      .slice(0, 5);

    const bestScore = nextRuns[0]?.score ?? entry.score;
    const bestRound = Math.max(...nextRuns.map((r) => r.round), entry.round);
    const bestMm = Math.min(...nextRuns.map((r) => r.closestMm), entry.closestMm);

    localStorage.setItem(
      key,
      JSON.stringify({
        score: bestScore,
        round: bestRound,
        closestMm: bestMm,
        runs: nextRuns,
      })
    );
  } catch {
    // Ignore
  }
}

export function getTodayDailyBestScore(): number | null {
  try {
    const raw = localStorage.getItem(DAILY_BEST_PREFIX + getTodayDateKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed.score === 'number' ? parsed.score : null;
  } catch {
    return null;
  }
}

export function getDailyLeaderboard(): {
  seed: string;
  dateLabel: string;
  rows: DailyLeaderboardRow[];
  playerBestScore: number | null;
  localAttemptCount: number;
} {
  const dateKey = getTodayDateKey();
  const seed = getTodayDailySeed();
  const rng = new SeededRNG(`LB-${seed}`);

  // Honest local preset target lines (explicitly marked as non-networked reference targets)
  const targetTiers = [
    { label: t('storage.tierLegend'), baseRound: 13 },
    { label: t('storage.tierMaster'), baseRound: 10 },
    { label: t('storage.tierAdvanced'), baseRound: 7 },
    { label: t('storage.tierStarter'), baseRound: 4 },
  ];

  const baseEntries: Array<{
    name: string;
    score: number;
    round: number;
    closestMm: number;
    isPlayer?: boolean;
    isReferenceTarget?: boolean;
  }> = targetTiers.map((tier, idx) => {
    const round = tier.baseRound + rng.int(0, 1);
    const score = round * round * rng.int(165, 225);
    const closestMm = +(0.9 + idx * 1.1 + rng.next() * 0.6).toFixed(1);
    return {
      name: tier.label,
      score,
      round,
      closestMm,
      isReferenceTarget: true,
    };
  });

  let playerBestScore: number | null = null;
  let localAttemptCount = 0;
  try {
    const raw = localStorage.getItem(DAILY_BEST_PREFIX + dateKey);
    if (raw) {
      const p = JSON.parse(raw);
      playerBestScore = typeof p.score === 'number' ? p.score : null;
      const runs: Array<{ score: number; round: number; closestMm: number }> = Array.isArray(
        p.runs
      )
        ? p.runs
        : typeof p.score === 'number'
        ? [{ score: p.score, round: p.round, closestMm: p.closestMm }]
        : [];
      localAttemptCount = runs.length;
      runs.forEach((r, idx) => {
        baseEntries.push({
          name: idx === 0 ? t('storage.myBest') : t('storage.myRecord', { n: idx + 1 }),
          score: r.score,
          round: r.round,
          closestMm: r.closestMm,
          isPlayer: true,
        });
      });
    }
  } catch {
    // Ignore
  }

  baseEntries.sort((a, b) => b.score - a.score || b.round - a.round);

  const rows: DailyLeaderboardRow[] = baseEntries.slice(0, 8).map((item, idx) => ({
    rank: idx + 1,
    ...item,
  }));

  const dateLabel = `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
  return { seed, dateLabel, rows, playerBestScore, localAttemptCount };
}

