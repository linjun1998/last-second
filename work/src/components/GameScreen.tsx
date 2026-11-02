import React from 'react';
import {
  AlertTriangle,
  FastForward,
  Film,
  Flame,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CHECKPOINT_INTERVAL_ROUNDS,
  getMultiplierForRound,
  LAST_SECOND_WINDOW_SEC,
} from '../data/difficultyConfig';
import { HudSnapshot } from '../game/GameState';
import { t, useLang } from '../i18n';

interface GameScreenProps {
  hud: HudSnapshot;
  isRevivingAdLoading: boolean;
  reduceFlashAndShake?: boolean;
  decisionPressure?: boolean;
  onContinueNextRound: () => void;
  onCashOut: () => void;
  onRequestRevive: () => void;
  onDeclineRevive: () => void;
  onSkipPostAnimation: () => void;
  onExportDeathReplayNow: () => void;
  onOpenSettings: () => void;
}


export const GameScreen: React.FC<GameScreenProps> = ({
  hud,
  isRevivingAdLoading,
  reduceFlashAndShake = false,
  decisionPressure = true,
  onContinueNextRound,
  onCashOut,
  onRequestRevive,
  onDeclineRevive,
  onSkipPostAnimation,
  onExportDeathReplayNow,
  onOpenSettings,
}) => {
  useLang();
  const totalCashOutScore = hud.safeBankedScore + hud.unsettledScore;
  const canCashOutMidIntro = hud.phase === 'ROUND_INTRO' && totalCashOutScore > 0;
  const isDecision = hud.phase === 'DECISION_PAUSE';
  const isDeathReplay = hud.phase === 'DEATH_REPLAY';
  const isReviveOffer = hud.phase === 'REVIVE_OFFER';
  const isCashingOut = hud.phase === 'CASHING_OUT_RELIEF';

  const isCoreGuideActive =
    hud.onboardingStep === 'HOLD_TO_CHARGE' || hud.onboardingStep === 'RELEASE_TO_DASH';

  const isHighStakes = hud.multiplier >= 4 || hud.unsettledScore >= 250;

  // Dynamic sliding window of 7 strictly-increasing round multipliers around current round
  const ladderStartRound = Math.max(1, hud.round - 2);
  const dynamicLadder = Array.from({ length: 7 }, (_, i) => {
    const r = ladderStartRound + i;
    return { round: r, mult: getMultiplierForRound(r) };
  });

  const nextCheckpointRound =
    Math.floor(hud.round / CHECKPOINT_INTERVAL_ROUNDS) * CHECKPOINT_INTERVAL_ROUNDS +
    CHECKPOINT_INTERVAL_ROUNDS;
  const roundsToNextCheckpoint = nextCheckpointRound - hud.round;

  const isInLastSecondWindow =
    !hud.isLethalActive &&
    hud.warningRemainingSec !== null &&
    hud.warningRemainingSec > 0 &&
    hud.warningRemainingSec <= LAST_SECOND_WINDOW_SEC;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-8">
      {/* Onboarding Spotlight Vignette (Rounds 1-2 first run, leaves center clock dial 100% clear) */}
      {isCoreGuideActive && !isDecision && !isReviveOffer && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 transition-opacity duration-300"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(8,9,14,0) 32%, rgba(5,6,10,0.76) 76%)',
          }}
        />
      )}

      {/* Decision Phase Escapement Tick Pulse Overlay (suppressed when reduceFlashAndShake is on) */}
      {isDecision && !reduceFlashAndShake && (
        <motion.div
          key={`beat-vignette-${hud.decisionHeartbeatTick}`}
          initial={{ opacity: isHighStakes ? 0.52 : 0.32 }}
          animate={{ opacity: 0.08 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(244,63,94,0) 45%, rgba(225,29,72,0.34) 100%)',
          }}
        />
      )}

      {/* Top Perimeter Horological Status Cluster */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 tabular-nums">
            <span className="font-display text-xl sm:text-2xl font-bold tracking-wider text-amber-50">
              ROUND {String(hud.round).padStart(2, '0')}
            </span>
            <span className="text-amber-200/30 font-mono" aria-hidden="true">
              /
            </span>
            <span
              className={`font-mono text-base sm:text-lg font-bold ${
                hud.rhythmStage === 'FRENZY'
                  ? 'text-rose-400'
                  : hud.rhythmStage === 'EXCITEMENT'
                  ? 'text-amber-300'
                  : 'text-sky-300'
              }`}
            >
              x{hud.multiplier}
            </span>
            {hud.rhythmStage === 'FRENZY' && (
              <span className="text-xs font-bold tracking-wider text-rose-300">
                {t('game.frenzyBurst')}
              </span>
            )}
            {hud.combo > 1 && (
              <>
                <span className="text-amber-200/30 font-mono" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono text-sm sm:text-base font-bold text-amber-300">
                  {t('game.combo', { combo: hud.combo, pct: hud.comboScoreBonusPct })}
                </span>
              </>
            )}
          </div>

          {/* Unboxed clean clockwork mechanism name, active modifier & observable clue */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="font-semibold text-amber-50/95">
              {hud.eventName || hud.stageLabel}
            </span>
            {hud.modifier !== 'NONE' && hud.modifierLabel && (
              <>
                <span className="text-amber-200/30" aria-hidden="true">
                  ·
                </span>
                <span className="font-semibold text-amber-300">
                  {t('game.modifierPrefix', { label: hud.modifierLabel })}
                </span>
              </>
            )}
            {!isDecision && !isDeathReplay && !isReviveOffer && hud.eventClue && (
              <>
                <span className="text-amber-200/30" aria-hidden="true">
                  ·
                </span>
                <span className="text-sky-300">{hud.eventClue}</span>
              </>
            )}
            {!isDecision && !isDeathReplay && !isReviveOffer && hud.activeShardAvailable && (
              <>
                <span className="text-amber-200/30" aria-hidden="true">
                  ·
                </span>
                <span className="font-semibold text-amber-300">{t('game.shardHint')}</span>
              </>
            )}
          </div>

          {!isDecision && hud.phase === 'ACTIVE_HAZARD' && (
            <div className="flex items-center gap-3 mt-0.5">
              <div className="w-36 sm:w-48 h-1.5 bg-stone-900/95 border border-amber-200/15 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-none ${
                    hud.isLethalActive
                      ? 'bg-rose-500'
                      : isInLastSecondWindow
                      ? 'bg-amber-300'
                      : 'bg-amber-400'
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(0, hud.roundProgress * 100))}%`,
                  }}
                />
              </div>
              <span
                className={`text-[11px] font-mono tabular-nums ${
                  hud.isLethalActive
                    ? 'text-rose-400 font-semibold'
                    : isInLastSecondWindow
                    ? 'text-amber-200 font-bold'
                    : 'text-stone-400'
                }`}
              >
                {hud.isLethalActive
                  ? t('game.lethalNow')
                  : hud.warningRemainingSec !== null
                  ? isInLastSecondWindow
                    ? t('game.lastSecondWindow', { sec: hud.warningRemainingSec.toFixed(2) })
                    : t('game.warnCountdown', { sec: hud.warningRemainingSec.toFixed(2) })
                  : t('game.warnOnly')}
              </span>
            </div>
          )}
        </div>

        {/* Right Unsettled Reward / Checkpoint Vault Target */}
        <div className="flex items-start gap-4">
          <div className="text-right font-mono tabular-nums">
            <div className="text-[11px] font-sans text-stone-400 tracking-wide">
              {isCashingOut
                ? t('game.cashingOut')
                : isDecision || isReviveOffer
                ? t('game.unsettledRisk')
                : t('game.unsettled')}
            </div>
            <motion.div
              key={
                isDecision && !reduceFlashAndShake
                  ? `score-beat-${hud.decisionHeartbeatTick}`
                  : 'score-steady'
              }
              initial={
                isDecision && !reduceFlashAndShake
                  ? {
                      scale: isHighStakes ? 1.11 : 1.05,
                      x: isHighStakes ? (hud.decisionHeartbeatTick % 2 === 0 ? -2.5 : 2.5) : 0,
                    }
                  : false
              }
              animate={{ scale: 1, x: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className={`text-2xl sm:text-3xl font-bold tracking-tight transition-colors ${
                isCashingOut
                  ? 'text-emerald-300'
                  : isDecision && isHighStakes
                  ? 'text-amber-300'
                  : 'text-sky-300'
              }`}
            >
              {(isCashingOut ? totalCashOutScore : hud.unsettledScore).toLocaleString()}
            </motion.div>
            <div className="text-[11px] text-stone-400 flex flex-wrap items-center justify-end gap-x-1.5">
              {hud.safeBankedScore > 0 ? (
                <span className="text-emerald-300 font-semibold">
                  {t('game.banked', { score: hud.safeBankedScore.toLocaleString() })}
                </span>
              ) : (
                <span className="text-stone-500">{t('game.bankedHint')}</span>
              )}
              <span className="text-amber-200/30" aria-hidden="true">
                ·
              </span>
              <span className="text-stone-500">
                {hud.isDailyChallenge ? t('game.dailySeed', { seed: hud.seed }) : `#${hud.seed}`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onOpenSettings}
            aria-label={t('common.settings')}
            className="pointer-events-auto p-2.5 rounded-lg border border-amber-200/15 hover:border-amber-300/45 bg-[#0a0d14]/95 text-stone-300 hover:text-amber-100 transition-colors shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Transient Alert & First-Time Reversal Coachmark Line */}
      <div className="flex flex-col items-center gap-2 pointer-events-none mb-auto mt-2">
        <AnimatePresence mode="wait">
          {hud.firstTwistCallout && !isDecision && !isReviveOffer && (
            <motion.div
              key={hud.firstTwistCallout}
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2 text-xs sm:text-sm font-bold tracking-wide px-4 py-2 rounded-xl border border-amber-300/75 bg-[#0a0d14]/95 text-amber-100 shadow-[0_12px_32px_rgba(0,0,0,0.88)] max-w-md text-center"
            >
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
              <span>{hud.firstTwistCallout}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {hud.bannerAlert && !isReviveOffer && (
            <motion.div
              key={hud.bannerAlert}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className={`text-xs sm:text-sm font-bold tracking-wider px-4 py-1.5 rounded-lg border shadow-lg ${
                isCashingOut
                  ? 'text-emerald-200 bg-emerald-950/90 border-emerald-400/50'
                  : isDeathReplay || hud.lastSecondTriggeredThisRound
                  ? 'text-amber-100 bg-[#0a0d14]/95 border-amber-400/60'
                  : 'text-rose-200 bg-[#0a0d14]/95 border-rose-500/50'
              }`}
            >
              {hud.bannerAlert}
            </motion.div>
          )}
          {!hud.bannerAlert && hud.lastNearMissText && !isDecision && !isReviveOffer && (
            <motion.div
              key={hud.lastNearMissText}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="text-xs sm:text-sm font-bold tracking-wide text-amber-300"
            >
              {hud.lastNearMissText}
            </motion.div>
          )}
          {!hud.bannerAlert &&
            !hud.lastNearMissText &&
            hud.lastSecondBonusText &&
            !isDecision &&
            !isReviveOffer && (
              <motion.div
                key={hud.lastSecondBonusText}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className="text-xs sm:text-sm font-bold tracking-wide text-amber-300"
              >
                {hud.lastSecondBonusText}
              </motion.div>
            )}
        </AnimatePresence>
      </div>

      {/* Bottom Zone */}
      <div className="flex flex-col items-center justify-end gap-2.5">
        {/* Step-by-step Interactive Onboarding & Shape+Texture Colorblind Guide */}
        {hud.onboardingStep && !isDecision && !isDeathReplay && !isReviveOffer && !isCashingOut && (
          <motion.div
            key={hud.onboardingStep}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="text-center bg-[#0a0d14]/95 border border-sky-400/45 rounded-xl px-5 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.88)] max-w-lg"
          >
            {hud.onboardingStep === 'HOLD_TO_CHARGE' && (
              <div className="text-xs sm:text-sm font-bold text-amber-50 mb-1">
                {t('game.guide1Title')}
              </div>
            )}
            {hud.onboardingStep === 'RELEASE_TO_DASH' && (
              <div className="text-xs sm:text-sm font-bold text-sky-300 mb-1">
                {t('game.guide2Title')}
              </div>
            )}
            <div className="text-[11px] sm:text-xs text-stone-300">
              <span className="text-sky-300 font-semibold">{t('game.guideLegendSafe')}</span>
              <span className="mx-1.5 text-amber-200/30">·</span>
              <span className="text-amber-300 font-semibold">{t('game.guideLegendWarn')}</span>
              <span className="mx-1.5 text-amber-200/30">·</span>
              <span className="text-rose-400 font-semibold">{t('game.guideLegendLethal')}</span>
            </div>
          </motion.div>
        )}

        {/* Death Replay Controls + Quick 1-per-run Revive Entry */}
        {isDeathReplay && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5">
            {hud.canRevive && (
              <button
                type="button"
                disabled={isRevivingAdLoading}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onRequestRevive}
                className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-sky-400 hover:bg-sky-300 disabled:opacity-60 text-slate-950 text-xs font-bold shadow-lg transition-transform active:scale-[0.98] whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {isRevivingAdLoading ? t('game.reviveVerifying') : t('game.reviveBtn')}
                </span>
              </button>
            )}

            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onExportDeathReplayNow}
              className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-amber-300 hover:bg-amber-200 text-slate-950 text-xs font-bold shadow-lg transition-transform active:scale-[0.98] whitespace-nowrap cursor-pointer"
            >
              <Film className="w-3.5 h-3.5" />
              <span>{t('game.exportVideo')}</span>
            </button>

            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onSkipPostAnimation}
              className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl border border-amber-200/20 bg-[#0a0d14]/95 text-xs font-medium text-stone-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>{hud.canRevive ? t('game.skipReplay') : t('game.skipReplayResult')}</span>
            </button>
          </div>
        )}

        {isCashingOut && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onSkipPostAnimation}
            className="pointer-events-auto flex items-center gap-1.5 py-2 px-4 rounded-lg border border-amber-200/20 bg-[#0a0d14]/90 text-xs font-medium text-stone-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>{t('game.viewResult')}</span>
          </button>
        )}

        {canCashOutMidIntro && !isDecision && !isReviveOffer && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onCashOut}
            className="pointer-events-auto flex items-center gap-2 py-2.5 px-5 rounded-xl border border-emerald-500/50 bg-[#0a0d14] text-emerald-300 hover:bg-emerald-950/60 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{t('game.cashOutNow', { score: totalCashOutScore.toLocaleString() })}</span>
          </button>
        )}

        {/* 1-Per-Run Revive Offer Modal (blocking only until the player declines 3 times) */}
        <AnimatePresence>
          {isReviveOffer && !hud.reviveDemoted && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto w-full max-w-lg rounded-2xl border border-amber-200/18 bg-[#0a0d14] p-5 sm:p-6 shadow-[0_28px_80px_rgba(0,0,0,0.94)]"
            >
              <div className="flex items-baseline justify-between gap-4 pb-3 border-b border-amber-200/12">
                <span className="font-display text-sm sm:text-base font-bold text-rose-400">
                  {t('game.reviveTitle', { round: hud.round })}
                </span>
                <span className="text-xs font-mono text-stone-400 shrink-0">
                  {t('game.reviveOnce')}
                </span>
              </div>

              <div className="py-3.5 space-y-2 text-xs text-stone-300 border-b border-amber-200/12">
                <div className="flex items-center justify-between">
                  <span>{t('game.reviveAtRisk')}</span>
                  <span className="font-mono font-bold tabular-nums text-amber-300 text-sm">
                    {t('common.scorePts', { n: hud.unsettledScore.toLocaleString() })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('game.reviveBanked')}</span>
                  <span className="font-mono font-semibold tabular-nums text-emerald-300">
                    {t('common.scorePts', { n: hud.safeBankedScore.toLocaleString() })}
                  </span>
                </div>
                {hud.lastMissedClueText && (
                  <div className="mt-2 px-3 py-2 rounded-lg border border-amber-400/45 bg-amber-950/30 text-amber-100 text-xs">
                    <span className="font-bold text-amber-300">{t('game.missedClueLabel')}</span>
                    {hud.lastMissedClueText}
                  </div>
                )}
                <p className="text-[11px] text-stone-400 pt-1">
                  {t('game.reviveNote', { round: hud.round })}
                </p>
              </div>

              <div className="pt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isRevivingAdLoading}
                  onClick={onDeclineRevive}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-50 font-semibold text-sm transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <span>{t('game.declineRevive', { score: hud.safeBankedScore.toLocaleString() })}</span>
                </button>

                <button
                  type="button"
                  disabled={isRevivingAdLoading}
                  onClick={onRequestRevive}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-sm transition-transform active:scale-[0.98] whitespace-nowrap cursor-pointer disabled:opacity-60"
                >
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span>
                    {isRevivingAdLoading ? t('game.reviveAdLoading') : t('game.reviveAd')}
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Demoted revive (after 3 declines): a quiet, non-blocking button row instead of the modal */}
        {isReviveOffer && hud.reviveDemoted && (
          <div className="pointer-events-auto flex items-center justify-center gap-2.5">
            <button
              type="button"
              disabled={isRevivingAdLoading}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onRequestRevive}
              className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-sky-400 hover:bg-sky-300 disabled:opacity-60 text-slate-950 text-xs font-bold shadow-lg transition-transform active:scale-[0.98] whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isRevivingAdLoading ? t('game.reviveAdLoading') : t('game.reviveAd')}</span>
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onDeclineRevive}
              className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-50 text-xs font-bold shadow-lg transition-transform active:scale-[0.98] whitespace-nowrap cursor-pointer"
            >
              <span>
                {t('game.declineRevive', { score: hud.safeBankedScore.toLocaleString() })}
              </span>
            </button>
          </div>
        )}

        {/* Psychological Pressure Decision Modal */}
        <AnimatePresence>
          {isDecision && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto w-full max-w-lg rounded-2xl border border-amber-200/18 bg-[#0a0d14] p-5 sm:p-6 shadow-[0_28px_80px_rgba(0,0,0,0.94)]"
            >
              {/* Calm decision header (review fix: no countdown bar, no urgency styling) */}
              <div className="mb-3.5">
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                  <span className="text-stone-400">{t('game.pressureNormal')}</span>
                  <span className="text-stone-500">
                    {t('game.threatLevel', { level: hud.dangerLevel })}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-amber-200/12">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-display text-sm sm:text-base font-bold text-amber-50">
                    {t('game.roundCleared', { round: hud.round })}
                  </span>
                  {hud.lastSecondBonusText && (
                    <span className="text-xs text-amber-300 font-semibold">
                      · {hud.lastSecondBonusText}
                    </span>
                  )}
                  {hud.lastNearMissText && (
                    <span className="text-xs text-sky-300 font-medium">
                      · {hud.lastNearMissText}
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono tabular-nums text-amber-300 shrink-0">
                  {t('game.comboBonus', { combo: hud.combo, pct: hud.comboScoreBonusPct })}
                </span>
              </div>

              {/* Checkpoint Vault Banner */}
              {hud.lastCheckpointDeposit > 0 ? (
                <div className="mt-3 px-3 py-2 rounded-lg border border-emerald-500/45 bg-emerald-950/35 text-xs text-emerald-200 flex items-center justify-between gap-2 font-mono tabular-nums">
                  <span className="font-sans font-semibold text-emerald-300">
                    {t('game.checkpointHit', { round: hud.round })}
                  </span>
                  <span className="font-bold text-emerald-300 shrink-0">
                    {t('game.checkpointDeposit', {
                      amount: hud.lastCheckpointDeposit.toLocaleString(),
                      total: hud.safeBankedScore.toLocaleString(),
                    })}
                  </span>
                </div>
              ) : (
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-stone-400 font-mono tabular-nums">
                  <span>
                    {t('game.bankedSoFar')}
                    <strong className="text-emerald-300 ml-1">
                      {hud.safeBankedScore.toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    {t('game.nextCheckpoint', {
                      n: roundsToNextCheckpoint,
                      round: nextCheckpointRound,
                    })}
                  </span>
                </div>
              )}

              {/* Trembling Unsettled Stake + Strictly-Increasing Smooth Multiplier Ladder */}
              <div className="py-3 border-b border-amber-200/12">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-xs text-stone-300">
                    {t('game.currentStake')}{' '}
                    <motion.span
                      key={
                        !decisionPressure || reduceFlashAndShake
                          ? 'modal-stake-steady'
                          : `modal-stake-${hud.decisionHeartbeatTick}`
                      }
                      initial={!decisionPressure || reduceFlashAndShake ? false : { scale: 1.06 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className="inline-block font-mono font-bold tabular-nums text-amber-300 text-sm"
                    >
                      {t('common.scorePts', { n: hud.unsettledScore.toLocaleString() })}
                    </motion.span>
                  </div>
                  <span className="font-mono text-xs text-rose-400 font-semibold shrink-0">
                    {t('game.nextMult', { mult: hud.nextMultiplier })}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1 font-mono text-xs tabular-nums">
                  {dynamicLadder.map((item) => {
                    const isCurrent = item.round === hud.round;
                    const isNext = item.round === hud.round + 1;
                    return (
                      <div
                        key={`r-${item.round}`}
                        className={`flex-1 text-center py-1 rounded ${
                          isNext
                            ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40'
                            : isCurrent
                            ? 'bg-sky-500/15 text-sky-300 font-semibold border border-sky-400/25'
                            : 'text-stone-500'
                        }`}
                      >
                        x{item.mult}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Explicit Loss Stake Warning */}
              {hud.unsettledScore > 0 && (
                <div
                  className={`mt-3 px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-between gap-2 ${
                    isHighStakes
                      ? 'bg-rose-950/45 border-rose-500/50 text-rose-200'
                      : 'bg-stone-900/80 border-amber-200/12 text-stone-300'
                  }`}
                >
                  <span>
                    {t('game.lossWarnPre')}
                    <strong className="font-mono tabular-nums text-rose-300 font-bold">
                      {hud.unsettledScore.toLocaleString()}
                    </strong>
                    {t('game.lossWarnUnit')}
                    {hud.safeBankedScore > 0
                      ? t('game.lossWarnKeep', {
                          score: hud.safeBankedScore.toLocaleString(),
                        })
                      : t('game.lossWarnZero')}
                  </span>
                  <span className="font-mono text-[11px] text-rose-400 shrink-0">
                    {hud.canRevive ? t('game.reviveLeft') : t('game.noRevive')}
                  </span>
                </div>
              )}

              <p className="pt-3 text-[11px] leading-relaxed text-stone-400">
                {t('game.decisionInfo', {
                  score: totalCashOutScore.toLocaleString(),
                  next: hud.nextMultiplier,
                })}
              </p>

              <div className="pt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={onCashOut}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl border border-emerald-500/55 hover:border-emerald-400 bg-emerald-950/30 hover:bg-emerald-950/50 text-emerald-300 font-bold text-sm transition-colors whitespace-nowrap cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="font-mono tabular-nums">
                    {t('game.cashOutBtn', { score: totalCashOutScore.toLocaleString() })}
                  </span>
                </button>

                <motion.button
                  key={
                    !decisionPressure || reduceFlashAndShake
                      ? 'continue-steady'
                      : `continue-beat-${hud.decisionHeartbeatTick}`
                  }
                  initial={
                    !decisionPressure || reduceFlashAndShake
                      ? false
                      : { scale: isHighStakes ? 1.012 : 1.006 }
                  }
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.22 }}
                  type="button"
                  onClick={onContinueNextRound}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-transform active:scale-[0.98] shadow-[0_0_28px_rgba(225,29,72,0.42)] whitespace-nowrap cursor-pointer"
                >
                  <Flame className="w-4 h-4 shrink-0" />
                  <span className="font-mono tabular-nums">
                    {t('game.continueBtn', { mult: hud.nextMultiplier })}
                  </span>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
