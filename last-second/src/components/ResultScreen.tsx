import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Copy,
  Crosshair,
  Download,
  Film,
  Home,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  CLOCK_DISPLAY_FONT,
  CLOCK_MONO_FONT,
  CLOCK_SANS_FONT,
  ClockworkPatternSet,
  createClockworkPatterns,
  drawArenaClockDial,
  drawClockGear,
  drawClockworkHazard,
  drawSafeEscapementZone,
  drawTimeSparkPlayer,
} from '../game/ClockworkRenderer';
import { ARENA_RADIUS, PLAYER_RADIUS } from '../game/CollisionSystem';
import { SparkSkinId } from '../data/progressionConfig';
import { RunResultSummary } from '../game/GameState';
import { ReplaySnapshotFrame } from '../game/ReplaySystem';
import { buildChallengeUrl, encodeChallengeCode } from '../utils/challengeSeed';
import { loadRecord } from '../utils/storage';
import { exportVerticalHighlightVideo } from '../utils/videoExporter';
import { track } from '../utils/analytics';
import { pick, t, useLang } from '../i18n';

interface ResultScreenProps {
  result: RunResultSummary;
  autoStartVideoExport?: boolean;
  onConsumeAutoExport?: () => void;
  onPlayAgainSameSeed: () => void;
  onPlayAgainNewSeed: () => void;
  onOpenCustomBuilder: () => void;
  onOpenProgression: () => void;
  onBackHome: () => void;
}

