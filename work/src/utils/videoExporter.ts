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
import { RunResultSummary } from '../game/GameState';
import { ReplaySnapshotFrame } from '../game/ReplaySystem';
import { encodeChallengeCode } from './challengeSeed';
import { t } from '../i18n';

/**
 * Generates a vertical 9:16 (540x960) TikTok / WeChat Channels highlight video (WebM)
 * rendered in the Giant Clockwork aesthetic with system fonts and zero external assets.
 */
export async function exportVerticalHighlightVideo(
  result: RunResultSummary,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const width = 540;
  const height = 960;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  const patterns = createClockworkPatterns(ctx);

  const frames: ReplaySnapshotFrame[] =
    result.replayReel.length > 0
      ? result.replayReel
      : result.closestSnapshot
      ? [result.closestSnapshot]
      : [];

  if (frames.length === 0) {
    throw new Error('No replay frames available');
  }

  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  let mimeType = '';
  if (typeof MediaRecorder !== 'undefined') {
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) {
        mimeType = c;
        break;
      }
    }
  }

  if (!mimeType || typeof canvas.captureStream !== 'function') {
    throw new Error(t('video.unsupported'));
  }

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_500_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const challengeCode = encodeChallengeCode({
    seed: result.seed,
    customSequence: result.customSequence,
    creatorRound: result.survivedRounds,
    creatorScore: result.finalScore,
  });

  const isSuccess = result.outcome === 'CASHED_OUT';

  const expandedFrames: ReplaySnapshotFrame[] = [];
  for (const f of frames) {
    const repeats = f.isDecisionPoint ? 5 : f.isNearMiss ? 3 : 2;
    for (let r = 0; r < repeats; r++) {
      expandedFrames.push(f);
    }
  }
  const finalSeq =
    expandedFrames.length > 165
      ? expandedFrames.slice(expandedFrames.length - 165)
      : expandedFrames;
  const lastF = finalSeq[finalSeq.length - 1];
  for (let k = 0; k < 18; k++) {
    finalSeq.push(lastF);
  }

  return new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error(t('video.encodeFail')));
    recorder.onstop = () => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mimeType });
      resolve({
        blob,
        filename: `LAST-SECOND-CLOCKWORK-${result.seed}.${ext}`,
        mimeType,
      });
    };

    recorder.start();

    let step = 0;
    const totalSteps = finalSeq.length;

    const renderNext = () => {
      if (step >= totalSteps) {
        recorder.stop();
        return;
      }

      const f = finalSeq[step];
      drawVerticalVideoFrame(
        ctx,
        patterns,
        width,
        height,
        f,
        result,
        challengeCode,
        isSuccess,
        step / totalSteps,
        step * 0.033
      );
      step++;
      if (onProgress) {
        onProgress(Math.round((step / totalSteps) * 100));
      }
      window.setTimeout(renderNext, 33);
    };

    renderNext();
  });
}

