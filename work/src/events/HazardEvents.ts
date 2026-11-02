import { EventModifierId, MODIFIER_CONFIGS } from '../data/difficultyConfig';
import { EVENT_CONFIGS, EventId, EventMeta } from '../data/eventConfig';
import { ARENA_RADIUS, HazardShape, SafeZoneHint, Vec2 } from '../game/CollisionSystem';
import { SeededRNG } from '../utils/random';
import { pick, t as i18nT } from '../i18n';

export type DeceptionAudioCue = 'FAKE_SAFETY' | 'INVERT_GLITCH' | 'SONAR_PING' | 'LOCK_ON';

export interface ClueZone {
  x: number;
  y: number;
  radius: number;
  color: 'AMBER' | 'MAGENTA' | 'CYAN';
  label: string;
  replayReason: string;
}

export interface TimeShardSpec {
  x: number;
  y: number;
  radius: number;
  bonusBasePts: number;
}

export interface ActiveEventFrame {
  hazards: HazardShape[];
  safeHints: SafeZoneHint[];
  clueZones?: ClueZone[];
  compassTarget?: Vec2;
  deceptionAudioCue?: DeceptionAudioCue;
  darknessAlpha: number;
  glitchIntensity: number;
  bannerAlert?: string;
  triggerSilence?: boolean;
  triggerHorrorSound?: boolean;
  warningRemainingSec: number | null;
  isComplete: boolean;
}

export interface HazardEventOptions {
  allowTimeShard?: boolean;
  shardSpawnChance?: number;
  forceRookieNearMissSetpiece?: boolean;
}

export interface HazardEventInstance {
  readonly id: EventId;
  readonly meta: EventMeta;
  readonly modifier: EventModifierId;
  readonly timeShard: TimeShardSpec | null;
  elapsed: number;
  readonly totalDuration: number;
  update(dt: number): ActiveEventFrame;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function rotatePoint(x: number, y: number, rad: number): Vec2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: x * c - y * s, y: x * s + y * c };
}

function rotateHazard(h: HazardShape, rad: number): HazardShape {
  if (Math.abs(rad) < 0.0001) return h;
  if (h.kind === 'bar') {
    const p = rotatePoint(h.cx, h.cy, rad);
    return { ...h, cx: p.x, cy: p.y, angle: h.angle + rad };
  }
  if (h.kind === 'circle') {
    const p = rotatePoint(h.cx, h.cy, rad);
    return { ...h, cx: p.x, cy: p.y };
  }
  return { ...h, safeAngleCenter: h.safeAngleCenter + rad };
}

interface BaseEventGeometryResult {
  instance: Omit<HazardEventInstance, 'timeShard'>;
  primarySafeAnchor: Vec2;
}

/**
 * 100% Strictly Seed-Deterministic Hazard Factory!
 * Zero dependency on live player coordinates when drawing RNG numbers, so two players on the same seed
 * get bit-for-bit identical angles, offsets, modifiers, Time Shards, and timings on every single round!
 */