let cachedMiniPatterns: ClockworkPatternSet | null = null;
function getMiniPatterns(ctx: CanvasRenderingContext2D): ClockworkPatternSet {
  if (!cachedMiniPatterns) {
    cachedMiniPatterns = createClockworkPatterns(ctx);
  }
  return cachedMiniPatterns;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  result,
  autoStartVideoExport,
  onConsumeAutoExport,
  onPlayAgainSameSeed,
  onPlayAgainNewSeed,
  onOpenCustomBuilder,
  onOpenProgression,
  onBackHome,
}) => {
  useLang();
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const autoTriggeredRef = useRef(false);
  const [copiedState, setCopiedState] = useState<
    'NONE' | 'LINK' | 'CODE' | 'COMPARE_IMG' | 'VIDEO_DONE'
  >('NONE');
  const [videoExportProgress, setVideoExportProgress] = useState<number | null>(null);
  const [videoStatusNote, setVideoStatusNote] = useState<string | null>(null);

  const frames: ReplaySnapshotFrame[] =
    result.replayReel.length > 0
      ? result.replayReel
      : result.closestSnapshot
      ? [result.closestSnapshot]
      : [];

  const [frameIdx, setFrameIdx] = useState(0);
  const [isPlayingReplay, setIsPlayingReplay] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showReplay, setShowReplay] = useState(false);

  const isSuccess = result.outcome === 'CASHED_OUT';
  const careerRecord = loadRecord();
  // Review fix: comparisons use ONLY the player's own local history — no fabricated "global" benchmarks.
  const personalBestMm = careerRecord.closestEverMm;
  const isGrazeRecord =
    result.closestMm !== null && personalBestMm !== null && result.closestMm <= personalBestMm;
  const nearGrazeRecord =
    !isGrazeRecord &&
    result.closestMm !== null &&
    personalBestMm !== null &&
    result.closestMm - personalBestMm <= 1.0;
  // Honest local comparisons (real records only): previous run + this week's local ranking.
  const prevEntry =
    careerRecord.recentHistory.find(
      (e) => !(e.seed === result.seed && e.score === result.finalScore)
    ) ?? null;
  const grazeDeltaMm =
    result.closestMm !== null && prevEntry?.closestMm != null
      ? +(prevEntry.closestMm - result.closestMm).toFixed(1)
      : null;
  const weekStartMs = Date.now() - 7 * 24 * 3600 * 1000;
  const weekOthers = careerRecord.recentHistory.filter(
    (e) =>
      e.timestamp >= weekStartMs &&
      !(e.seed === result.seed && e.score === result.finalScore)
  );
  const weekRank = 1 + weekOthers.filter((e) => e.score > result.finalScore).length;
  const weekTotal = weekOthers.length + 1;
  const prog = result.progressionReport;

  const challengePayload = {
    seed: result.seed,
    customSequence: result.customSequence,
    creatorRound: result.survivedRounds,
    creatorScore: result.finalScore,
  };
  const challengeCode = encodeChallengeCode(challengePayload);
  const challengeUrl = buildChallengeUrl(challengePayload);

  const shareCopyText = isSuccess
    ? t('result.shareSuccess', {
        rounds: result.survivedRounds,
        graze:
          result.closestMm !== null
            ? t('result.shareGraze', { mm: result.closestMm }) +
              (grazeDeltaMm !== null && grazeDeltaMm > 0.05
                ? t('result.shareDelta', { d: grazeDeltaMm })
                : '')
            : '',
        score: result.finalScore.toLocaleString(),
        seed: result.seed,
        url: challengeUrl,
      })
    : t('result.shareFail', {
        round: result.survivedRounds + 1,
        lost: result.lostUnsettledScore.toLocaleString(),
        banked:
          result.safeBankedScore > 0
            ? t('result.shareBanked', { n: result.safeBankedScore.toLocaleString() })
            : '',
        seed: result.seed,
        url: challengeUrl,
      });

  const copyTextSafe = async (txt: string, tag: 'LINK' | 'CODE') => {
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    track('share', { method: tag === 'LINK' ? 'copy_link' : 'copy_code' });
    setCopiedState(tag);
    window.setTimeout(() => setCopiedState('NONE'), 2200);
  };

  // 1-Click Generate Horological Near-Miss Millimeter Caliper + Social Comparison Poster (PNG)
  const handleDownloadComparisonCard = useCallback(() => {
    const poster = document.createElement('canvas');
    poster.width = 800;
    poster.height = 1080;
    const pctx = poster.getContext('2d');
    if (!pctx) return;
    track('share', { method: 'poster' });

    const bg = pctx.createLinearGradient(0, 0, 0, 1080);
    bg.addColorStop(0, '#0c0f17');
    bg.addColorStop(0.55, '#08090e');
    bg.addColorStop(1, '#05060a');
    pctx.fillStyle = bg;
    pctx.fillRect(0, 0, 800, 1080);

    // Decorative corner clockwork gears on poster background
    drawClockGear(
      pctx,
      730,
      110,
      115,
      26,
      0.35,
      'rgba(200, 169, 110, 0.16)',
      'rgba(18, 22, 34, 0.4)',
      6
    );
    drawClockGear(
      pctx,
      80,
      980,
      125,
      28,
      -0.25,
      isSuccess ? 'rgba(56, 189, 248, 0.14)' : 'rgba(244, 63, 94, 0.16)',
      'rgba(18, 22, 34, 0.4)',
      6
    );

    pctx.strokeStyle = isSuccess
      ? 'rgba(56, 189, 248, 0.48)'
      : 'rgba(244, 63, 94, 0.48)';
    pctx.lineWidth = 2.5;
    pctx.strokeRect(28, 28, 744, 1024);

    pctx.strokeStyle = 'rgba(200, 169, 110, 0.25)';
    pctx.lineWidth = 1;
    pctx.strokeRect(36, 36, 728, 1008);

    // Brand Title (System horological serif/sans stack — zero external font dependency)
    pctx.fillStyle = '#f4f1ea';
    pctx.font = `700 50px ${CLOCK_DISPLAY_FONT}`;
    pctx.fillText('LAST SECOND', 64, 106);
    pctx.fillStyle = '#d6c7a9';
    pctx.font = `600 22px ${CLOCK_SANS_FONT}`;
    pctx.fillText(t('result.posterSubtitle'), 64, 146);

    // Side-by-side Pocket-Watch Dials: Left = Closest Near-Miss, Right = Decision / Final Moment
    const snapLeft = result.closestSnapshot || frames[0];
    const decisionFrame = frames.find((f) => f.isDecisionPoint) || frames[frames.length - 1];

    if (snapLeft) {
      pctx.save();
      pctx.translate(225, 350);
      drawSnapshotAtOrigin(pctx, 132, snapLeft, result.equippedSkin);
      pctx.restore();
      pctx.fillStyle = '#fde047';
      pctx.font = `700 20px ${CLOCK_SANS_FONT}`;
      pctx.textAlign = 'center';
      pctx.fillText(
        result.closestMm !== null
          ? t('result.posterClosest', { mm: result.closestMm })
          : t('result.posterHighlight'),
        225,
        518
      );
    }

    if (decisionFrame) {
      pctx.save();
      pctx.translate(575, 350);
      drawSnapshotAtOrigin(pctx, 132, decisionFrame, result.equippedSkin);
      pctx.restore();
      pctx.fillStyle = isSuccess ? '#38bdf8' : '#fb7185';
      pctx.font = `700 20px ${CLOCK_SANS_FONT}`;
      pctx.textAlign = 'center';
      pctx.fillText(
        isSuccess
          ? t('result.posterCash', { n: result.survivedRounds })
          : t('result.posterDecision'),
        575,
        518
      );
    }

    pctx.textAlign = 'left';

    // Precision Millimeter Caliper Bar on Poster
    const mmVal = result.closestMm ?? 9.5;
    pctx.fillStyle = '#161924';
    pctx.fillRect(64, 565, 672, 26);
    pctx.fillStyle = 'rgba(244, 63, 94, 0.72)';
    pctx.fillRect(64, 565, 160, 26);
    pctx.fillStyle = 'rgba(251, 191, 36, 0.62)';
    pctx.fillRect(224, 565, 160, 26);
    pctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
    pctx.fillRect(384, 565, 160, 26);

    if (personalBestMm !== null) {
      const bestX = 64 + Math.max(0, Math.min(1, personalBestMm / 10)) * 672;
      pctx.fillStyle = '#fbbf24';
      pctx.fillRect(bestX - 1.5, 560, 3, 36);
    }

    const markerNorm = Math.max(0, Math.min(1, mmVal / 10));
    const markerX = 64 + markerNorm * 672;
    pctx.fillStyle = '#ffffff';
    pctx.fillRect(markerX - 3, 554, 6, 48);

    pctx.font = `700 20px ${CLOCK_MONO_FONT}`;
    pctx.fillStyle = '#f4f1ea';
    pctx.fillText(
      t('result.posterVs', {
        mm: mmVal,
        best: personalBestMm ?? mmVal,
      }),
      64,
      636
    );

    // 4 Quantitative Metrics
    const stats = [
      { k: t('result.finalScore'), v: result.finalScore.toLocaleString() },
      { k: t('result.survivedRounds'), v: t('result.roundsVal', { n: result.survivedRounds }) },
      { k: t('result.maxMult'), v: `x${result.maxMultiplier}` },
      { k: t('result.maxCombo'), v: `${result.maxCombo}` },
    ];
    stats.forEach((st, i) => {
      const x = 64 + i * 172;
      pctx.fillStyle = '#a8a29e';
      pctx.font = `500 18px ${CLOCK_SANS_FONT}`;
      pctx.fillText(st.k, x, 720);
      pctx.fillStyle = '#f4f1ea';
      pctx.font = `700 32px ${CLOCK_MONO_FONT}`;
      pctx.fillText(st.v, x, 762);
    });

    pctx.fillStyle = '#fbbf24';
    pctx.font = `700 26px ${CLOCK_MONO_FONT}`;
    pctx.fillText(t('result.posterCode', { code: challengeCode }), 64, 865);

    pctx.fillStyle = '#a8a29e';
    pctx.font = `400 18px ${CLOCK_SANS_FONT}`;
    pctx.fillText(t('result.posterFootnote'), 64, 915);

    const link = document.createElement('a');
    link.download = `LAST-SECOND-CLOCKWORK-${result.seed}.png`;
    link.href = poster.toDataURL('image/png');
    link.click();

    setCopiedState('COMPARE_IMG');
    window.setTimeout(() => setCopiedState('NONE'), 2400);
  }, [challengeCode, frames, isSuccess, result, personalBestMm]);

  // 1-Click Vertical 9:16 Highlight Short Video Export + Native Share
  const handleExportShortVideo = useCallback(async () => {
    if (videoExportProgress !== null) return;
    setVideoStatusNote(null);
    setVideoExportProgress(1);

    try {
      const { blob, filename, mimeType } = await exportVerticalHighlightVideo(result, (pct) => {
        setVideoExportProgress(pct);
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);

      try {
        await navigator.clipboard.writeText(shareCopyText);
      } catch {
        // Ignore clipboard error
      }

      const file = new File([blob], filename, { type: mimeType });
      if (
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] }) &&
        typeof navigator.share === 'function'
      ) {
        try {
          await navigator.share({
            files: [file],
            title: t('result.shareTitle'),
            text: shareCopyText,
          });
        } catch {
          // User dismissed share sheet; download already succeeded
        }
      }

      track('share', { method: 'video' });
      setVideoExportProgress(null);
      setCopiedState('VIDEO_DONE');
      setVideoStatusNote(t('result.videoNoteOk'));
      window.setTimeout(() => setCopiedState('NONE'), 3500);
    } catch {
      setVideoExportProgress(null);
      setVideoStatusNote(t('result.videoNoteFallback'));
      handleDownloadComparisonCard();
    }
  }, [handleDownloadComparisonCard, result, shareCopyText, videoExportProgress]);

  useEffect(() => {
    if (autoStartVideoExport && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true;
      onConsumeAutoExport?.();
      void handleExportShortVideo();
    }
  }, [autoStartVideoExport, handleExportShortVideo, onConsumeAutoExport]);

  // Interactive Replay Player Loop
  useEffect(() => {
    if (frames.length === 0 || !isPlayingReplay) return;
    const timer = window.setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % frames.length);
    }, 90);
    return () => window.clearInterval(timer);
  }, [frames.length, isPlayingReplay]);

  // Render active frame on pocket-watch mini-canvas
  useEffect(() => {
    const canvas = miniCanvasRef.current;
    if (!canvas || frames.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const safeIdx = Math.min(frames.length - 1, Math.max(0, frameIdx));
    const f = frames[safeIdx];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    drawSnapshotAtOrigin(ctx, canvas.width * 0.44, f, result.equippedSkin);
    ctx.restore();
  }, [frameIdx, frames, result.equippedSkin]);

  const jumpToDecisionPoint = () => {
    const idx = frames.findIndex((f) => f.isDecisionPoint);
    if (idx >= 0) {
      setIsPlayingReplay(false);
      setFrameIdx(idx);
    }
  };

  const currentFrame = frames[Math.min(frames.length - 1, frameIdx)];
  const beatGlobalMm = nearGrazeRecord;
  const beatTop10Mm = isGrazeRecord;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#05060a]/92 p-3 sm:p-6 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl rounded-2xl border border-amber-200/18 bg-[#0a0d14] overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.94)] my-auto"
      >
        {/* Top Bespoke Pure-SVG Horological Banner (Zero external image dependency) */}
        <div className="relative h-32 sm:h-36 w-full overflow-hidden bg-[#07090f]">
          <HorologicalResultBannerSvg isSuccess={isSuccess} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0d14] via-[#0a0d14]/45 to-transparent" />

          <div className="absolute inset-x-6 top-4 flex items-center justify-between">
            <span className="text-xs font-mono tracking-wider text-amber-100/85">
              {result.isDailyChallenge
                ? t('result.dailySeed', { seed: result.seed })
                : `SEED #${result.seed}`}
              {result.isNewBest ? t('result.newBest') : ''}
            </span>
            <button
              type="button"
              onClick={onBackHome}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#080a10]/80 hover:bg-[#0e121c] border border-amber-200/20 text-xs text-stone-200 hover:text-amber-100 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>{t('result.home')}</span>
            </button>
          </div>

          <div className="absolute inset-x-6 bottom-3">
            <h2
              className={`font-display text-2xl sm:text-3xl font-bold tracking-wide ${
                isSuccess ? 'text-emerald-300' : 'text-rose-400'
              }`}
            >
              {isSuccess ? t('result.titleSuccess') : t('result.titleFail')}
            </h2>
          </div>
        </div>

        <div className="p-5 sm:p-7 space-y-5">
          {/* Quantitative Readouts */}
          {/* Quick restart (review fix: also mirrored at the bottom action bar) */}
          <button
            type="button"
            onClick={onPlayAgainNewSeed}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-gradient-to-b from-amber-100 to-amber-300 hover:from-white hover:to-amber-200 text-slate-950 font-bold text-sm transition-transform active:scale-[0.98] whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{t('result.playAgain')}</span>
          </button>

          {/* Compact summary (default view): score / rounds / personal best only */}
          <div className="grid grid-cols-3 gap-4 pb-4 border-b border-amber-200/12 font-mono tabular-nums">
            <div>
              <div className="text-xs font-sans text-stone-400 mb-1">{t('result.finalScore')}</div>
              <div className="text-2xl font-bold text-amber-50">{result.finalScore.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs font-sans text-stone-400 mb-1">{t('result.survivedRounds')}</div>
              <div className="text-2xl font-bold text-amber-50">{result.survivedRounds}</div>
            </div>
            <div>
              <div className="text-xs font-sans text-stone-400 mb-1">{t('result.bestScore')}</div>
              <div className="text-2xl font-bold text-sky-300">{careerRecord.bestScore.toLocaleString()}</div>
              <div className="text-[11px] font-sans text-stone-500 mt-0.5">
                {t('result.bestRoundsLine', { n: careerRecord.bestRound })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowReplay((v) => !v);
                setIsPlayingReplay(true);
              }}
              className="flex items-center gap-1.5 py-2 px-3.5 rounded-lg border border-amber-200/20 hover:border-amber-300/50 text-xs font-semibold text-stone-200 hover:text-amber-100 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{showReplay ? t('result.hideReplay') : t('result.watchReplay')}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="flex items-center gap-1.5 py-2 px-3.5 rounded-lg border border-amber-200/20 hover:border-amber-300/50 text-xs font-semibold text-stone-200 hover:text-amber-100 transition-colors cursor-pointer"
            >
              <span>{showDetails ? t('result.hideDetails') : t('result.showDetails')}</span>
            </button>
          </div>

          {showDetails && (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 pb-5 border-b border-amber-200/12 font-mono tabular-nums">
            <div>
              <div className="text-xs font-sans text-stone-400 mb-1">{t('result.finalScore')}</div>
              <div className="text-2xl sm:text-3xl font-bold text-amber-50">
                {result.finalScore.toLocaleString()}
              </div>
              {!isSuccess && result.lostUnsettledScore > 0 && (
                <div className="text-[11px] font-sans text-rose-400 mt-0.5">
                  {result.safeBankedScore > 0
                    ? t('result.bankedLost', {
                        a: result.safeBankedScore.toLocaleString(),
                        b: result.lostUnsettledScore.toLocaleString(),
                      })
                    : t('result.lostOnly', {
                        n: result.lostUnsettledScore.toLocaleString(),
                      })}
                </div>
              )}
              {isSuccess && result.safeBankedScore > 0 && (
                <div className="text-[11px] font-sans text-emerald-300 mt-0.5">
                  {t('result.includesBanked', {
                    n: result.safeBankedScore.toLocaleString(),
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-sans text-stone-400 mb-1">{t('result.survivedRounds')}</div>
              <div className="text-2xl sm:text-3xl font-bold text-amber-50">
                {result.survivedRounds}
              </div>
              <div className="text-[11px] font-sans text-stone-500 mt-0.5">
                {t('result.yourBestRounds', { n: careerRecord.bestRound })}
                {result.reviveUsed ? t('result.revivedTag') : ''}
              </div>
            </div>

            <div>
              <div className="text-xs font-sans text-stone-400 mb-1">{t('result.maxMult')}</div>
              <div className="text-2xl sm:text-3xl font-bold text-sky-300">
                x{result.maxMultiplier}
              </div>
            </div>

            <div>
              <div className="text-xs font-sans text-stone-400 mb-1">{t('result.maxCombo')}</div>
              <div className="text-2xl sm:text-3xl font-bold text-amber-300">
                {result.maxCombo}
              </div>
              {result.lastSecondCount > 0 && (
                <div className="text-[11px] font-sans text-amber-300 mt-0.5">
                  {t('result.lastSecondCount', { n: result.lastSecondCount })}
                </div>
              )}
              {result.shardsCollected > 0 && (
                <div className="text-[11px] font-sans text-amber-200 mt-0.5">
                  {t('result.shardsPicked', { n: result.shardsCollected })}
                </div>
              )}
            </div>
          </div>

          {/* Persistent Meta Currency ("时间碎片") & Newly Completed Quests / Achievements */}
          <div className="pb-5 border-b border-amber-200/12 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="text-xs text-stone-400">{t('result.shardsEarned')}</span>
                <span className="text-xl font-mono font-bold tabular-nums text-amber-300">
                  +{prog.totalEarnedThisRun}
                </span>
                <span className="text-xs font-mono tabular-nums text-stone-400">
                  {t('result.balanceNow', { n: prog.newBalance.toLocaleString() })}
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenProgression}
                className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-4 cursor-pointer whitespace-nowrap"
              >
                {t('result.gotoSkins')}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-mono tabular-nums text-stone-400">
              <span>{t('result.shardSurvival', { n: prog.baseSurvivalShards })}</span>
              {prog.cashOutBonusShards > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-300">
                    {t('result.shardCash', { n: prog.cashOutBonusShards })}
                  </span>
                </>
              )}
              {prog.skillBonusShards > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-sky-300">
                    {t('result.shardSkill', { n: prog.skillBonusShards })}
                  </span>
                </>
              )}
              {prog.arenaPickedShards > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-200">
                    {t('result.shardArena', { n: prog.arenaPickedShards })}
                  </span>
                </>
              )}
              {prog.questBonusShards > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-300">
                    {t('result.shardQuest', { n: prog.questBonusShards })}
                  </span>
                </>
              )}
              {prog.achievementBonusShards > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-300">
                    {t('result.shardAch', { n: prog.achievementBonusShards })}
                  </span>
                </>
              )}
            </div>

            {(prog.newlyCompletedQuests.length > 0 ||
              prog.newlyUnlockedAchievements.length > 0) && (
              <div className="pt-1 space-y-1 text-xs">
                {prog.newlyCompletedQuests.map((q) => (
                  <div key={q.id} className="text-emerald-300">
                    {t('result.questDoneLine', {
                      title: pick(q.title, q.titleEn),
                      n: q.rewardShards,
                    })}
                  </div>
                ))}
                {prog.newlyUnlockedAchievements.map((ach) => (
                  <div key={ach.id} className="text-amber-300 font-medium">
                    {t('result.achLine', {
                      title: pick(ach.title, ach.titleEn),
                      desc: pick(ach.desc, ach.descEn),
                      n: ach.rewardShards,
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Near-Miss Millimeter Caliper Gauge + Target Reference Line */}
          <div className="pb-5 border-b border-amber-200/12">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xs text-stone-400">{t('result.closestLabel')}</span>
                <span className="text-xl sm:text-2xl font-mono font-bold tabular-nums text-amber-300">
                  {result.closestMm !== null ? `${result.closestMm} mm` : t('result.noNearMiss')}
                </span>
                <span className="text-xs text-stone-400">· {result.closestTierLabel}</span>
              </div>

              <div className="text-xs font-mono tabular-nums text-stone-400">
                {personalBestMm !== null && t('result.personalBestLine', { mm: personalBestMm })}
              </div>
            </div>

            <div className="relative h-2.5 w-full rounded-full bg-stone-900 overflow-hidden flex">
              <div className="w-[20%] h-full bg-rose-500/75" title={t('result.gauge1')} />
              <div className="w-[20%] h-full bg-amber-400/70" title={t('result.gauge2')} />
              <div className="w-[20%] h-full bg-sky-400/60" title={t('result.gauge3')} />
              <div className="w-[40%] h-full bg-stone-800" title={t('result.gauge4')} />
              {personalBestMm !== null && personalBestMm !== result.closestMm && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-300/90"
                  title={t('result.gaugeBestTitle', { mm: personalBestMm })}
                  style={{
                    left: `${Math.max(1, Math.min(98, (personalBestMm / 10) * 100))}%`,
                  }}
                />
              )}
              {result.closestMm !== null && (
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_#fff]"
                  style={{
                    left: `${Math.max(1, Math.min(98, (result.closestMm / 10) * 100))}%`,
                  }}
                />
              )}
            </div>
            {(grazeDeltaMm !== null || weekTotal >= 2) && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono text-sky-300/90 mt-1.5">
                {grazeDeltaMm !== null && (
                  <span>
                    {grazeDeltaMm > 0.05
                      ? t('result.vsPrevCloser', { d: grazeDeltaMm })
                      : grazeDeltaMm < -0.05
                      ? t('result.vsPrevFarther', { d: Math.abs(grazeDeltaMm) })
                      : t('result.vsPrevSame')}
                  </span>
                )}
                {weekTotal >= 2 && <span>{t('result.weekRank', { rank: weekRank })}</span>}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-stone-400 mt-1.5">
              <span>{t('result.gaugeScale')}</span>
              {result.closestMm !== null && (
                <span
                  className={
                    beatTop10Mm
                      ? 'text-rose-300 font-semibold'
                      : beatGlobalMm
                      ? 'text-sky-300'
                      : 'text-stone-400'
                  }
                >
                  {beatTop10Mm
                    ? t('result.beatMaster')
                    : beatGlobalMm
                    ? t('result.beatTarget')
                    : t('result.tryHarder')}
                </span>
              )}
            </div>
          </div>

          </>
          )}

          {/* Interactive Scrubbable Pocket-Watch Replay + 1-Click Share Assets */}
          {(showReplay || showDetails) && (
          <div className="pb-5 border-b border-amber-200/12 flex flex-col sm:flex-row items-center gap-5">
            {showReplay && (
            <div className="flex flex-col items-center shrink-0 w-full sm:w-44">
              <canvas
                ref={miniCanvasRef}
                width={156}
                height={156}
                className="w-[156px] h-[156px] rounded-full border border-amber-200/25 bg-[#07090f] shadow-[0_0_24px_rgba(0,0,0,0.75)]"
              />
              {frames.length > 1 && (
                <div className="mt-2.5 w-full">
                  <div className="flex items-center gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => setIsPlayingReplay((p) => !p)}
                      aria-label={isPlayingReplay ? t('result.pauseAria') : t('result.playAria')}
                      className="p-1.5 rounded border border-amber-200/20 hover:border-amber-300/50 text-stone-300 cursor-pointer shrink-0"
                    >
                      {isPlayingReplay ? (
                        <Pause className="w-3 h-3" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={frames.length - 1}
                      value={Math.min(frames.length - 1, frameIdx)}
                      onChange={(e) => {
                        setIsPlayingReplay(false);
                        setFrameIdx(Number(e.target.value));
                      }}
                      aria-label={t('result.scrubAria')}
                      className="flex-1 accent-amber-300 cursor-pointer"
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono tabular-nums text-stone-500 mt-1">
                    <span>{t('result.replayHint')}</span>
                    <span>
                      {t('result.framesUnit', {
                        a: Math.min(frames.length, frameIdx + 1),
                        b: frames.length,
                      })}
                    </span>
                  </div>
                </div>
              )}
            </div>
            )}

            {showDetails && (
            <div className="flex-1 text-center sm:text-left w-full">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                <span className="text-xs text-stone-400">
                  {currentFrame
                    ? t('result.frameInfo', {
                        round: currentFrame.round,
                        event: currentFrame.eventName,
                      })
                    : t('result.replayFallback')}
                  {currentFrame?.isDecisionPoint ? t('result.couldLive') : ''}
                </span>
                {!isSuccess && frames.some((f) => f.isDecisionPoint) && (
                  <button
                    type="button"
                    onClick={jumpToDecisionPoint}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-4 cursor-pointer whitespace-nowrap"
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>{t('result.jumpDecision')}</span>
                  </button>
                )}
              </div>

              <div className="text-base font-bold text-amber-50 mb-2">
                {result.highlightSummary}
              </div>

              {!isSuccess && result.missedClueSummary && (
                <div className="mb-2.5 px-3 py-2 rounded-lg border border-amber-400/50 bg-amber-950/30 text-xs text-amber-100 text-left">
                  <span className="font-bold text-amber-300">{t('result.missedClueLabel')}</span>
                  {result.missedClueSummary}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 my-3">
                <button
                  type="button"
                  disabled={videoExportProgress !== null}
                  onClick={handleExportShortVideo}
                  className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-amber-300 hover:bg-amber-200 disabled:opacity-60 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Film className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-mono tabular-nums">
                    {videoExportProgress !== null
                      ? t('result.exporting', { pct: videoExportProgress })
                      : copiedState === 'VIDEO_DONE'
                      ? t('result.videoDone')
                      : t('result.exportVideo')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadComparisonCard}
                  className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl border border-amber-200/25 hover:border-amber-300/65 text-amber-300 hover:text-amber-200 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {copiedState === 'COMPARE_IMG'
                      ? t('result.posterDownloaded')
                      : t('result.downloadPoster')}
                  </span>
                </button>
              </div>

              {videoStatusNote && (
                <p className="text-[11px] text-emerald-300 mb-2">{videoStatusNote}</p>
              )}

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 text-xs font-mono text-stone-400">
                <span>{t('result.challengeCodeLine', { code: challengeCode })}</span>
                <span className="text-amber-200/30" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => copyTextSafe(challengeCode, 'CODE')}
                  className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 cursor-pointer whitespace-nowrap"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedState === 'CODE' ? t('result.codeCopied') : t('result.copyCode')}</span>
                </button>
              </div>
            </div>
            )}
          </div>
          )}

          {/* Main Action Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onPlayAgainNewSeed}
              className="flex-1 min-w-[130px] flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-gradient-to-b from-amber-100 to-amber-300 hover:from-white hover:to-amber-200 text-slate-950 font-bold text-sm transition-transform active:scale-[0.98] whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('result.playAgain')}</span>
            </button>

            <button
              type="button"
              onClick={onPlayAgainSameSeed}
              className="py-3.5 px-4 rounded-xl border border-amber-200/20 hover:border-amber-200/45 text-stone-200 hover:text-white text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
            >
              {t('result.replaySame')}
            </button>

            <button
              type="button"
              onClick={() => copyTextSafe(shareCopyText, 'LINK')}
              className="flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>{copiedState === 'LINK' ? t('result.linkCopied') : t('result.challengeFriend')}</span>
            </button>

            <button
              type="button"
              onClick={onOpenCustomBuilder}
              className="flex items-center justify-center gap-1.5 py-3.5 px-4 rounded-xl border border-amber-200/15 hover:border-sky-400/50 text-stone-300 hover:text-white text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>{t('result.customBuild')}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

/**
 * Pure inline SVG Horological Result Banner:
 * - Success: Harmonious golden escapement gears, intact Roman XII dial arc, and glowing cyan/emerald chime waves.
 * - Failure: Cracked watch crystal fractures, snapped crimson mainspring coils, and sweeping crimson second hand.
 */
const HorologicalResultBannerSvg: React.FC<{ isSuccess: boolean }> = ({ isSuccess }) => {
  return (
    <svg
      viewBox="0 0 800 180"
      preserveAspectRatio="xMidYMid slice"
      className="w-full h-full"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="resBannerGlow" cx="68%" cy="48%" r="65%">
          <stop
            offset="0%"
            stopColor={isSuccess ? 'rgba(52,211,153,0.28)' : 'rgba(244,63,94,0.34)'}
          />
          <stop
            offset="55%"
            stopColor={isSuccess ? 'rgba(56,189,248,0.12)' : 'rgba(251,191,36,0.10)'}
          />
          <stop offset="100%" stopColor="rgba(7,9,15,0)" />
        </radialGradient>
      </defs>

      <rect width="800" height="180" fill="#07090f" />
      <rect width="800" height="180" fill="url(#resBannerGlow)" />

      {/* Giant Pocket-Watch Chapter Rings on Right Side */}
      <g transform="translate(565, 92)">
        <circle
          cx="0"
          cy="0"
          r="138"
          fill="none"
          stroke={isSuccess ? 'rgba(200,169,110,0.32)' : 'rgba(244,63,94,0.32)'}
          strokeWidth="1.5"
        />
        <circle
          cx="0"
          cy="0"
          r="116"
          fill="none"
          stroke="rgba(200,169,110,0.22)"
          strokeWidth="1.2"
          strokeDasharray="4 6"
        />
        <circle
          cx="0"
          cy="0"
          r="78"
          fill="none"
          stroke={isSuccess ? 'rgba(56,189,248,0.28)' : 'rgba(251,191,36,0.22)'}
          strokeWidth="1.5"
        />

        {/* 12 Hour Radial Ticks */}
        {Array.from({ length: 12 }).map((_, idx) => {
          const deg = idx * 30;
          return (
            <line
              key={deg}
              x1="0"
              y1="-124"
              x2="0"
              y2="-136"
              stroke={isSuccess ? 'rgba(253,230,138,0.55)' : 'rgba(253,164,175,0.45)'}
              strokeWidth={idx % 3 === 0 ? '2.5' : '1.3'}
              transform={`rotate(${deg})`}
            />
          );
        })}

        {/* Inner Spoked Escapement Wheel */}
        <circle
          cx="0"
          cy="0"
          r="46"
          fill="rgba(12,15,24,0.65)"
          stroke={isSuccess ? 'rgba(251,191,36,0.48)' : 'rgba(244,63,94,0.55)'}
          strokeWidth="2"
        />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <line
            key={`sp-${deg}`}
            x1="0"
            y1="-10"
            x2="0"
            y2="-45"
            stroke="rgba(200,169,110,0.35)"
            strokeWidth="2"
            transform={`rotate(${deg})`}
          />
        ))}

        {isSuccess ? (
          <>
            {/* Harmonious Chime Acoustic Ripples & Radiant Time Spark */}
            <circle
              cx="0"
              cy="0"
              r="62"
              fill="none"
              stroke="rgba(52,211,153,0.45)"
              strokeWidth="1.6"
              strokeDasharray="8 5"
            />
            <line
              x1="-24"
              y1="14"
              x2="96"
              y2="-54"
              stroke="#38bdf8"
              strokeWidth="2.6"
            />
            <path
              d="M 108 -60 L 99 -56 L 96 -47 L 93 -56 L 84 -60 L 93 -64 L 96 -73 L 99 -64 Z"
              fill="#ffffff"
            />
            <circle cx="0" cy="0" r="6" fill="#34d399" />
          </>
        ) : (
          <>
            {/* Shattered Watch Crystal Fracture Lines & Snapped Crimson Second Hand */}
            <path
              d="M 0 0 L -95 -62 M 0 0 L -132 18 M 0 0 L 84 -78 M 0 0 L 112 48 M -48 -31 L -72 -8"
              stroke="rgba(254,205,211,0.52)"
              strokeWidth="1.5"
              fill="none"
            />
            <line
              x1="-35"
              y1="22"
              x2="118"
              y2="-72"
              stroke="#f43f5e"
              strokeWidth="3.5"
            />
            <circle cx="0" cy="0" r="7" fill="#f43f5e" stroke="#ffe4e6" strokeWidth="1.5" />
          </>
        )}
      </g>
    </svg>
  );
};

function drawSnapshotAtOrigin(
  ctx: CanvasRenderingContext2D,
  targetRadiusPx: number,
  frame: ReplaySnapshotFrame,
  skinId: SparkSkinId = 'classic_spark'
): void {
  const patterns = getMiniPatterns(ctx);
  const scale = targetRadiusPx / ARENA_RADIUS;

  ctx.save();
  ctx.scale(scale, scale);

  drawArenaClockDial(
    ctx,
    frame.round || 1,
    frame.round >= 7 ? 'FRENZY' : 'PRESSURE',
    frame.round * 0.85,
    false
  );

  ctx.beginPath();
  ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
  ctx.clip();

  for (const hz of frame.hazards) {
    drawClockworkHazard(ctx, hz, frame.eventId ?? null, patterns, 1.2);
  }

  for (const sh of frame.safeHints || []) {
    drawSafeEscapementZone(ctx, sh, 1.0);
  }

  if (frame.missedClue) {
    const mc = frame.missedClue;
    const hlStroke =
      mc.color === 'MAGENTA' ? '#e879f9' : mc.color === 'CYAN' ? '#38bdf8' : '#fbbf24';
    ctx.save();
    ctx.beginPath();
    ctx.arc(mc.x, mc.y, mc.radius, 0, Math.PI * 2);
    ctx.strokeStyle = hlStroke;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(mc.x, mc.y, mc.radius + 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (
    frame.isDecisionPoint &&
    frame.optimalEscapeX !== undefined &&
    frame.optimalEscapeY !== undefined
  ) {
    ctx.beginPath();
    ctx.moveTo(frame.playerX, frame.playerY);
    ctx.lineTo(frame.optimalEscapeX, frame.optimalEscapeY);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 4.5;
    ctx.setLineDash([9, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawTimeSparkPlayer(
    ctx,
    frame.playerX,
    frame.playerY,
    frame.aimAngle,
    1,
    frame.isDecisionPoint ? 6 : 1,
    1.5,
    [],
    skinId
  );

  if (frame.isDecisionPoint) {
    ctx.beginPath();
    ctx.arc(frame.playerX, frame.playerY, PLAYER_RADIUS + 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.8;
    ctx.stroke();
  }

  ctx.restore();

  ctx.beginPath();
  ctx.arc(0, 0, targetRadiusPx, 0, Math.PI * 2);
  ctx.strokeStyle = frame.isDecisionPoint
    ? 'rgba(253, 224, 71, 0.88)'
    : 'rgba(200, 169, 110, 0.45)';
  ctx.lineWidth = 2.4;
  ctx.stroke();
}