function drawVerticalVideoFrame(
  ctx: CanvasRenderingContext2D,
  patterns: ClockworkPatternSet,
  w: number,
  h: number,
  frame: ReplaySnapshotFrame,
  result: RunResultSummary,
  challengeCode: string,
  isSuccess: boolean,
  progress: number,
  pulseTime: number
): void {
  ctx.save();

  // 1. Deep Obsidian Watchcase Background
  const tension = Math.min(1, ((frame.round || 1) - 1) / 13);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, `rgb(${Math.round(12 + tension * 22)}, 12, 19)`);
  bg.addColorStop(0.5, '#07080d');
  bg.addColorStop(1, '#090b12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Corner clockwork gears spinning subtly
  drawClockGear(
    ctx,
    56,
    130,
    78,
    22,
    pulseTime * 0.4,
    'rgba(200, 169, 110, 0.14)',
    'rgba(16, 19, 28, 0.35)',
    5
  );
  drawClockGear(
    ctx,
    w - 56,
    h - 140,
    86,
    24,
    -pulseTime * 0.35,
    isSuccess ? 'rgba(56, 189, 248, 0.14)' : 'rgba(244, 63, 94, 0.15)',
    'rgba(16, 19, 28, 0.35)',
    5
  );

  // Outer watchcase frame
  ctx.strokeStyle = isSuccess ? 'rgba(52, 211, 153, 0.42)' : 'rgba(244, 63, 94, 0.42)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, w - 40, h - 40);

  // 2. Top Horological Brand Lockup
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4f1ea';
  ctx.font = `700 40px ${CLOCK_DISPLAY_FONT}`;
  ctx.fillText('LAST SECOND', w / 2, 84);

  ctx.fillStyle = '#d6c7a9';
  ctx.font = `600 18px ${CLOCK_SANS_FONT}`;
  ctx.fillText(t('video.header', { round: frame.round, event: frame.eventName }), w / 2, 118);

  // 3. Kinetic Hook Subtitle Banner above Dial
  let subtitle = isSuccess
    ? t('video.subSuccess', {
        rounds: result.survivedRounds,
        score: result.finalScore.toLocaleString(),
      })
    : t('video.subFail', { lost: result.lostUnsettledScore.toLocaleString() });
  let subColor = isSuccess ? '#6ee7b7' : '#fda4af';

  if (frame.isDecisionPoint && !isSuccess && frame.missedClue) {
    subtitle = t('video.subClue', { text: frame.missedClue.text.slice(0, 22) });
    subColor = '#fde047';
  } else if (frame.isDecisionPoint) {
    subtitle = t('video.subDecision');
    subColor = '#fde047';
  } else if (frame.isNearMiss) {
    const mm = Math.max(0.1, +(frame.closestMarginPx * 0.25).toFixed(1));
    subtitle = t('video.subNearMiss', { mm });
    subColor = '#fde047';
  }

  ctx.fillStyle = subColor;
  ctx.font = `700 19px ${CLOCK_SANS_FONT}`;
  ctx.fillText(subtitle, w / 2, 176);

  // 4. Central Giant Clock Dial Arena (Centered at y = 465, radius = 212)
  const cx = w / 2;
  const cy = 465;
  const arenaPx = 212;
  const scale = arenaPx / ARENA_RADIUS;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  drawArenaClockDial(
    ctx,
    frame.round || 1,
    frame.round >= 7 ? 'FRENZY' : 'PRESSURE',
    pulseTime,
    true
  );

  ctx.beginPath();
  ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
  ctx.clip();

  for (const hz of frame.hazards) {
    drawClockworkHazard(ctx, hz, frame.eventId ?? null, patterns, pulseTime);
  }

  for (const sh of frame.safeHints || []) {
    drawSafeEscapementZone(ctx, sh, pulseTime);
  }

  // Missed Clue Highlight Ring
  if (frame.missedClue) {
    const mc = frame.missedClue;
    const hlStroke =
      mc.color === 'MAGENTA' ? '#e879f9' : mc.color === 'CYAN' ? '#38bdf8' : '#fbbf24';
    ctx.save();
    ctx.beginPath();
    ctx.arc(mc.x, mc.y, mc.radius, 0, Math.PI * 2);
    ctx.strokeStyle = hlStroke;
    ctx.lineWidth = 3.8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(mc.x, mc.y, mc.radius + 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    const tagX = Math.max(-155, Math.min(155, mc.x));
    const tagY = mc.y > 120 ? mc.y - mc.radius - 12 : mc.y + mc.radius + 18;
    ctx.fillStyle = '#fde047';
    ctx.font = `700 13px ${CLOCK_SANS_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(t('video.missedTag'), tagX, tagY);
    ctx.restore();
  }

  // Decision Point Escape Arrow
  if (
    frame.isDecisionPoint &&
    frame.optimalEscapeX !== undefined &&
    frame.optimalEscapeY !== undefined
  ) {
    ctx.beginPath();
    ctx.arc(frame.playerX, frame.playerY, PLAYER_RADIUS + 16, 0, Math.PI * 2);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(frame.playerX, frame.playerY);
    ctx.lineTo(frame.optimalEscapeX, frame.optimalEscapeY);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4.5;
    ctx.setLineDash([10, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Time Spark Player
  drawTimeSparkPlayer(
    ctx,
    frame.playerX,
    frame.playerY,
    frame.aimAngle,
    1,
    frame.isDecisionPoint ? 6 : 2,
    pulseTime,
    [],
    result.equippedSkin
  );

  ctx.restore();

  // Outer Brass/Sky Bezel Rim
  ctx.beginPath();
  ctx.arc(cx, cy, arenaPx, 0, Math.PI * 2);
  ctx.strokeStyle = frame.isDecisionPoint ? '#fde047' : 'rgba(200, 169, 110, 0.72)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 5. Bottom Telemetry & Challenge Call-To-Action
  const statsY = 748;
  const cols = [
    { label: t('video.statRounds'), val: t('video.roundsVal', { n: result.survivedRounds }) },
    { label: t('video.statMult'), val: `x${result.maxMultiplier}` },
    {
      label: t('video.statMargin'),
      val: result.closestMm !== null ? `${result.closestMm}mm` : '--',
    },
  ];
  cols.forEach((c, idx) => {
    const x = 105 + idx * 165;
    ctx.fillStyle = '#a8a29e';
    ctx.font = `500 15px ${CLOCK_SANS_FONT}`;
    ctx.fillText(c.label, x, statsY);
    ctx.fillStyle = '#f4f1ea';
    ctx.font = `700 26px ${CLOCK_MONO_FONT}`;
    ctx.fillText(c.val, x, statsY + 34);
  });

  ctx.fillStyle = '#fbbf24';
  ctx.font = `700 22px ${CLOCK_MONO_FONT}`;
  ctx.fillText(t('video.code', { code: challengeCode }), w / 2, 848);

  ctx.fillStyle = '#d6d3d1';
  ctx.font = `600 17px ${CLOCK_SANS_FONT}`;
  ctx.fillText(t('video.cta'), w / 2, 888);

  // Progress bar along bottom frame
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(22, h - 24, (w - 44) * progress, 4);

  ctx.restore();
}
