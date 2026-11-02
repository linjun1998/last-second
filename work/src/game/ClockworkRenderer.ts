import { RhythmStage } from '../data/difficultyConfig';
import { EventId } from '../data/eventConfig';
import { SparkSkinId } from '../data/progressionConfig';
import { ClueZone } from '../events/HazardEvents';
import { ARENA_RADIUS, HazardShape, PLAYER_RADIUS, SafeZoneHint } from './CollisionSystem';
import { TrailGhost } from './PlayerController';

export const CLOCK_DISPLAY_FONT =
  '"Optima", "Palatino Linotype", "Book Antiqua", Georgia, "Songti SC", serif';
export const CLOCK_SANS_FONT =
  'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
export const CLOCK_MONO_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const ROMAN_NUMERALS = [
  'XII',
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
];

export interface ClockworkPatternSet {
  warningHatch: CanvasPattern | null;
  lethalKnurl: CanvasPattern | null;
}

export function createClockworkPatterns(ctx: CanvasRenderingContext2D): ClockworkPatternSet {
  // 1. Warning Pattern: 45-degree wide diagonal stripes (high-contrast shape cue for colorblind players)
  const warnCanvas = document.createElement('canvas');
  warnCanvas.width = 20;
  warnCanvas.height = 20;
  const wctx = warnCanvas.getContext('2d');
  if (wctx) {
    wctx.clearRect(0, 0, 20, 20);
    wctx.strokeStyle = 'rgba(251, 191, 36, 0.36)';
    wctx.lineWidth = 4;
    wctx.beginPath();
    wctx.moveTo(-5, 5);
    wctx.lineTo(5, -5);
    wctx.moveTo(0, 20);
    wctx.lineTo(20, 0);
    wctx.moveTo(15, 25);
    wctx.lineTo(25, 15);
    wctx.stroke();
  }

  // 2. Lethal Pattern: Mechanical cross-knurl diamond mesh (distinct from single-angle warning stripes)
  const lethalCanvas = document.createElement('canvas');
  lethalCanvas.width = 16;
  lethalCanvas.height = 16;
  const lctx = lethalCanvas.getContext('2d');
  if (lctx) {
    lctx.clearRect(0, 0, 16, 16);
    lctx.strokeStyle = 'rgba(255, 228, 230, 0.22)';
    lctx.lineWidth = 1.6;
    lctx.beginPath();
    lctx.moveTo(0, 0);
    lctx.lineTo(16, 16);
    lctx.moveTo(16, 0);
    lctx.lineTo(0, 16);
    lctx.stroke();
  }

  return {
    warningHatch: wctx ? ctx.createPattern(warnCanvas, 'repeat') : null,
    lethalKnurl: lctx ? ctx.createPattern(lethalCanvas, 'repeat') : null,
  };
}

/**
 * Draws a precision horological spoked skeleton gear at (cx, cy).
 */