export function createHazardEvent(
  id: EventId,
  modifier: EventModifierId,
  rng: SeededRNG,
  speedScale: number,
  warningScale: number,
  generosityScale: number,
  options?: HazardEventOptions
): HazardEventInstance {
  const meta = EVENT_CONFIGS[id];
  const overclockFactor = modifier === 'OVERCLOCK' ? 0.85 : 1.0;
  const spinDir = rng.chance(0.5) ? 1 : -1;
  const echoSafeAngle = rng.angle();

  // Always draw deterministic RNG values for Time Shard so RNG stream stays strictly synchronized
  const shardRoll = rng.next();
  const shardSideSign = rng.chance(0.5) ? 1 : -1;
  const shardRadiusRoll = rng.range(118, 156);
  const shardAngleDelta = rng.range(1.12, 1.58);

  const warnDur = Math.max(
    0.78,
    (meta.warningDuration / Math.sqrt(speedScale)) * warningScale * overclockFactor
  );
  const actDur = Math.max(1.35, meta.activeDuration / Math.sqrt(speedScale));

  const { instance: baseInstance, primarySafeAnchor } = createBaseEventGeometry(
    id,
    meta,
    rng,
    warnDur,
    actDur,
    generosityScale,
    Boolean(options?.forceRookieNearMissSetpiece)
  );

  // Place greedy Time Shard near the danger boundary (offset ~75° from primary safe anchor)
  const shardChance = options?.shardSpawnChance ?? 0.45;
  let timeShard: TimeShardSpec | null = null;
  if (options?.allowTimeShard && shardRoll < shardChance) {
    const safeAng = Math.atan2(primarySafeAnchor.y, primarySafeAnchor.x);
    const targetAng = safeAng + shardSideSign * shardAngleDelta;
    const clampedR = Math.min(ARENA_RADIUS - 36, shardRadiusRoll);
    timeShard = {
      x: Math.cos(targetAng) * clampedR,
      y: Math.sin(targetAng) * clampedR,
      radius: 14,
      bonusBasePts: 120,
    };
  }

  if (modifier === 'NONE') {
    return {
      ...baseInstance,
      timeShard,
    };
  }

  // Wrap base event with fair, observable Modifier Mutators!
  const echoExtraDur = modifier === 'DOUBLE_ECHO' ? 1.4 : 0;
  const totalWithMod = baseInstance.totalDuration + echoExtraDur;

  return {
    id,
    meta,
    modifier,
    timeShard,
    elapsed: 0,
    totalDuration: totalWithMod,
    update(dt: number): ActiveEventFrame {
      this.elapsed += dt;
      const baseFrame = baseInstance.update(dt);

      // 1. MIRROR_SPIN: Smooth slow spatial rotation (max ~24 deg over the round, safeHints & clues rotate together!)
      let spinRad = 0;
      if (modifier === 'MIRROR_SPIN') {
        spinRad = spinDir * Math.min(0.42, this.elapsed * 0.14);
      }

      const hazards = baseFrame.hazards.map((h) => rotateHazard(h, spinRad));
      const safeHints = baseFrame.safeHints.map((s) => {
        const rp = rotatePoint(s.x, s.y, spinRad);
        return { ...s, x: rp.x, y: rp.y };
      });
      const clueZones = baseFrame.clueZones
        ? baseFrame.clueZones.map((c) => {
            const rp = rotatePoint(c.x, c.y, spinRad);
            return { ...c, x: rp.x, y: rp.y };
          })
        : [];
      const compassTarget = baseFrame.compassTarget
        ? rotatePoint(baseFrame.compassTarget.x, baseFrame.compassTarget.y, spinRad)
        : undefined;

      // 2. TUNNEL_FOG: Adds atmospheric fog spotlight (while Cyan safeHints & compass remain bright above fog!)
      let darknessAlpha = baseFrame.darknessAlpha;
      let effectiveCompass = compassTarget;
      if (modifier === 'TUNNEL_FOG') {
        darknessAlpha = Math.max(darknessAlpha, 0.58);
        if (!effectiveCompass && safeHints.length > 0) {
          effectiveCompass = { x: safeHints[0].x, y: safeHints[0].y };
        }
      }

      // 3. DOUBLE_ECHO: After primary hazard finishes, a crisp secondary ring-pulse sweeps outward with a wide safe gate!
      let bannerAlert = baseFrame.bannerAlert;
      let warningRemainingSec = baseFrame.warningRemainingSec;
      if (modifier === 'DOUBLE_ECHO' && this.elapsed >= baseInstance.totalDuration - 0.18) {
        const echoT = this.elapsed - (baseInstance.totalDuration - 0.18);
        const echoWarn = 0.72;
        const inEchoWarn = echoT < echoWarn;
        warningRemainingSec = inEchoWarn ? Math.max(0, echoWarn - echoT) : null;
        const echoProg = inEchoWarn ? 0 : clamp01((echoT - echoWarn) / 0.82);
        const rInner = 18 + echoProg * 195;

        if (this.elapsed >= baseInstance.totalDuration) {
          hazards.length = 0;
          safeHints.length = 0;
        }
        hazards.push({
          kind: 'ring_wall',
          innerRadius: rInner,
          outerRadius: rInner + 44,
          safeAngleCenter: echoSafeAngle,
          safeAngleHalfSpan: 0.56,
          lethal: !inEchoWarn,
          warningProgress: clamp01(echoT / echoWarn),
        });
        safeHints.push({
          x: Math.cos(echoSafeAngle) * 185,
          y: Math.sin(echoSafeAngle) * 185,
          radius: 46,
          label: 'SAFE',
        });
        if (inEchoWarn) {
          clueZones.push({
            x: 0,
            y: 0,
            radius: 48,
            color: 'AMBER',
            label: i18nT('hazard.echoLabel'),
            replayReason: i18nT('hazard.echoReason'),
          });
          bannerAlert = i18nT('hazard.echoBanner');
        }
      }

      return {
        ...baseFrame,
        hazards,
        safeHints,
        clueZones: clueZones.length > 0 ? clueZones : undefined,
        compassTarget: effectiveCompass,
        darknessAlpha,
        warningRemainingSec,
        bannerAlert:
          bannerAlert ||
          (this.elapsed < 0.9
            ? i18nT('hazard.modifierBanner', {
                name: pick(MODIFIER_CONFIGS[modifier].name, MODIFIER_CONFIGS[modifier].nameEn),
              })
            : undefined),
        isComplete: this.elapsed >= totalWithMod,
      };
    },
  };
}

