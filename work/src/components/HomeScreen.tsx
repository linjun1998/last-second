import React, { useEffect, useState } from 'react';
import { Play, SlidersHorizontal, Sparkles, Trophy, Users, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'motion/react';
import { ACHIEVEMENTS } from '../data/progressionConfig';
import { CLOCK_DISPLAY_FONT } from '../game/ClockworkRenderer';
import { ChallengePayload } from '../utils/challengeSeed';
import {
  getTodayDailyQuestsStatus,
  hasAffordableLockedSkin,
  ProgressionState,
} from '../utils/progressionStorage';
import { BestRecord, getTodayDailyBestScore } from '../utils/storage';
import { t, toggleLang, useLang } from '../i18n';
import { ProgressionModalTab } from './ProgressionModal';

interface HomeScreenProps {
  bestRecord: BestRecord;
  progression: ProgressionState;
  incomingChallenge: ChallengePayload | null;
  soundEnabled: boolean;
  onToggleSoundQuick: () => void;
  onStartNormal: () => void;
  onStartIncomingChallenge: () => void;
  onDismissChallenge: () => void;
  onOpenDailyChallenge: () => void;
  onOpenChallengeModal: () => void;
  onOpenProgression: (tab: ProgressionModalTab) => void;
  onOpenSettings: () => void;
  onOpenPrivacy: () => void;
}

const SLOGANS = ['home.slogan.1', 'home.slogan.2', 'home.slogan.3', 'home.slogan.4'];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  bestRecord,
  progression,
  incomingChallenge,
  soundEnabled,
  onToggleSoundQuick,
  onStartNormal,
  onStartIncomingChallenge,
  onDismissChallenge,
  onOpenDailyChallenge,
  onOpenChallengeModal,
  onOpenProgression,
  onOpenSettings,
  onOpenPrivacy,
}) => {
  const lang = useLang();
  const [sloganIndex, setSloganIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSloganIndex((prev) => (prev + 1) % SLOGANS.length);
    }, 3600);
    return () => window.clearInterval(id);
  }, []);

  const dailyQuests = getTodayDailyQuestsStatus(progression);
  const completedQuests = dailyQuests.filter((q) => q.completed).length;
  const canUnlockNewSkin = hasAffordableLockedSkin(progression);
  const todayDailyBest = getTodayDailyBestScore();

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between px-6 py-5 sm:px-12 sm:py-8">
      {/* Top Perimeter Utility Row: Career Readout + Time Shards Wallet + Audio/Settings */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums tracking-wide text-stone-400">
          {bestRecord.totalRuns > 0 ? (
            <>
              <span className="text-amber-100 font-semibold">
                {t('home.bestScore', { score: bestRecord.bestScore.toLocaleString() })}
              </span>
              <span className="text-amber-200/30" aria-hidden="true">
                ·
              </span>
              <span>{t('home.bestRound', { round: bestRecord.bestRound })}</span>
              <span className="hidden sm:inline text-amber-200/30" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline">
                {t('home.achievements', {
                  done: progression.unlockedAchievements.length,
                  total: ACHIEVEMENTS.length,
                })}
              </span>
            </>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2 shrink-0">
          {bestRecord.totalRuns > 0 && (
          <button
            type="button"
            onClick={() => onOpenProgression('SKINS')}
            title={t('home.shardsTitle')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200/20 hover:border-amber-300/55 bg-[#0b0d14]/90 text-xs font-mono font-bold tabular-nums text-amber-300 hover:text-amber-200 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <span>✦ {progression.shardsBalance.toLocaleString()}</span>
            <span className="font-sans font-medium text-stone-300 hidden xs:inline">
              {t('common.shards')}
            </span>
          </button>
          )}

          <button
            type="button"
            onClick={onToggleSoundQuick}
            aria-label={soundEnabled ? t('home.mute') : t('home.unmute')}
            className="p-2.5 rounded-lg border border-amber-200/15 hover:border-amber-300/45 bg-[#0b0d14]/90 text-stone-300 hover:text-amber-100 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-amber-200" />
            ) : (
              <VolumeX className="w-4 h-4 text-stone-500" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleLang}
            aria-label="Switch language / 切换语言"
            className="px-3 py-2 rounded-lg border border-amber-200/15 hover:border-amber-300/45 bg-[#0b0d14]/90 text-xs font-bold text-stone-200 hover:text-amber-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            {lang === 'zh' ? 'EN' : '中'}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200/15 hover:border-amber-300/45 bg-[#0b0d14]/90 text-xs font-medium text-stone-200 hover:text-amber-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-300/80" />
            <span>{t('common.settings')}</span>
          </button>
        </div>
      </div>

      {/* Center Focal Anchor: Bespoke Giant Clockwork SVG Lockup + Primary "开始" Button + Today's Brief */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="my-auto flex flex-col items-center text-center max-w-xl mx-auto w-full"
      >
        <div className="mb-3 flex flex-col items-center">
          <svg
            viewBox="0 0 560 132"
            className="w-72 sm:w-[450px] h-auto overflow-visible"
            aria-label={t('home.logoAria')}
          >
            <defs>
              <linearGradient id="lsClockBrass" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fffdf7" />
                <stop offset="52%" stopColor="#f3e3be" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
              <linearGradient id="lsSecondHandSweep" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(244,63,94,0)" />
                <stop offset="18%" stopColor="#f43f5e" />
                <stop offset="68%" stopColor="#fbbf24" />
                <stop offset="94%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="rgba(56,189,248,0)" />
              </linearGradient>
              <radialGradient id="lsSparkHalo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <stop offset="40%" stopColor="#fde047" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </radialGradient>
            </defs>

            <path
              d="M 118 36 A 210 210 0 0 1 442 36"
              fill="none"
              stroke="rgba(200,169,110,0.34)"
              strokeWidth="1.2"
              strokeDasharray="3 5"
            />
            <path
              d="M 148 38 A 180 180 0 0 1 412 38"
              fill="none"
              stroke="rgba(200,169,110,0.2)"
              strokeWidth="1"
            />

            <circle
              cx="280"
              cy="19"
              r="12"
              fill="#0b0d14"
              stroke="rgba(251,191,36,0.55)"
              strokeWidth="1.3"
            />
            <circle cx="280" cy="19" r="3" fill="#f43f5e" />
            <text
              x="280"
              y="8"
              textAnchor="middle"
              fill="rgba(253,230,138,0.85)"
              fontFamily={CLOCK_DISPLAY_FONT}
              fontWeight="700"
              fontSize="10"
              letterSpacing="2"
            >
              XII
            </text>
            <text
              x="186"
              y="26"
              textAnchor="middle"
              fill="rgba(200,169,110,0.5)"
              fontFamily={CLOCK_DISPLAY_FONT}
              fontWeight="600"
              fontSize="9.5"
            >
              XI
            </text>
            <text
              x="374"
              y="26"
              textAnchor="middle"
              fill="rgba(200,169,110,0.5)"
              fontFamily={CLOCK_DISPLAY_FONT}
              fontWeight="600"
              fontSize="9.5"
            >
              I
            </text>

            <path
              d="M 24 46 L 24 32 L 40 32"
              fill="none"
              stroke="rgba(200,169,110,0.5)"
              strokeWidth="1.5"
            />
            <path
              d="M 536 46 L 536 32 L 520 32"
              fill="none"
              stroke="rgba(200,169,110,0.5)"
              strokeWidth="1.5"
            />

            <text
              x="280"
              y="88"
              textAnchor="middle"
              fill="url(#lsClockBrass)"
              fontFamily={CLOCK_DISPLAY_FONT}
              fontWeight="700"
              fontSize="58"
              letterSpacing="8"
            >
              LAST SECOND
            </text>

            <line
              x1="36"
              y1="108"
              x2="512"
              y2="108"
              stroke="url(#lsSecondHandSweep)"
              strokeWidth="2"
            />
            <circle
              cx="104"
              cy="108"
              r="5.5"
              fill="#0b0d14"
              stroke="#f43f5e"
              strokeWidth="2"
            />
            <circle cx="104" cy="108" r="2" fill="#fbbf24" />

            <circle cx="468" cy="108" r="14" fill="url(#lsSparkHalo)" />
            <path
              d="M 478 108 L 470.5 110.5 L 468 117 L 465.5 110.5 L 458 108 L 465.5 105.5 L 468 99 L 470.5 105.5 Z"
              fill="#ffffff"
            />
          </svg>

          <div className="mt-0.5 flex items-center gap-4">
            <span className="h-px w-10 bg-amber-300/30" aria-hidden="true" />
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-[0.42em] text-amber-50 pl-[0.42em]">
              {t('home.brandSub')}
            </h1>
            <span className="h-px w-10 bg-amber-300/30" aria-hidden="true" />
          </div>
        </div>

        <p className="h-6 text-sm font-medium text-stone-300/95 mb-6 tracking-wide [text-wrap:balance]">
          {t(SLOGANS[sloganIndex])}
        </p>

        {incomingChallenge ? (
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-sky-400/45 bg-[#0a0d14]/95 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.88)] text-left">
            <div className="flex items-center justify-between text-xs font-mono text-sky-300 mb-2">
              <span>{t('home.challengeReceived')}</span>
              <span>SEED #{incomingChallenge.seed}</span>
            </div>
            <p className="text-sm text-stone-200 leading-relaxed mb-5">
              {incomingChallenge.creatorRound
                ? t('home.challengeBodyRound', {
                    round: incomingChallenge.creatorRound,
                    score: incomingChallenge.creatorScore?.toLocaleString() ?? '',
                  })
                : incomingChallenge.customSequence
                ? t('home.challengeBodyCustom', {
                    count: incomingChallenge.customSequence.length,
                  })
                : t('home.challengeBodyDefault')}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onStartIncomingChallenge}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-amber-300 hover:bg-amber-200 text-slate-950 font-bold text-sm transition-transform active:scale-[0.98] whitespace-nowrap cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{t('home.acceptChallenge')}</span>
              </button>
              <button
                type="button"
                onClick={onDismissChallenge}
                className="py-3.5 px-4 rounded-xl border border-amber-200/20 hover:border-amber-200/45 text-stone-300 hover:text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                {t('home.normalMode')}
              </button>
            </div>
          </div>
        ) : (
          <div className="pointer-events-auto flex flex-col items-center gap-2.5 w-full max-w-[360px]">
            {/* Dominant Primary Action: "开始" */}
            <button
              type="button"
              onClick={onStartNormal}
              className="group w-full flex items-center justify-center gap-2.5 py-4 px-8 rounded-xl bg-gradient-to-b from-amber-100 to-amber-300 hover:from-white hover:to-amber-200 text-slate-950 font-bold text-lg tracking-widest transition-all duration-150 active:scale-[0.98] shadow-[0_0_42px_rgba(251,191,36,0.28)] whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <Play className="w-4 h-4 fill-slate-950 transition-transform duration-150 group-hover:translate-x-0.5" />
              <span>{t('home.start')}</span>
            </button>

            {bestRecord.totalRuns === 0 && (
              <p className="text-[11px] text-stone-400 tracking-wide">{t('home.firstRunHint')}</p>
            )}

            {/* Secondary Entry Row — review fix: hidden for brand-new players (first-run focus) */}
            {bestRecord.totalRuns > 0 && (
            <div className="grid grid-cols-3 gap-2 w-full">
              <button
                type="button"
                onClick={onOpenDailyChallenge}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-amber-200/15 hover:border-amber-300/55 bg-[#0a0d14]/90 text-stone-200 hover:text-amber-100 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>{t('home.dailyDial')}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenProgression('SKINS')}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border bg-[#0a0d14]/90 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400 ${
                  canUnlockNewSkin
                    ? 'border-amber-300/55 text-amber-200 hover:border-amber-300'
                    : 'border-amber-200/15 hover:border-amber-300/55 text-stone-200 hover:text-amber-100'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>{canUnlockNewSkin ? t('home.skinNew') : t('home.skinAch')}</span>
              </button>

              <button
                type="button"
                onClick={onOpenChallengeModal}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-amber-200/15 hover:border-sky-400/50 bg-[#0a0d14]/90 text-stone-200 hover:text-sky-100 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                <Users className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>{t('home.friendSame')}</span>
              </button>
            </div>

            )}

            {/* At-a-Glance Today's Goals Strip — also post-first-run only */}
            {bestRecord.totalRuns > 0 && (
            <div className="w-full mt-1.5 rounded-xl border border-amber-200/14 bg-[#080a11]/88 px-4 py-3 text-left">
              <div className="flex items-center justify-between text-[11px] text-stone-400 pb-2 border-b border-slate-800/80">
                <span>
                  {t('home.todayGoals', { done: completedQuests })}
                  {todayDailyBest === null
                    ? t('home.dailyPending')
                    : t('home.todayBest', { score: todayDailyBest.toLocaleString() })}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenProgression('QUESTS')}
                  className="text-amber-300/90 hover:text-amber-200 cursor-pointer whitespace-nowrap"
                >
                  {t('home.details')}
                </button>
              </div>

              <div className="pt-2 space-y-1.5 text-xs">
                {dailyQuests.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between gap-2 font-mono tabular-nums"
                  >
                    <span
                      className={`font-sans truncate ${
                        q.completed ? 'text-stone-500 line-through' : 'text-stone-200'
                      }`}
                    >
                      {q.completed ? '✓ ' : '· '}
                      {q.title}
                    </span>
                    <span
                      className={`shrink-0 text-[11px] ${
                        q.completed ? 'text-emerald-400' : 'text-amber-300/90'
                      }`}
                    >
                      {q.completed
                        ? t('home.questDone')
                        : `${q.progress}/${q.target} (+${q.rewardShards}✦)`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Bottom Control & Colorblind Dual-Coding Legend */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-stone-400/90 tracking-wide">
        <div>
          {t('home.legendHold')} ·{' '}
          <span className="text-sky-300 font-medium">{t('home.legendSafe')}</span> ·{' '}
          <span className="text-amber-300 font-medium">{t('home.legendWarn')}</span> ·{' '}
          <span className="text-rose-400 font-medium">{t('home.legendLethal')}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="pointer-events-auto underline underline-offset-2 decoration-stone-600 hover:text-amber-200 transition-colors cursor-pointer"
          >
            {t('common.privacy')}
          </button>
          <span className="font-mono text-[11px] text-stone-500">{t('home.keysHint')}</span>
        </div>
      </div>
    </div>
  );
};