export function drawClockGear(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerRadius: number,
  teeth: number,
  rotation: number,
  strokeColor: string,
  fillColor: string,
  spokes = 5
): void {
  if (outerRadius < 8) return;
  const toothDepth = Math.max(3, outerRadius * 0.11);
  const rootR = outerRadius - toothDepth;
  const rimInnerR = rootR * 0.78;
  const hubR = Math.max(4, outerRadius * 0.22);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  // Gear toothed perimeter
  ctx.beginPath();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.22;
    const a2 = a0 + step * 0.48;
    const a3 = a0 + step * 0.7;
    if (i === 0) {
      ctx.moveTo(Math.cos(a0) * rootR, Math.sin(a0) * rootR);
    } else {
      ctx.lineTo(Math.cos(a0) * rootR, Math.sin(a0) * rootR);
    }
    ctx.lineTo(Math.cos(a1) * outerRadius, Math.sin(a1) * outerRadius);
    ctx.lineTo(Math.cos(a2) * outerRadius, Math.sin(a2) * outerRadius);
    ctx.lineTo(Math.cos(a3) * rootR, Math.sin(a3) * rootR);
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Inner rim & spokes
  ctx.beginPath();
  ctx.arc(0, 0, rimInnerR, 0, Math.PI * 2);
  ctx.stroke();

  for (let s = 0; s < spokes; s++) {
    const sa = (s / spokes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(sa) * hubR, Math.sin(sa) * hubR);
    ctx.lineTo(Math.cos(sa) * rimInnerR, Math.sin(sa) * rimInnerR);
    ctx.lineWidth = Math.max(1.5, outerRadius * 0.055);
    ctx.stroke();
  }

  // Hub & pivot hole
  ctx.beginPath();
  ctx.arc(0, 0, hubR, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a central horological Archimedes hairspring (游丝) that breathes with tension.
 */
export function drawHairspring(
  ctx: CanvasRenderingContext2D,
  maxRadius: number,
  turns: number,
  pulseTime: number,
  tension: number,
  strokeStyle: string
): void {
  const breathe = 1 + Math.sin(pulseTime * (2.6 + tension * 4.5)) * (0.045 + tension * 0.035);
  const effectiveMaxR = maxRadius * breathe;
  const totalAngle = turns * Math.PI * 2;
  const steps = 110;

  ctx.save();
  ctx.rotate(Math.sin(pulseTime * (1.8 + tension * 2.5)) * 0.25);
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const theta = t * totalAngle;
    const r = 6 + (effectiveMaxR - 6) * t;
    const x = Math.cos(theta) * r;
    const y = Math.sin(theta) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1.35;
  ctx.stroke();
  ctx.restore();
}

/**
 * Renders the full-viewport watchcase background & outer movement gears.
 * Progressively shifts warmer/redder and spawns denser interlocking gears with higher rounds!
 */
export function drawClockworkBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  arenaPxRadius: number,
  round: number,
  rhythmStage: RhythmStage,
  pulseTime: number,
  isCashingOut: boolean,
  decisionBeatFlash: number
): void {
  const isFrenzy = rhythmStage === 'FRENZY';
  const roundTension = Math.max(0, Math.min(1, (round - 1) / 13));
  const tension = isFrenzy ? Math.min(1, roundTension * 0.65 + 0.45) : roundTension;

  // Base watchcase obsidian fill
  ctx.fillStyle = '#07080d';
  ctx.fillRect(0, 0, width, height);

  // Round-progressive atmospheric radial gradient (Cool Slate -> Warm Bronze -> Furnace Crimson)
  const rCore = Math.round(14 + tension * 44 + decisionBeatFlash * 28);
  const gCore = isCashingOut ? 38 : Math.round(17 - tension * 7);
  const bCore = isCashingOut ? 32 : Math.round(28 - tension * 12);

  const bgGrad = ctx.createRadialGradient(
    centerX,
    centerY,
    arenaPxRadius * 0.2,
    centerX,
    centerY,
    Math.max(width, height) * 0.72
  );
  bgGrad.addColorStop(0, `rgb(${rCore}, ${gCore}, ${bCore})`);
  bgGrad.addColorStop(0.58, `rgba(${Math.round(9 + tension * 16)}, 9, 14, 0.96)`);
  bgGrad.addColorStop(1, '#05060a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle architectural bridge lines radiating from watch center
  ctx.save();
  ctx.translate(centerX, centerY);
  const bridgeAlpha = 0.06 + tension * 0.06;
  ctx.strokeStyle =
    tension > 0.55
      ? `rgba(244, 63, 94, ${bridgeAlpha})`
      : `rgba(200, 169, 110, ${bridgeAlpha})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    const span = Math.max(width, height);
    ctx.beginPath();
    ctx.moveTo(-Math.cos(a) * span, -Math.sin(a) * span);
    ctx.lineTo(Math.cos(a) * span, Math.sin(a) * span);
    ctx.stroke();
  }

  // Outer Movement Gear Train: Gets denser & faster as round increases!
  const speedFactor = (0.18 + tension * 0.65) * (isFrenzy ? 1.85 : 1);
  const gearStroke =
    tension > 0.62
      ? `rgba(244, 63, 94, ${0.14 + tension * 0.12})`
      : `rgba(200, 169, 110, ${0.13 + tension * 0.09})`;
  const gearFill =
    tension > 0.62 ? 'rgba(36, 11, 18, 0.32)' : 'rgba(17, 20, 30, 0.35)';

  // Tier 1 Gears (Always present: 4 corner movement wheels)
  const baseDist = arenaPxRadius * 1.24;
  const tier1 = [
    { ang: -0.68, dist: baseDist, r: arenaPxRadius * 0.42, teeth: 28, dir: 1 },
    { ang: 2.46, dist: baseDist, r: arenaPxRadius * 0.44, teeth: 30, dir: -1 },
    { ang: 0.72, dist: baseDist * 1.04, r: arenaPxRadius * 0.36, teeth: 24, dir: -1 },
    { ang: -2.42, dist: baseDist * 1.04, r: arenaPxRadius * 0.36, teeth: 24, dir: 1 },
  ];
  for (const g of tier1) {
    drawClockGear(
      ctx,
      Math.cos(g.ang) * g.dist,
      Math.sin(g.ang) * g.dist,
      g.r,
      g.teeth,
      pulseTime * speedFactor * g.dir,
      gearStroke,
      gearFill,
      6
    );
  }

  // Tier 2 Gears (Round 4+: 4 intermediate escapement gears engage)
  if (round >= 4 || isFrenzy) {
    const tier2 = [
      { ang: 0, dist: arenaPxRadius * 1.32, r: arenaPxRadius * 0.27, teeth: 18, dir: -1.4 },
      { ang: Math.PI, dist: arenaPxRadius * 1.32, r: arenaPxRadius * 0.27, teeth: 18, dir: 1.4 },
      { ang: -1.25, dist: arenaPxRadius * 1.46, r: arenaPxRadius * 0.24, teeth: 16, dir: -1.6 },
      { ang: 1.88, dist: arenaPxRadius * 1.46, r: arenaPxRadius * 0.24, teeth: 16, dir: 1.6 },
    ];
    for (const g of tier2) {
      drawClockGear(
        ctx,
        Math.cos(g.ang) * g.dist,
        Math.sin(g.ang) * g.dist,
        g.r,
        g.teeth,
        pulseTime * speedFactor * g.dir,
        gearStroke,
        gearFill,
        5
      );
    }
  }

  // Tier 3 Gears (Round 8+ or FRENZY: 6 dense high-speed strike-train pinions!)
  if (round >= 8 || isFrenzy) {
    const tier3 = [
      { ang: -1.57, dist: arenaPxRadius * 1.18, r: arenaPxRadius * 0.2, teeth: 14, dir: 2.2 },
      { ang: 1.57, dist: arenaPxRadius * 1.18, r: arenaPxRadius * 0.2, teeth: 14, dir: -2.2 },
      { ang: -0.32, dist: arenaPxRadius * 1.58, r: arenaPxRadius * 0.22, teeth: 15, dir: 1.9 },
      { ang: 2.82, dist: arenaPxRadius * 1.58, r: arenaPxRadius * 0.22, teeth: 15, dir: -1.9 },
      { ang: 0.35, dist: arenaPxRadius * 1.56, r: arenaPxRadius * 0.19, teeth: 13, dir: -2.3 },
      { ang: -2.78, dist: arenaPxRadius * 1.56, r: arenaPxRadius * 0.19, teeth: 13, dir: 2.3 },
    ];
    for (const g of tier3) {
      drawClockGear(
        ctx,
        Math.cos(g.ang) * g.dist,
        Math.sin(g.ang) * g.dist,
        g.r,
        g.teeth,
        pulseTime * speedFactor * g.dir,
        gearStroke,
        gearFill,
        4
      );
    }
  }

  // Frenzy "整点报时爆发": 12-o'clock Chime Bell & Acoustic Ripples!
  if (isFrenzy) {
    const bellY = -arenaPxRadius - 22;
    const chimeWave = (pulseTime * 3.2) % 1;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, bellY, 14 + chimeWave * 58, Math.PI * 1.15, Math.PI * 1.85);
    ctx.strokeStyle = `rgba(251, 191, 36, ${(1 - chimeWave) * 0.55})`;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    const hammerSwing = Math.sin(pulseTime * 22) * 0.22;
    ctx.rotate(hammerSwing * 0.12);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.78)';
    ctx.beginPath();
    ctx.arc(0, bellY, 9, Math.PI, 0);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Draws the Giant Clock Dial inside the circular arena (ticks, Roman numerals, inner gears, hairspring, center jewel).
 * Call while translated to arena origin (0,0) in ARENA_RADIUS (250px) space!
 */
export function drawArenaClockDial(
  ctx: CanvasRenderingContext2D,
  round: number,
  rhythmStage: RhythmStage,
  pulseTime: number,
  includeOuterBezelTicks = true
): void {
  const isFrenzy = rhythmStage === 'FRENZY';
  const tension = Math.max(0, Math.min(1, (round - 1) / 13));
  const speed = (0.14 + tension * 0.42) * (isFrenzy ? 1.8 : 1);

  // 1. Outer Bezel Crown & 60 Minute/Second Graduations (outside clip)
  if (includeOuterBezelTicks) {
    ctx.save();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const isHour = i % 5 === 0;
      const rIn = ARENA_RADIUS + (isHour ? 6 : 9);
      const rOut = ARENA_RADIUS + (isHour ? 18 : 14);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
      ctx.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
      ctx.strokeStyle = isHour
        ? isFrenzy
          ? 'rgba(251, 191, 36, 0.72)'
          : 'rgba(200, 169, 110, 0.52)'
        : 'rgba(148, 163, 184, 0.18)';
      ctx.lineWidth = isHour ? 2.1 : 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Dial Face Base (Clipped inside ARENA_RADIUS by caller or here)
  const dialGrad = ctx.createRadialGradient(0, 0, 12, 0, 0, ARENA_RADIUS);
  const innerR = Math.round(16 + tension * 26);
  const innerG = Math.round(19 - tension * 6);
  const innerB = Math.round(29 - tension * 10);
  dialGrad.addColorStop(0, `rgb(${innerR}, ${innerG}, ${innerB})`);
  dialGrad.addColorStop(0.74, `rgb(${Math.round(10 + tension * 12)}, 12, 19)`);
  dialGrad.addColorStop(1, '#07080d');
  ctx.fillStyle = dialGrad;
  ctx.beginPath();
  ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // 3. Internal Skeleton Gears (Progressive density with round!)
  const gearLine =
    tension > 0.6
      ? `rgba(244, 63, 94, ${0.11 + tension * 0.08})`
      : `rgba(200, 169, 110, ${0.11 + tension * 0.06})`;
  const gearBody = 'rgba(15, 18, 28, 0.42)';

  // Core coaxial mainspring barrel & escapement wheel
  drawClockGear(ctx, 0, 0, 146, 32, pulseTime * speed * 0.45, gearLine, gearBody, 6);
  drawClockGear(ctx, 0, 0, 92, 20, -pulseTime * speed * 0.85, gearLine, gearBody, 4);

  if (round >= 4 || isFrenzy) {
    drawClockGear(ctx, -92, -68, 52, 16, pulseTime * speed * 1.3, gearLine, gearBody, 4);
    drawClockGear(ctx, 92, 68, 52, 16, pulseTime * speed * 1.3, gearLine, gearBody, 4);
    drawClockGear(ctx, 88, -76, 40, 14, -pulseTime * speed * 1.6, gearLine, gearBody, 3);
  }

  if (round >= 8 || isFrenzy) {
    drawClockGear(ctx, -90, 78, 42, 14, -pulseTime * speed * 1.9, gearLine, gearBody, 4);
    drawClockGear(ctx, 0, -124, 34, 12, pulseTime * speed * 2.4, gearLine, gearBody, 3);
    drawClockGear(ctx, 0, 124, 34, 12, -pulseTime * speed * 2.4, gearLine, gearBody, 3);
  }

  // 4. Concentric Chapter Rings & Tourbillon Crosshair Axes
  ctx.save();
  ctx.strokeStyle = 'rgba(200, 169, 110, 0.12)';
  ctx.lineWidth = 1;
  for (const r of [68, 136, 198, 232]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
  ctx.beginPath();
  ctx.moveTo(-ARENA_RADIUS, 0);
  ctx.lineTo(ARENA_RADIUS, 0);
  ctx.moveTo(0, -ARENA_RADIUS);
  ctx.lineTo(0, ARENA_RADIUS);
  ctx.stroke();

  // 60 Inner Chapter Sub-Ticks
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const isMajor = i % 5 === 0;
    const r0 = isMajor ? 231 : 237;
    const r1 = 244;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.strokeStyle = isMajor ? 'rgba(253, 230, 138, 0.45)' : 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = isMajor ? 1.8 : 0.9;
    ctx.stroke();
  }

  // 5. 12 Roman Numerals around Chapter Ring
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    const nr = 214;
    const nx = Math.cos(a) * nr;
    const ny = Math.sin(a) * nr;
    const isTwelve = h === 0;
    ctx.font = `700 ${isTwelve ? 15 : 12}px ${CLOCK_DISPLAY_FONT}`;
    ctx.fillStyle =
      isTwelve && isFrenzy
        ? 'rgba(253, 224, 71, 0.92)'
        : isTwelve
        ? 'rgba(253, 230, 138, 0.62)'
        : 'rgba(200, 169, 110, 0.36)';
    ctx.fillText(ROMAN_NUMERALS[h], nx, ny);
  }
  ctx.restore();

  // 6. Central Hairspring (游丝) + Ruby Escapement Pivot Jewel
  const springColor = isFrenzy
    ? 'rgba(251, 113, 133, 0.32)'
    : tension > 0.5
    ? 'rgba(251, 191, 36, 0.25)'
    : 'rgba(125, 211, 252, 0.22)';
  drawHairspring(ctx, 56, 3.6, pulseTime, tension, springColor);

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(200, 169, 110, 0.55)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = '#e11d48';
  ctx.fill();
  ctx.restore();
}

/**
 * Renders any HazardShape with both horological mechanism identity AND colorblind-safe texture/shape differentiation:
 * - Warning (!lethal): Diagonal 45° Hatch + Dashed Outline + Mechanical Preview Silhouette
 * - Lethal (lethal): Solid High-Contrast Crimson + Cross-Knurl Texture + Serrated Gear/Saw Teeth + Bright Core
 */
export function drawClockworkHazard(
  ctx: CanvasRenderingContext2D,
  h: HazardShape,
  eventId: EventId | null,
  patterns: ClockworkPatternSet,
  pulseTime: number
): void {
  ctx.save();

  const isSecondHand =
    eventId === 'rotating_blade' ||
    eventId === 'frenzy_gauntlet' ||
    eventId === 'chain_sweep';
  const isPendulum = eventId === 'moving_obstacle';
  const isMainspring = eventId === 'shrinking_zone' || eventId === 'razor_gate';
  const isDirectionInvert = eventId === 'direction_invert';
  const isFakeSafety = eventId === 'fake_safety';

  if (h.kind === 'bar') {
    ctx.translate(h.cx, h.cy);
    ctx.rotate(h.angle);
    const w = h.halfLength * 2;
    const t = h.halfThickness * 2;

    if (!h.lethal) {
      // WARNING STATE: Warm Amber + 45° Diagonal Hatching + Dashed Border
      ctx.fillStyle = `rgba(245, 158, 11, ${0.09 + h.warningProgress * 0.2})`;
      ctx.fillRect(-h.halfLength, -h.halfThickness, w, t);

      if (patterns.warningHatch) {
        ctx.fillStyle = patterns.warningHatch;
        ctx.fillRect(-h.halfLength, -h.halfThickness, w, t);
      }

      // Inner tension fill bar growing with warningProgress
      ctx.fillStyle = 'rgba(251, 191, 36, 0.36)';
      ctx.fillRect(
        -h.halfLength,
        -h.halfThickness * h.warningProgress,
        w,
        t * h.warningProgress
      );

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 5]);
      ctx.strokeRect(-h.halfLength, -h.halfThickness, w, t);
      ctx.setLineDash([]);

      // Horological Silhouette Details on Warning
      if (isSecondHand) {
        // Sweeping Clock Hand needle spine & counterweight ring
        ctx.beginPath();
        ctx.moveTo(-h.halfLength + 10, 0);
        ctx.lineTo(h.halfLength - 6, 0);
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.75)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, Math.min(13, h.halfThickness + 3), 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      } else if (isPendulum) {
        // Pendulum Bob at inner gap end
        const bobX = h.cx < 0 ? h.halfLength - 18 : -h.halfLength + 18;
        ctx.beginPath();
        ctx.arc(bobX, 0, Math.min(20, h.halfThickness * 1.25), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
        ctx.fill();
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      // LETHAL STATE: High-Contrast Crimson + Cross-Knurl + Serrated Teeth + Bright Needle Spine
      const barGrad = ctx.createLinearGradient(0, -h.halfThickness, 0, h.halfThickness);
      barGrad.addColorStop(0, '#9f1239');
      barGrad.addColorStop(0.5, '#f43f5e');
      barGrad.addColorStop(1, '#9f1239');
      ctx.fillStyle = barGrad;
      ctx.fillRect(-h.halfLength, -h.halfThickness, w, t);

      if (patterns.lethalKnurl) {
        ctx.fillStyle = patterns.lethalKnurl;
        ctx.fillRect(-h.halfLength, -h.halfThickness, w, t);
      }

      // Incandescent clock-hand spine
      ctx.fillStyle = 'rgba(255, 241, 242, 0.72)';
      ctx.fillRect(
        -h.halfLength + 4,
        -Math.min(2.6, h.halfThickness * 0.24),
        Math.max(0, w - 8),
        Math.min(5.2, h.halfThickness * 0.48)
      );

      ctx.strokeStyle = '#ffe4e6';
      ctx.lineWidth = 2.2;
      ctx.strokeRect(-h.halfLength, -h.halfThickness, w, t);

      // Accessibility Shape Cue: Serrated mechanical sawtooth notches along lethal edges!
      const notchSpacing = 28;
      ctx.fillStyle = '#fda4af';
      for (let x = -h.halfLength + 14; x <= h.halfLength - 14; x += notchSpacing) {
        ctx.beginPath();
        ctx.moveTo(x - 4, -h.halfThickness);
        ctx.lineTo(x, -h.halfThickness - 4.5);
        ctx.lineTo(x + 4, -h.halfThickness);
        ctx.moveTo(x - 4, h.halfThickness);
        ctx.lineTo(x, h.halfThickness + 4.5);
        ctx.lineTo(x + 4, h.halfThickness);
        ctx.fill();
      }

      if (isSecondHand) {
        // Counterweighted Second Hand Pivot Boss & Tail Loop
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(14, h.halfThickness + 4), 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#fffbeb';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#be123c';
        ctx.fill();
      } else if (isPendulum) {
        // Heavy Swinging Crimson-Brass Pendulum Bob framing the gap
        const bobX = h.cx < 0 ? h.halfLength - 18 : -h.halfLength + 18;
        const bobR = Math.min(21, h.halfThickness * 1.3);
        ctx.beginPath();
        ctx.arc(bobX, 0, bobR, 0, Math.PI * 2);
        ctx.fillStyle = '#e11d48';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#fde68a';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(bobX, 0, bobR * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#fde68a';
        ctx.fill();
      }
    }
  } else if (h.kind === 'circle') {
    const safeR = Math.max(0, h.radius);
    if (h.invertSafeInside) {
      // CONTRACTING MAINSPRING ZONE (shrinking_zone, fake_safety)
      ctx.beginPath();
      ctx.rect(
        -ARENA_RADIUS - 20,
        -ARENA_RADIUS - 20,
        ARENA_RADIUS * 2 + 40,
        ARENA_RADIUS * 2 + 40
      );
      ctx.arc(h.cx, h.cy, safeR, 0, Math.PI * 2, true);

      if (!h.lethal) {
        ctx.fillStyle = `rgba(245, 158, 11, ${0.1 + h.warningProgress * 0.22})`;
        ctx.fill('evenodd');
        if (patterns.warningHatch) {
          ctx.fillStyle = patterns.warningHatch;
          ctx.fill('evenodd');
        }
        ctx.beginPath();
        ctx.arc(h.cx, h.cy, safeR, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([9, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = 'rgba(190, 18, 60, 0.9)';
        ctx.fill('evenodd');
        if (patterns.lethalKnurl) {
          ctx.fillStyle = patterns.lethalKnurl;
          ctx.fill('evenodd');
        }
        ctx.beginPath();
        ctx.arc(h.cx, h.cy, safeR, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffe4e6';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inward-biting ratchet teeth around contracting pocket (shape cue for lethal)
        const teethCount = 16;
        ctx.fillStyle = '#fecdd3';
        for (let i = 0; i < teethCount; i++) {
          const a = (i / teethCount) * Math.PI * 2 + pulseTime * 0.6;
          const x0 = h.cx + Math.cos(a - 0.06) * (safeR + 1);
          const y0 = h.cy + Math.sin(a - 0.06) * (safeR + 1);
          const xTip = h.cx + Math.cos(a) * Math.max(0, safeR - 6);
          const yTip = h.cy + Math.sin(a) * Math.max(0, safeR - 6);
          const x1 = h.cx + Math.cos(a + 0.06) * (safeR + 1);
          const y1 = h.cy + Math.sin(a + 0.06) * (safeR + 1);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(xTip, yTip);
          ctx.lineTo(x1, y1);
          ctx.fill();
        }
      }

      // Coiling Mainspring Spiral Ribs outside safe pocket (坍缩禁区 = 发条收紧)
      if (isMainspring || isFakeSafety) {
        ctx.save();
        ctx.strokeStyle = h.lethal
          ? 'rgba(254, 205, 211, 0.34)'
          : 'rgba(253, 230, 138, 0.32)';
        ctx.lineWidth = 1.6;
        for (let ring = 1; ring <= 3; ring++) {
          ctx.beginPath();
          ctx.arc(
            h.cx,
            h.cy,
            safeR + ring * 26 + Math.sin(pulseTime * 5 + ring) * 3,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      // STRIKING CHIME HAMMER / OVERPRESSURE CORE (sudden_drop, fake_safety Phase 2)
      ctx.beginPath();
      ctx.arc(h.cx, h.cy, safeR, 0, Math.PI * 2);
      if (!h.lethal) {
        ctx.fillStyle = `rgba(245, 158, 11, ${0.1 + h.warningProgress * 0.22})`;
        ctx.fill();
        if (patterns.warningHatch) {
          ctx.fillStyle = patterns.warningHatch;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(h.cx, h.cy, safeR * h.warningProgress, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.34)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(h.cx, h.cy, safeR, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.4;
        ctx.setLineDash([8, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (isFakeSafety) {
          // Stalled False Time glyph ("⏸ 停摆")
          ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
          ctx.fillRect(h.cx - 8, h.cy - 10, 5, 20);
          ctx.fillRect(h.cx + 3, h.cy - 10, 5, 20);
        }
      } else {
        const radGrad = ctx.createRadialGradient(h.cx, h.cy, 4, h.cx, h.cy, Math.max(8, safeR));
        radGrad.addColorStop(0, '#fff1f2');
        radGrad.addColorStop(0.35, '#f43f5e');
        radGrad.addColorStop(1, '#9f1239');
        ctx.fillStyle = radGrad;
        ctx.fill();
        if (patterns.lethalKnurl) {
          ctx.fillStyle = patterns.lethalKnurl;
          ctx.fill();
        }
        ctx.strokeStyle = '#ffe4e6';
        ctx.lineWidth = 2.6;
        ctx.stroke();

        // Outer serrated teeth on striking hammer
        const spikes = 14;
        ctx.fillStyle = '#fda4af';
        for (let i = 0; i < spikes; i++) {
          const a = (i / spikes) * Math.PI * 2 + pulseTime * 0.8;
          ctx.beginPath();
          ctx.moveTo(
            h.cx + Math.cos(a - 0.08) * safeR,
            h.cy + Math.sin(a - 0.08) * safeR
          );
          ctx.lineTo(
            h.cx + Math.cos(a) * (safeR + 5.5),
            h.cy + Math.sin(a) * (safeR + 5.5)
          );
          ctx.lineTo(
            h.cx + Math.cos(a + 0.08) * safeR,
            h.cy + Math.sin(a + 0.08) * safeR
          );
          ctx.fill();
        }
      }
    }
  } else if (h.kind === 'ring_wall') {
    const startAng = h.safeAngleCenter + h.safeAngleHalfSpan;
    const endAng = h.safeAngleCenter + Math.PI * 2 - h.safeAngleHalfSpan;

    ctx.beginPath();
    ctx.arc(0, 0, h.outerRadius, startAng, endAng, false);
    ctx.arc(0, 0, h.innerRadius, endAng, startAng, true);
    ctx.closePath();

    if (!h.lethal) {
      ctx.fillStyle = `rgba(245, 158, 11, ${0.12 + h.warningProgress * 0.24})`;
      ctx.fill();
      if (patterns.warningHatch) {
        ctx.fillStyle = patterns.warningHatch;
        ctx.fill();
      }
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = 'rgba(190, 18, 60, 0.92)';
      ctx.fill();
      if (patterns.lethalKnurl) {
        ctx.fillStyle = patterns.lethalKnurl;
        ctx.fill();
      }
      ctx.strokeStyle = '#ffe4e6';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Direction Invert = Reversing Clock Hand ("指针倒转") visual cue!
    if (isDirectionInvert) {
      ctx.save();
      const handAng = h.safeAngleCenter + Math.PI;
      ctx.rotate(handAng);
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(Math.min(185, (h.innerRadius + h.outerRadius) * 0.5), 0);
      ctx.strokeStyle = h.lethal ? '#ffe4e6' : '#f5d0fe';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
}

/**
 * Draws Colorblind-Safe Escapement Safe Zone:
 * Ice-Blue + Double Concentric Circle + 4 Cardinal Watch-Jewel Notches + "◇ SAFE" glyph.
 */
export function drawSafeEscapementZone(
  ctx: CanvasRenderingContext2D,
  hint: SafeZoneHint,
  pulseTime: number
): void {
  ctx.save();
  const pulse = 1 + Math.sin(pulseTime * 8) * 0.05;
  const r = hint.radius * pulse;

  const safeGlow = ctx.createRadialGradient(hint.x, hint.y, 4, hint.x, hint.y, r * 1.28);
  safeGlow.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
  safeGlow.addColorStop(0.7, 'rgba(56, 189, 248, 0.10)');
  safeGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = safeGlow;
  ctx.beginPath();
  ctx.arc(hint.x, hint.y, r * 1.28, 0, Math.PI * 2);
  ctx.fill();

  // Outer dashed escapement ring
  ctx.beginPath();
  ctx.arc(hint.x, hint.y, r, 0, Math.PI * 2);
  ctx.lineWidth = 2.4;
  ctx.setLineDash([8, 5]);
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();
  ctx.setLineDash([]);

  // Inner solid hairline ring (distinct double-ring geometry for colorblind safety)
  if (r > 16) {
    ctx.beginPath();
    ctx.arc(hint.x, hint.y, Math.max(8, r - 6), 0, Math.PI * 2);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.62)';
    ctx.stroke();
  }

  // 4 Cardinal Diamond Escapement Pips
  ctx.fillStyle = '#bae6fd';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const px = hint.x + Math.cos(a) * r;
    const py = hint.y + Math.sin(a) * r;
    ctx.beginPath();
    ctx.arc(px, py, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }

  const rawLabel = hint.label || 'SAFE';
  const displayLabel = rawLabel.includes('◇') ? rawLabel : `◇ ${rawLabel}`;
  ctx.fillStyle = '#e0f2fe';
  ctx.font = `700 11px ${CLOCK_MONO_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(displayLabel, hint.x, hint.y);
  ctx.restore();
}

/**
 * Draws Deception / Lock-On ClueZones with horological iconography & non-hue shape coding:
 * - MAGENTA (Decoy / Reversing Hand): Octagonal / Broken-Dash Frame + "↺" Rewind / "✕" Decoy mark
 * - AMBER (Stalled Time / Overload / Hammer Lock): Target Brackets + "⏸" Stalled Clock / "△" Alert
 * - CYAN (True Beacon): Double Concentric Escapement Ring
 */
export function drawHorologicalClueZone(
  ctx: CanvasRenderingContext2D,
  cz: ClueZone,
  eventId: EventId | null,
  pulseTime: number
): void {
  ctx.save();
  const pulse = 1 + Math.sin(pulseTime * 11) * 0.07;
  const r = Math.max(18, cz.radius * pulse);

  const stroke =
    cz.color === 'MAGENTA' ? '#e879f9' : cz.color === 'AMBER' ? '#fbbf24' : '#38bdf8';
  const glowRgba =
    cz.color === 'MAGENTA'
      ? 'rgba(232, 121, 249, 0.22)'
      : cz.color === 'AMBER'
      ? 'rgba(251, 191, 36, 0.24)'
      : 'rgba(56, 189, 248, 0.20)';
  const textFill =
    cz.color === 'MAGENTA' ? '#f5d0fe' : cz.color === 'AMBER' ? '#fef08a' : '#bae6fd';

  const g = ctx.createRadialGradient(cz.x, cz.y, 4, cz.x, cz.y, r * 1.25);
  g.addColorStop(0, glowRgba);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cz.x, cz.y, r * 1.25, 0, Math.PI * 2);
  ctx.fill();

  if (cz.color === 'MAGENTA') {
    // Octagon silhouette for decoy/reversing hand (never mistakable for circular safe zone!)
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + pulseTime * -1.8;
      const vx = cz.x + Math.cos(a) * r;
      const vy = cz.y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.4;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Reversing clock hand icon inside
    const handAngle = -pulseTime * 6.5;
    ctx.beginPath();
    ctx.moveTo(cz.x, cz.y);
    ctx.lineTo(cz.x + Math.cos(handAngle) * (r * 0.65), cz.y + Math.sin(handAngle) * (r * 0.65));
    ctx.strokeStyle = '#f5d0fe';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cz.x, cz.y, r, 0, Math.PI * 2);
    ctx.lineWidth = 2.3;
    ctx.setLineDash([8, 5]);
    ctx.lineDashOffset = -(pulseTime * 32) % 26;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (cz.color === 'AMBER') {
    // Crosshair ticks + Frozen-time pause bars when fake_safety
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cz.x - r - 5, cz.y);
    ctx.lineTo(cz.x - r + 4, cz.y);
    ctx.moveTo(cz.x + r - 4, cz.y);
    ctx.lineTo(cz.x + r + 5, cz.y);
    ctx.moveTo(cz.x, cz.y - r - 5);
    ctx.lineTo(cz.x, cz.y - r + 4);
    ctx.moveTo(cz.x, cz.y + r - 4);
    ctx.lineTo(cz.x, cz.y + r + 5);
    ctx.stroke();

    if (eventId === 'fake_safety') {
      // Stalled False Time ("⏸") emblem
      ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
      ctx.fillRect(cz.x - 6, cz.y - 8, 3.8, 16);
      ctx.fillRect(cz.x + 2.2, cz.y - 8, 3.8, 16);
    }
  }

  if (cz.label) {
    const prefix = cz.color === 'MAGENTA' ? '↺ ' : cz.color === 'AMBER' ? '△ ' : '◇ ';
    const labelStr =
      cz.label.startsWith('↺') || cz.label.startsWith('△') || cz.label.startsWith('◇')
        ? cz.label
        : `${prefix}${cz.label}`;
    ctx.fillStyle = textFill;
    ctx.font = `700 11px ${CLOCK_SANS_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(labelStr, cz.x, cz.y - r - 8);
  }
  ctx.restore();
}

/**
 * Renders the Player as a glowing incandescent "Time Spark" (时间火花)
 * supporting 7 unlockable horological skins, each with a distinct core shape AND distinct trail!
 */
export function drawTimeSparkPlayer(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  aimAngle: number,
  squash: number,
  combo: number,
  pulseTime: number,
  trail: TrailGhost[],
  skinId: SparkSkinId = 'classic_spark'
): void {
  // 1. Skin-Specific Trail Geometry & Filament
  if (trail.length > 0) {
    ctx.save();
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      const alpha = t.alpha * 0.76;
      const r = PLAYER_RADIUS * (0.36 + t.alpha * 0.62);
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle);

      if (skinId === 'brass_gear') {
        // Spinning interlocking mini-gear rings
        ctx.rotate(pulseTime * 5 + i * 0.7);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
        ctx.strokeStyle =
          i % 2 === 0
            ? `rgba(245, 158, 11, ${alpha})`
            : `rgba(254, 240, 138, ${alpha * 0.85})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let k = 0; k < 4; k++) {
          const ka = (k * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ka) * r * 0.75, Math.sin(ka) * r * 0.75);
          ctx.lineTo(Math.cos(ka) * r * 1.2, Math.sin(ka) * r * 1.2);
          ctx.stroke();
        }
      } else if (skinId === 'chrono_hourglass') {
        // Golden sand-grain twin triangles + scattered motes
        ctx.scale(t.stretch, 1);
        ctx.beginPath();
        ctx.moveTo(r * 1.1, -r * 0.55);
        ctx.lineTo(r * 1.1, r * 0.55);
        ctx.lineTo(-r * 0.9, 0);
        ctx.closePath();
        ctx.fillStyle = `rgba(251, 191, 36, ${alpha})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, (i % 2 === 0 ? 1 : -1) * r * 0.7, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(254, 215, 170, ${alpha})`;
        ctx.fill();
      } else if (skinId === 'lunar_eclipse') {
        // Cool silver-cyan crescent wave arcs
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.08, -Math.PI * 0.58, Math.PI * 0.58);
        ctx.strokeStyle =
          i % 2 === 0
            ? `rgba(226, 232, 240, ${alpha})`
            : `rgba(56, 189, 248, ${alpha * 0.9})`;
        ctx.lineWidth = 2.4;
        ctx.stroke();
      } else if (skinId === 'emerald_hairspring') {
        // Double-helix jade spiral dots & rings
        const wave = Math.sin(pulseTime * 9 + i * 0.9) * r * 0.55;
        ctx.beginPath();
        ctx.arc(0, wave, r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(52, 211, 153, ${alpha})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -wave, r * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167, 243, 208, ${alpha * 0.85})`;
        ctx.fill();
      } else if (skinId === 'crimson_pendulum') {
        // Serrated crimson-gold chevron lance bolts
        ctx.scale(t.stretch * 1.2, 1);
        ctx.beginPath();
        ctx.moveTo(r * 1.35, 0);
        ctx.lineTo(-r * 0.5, r * 0.78);
        ctx.lineTo(-r * 0.15, 0);
        ctx.lineTo(-r * 0.5, -r * 0.78);
        ctx.closePath();
        ctx.fillStyle =
          i % 2 === 0
            ? `rgba(251, 113, 133, ${alpha})`
            : `rgba(253, 224, 71, ${alpha * 0.85})`;
        ctx.fill();
      } else if (skinId === 'royal_tourbillon') {
        // Royal Roman tick bars + violet-gold prism diamonds
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.95);
        ctx.lineTo(0, r * 0.95);
        ctx.strokeStyle =
          i % 2 === 0
            ? `rgba(250, 204, 21, ${alpha})`
            : `rgba(192, 132, 252, ${alpha * 0.9})`;
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(254, 240, 138, ${alpha})`;
        ctx.fill();
      } else {
        // classic_spark: Diamond ember tail mote
        ctx.scale(t.stretch * 1.15, 1 / Math.sqrt(t.stretch));
        ctx.beginPath();
        ctx.moveTo(r * 1.35, 0);
        ctx.lineTo(0, r * 0.68);
        ctx.lineTo(-r * 1.15, 0);
        ctx.lineTo(0, -r * 0.68);
        ctx.closePath();
        ctx.fillStyle =
          i % 2 === 0
            ? `rgba(253, 224, 71, ${alpha})`
            : `rgba(56, 189, 248, ${alpha * 0.85})`;
        ctx.fill();
      }
      ctx.restore();
    }

    // Continuous connecting filament colored per skin
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let i = trail.length - 1; i >= 0; i--) {
      ctx.lineTo(trail[i].x, trail[i].y);
    }
    const filamentMap: Record<SparkSkinId, string> = {
      classic_spark: 'rgba(254, 240, 138, 0.42)',
      brass_gear: 'rgba(245, 158, 11, 0.42)',
      chrono_hourglass: 'rgba(251, 191, 36, 0.48)',
      lunar_eclipse: 'rgba(186, 230, 253, 0.45)',
      emerald_hairspring: 'rgba(52, 211, 153, 0.48)',
      crimson_pendulum: 'rgba(251, 113, 133, 0.48)',
      royal_tourbillon: 'rgba(216, 180, 254, 0.48)',
    };
    ctx.strokeStyle = filamentMap[skinId];
    ctx.lineWidth = skinId === 'crimson_pendulum' ? 2.6 : 3.2;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // 2. Radiant Time Spark Core (Preserves PLAYER_RADIUS hitbox clarity across all skins!)
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(aimAngle);
  ctx.scale(squash, 2 - squash);

  const isHotCombo = combo >= 5;
  const haloColorMap: Record<SparkSkinId, [string, string]> = {
    classic_spark: ['rgba(254, 240, 138, 0.88)', isHotCombo ? 'rgba(245, 158, 11, 0.42)' : 'rgba(56, 189, 248, 0.40)'],
    brass_gear: ['rgba(253, 224, 71, 0.88)', 'rgba(217, 119, 6, 0.42)'],
    chrono_hourglass: ['rgba(254, 215, 170, 0.9)', 'rgba(245, 158, 11, 0.44)'],
    lunar_eclipse: ['rgba(224, 242, 254, 0.9)', 'rgba(56, 189, 248, 0.44)'],
    emerald_hairspring: ['rgba(167, 243, 208, 0.9)', 'rgba(16, 185, 129, 0.44)'],
    crimson_pendulum: ['rgba(254, 205, 211, 0.9)', 'rgba(244, 63, 94, 0.46)'],
    royal_tourbillon: ['rgba(254, 240, 138, 0.92)', 'rgba(168, 85, 247, 0.46)'],
  };
  const [midStop, outerStop] = haloColorMap[skinId];

  const coronaGlow = ctx.createRadialGradient(0, 0, 2, 0, 0, PLAYER_RADIUS * 3.4);
  coronaGlow.addColorStop(0, '#ffffff');
  coronaGlow.addColorStop(0.28, midStop);
  coronaGlow.addColorStop(0.62, outerStop);
  coronaGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = coronaGlow;
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER_RADIUS * 3.4, 0, Math.PI * 2);
  ctx.fill();

  if (skinId === 'brass_gear') {
    // Rotating 6-tooth golden escapement gear silhouette + bright central jewel
    ctx.save();
    ctx.rotate(pulseTime * 3.8);
    const teeth = 6;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2;
      const a1 = a0 + Math.PI / teeth * 0.48;
      const a2 = a0 + Math.PI / teeth;
      ctx.lineTo(Math.cos(a0) * PLAYER_RADIUS * 1.28, Math.sin(a0) * PLAYER_RADIUS * 1.28);
      ctx.lineTo(Math.cos(a1) * PLAYER_RADIUS * 1.28, Math.sin(a1) * PLAYER_RADIUS * 1.28);
      ctx.lineTo(Math.cos(a1) * PLAYER_RADIUS * 0.82, Math.sin(a1) * PLAYER_RADIUS * 0.82);
      ctx.lineTo(Math.cos(a2) * PLAYER_RADIUS * 0.82, Math.sin(a2) * PLAYER_RADIUS * 0.82);
    }
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#fffbeb';
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS * 0.48, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else if (skinId === 'chrono_hourglass') {
    // Faceted twin-cone amber hourglass crystal aligned along aim axis
    const r = PLAYER_RADIUS * 1.15;
    ctx.beginPath();
    ctx.moveTo(r * 1.1, -r * 0.78);
    ctx.lineTo(r * 1.1, r * 0.78);
    ctx.lineTo(-r * 0.95, -r * 0.78);
    ctx.lineTo(-r * 0.95, r * 0.78);
    ctx.closePath();
    ctx.fillStyle = '#fde68a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else if (skinId === 'lunar_eclipse') {
    // Luminous crescent moon-phase dial + forward star pearl
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS * 1.02, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS * 0.98, -Math.PI * 0.72, Math.PI * 0.72, true);
    ctx.arc(-PLAYER_RADIUS * 0.36, 0, PLAYER_RADIUS * 0.78, Math.PI * 0.65, -Math.PI * 0.65, false);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(PLAYER_RADIUS * 0.42, 0, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = '#bae6fd';
    ctx.fill();
  } else if (skinId === 'emerald_hairspring') {
    // Concentric emerald balance-spring spiral + bright jade core
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS * 0.94, 0, Math.PI * 2);
    ctx.fillStyle = '#064e3b';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#34d399';
    ctx.stroke();

    ctx.save();
    ctx.rotate(-pulseTime * 5);
    ctx.beginPath();
    for (let s = 0; s <= 24; s++) {
      const t = s / 24;
      const ang = t * Math.PI * 3.6;
      const rad = t * PLAYER_RADIUS * 0.92;
      if (s === 0) ctx.moveTo(0, 0);
      else ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    ctx.strokeStyle = '#a7f3d0';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else if (skinId === 'crimson_pendulum') {
    // Ruby diamond-lance blade with golden collar
    const r = PLAYER_RADIUS;
    ctx.beginPath();
    ctx.moveTo(r * 1.55, 0);
    ctx.lineTo(0, r * 0.92);
    ctx.lineTo(-r * 1.05, 0);
    ctx.lineTo(0, -r * 0.92);
    ctx.closePath();
    ctx.fillStyle = '#f43f5e';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fde047';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(r * 0.9, 0);
    ctx.lineTo(0, r * 0.42);
    ctx.lineTo(-r * 0.45, 0);
    ctx.lineTo(0, -r * 0.42);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else if (skinId === 'royal_tourbillon') {
    // Dual counter-rotating gold & violet tourbillon cage rings + 8-point royal star
    ctx.save();
    ctx.rotate(pulseTime * 4.2);
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS * 1.16, 0, Math.PI * 2);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.save();
    ctx.rotate(-pulseTime * 5.4);
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(
      -PLAYER_RADIUS * 0.74,
      -PLAYER_RADIUS * 0.74,
      PLAYER_RADIUS * 1.48,
      PLAYER_RADIUS * 1.48
    );
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else {
    // classic_spark: Inner bright circular core + 4-pointed horological star flare
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS * 0.86, 0, Math.PI * 2);
    ctx.fillStyle = '#fffbeb';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = isHotCombo ? '#fbbf24' : '#38bdf8';
    ctx.stroke();

    const flareLen = PLAYER_RADIUS * 1.48;
    const flareWaist = PLAYER_RADIUS * 0.34;
    ctx.beginPath();
    ctx.moveTo(flareLen * 1.15, 0);
    ctx.lineTo(flareWaist, flareWaist);
    ctx.lineTo(0, flareLen * 0.92);
    ctx.lineTo(-flareWaist, flareWaist);
    ctx.lineTo(-flareLen * 0.88, 0);
    ctx.lineTo(-flareWaist, -flareWaist);
    ctx.lineTo(0, -flareLen * 0.92);
    ctx.lineTo(flareWaist, -flareWaist);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // Orbiting micro-ember motes colored per skin
  const moteColor =
    skinId === 'lunar_eclipse'
      ? '#bae6fd'
      : skinId === 'emerald_hairspring'
      ? '#6ee7b7'
      : skinId === 'crimson_pendulum'
      ? '#fda4af'
      : skinId === 'royal_tourbillon'
      ? '#e9d5ff'
      : '#fde047';

  for (let m = 0; m < 2; m++) {
    const ma = pulseTime * 6.5 + m * Math.PI;
    const mx = Math.cos(ma) * (PLAYER_RADIUS + 4.5);
    const my = Math.sin(ma) * (PLAYER_RADIUS + 4.5);
    ctx.beginPath();
    ctx.arc(mx, my, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = moteColor;
    ctx.fill();
  }

  ctx.restore();
}