function createBaseEventGeometry(
  id: EventId,
  meta: EventMeta,
  rng: SeededRNG,
  warnDur: number,
  actDur: number,
  generosityScale: number,
  forceRookieNearMissSetpiece: boolean
): BaseEventGeometryResult {
  const totalDuration = warnDur + actDur;

  switch (id) {
    case 'closing_wall': {
      const axisAngle = rng.angle();
      const perpAngle = axisAngle + Math.PI / 2;
      const safeSign = rng.chance(0.5) ? 1 : -1;
      const safeOffset = safeSign * 165;
      const safePos = {
        x: Math.cos(axisAngle) * safeOffset,
        y: Math.sin(axisAngle) * safeOffset,
      };
      const halfLen = 135 / Math.sqrt(generosityScale);

      return {
        primarySafeAnchor: safePos,
        instance: {
          id,
          meta,
          modifier: 'NONE',
          elapsed: 0,
          totalDuration,
          update(dt: number): ActiveEventFrame {
            this.elapsed += dt;
            const inWarn = this.elapsed < warnDur;
            const warnProg = clamp01(this.elapsed / warnDur);
            const actProg = inWarn ? 0 : clamp01((this.elapsed - warnDur) / (actDur * 0.55));
            const distFromCenter = 228 - actProg * 158;
            const shiftAlongAxis = safeOffset > 0 ? -58 : 58;

            const makeWall = (side: number): HazardShape => ({
              kind: 'bar',
              cx:
                Math.cos(perpAngle) * side * distFromCenter +
                Math.cos(axisAngle) * shiftAlongAxis,
              cy:
                Math.sin(perpAngle) * side * distFromCenter +
                Math.sin(axisAngle) * shiftAlongAxis,
              angle: axisAngle,
              halfLength: halfLen,
              halfThickness: 64,
              lethal: !inWarn,
              warningProgress: warnProg,
            });

            return {
              hazards: [makeWall(1), makeWall(-1)],
              safeHints: [{ x: safePos.x, y: safePos.y, radius: 46 * generosityScale, label: 'SAFE' }],
              darknessAlpha: 0,
              glitchIntensity: 0,
              warningRemainingSec: inWarn ? Math.max(0, warnDur - this.elapsed) : null,
              isComplete: this.elapsed >= totalDuration,
            };
          },
        },
      };
    }

    case 'moving_obstacle': {
      const moveAngle = rng.angle();
      const barAngle = moveAngle + Math.PI / 2;
      const gapOffset = forceRookieNearMissSetpiece ? rng.range(-55, 55) : rng.range(-104, 104);
      // When rookie first-30s thrill set-piece is active, calibrate gap to 33px half-width (~66px total vs 24px orb):
      // super easy to land inside Cyan SAFE, while guaranteeing a thrilling <=22px (<5.5mm) shoulder-graze Near-Miss as the gate sweeps past!
      const gapHalfWidth = forceRookieNearMissSetpiece
        ? 33
        : Math.max(38, 52 * generosityScale);
      const effectiveWarn = forceRookieNearMissSetpiece ? Math.max(warnDur, 1.65) : warnDur;
      const effectiveTotal = effectiveWarn + actDur;

      const safePos = {
        x: Math.cos(barAngle) * gapOffset,
        y: Math.sin(barAngle) * gapOffset,
      };
      const entryMarkerPos = {
        x: Math.cos(moveAngle) * -175 + safePos.x * 0.35,
        y: Math.sin(moveAngle) * -175 + safePos.y * 0.35,
      };

      return {
        primarySafeAnchor: safePos,
        instance: {
          id,
          meta,
          modifier: 'NONE',
          elapsed: 0,
          totalDuration: effectiveTotal,
          update(dt: number): ActiveEventFrame {
            this.elapsed += dt;
            const inWarn = this.elapsed < effectiveWarn;
            const warnProg = clamp01(this.elapsed / effectiveWarn);
            const sweepProg = inWarn ? 0 : clamp01((this.elapsed - effectiveWarn) / (actDur * 0.85));
            // Keep gate visibly inside arena rim (-210) during warning so sweep direction is 100% obvious!
            const sweepDist = inWarn ? -210 : -210 + sweepProg * 465;

            const baseCx = Math.cos(moveAngle) * sweepDist;
            const baseCy = Math.sin(moveAngle) * sweepDist;

            const leftLen = (280 + (gapOffset - gapHalfWidth)) / 2;
            const leftCenter = -280 + leftLen;
            const rightLen = (280 - (gapOffset + gapHalfWidth)) / 2;
            const rightCenter = gapOffset + gapHalfWidth + rightLen;

            const hazards: HazardShape[] = [];
            if (leftLen > 8) {
              hazards.push({
                kind: 'bar',
                cx: baseCx + Math.cos(barAngle) * leftCenter,
                cy: baseCy + Math.sin(barAngle) * leftCenter,
                angle: barAngle,
                halfLength: leftLen,
                halfThickness: 20,
                lethal: !inWarn,
                warningProgress: warnProg,
              });
            }
            if (rightLen > 8) {
              hazards.push({
                kind: 'bar',
                cx: baseCx + Math.cos(barAngle) * rightCenter,
                cy: baseCy + Math.sin(barAngle) * rightCenter,
                angle: barAngle,
                halfLength: rightLen,
                halfThickness: 20,
                lethal: !inWarn,
                warningProgress: warnProg,
              });
            }

            return {
              hazards,
              safeHints: [
                {
                  x: safePos.x,
                  y: safePos.y,
                  radius: Math.max(26, gapHalfWidth * 0.82),
                  label: 'SAFE',
                },
              ],
              clueZones: inWarn
                ? [
                    {
                      x: entryMarkerPos.x,
                      y: entryMarkerPos.y,
                      radius: 26,
                      color: 'AMBER',
                      label: i18nT('hazard.gateLabel'),
                      replayReason: i18nT('hazard.gateReason'),
                    },
                  ]
                : undefined,
              darknessAlpha: 0,
              glitchIntensity: 0,
              warningRemainingSec: inWarn ? Math.max(0, effectiveWarn - this.elapsed) : null,
              isComplete: this.elapsed >= effectiveTotal,
            };
          },
        },
      };
    }

    case 'rotating_blade': {
      const baseSeedAngle = rng.angle();
      const dir = rng.chance(0.5) ? 1 : -1;
      const totalRot = Math.PI * 1.12 * dir;
      // Full-reach 232px blade so players cannot cheese AFK along the outer rim!
      const bladeLen = 232;
      // Safe blind-spot sector right behind the blade's starting angle (blade sweeps away from this sector!)
      const safeBehindAngle = baseSeedAngle - dir * 0.52;
      const safePos = {
        x: Math.cos(safeBehindAngle) * 156,
        y: Math.sin(safeBehindAngle) * 156,
      };

      return {
        primarySafeAnchor: safePos,
        instance: {
          id,
          meta,
          modifier: 'NONE',
          elapsed: 0,
          totalDuration,
          update(dt: number): ActiveEventFrame {
            this.elapsed += dt;
            const inWarn = this.elapsed < warnDur;
            const warnProg = clamp01(this.elapsed / warnDur);
            const actProg = inWarn ? 0 : clamp01((this.elapsed - warnDur) / actDur);
            const currentAngle = baseSeedAngle + totalRot * actProg;

            return {
              hazards: [
                {
                  kind: 'bar',
                  cx: 0,
                  cy: 0,
                  angle: currentAngle,
                  halfLength: bladeLen,
                  halfThickness: 15,
                  lethal: !inWarn,
                  warningProgress: warnProg,
                },
                {
                  kind: 'circle',
                  cx: 0,
                  cy: 0,
                  radius: 34,
                  invertSafeInside: false,
                  lethal: !inWarn,
                  warningProgress: warnProg,
                },
              ],
              safeHints: [{ x: safePos.x, y: safePos.y, radius: 44 * Math.min(1.15, generosityScale), label: 'SAFE' }],
              darknessAlpha: 0,
              glitchIntensity: 0,
              warningRemainingSec: inWarn ? Math.max(0, warnDur - this.elapsed) : null,
              isComplete: this.elapsed >= totalDuration,
            };
          },
        },
      };
    }

    case 'shrinking_zone': {
      const targetAngle = rng.angle();
      const targetDist = rng.range(95, 150);
      const target = {
        x: Math.cos(targetAngle) * targetDist,
        y: Math.sin(targetAngle) * targetDist,
      };
      const targetRadius = Math.max(54, 66 * generosityScale);

      return {
        primarySafeAnchor: target,
        instance: {
          id,
          meta,
          modifier: 'NONE',
          elapsed: 0,
          totalDuration,
          update(dt: number): ActiveEventFrame {
            this.elapsed += dt;
            const inWarn = this.elapsed < warnDur;
            const warnProg = clamp01(this.elapsed / warnDur);
            const actProg = inWarn ? 0 : clamp01((this.elapsed - warnDur) / (actDur * 0.68));
            const currentSafeRadius =
              ARENA_RADIUS * 1.45 - (ARENA_RADIUS * 1.45 - targetRadius) * actProg;

            return {
              hazards: [
                {
                  kind: 'circle',
                  cx: target.x,
                  cy: target.y,
                  radius: currentSafeRadius,
                  invertSafeInside: true,
                  lethal: !inWarn,
                  warningProgress: warnProg,
                },
              ],
              safeHints: [{ x: target.x, y: target.y, radius: targetRadius - 6, label: 'SAFE' }],
              darknessAlpha: 0,
              glitchIntensity: 0,
              warningRemainingSec: inWarn ? Math.max(0, warnDur - this.elapsed) : null,
              isComplete: this.elapsed >= totalDuration,
            };
          },
        },
      };
    }

    case 'narrow_corridor': {
      const laneAngle = rng.angle();
      const perpAngle = laneAngle + Math.PI / 2;
      const laneOffset = rng.range(-72, 72);
      const targetPos = {
        x: Math.cos(perpAngle) * laneOffset + Math.cos(laneAngle) * 85,
        y: Math.sin(perpAngle) * laneOffset + Math.sin(laneAngle) * 85,
      };
      const minGapHalf = Math.max(30, 35 * generosityScale);

      return {
        primarySafeAnchor: targetPos,
        instance: {
          id,
          meta,
          modifier: 'NONE',
          elapsed: 0,
          totalDuration,
          update(dt: number): ActiveEventFrame {
            this.elapsed += dt;
            const inWarn = this.elapsed < warnDur;
            const warnProg = clamp01(this.elapsed / warnDur);
            const actProg = inWarn ? 0 : clamp01((this.elapsed - warnDur) / (actDur * 0.52));
            const gapHalf = 96 - actProg * (96 - minGapHalf);
            const wallHalfThick = 150;

            const makeSide = (dir: number): HazardShape => {
              const centerOffset = laneOffset + dir * (gapHalf + wallHalfThick);
              return {
                kind: 'bar',
                cx: Math.cos(perpAngle) * centerOffset,
                cy: Math.sin(perpAngle) * centerOffset,
                angle: laneAngle,
                halfLength: 280,
                halfThickness: wallHalfThick,
                lethal: !inWarn,
                warningProgress: warnProg,
              };
            };

            return {
              hazards: [makeSide(1), makeSide(-1)],
              safeHints: [{ x: targetPos.x, y: targetPos.y, radius: minGapHalf * 0.85, label: 'SAFE' }],
              darknessAlpha: 0,
              glitchIntensity: 0,
              warningRemainingSec: inWarn ? Math.max(0, warnDur - this.elapsed) : null,
              isComplete: this.elapsed >= totalDuration,
            };
          },
        },
      };
    }

    case 'sudden_drop': {
      const dropAngle = rng.angle();
      const dropDist = rng.range(0, 52);
      const lockPos = {
        x: Math.cos(dropAngle) * dropDist,
        y: Math.sin(dropAngle) * dropDist,
      };
      const crossAngle = rng.angle();
      const escapeAngle = crossAngle + (rng.chance(0.5) ? 0.78 : -0.78);
      const finalEscape = {
        x: Math.cos(escapeAngle) * 168,
        y: Math.sin(escapeAngle) * 168,
      };

      let playedLockCue = false;
      let playedTwist = false;

      return {
        primarySafeAnchor: finalEscape,
        instance: {
          id,
          meta,
          modifier: 'NONE',
          elapsed: 0,
          totalDuration,
          update(dt: number): ActiveEventFrame {
            this.elapsed += dt;
            const inWarn = this.elapsed < warnDur;
            const warnProg = clamp01(this.elapsed / warnDur);

            let deceptionAudioCue: DeceptionAudioCue | undefined;
            if (!playedLockCue) {
              playedLockCue = true;
              deceptionAudioCue = 'LOCK_ON';
            }

            let triggerHorrorSound = false;
            if (!inWarn && !playedTwist) {
              playedTwist = true;
              triggerHorrorSound = true;
            }

            // Kinetic impact shock expansion upon slamming down
            const slamShock = inWarn
              ? 0
              : Math.sin(clamp01((this.elapsed - warnDur) / 0.28) * Math.PI) * 14;

            return {
              hazards: [
                {
                  kind: 'circle',
                  cx: lockPos.x,
                  cy: lockPos.y,
                  radius: 82 + slamShock,
                  invertSafeInside: false,
                  lethal: !inWarn,
                  warningProgress: warnProg,
                },
                {
                  kind: 'bar',
                  cx: lockPos.x,
                  cy: lockPos.y,
                  angle: crossAngle,
                  halfLength: 260,
                  halfThickness: 22,
                  lethal: !inWarn,
                  warningProgress: warnProg,
                },
                {
                  kind: 'bar',
                  cx: lockPos.x,
                  cy: lockPos.y,
                  angle: crossAngle + Math.PI / 2,
                  halfLength: 260,
                  halfThickness: 18,
                  lethal: !inWarn,
                  warningProgress: warnProg,
                },
              ],
              safeHints: [{ x: finalEscape.x, y: finalEscape.y, radius: 44, label: 'SAFE' }],
              clueZones: [
                {
                  x: lockPos.x,
                  y: lockPos.y,
                  radius: inWarn ? 118 - warnProg * 36 : 86,
                  color: 'AMBER',
                  label: inWarn ? i18nT('hazard.hammerLabelWarn') : i18nT('hazard.hammerLabelHit'),
                  replayReason: i18nT('hazard.hammerReason'),
                },
              ],
              deceptionAudioCue,
              bannerAlert: inWarn ? i18nT('hazard.hammerBanner') : undefined,
              darknessAlpha: 0,
              glitchIntensity: !inWarn && this.elapsed < warnDur + 0.25 ? 0.6 : 0,
              triggerHorrorSound,
              warningRemainingSec: inWarn ? Math.max(0, warnDur - this.elapsed) : null,
              isComplete: this.elapsed >= totalDuration,
            };
          },
        },
      };
    }

    case 'direction_invert': {
      const fakeAng = rng.angle();
      const fakeTarget = {
        x: Math.cos(fakeAng) * 145,
        y: Math.sin(fakeAng) * 145,
      };
      const realAng = fakeAng + (rng.chance(0.5) ? 2.25 : -2.25);
      const realTarget = {
        x: Math.cos(realAng) * 150,
        y: Math.sin(realAng) * 150,
      };
      // Twist happens at 30% of warning so the player keeps 70% of the warning to react,
      // AND pre-twist clues (Magenta decoy ring + same-size Cyan real beacon + radio static) reveal the truth from t=0.
      const twistTime = warnDur * 0.3;
      let playedGlitchCue = false;
      let twisted = false;

      return {
        primarySafeAnchor: realTarget,
        instance: {
          id,
          meta,
          modifier: 'NONE',
          elapsed: 0,
          totalDuration,
          update(dt: number): ActiveEventFrame {
            this.elapsed += dt;
            const hasTwisted = this.elapsed >= twistTime;

            let deceptionAudioCue: DeceptionAudioCue | undefined;
            if (!playedGlitchCue) {
              playedGlitchCue = true;
              deceptionAudioCue = 'INVERT_GLITCH';
            }

            let triggerHorrorSound = false;
            if (hasTwisted && !twisted) {
              twisted = true;
              triggerHorrorSound = true;
            }

            const activeTarget = hasTwisted ? realTarget : fakeTarget;
            const inWarn = this.elapsed < warnDur;
            const warnProg = clamp01(this.elapsed / warnDur);
            const actProg = inWarn ? 0 : clamp01((this.elapsed - warnDur) / (actDur * 0.68));
            const safeRadius = ARENA_RADIUS * 1.4 - (ARENA_RADIUS * 1.4 - 68) * actProg;

            const clueZones: ClueZone[] = !hasTwisted
              ? [
                  {
                    x: fakeTarget.x,
                    y: fakeTarget.y,
                    radius: 54,
                    color: 'MAGENTA',
                    label: i18nT('hazard.fakeLabel'),
                    replayReason: i18nT('hazard.fakeReason'),
                  },
                  {
                    x: realTarget.x,
                    y: realTarget.y,
                    radius: 54,
                    color: 'CYAN',
                    label: i18nT('hazard.realLabel'),
                    replayReason: i18nT('hazard.realReason'),
                  },
                ]
              : [
                  {
                    x: fakeTarget.x,
                    y: fakeTarget.y,
                    radius: 46,
                    color: 'MAGENTA',
                    label: i18nT('hazard.decoyLabel'),
                    replayReason: i18nT('hazard.decoyReason'),
                  },
                ];

            return {
              hazards: [
                {
                  kind: 'circle',
                  cx: activeTarget.x,
                  cy: activeTarget.y,
                  radius: safeRadius,
                  invertSafeInside: true,
                  lethal: !inWarn,
                  warningProgress: warnProg,
                },
              ],
              // Fairness rule: the trusted cyan SAFE ring ALWAYS marks the real target,
              // from t=0. The magenta decoy is only ever a labelled clue, never a SAFE hint —
              // if the player follows the SAFE ring, they succeed.
              safeHints: [
                {
                  x: realTarget.x,
                  y: realTarget.y,
                  radius: 58,
                  label: 'SAFE',
                },
              ],
              clueZones,
              deceptionAudioCue,
              darknessAlpha: 0,
              glitchIntensity:
                this.elapsed >= twistTime - 0.1 && this.elapsed <= twistTime + 0.28 ? 0.85 : 0,
              bannerAlert: hasTwisted
                ? i18nT('hazard.invertBannerTwisted')
                : i18nT('hazard.invertBanner'),
              triggerHorrorSound,
              warningRemainingSec: inWarn ? Math.max(0, warnDur - this.elapsed) : null,
              isComplete: this.elapsed >= totalDuration,
            };
          },
        },
      };
    }

    case 'fake_safety': {
      const splitAngle = rng.angle();
      const perp = splitAngle + Math.PI / 2;
      const phase1SafePos = {
        x: Math.cos(perp) * 128,
        y: Math.sin(perp) * 128,
      };
      const phase2SafePos = {
        x: -Math.cos(perp) * 128,
        y: -Math.sin(perp) * 128,
      };

      const p1Warn = warnDur * 0.88;
      const p1Active = 0.92;
      const fakeCalm = 0.48;
      const p2Warn = 1.12;
      const p2Active = 1.02;
      const fsTotal = p1Warn + p1Active + fakeCalm + p2Warn + p2Active;

      let playedOverloadCue = false;
      let horrorPlayed = false;

      return {
        primarySafeAnchor: phase1SafePos,
        instance: {
          id,
          meta,
          modifier: 'NONE',
          elapsed: 0,
          totalDuration: fsTotal,
          update(dt: number): ActiveEventFrame {
            this.elapsed += dt;
            const t = this.elapsed;

            if (t < p1Warn + p1Active) {
              const inWarn = t < p1Warn;
              const isPreOverload = !inWarn && t >= p1Warn + p1Active * 0.42;
              let deceptionAudioCue: DeceptionAudioCue | undefined;
              if (isPreOverload && !playedOverloadCue) {
                playedOverloadCue = true;
                deceptionAudioCue = 'FAKE_SAFETY';
              }

              return {
                hazards: [
                  {
                    kind: 'bar',
                    cx: -Math.cos(perp) * 130,
                    cy: -Math.sin(perp) * 130,
                    angle: splitAngle,
                    halfLength: 280,
                    halfThickness: 135,
                    lethal: !inWarn,
                    warningProgress: clamp01(t / p1Warn),
                  },
                ],
                safeHints: [{ x: phase1SafePos.x, y: phase1SafePos.y, radius: 50, label: 'SAFE' }],
                clueZones: isPreOverload
                  ? [
                      {
                        x: phase1SafePos.x,
                        y: phase1SafePos.y,
                        radius: 62,
                        color: 'AMBER',
                        label: i18nT('hazard.overloadLabel'),
                        replayReason: i18nT('hazard.overloadReason'),
                      },
                    ]
                  : undefined,
                deceptionAudioCue,
                bannerAlert: isPreOverload ? i18nT('hazard.overloadBanner') : undefined,
                darknessAlpha: 0,
                glitchIntensity: 0,
                warningRemainingSec: inWarn ? Math.max(0, p1Warn - t) : null,
                isComplete: false,
              };
            }

            const tAfterP1 = t - (p1Warn + p1Active);
            if (tAfterP1 < fakeCalm) {
              return {
                hazards: [],
                // Immediately light up Phase 2 Cyan SAFE during calm window so player gets >1.5s reaction window!
                safeHints: [{ x: phase2SafePos.x, y: phase2SafePos.y, radius: 52, label: 'SAFE' }],
                clueZones: [
                  {
                    x: phase1SafePos.x,
                    y: phase1SafePos.y,
                    radius: 66,
                    color: 'MAGENTA',
                    label: i18nT('hazard.betrayLabel'),
                    replayReason: i18nT('hazard.betrayReason'),
                  },
                ],
                darknessAlpha: 0.22,
                glitchIntensity: tAfterP1 > fakeCalm * 0.45 ? 0.48 : 0,
                bannerAlert: i18nT('hazard.betrayBanner'),
                warningRemainingSec: p2Warn + (fakeCalm - tAfterP1),
                isComplete: false,
              };
            }

            const tP2 = tAfterP1 - fakeCalm;
            const inP2Warn = tP2 < p2Warn;
            let triggerHorrorSound = false;
            if (!horrorPlayed) {
              horrorPlayed = true;
              triggerHorrorSound = true;
            }

            return {
              hazards: [
                {
                  kind: 'bar',
                  cx: Math.cos(perp) * 130,
                  cy: Math.sin(perp) * 130,
                  angle: splitAngle,
                  halfLength: 280,
                  halfThickness: 135,
                  lethal: !inP2Warn,
                  warningProgress: clamp01(tP2 / p2Warn),
                },
              ],
              safeHints: [{ x: phase2SafePos.x, y: phase2SafePos.y, radius: 54, label: 'SAFE' }],
              clueZones: [
                {
                  x: phase1SafePos.x,
                  y: phase1SafePos.y,
                  radius: 64,
                  color: 'MAGENTA',
                  label: i18nT('hazard.turnedLabel'),
                  replayReason: i18nT('hazard.turnedReason'),
                },
              ],
              darknessAlpha: 0.12,
              glitchIntensity: inP2Warn ? 0.52 : 0.16,
              bannerAlert: i18nT('hazard.turnedBanner'),
              triggerHorrorSound,
              warningRemainingSec: inP2Warn ? Math.max(0, p2Warn - tP2) : null,
              isComplete: t >= fsTotal,
            };
          },
        },
      };
    }

    case 'darkness_ambush': {
      const safeAngle = rng.angle();
      const safePos = {
        x: Math.cos(safeAngle) * 158,
        y: Math.sin(safeAngle) * 158,
      };
      let silenced = false;

      return {
        primarySafeAnchor: safePos,
        instance: {
          id,
          meta,
          modifier: 'NONE',
          elapsed: 0,
          totalDuration,
          update(dt: number): ActiveEventFrame {
            this.elapsed += dt;
            let triggerSilence = false;
            let deceptionAudioCue: DeceptionAudioCue | undefined;
            if (!silenced) {
              silenced = true;
              triggerSilence = true;
              deceptionAudioCue = 'SONAR_PING';
            }
            const inWarn = this.elapsed < warnDur;
            const warnProg = clamp01(this.elapsed / warnDur);
            const actProg = inWarn ? 0 : clamp01((this.elapsed - warnDur) / (actDur * 0.7));
            const ringInner = 250 - actProg * 195;

            return {
              hazards: [
                {
                  kind: 'ring_wall',
                  innerRadius: Math.max(25, ringInner),
                  outerRadius: Math.max(85, ringInner + 75),
                  safeAngleCenter: safeAngle,
                  safeAngleHalfSpan: Math.max(0.4, 0.47 * generosityScale),
                  lethal: !inWarn,
                  warningProgress: warnProg,
                },
              ],
              safeHints: [{ x: safePos.x, y: safePos.y, radius: 48, label: 'SAFE' }],
              compassTarget: safePos,
              clueZones: [
                {
                  x: safePos.x,
                  y: safePos.y,
                  radius: 56,
                  color: 'CYAN',
                  label: i18nT('hazard.sonarLabel'),
                  replayReason: i18nT('hazard.sonarReason'),
                },
              ],
              deceptionAudioCue,
              darknessAlpha: inWarn ? 0.64 : 0.46,
              glitchIntensity: this.elapsed < 0.22 ? 0.65 : 0,
              bannerAlert: inWarn ? i18nT('hazard.darkBannerWarn') : i18nT('hazard.darkBanner'),
              triggerSilence,
              warningRemainingSec: inWarn ? Math.max(0, warnDur - this.elapsed) : null,
              isComplete: this.elapsed >= totalDuration,
            };
          },
        },
      };
    }

    case 'chain_sweep': {
      // Upgraded Two-Wave Alternating Laser Matrix:
      // Wave 1 locks orthogonal cross (0° & 90°); Wave 2 rotates +45° to lock the diagonals, forcing two rhythmic dodges!
      const baseAngle = rng.angle();
      const quadIdx = rng.int(0, 3);
      const safeAngle1 = baseAngle + Math.PI * 0.25 + quadIdx * (Math.PI * 0.5);
      const rotStep = rng.chance(0.5) ? Math.PI * 0.25 : -Math.PI * 0.25;
      const safeAngle2 = safeAngle1 + rotStep;
      const safeDist = 148;

      const safePos1 = {
        x: Math.cos(safeAngle1) * safeDist,
        y: Math.sin(safeAngle1) * safeDist,
      };
      const safePos2 = {
        x: Math.cos(safeAngle2) * safeDist,
        y: Math.sin(safeAngle2) * safeDist,
      };

      const w1Warn = warnDur * 0.85;
      const w1Act = 0.88;
      const w2Warn = 0.92;
      const w2Act = 0.92;
      const csTotal = w1Warn + w1Act + w2Warn + w2Act;

      return {
        primarySafeAnchor: safePos1,
        instance: {
          id,
          meta,
          modifier: 'NONE',
          elapsed: 0,
          totalDuration: csTotal,
          update(dt: number): ActiveEventFrame {
            this.elapsed += dt;
            const t = this.elapsed;

            if (t < w1Warn + w1Act) {
              const inW1Warn = t < w1Warn;
              const showNextPreview = t >= w1Warn + w1Act * 0.35;
              return {
                hazards: [
                  {
                    kind: 'bar',
                    cx: 0,
                    cy: 0,
                    angle: baseAngle,
                    halfLength: 270,
                    halfThickness: 22,
                    lethal: !inW1Warn,
                    warningProgress: clamp01(t / w1Warn),
                  },
                  {
                    kind: 'bar',
                    cx: 0,
                    cy: 0,
                    angle: baseAngle + Math.PI / 2,
                    halfLength: 270,
                    halfThickness: 22,
                    lethal: !inW1Warn,
                    warningProgress: clamp01(t / w1Warn),
                  },
                  {
                    kind: 'circle',
                    cx: -safePos1.x,
                    cy: -safePos1.y,
                    radius: 62,
                    invertSafeInside: false,
                    lethal: !inW1Warn,
                    warningProgress: clamp01(t / w1Warn),
                  },
                ],
                safeHints: [
                  { x: safePos1.x, y: safePos1.y, radius: 44, label: 'SAFE 1/2' },
                ],
                clueZones: showNextPreview
                  ? [
                      {
                        x: safePos2.x,
                        y: safePos2.y,
                        radius: 38,
                        color: 'CYAN',
                        label: i18nT('hazard.nextCellLabel'),
                        replayReason: i18nT('hazard.nextCellReason'),
                      },
                    ]
                  : undefined,
                bannerAlert: showNextPreview ? i18nT('hazard.chainBanner') : undefined,
                darknessAlpha: 0,
                glitchIntensity: 0,
                warningRemainingSec: inW1Warn ? Math.max(0, w1Warn - t) : null,
                isComplete: false,
              };
            }

            const t2 = t - (w1Warn + w1Act);
            const inW2Warn = t2 < w2Warn;
            const angle2 = baseAngle + Math.PI * 0.25;
            return {
              hazards: [
                {
                  kind: 'bar',
                  cx: 0,
                  cy: 0,
                  angle: angle2,
                  halfLength: 270,
                  halfThickness: 22,
                  lethal: !inW2Warn,
                  warningProgress: clamp01(t2 / w2Warn),
                },
                {
                  kind: 'bar',
                  cx: 0,
                  cy: 0,
                  angle: angle2 + Math.PI / 2,
                  halfLength: 270,
                  halfThickness: 22,
                  lethal: !inW2Warn,
                  warningProgress: clamp01(t2 / w2Warn),
                },
                {
                  kind: 'circle',
                  cx: -safePos2.x,
                  cy: -safePos2.y,
                  radius: 62,
                  invertSafeInside: false,
                  lethal: !inW2Warn,
                  warningProgress: clamp01(t2 / w2Warn),
                },
              ],
              safeHints: [{ x: safePos2.x, y: safePos2.y, radius: 44, label: 'SAFE 2/2' }],
              clueZones: [
                {
                  x: safePos1.x,
                  y: safePos1.y,
                  radius: 40,
                  color: 'AMBER',
                  label: i18nT('hazard.wave2Label'),
                  replayReason: i18nT('hazard.wave2Reason'),
                },
              ],
              bannerAlert: inW2Warn ? i18nT('hazard.wave2Banner') : undefined,
              darknessAlpha: 0,
              glitchIntensity: 0,
              warningRemainingSec: inW2Warn ? Math.max(0, w2Warn - t2) : null,
              isComplete: t >= csTotal,
            };
          },
        },
      };
    }

    case 'razor_gate': {
      const safeAngle = rng.angle();
      const safePos = {
        x: Math.cos(safeAngle) * 195,
        y: Math.sin(safeAngle) * 195,
      };

      return {
        primarySafeAnchor: safePos,
        instance: {
          id,
          meta,
          modifier: 'NONE',
          elapsed: 0,
          totalDuration,
          update(dt: number): ActiveEventFrame {
            this.elapsed += dt;
            const inWarn = this.elapsed < warnDur;
            const warnProg = clamp01(this.elapsed / warnDur);
            const actProg = inWarn ? 0 : clamp01((this.elapsed - warnDur) / actDur);

            const innerR = 15 + actProg * 210;
            const outerR = innerR + 52;
            const gapSpan = (0.48 - actProg * 0.14) * generosityScale;

            return {
              hazards: [
                {
                  kind: 'ring_wall',
                  innerRadius: innerR,
                  outerRadius: outerR,
                  safeAngleCenter: safeAngle,
                  safeAngleHalfSpan: Math.max(0.28, gapSpan),
                  lethal: !inWarn,
                  warningProgress: warnProg,
                },
              ],
              safeHints: [{ x: safePos.x, y: safePos.y, radius: 40, label: 'SAFE' }],
              darknessAlpha: 0,
              glitchIntensity: 0,
              warningRemainingSec: inWarn ? Math.max(0, warnDur - this.elapsed) : null,
              isComplete: this.elapsed >= totalDuration,
            };
          },
        },
      };
    }

    case 'frenzy_gauntlet':
    default: {
      const targetAngle = rng.angle();
      const target = {
        x: Math.cos(targetAngle) * 155,
        y: Math.sin(targetAngle) * 155,
      };
      const bladeStart = targetAngle + Math.PI * 0.48;
      const rotDir = rng.chance(0.5) ? 1 : -1;

      return {
        primarySafeAnchor: target,
        instance: {
          id,
          meta,
          modifier: 'NONE',
          elapsed: 0,
          totalDuration,
          update(dt: number): ActiveEventFrame {
            this.elapsed += dt;
            const inWarn = this.elapsed < warnDur;
            const warnProg = clamp01(this.elapsed / warnDur);
            const actProg = inWarn ? 0 : clamp01((this.elapsed - warnDur) / actDur);

            const safeRadius =
              ARENA_RADIUS * 1.4 -
              (ARENA_RADIUS * 1.4 - 78 * generosityScale) * Math.min(1, actProg * 1.32);
            const bladeAngle = bladeStart + rotDir * actProg * Math.PI * 0.85;

            return {
              hazards: [
                {
                  kind: 'circle',
                  cx: target.x,
                  cy: target.y,
                  radius: safeRadius,
                  invertSafeInside: true,
                  lethal: !inWarn,
                  warningProgress: warnProg,
                },
                {
                  kind: 'bar',
                  cx: 0,
                  cy: 0,
                  angle: bladeAngle,
                  halfLength: 118,
                  halfThickness: 14,
                  lethal: !inWarn,
                  warningProgress: warnProg,
                },
              ],
              safeHints: [{ x: target.x, y: target.y, radius: 54, label: 'SAFE' }],
              darknessAlpha: 0,
              glitchIntensity: 0,
              warningRemainingSec: inWarn ? Math.max(0, warnDur - this.elapsed) : null,
              isComplete: this.elapsed >= totalDuration,
            };
          },
        },
      };
    }
  }
}
