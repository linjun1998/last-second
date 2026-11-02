import { ARENA_RADIUS, PLAYER_RADIUS, Vec2 } from './CollisionSystem';

export interface TrailGhost {
  x: number;
  y: number;
  angle: number;
  stretch: number;
  alpha: number;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  isCharging: boolean;
  chargeTime: number; // raw seconds held
  chargeRatio: number; // non-linear eased 0 to 1
  rawChargeProgress: number; // linear 0 to 1
  aimAngle: number;
  isDashing: boolean;
  dashElapsed: number;
  dashDuration: number;
  dashStartX: number;
  dashStartY: number;
  dashTargetX: number;
  dashTargetY: number;
  justLanded: boolean;
  landedImpactPower: number; // 0.3 to 1.0
  trail: TrailGhost[];
}

const MAX_CHARGE_TIME = 1.02; // seconds to reach peak overdrive charge
const MIN_DASH_DIST = 64;
const MAX_DASH_DIST = 325;

/**
 * Non-linear charge curve:
 * Slow, deliberate tension build-up in the first half (0 -> 0.55 takes ~60% time),
 * followed by rapid exponential acceleration in the second half so holding until
 * the "last second" feels explosive and rewarding!
 */
export function computeNonLinearCharge(linearT: number): number {
  const t = Math.max(0, Math.min(1, linearT));
  if (t <= 0.52) {
    // Gentle precision zone for micro-adjustments
    return 0.34 * Math.pow(t / 0.52, 1.35);
  }
  // Rapid overdrive surge in the final half
  const u = (t - 0.52) / 0.48;
  return 0.34 + 0.66 * Math.pow(u, 1.95);
}

/**
 * Smooth deceleration dash curve (quintic ease-out):
 * Instant launch velocity with cushioned kinetic braking at landing.
 */
function easeOutQuint(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - u, 4.2);
}

export class PlayerController {
  public state: PlayerState;
  private activePointerId: number | null = null;
  private pointerStartScreen: Vec2 = { x: 0, y: 0 };
  private lastTrailDist = 0;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): PlayerState {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      isCharging: false,
      chargeTime: 0,
      chargeRatio: 0,
      rawChargeProgress: 0,
      aimAngle: -Math.PI / 2,
      isDashing: false,
      dashElapsed: 0,
      dashDuration: 0.16,
      dashStartX: 0,
      dashStartY: 0,
      dashTargetX: 0,
      dashTargetY: 0,
      justLanded: false,
      landedImpactPower: 0,
      trail: [],
    };
  }

  public reset(): void {
    this.activePointerId = null;
    this.lastTrailDist = 0;
    this.state = this.createInitialState();
  }

  public cancelInput(): void {
    this.activePointerId = null;
    this.state.isCharging = false;
    this.state.chargeTime = 0;
    this.state.chargeRatio = 0;
    this.state.rawChargeProgress = 0;
  }

  public onPointerDown(
    pointerId: number,
    screenX: number,
    screenY: number,
    arenaX: number,
    arenaY: number
  ): boolean {
    if (this.activePointerId !== null || this.state.isDashing) {
      return false;
    }
    this.activePointerId = pointerId;
    this.pointerStartScreen = { x: screenX, y: screenY };
    this.state.isCharging = true;
    this.state.chargeTime = 0;
    this.state.rawChargeProgress = 0.05;
    this.state.chargeRatio = computeNonLinearCharge(0.05);

    const dx = arenaX - this.state.x;
    const dy = arenaY - this.state.y;
    if (Math.hypot(dx, dy) > 12) {
      this.state.aimAngle = Math.atan2(dy, dx);
    }
    return true;
  }

  public onPointerMove(
    pointerId: number,
    screenX: number,
    screenY: number,
    arenaX: number,
    arenaY: number
  ): void {
    if (this.activePointerId !== pointerId || !this.state.isCharging) return;

    const dragDx = screenX - this.pointerStartScreen.x;
    const dragDy = screenY - this.pointerStartScreen.y;
    const dragDist = Math.hypot(dragDx, dragDy);

    if (dragDist >= 10) {
      this.state.aimAngle = Math.atan2(dragDy, dragDx);
    } else {
      const toArenaDx = arenaX - this.state.x;
      const toArenaDy = arenaY - this.state.y;
      if (Math.hypot(toArenaDx, toArenaDy) > 10) {
        this.state.aimAngle = Math.atan2(toArenaDy, toArenaDx);
      }
    }
  }

  /** Returns dash power [0..1] if a dash was executed, or null */
  public onPointerUp(pointerId: number): number | null {
    if (this.activePointerId !== pointerId || !this.state.isCharging) {
      return null;
    }
    this.activePointerId = null;
    this.state.isCharging = false;

    const power = Math.max(0.15, this.state.chargeRatio);
    const landing = this.getPredictedLanding();
    const actualDist = Math.hypot(landing.x - this.state.x, landing.y - this.state.y);

    this.state.isDashing = true;
    this.state.dashElapsed = 0;
    // Fast burst + brief smooth braking tail (0.14s ~ 0.23s depending on distance)
    this.state.dashDuration = 0.13 + (actualDist / MAX_DASH_DIST) * 0.11;
    this.state.dashStartX = this.state.x;
    this.state.dashStartY = this.state.y;
    this.state.dashTargetX = landing.x;
    this.state.dashTargetY = landing.y;
    this.state.landedImpactPower = power;
    this.lastTrailDist = 0;

    this.state.chargeTime = 0;
    this.state.chargeRatio = 0;
    this.state.rawChargeProgress = 0;
    return power;
  }

  public getPlannedDashDistance(): number {
    return MIN_DASH_DIST + this.state.chargeRatio * (MAX_DASH_DIST - MIN_DASH_DIST);
  }

  public getPredictedLanding(): Vec2 {
    const dist = this.getPlannedDashDistance();
    return this.clampSegmentToCircle(
      this.state.x,
      this.state.y,
      this.state.aimAngle,
      dist
    );
  }

  /** Ray-circle intersection so aiming past the arena rim shows exact wall-clamped landing point along the ray! */
  private clampSegmentToCircle(
    ox: number,
    oy: number,
    angle: number,
    dist: number
  ): Vec2 {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const tx = ox + dx * dist;
    const ty = oy + dy * dist;
    const maxR = ARENA_RADIUS - PLAYER_RADIUS - 2;

    if (tx * tx + ty * ty <= maxR * maxR) {
      return { x: tx, y: ty };
    }

    // Solve |O + t*D|^2 = maxR^2 for positive t
    const b = 2 * (ox * dx + oy * dy);
    const c = ox * ox + oy * oy - maxR * maxR;
    const disc = Math.max(0, b * b - 4 * c);
    const tHit = Math.max(0, (-b + Math.sqrt(disc)) / 2);
    const clampedT = Math.min(dist, tHit);
    return {
      x: ox + dx * clampedT,
      y: oy + dy * clampedT,
    };
  }

  public update(dt: number): void {
    this.state.justLanded = false;

    if (this.state.isCharging) {
      this.state.chargeTime += dt;
      this.state.rawChargeProgress = Math.min(1, this.state.chargeTime / MAX_CHARGE_TIME);
      this.state.chargeRatio = computeNonLinearCharge(this.state.rawChargeProgress);
    }

    if (this.state.isDashing) {
      const prevX = this.state.x;
      const prevY = this.state.y;

      this.state.dashElapsed += dt;
      const progress = Math.min(1, this.state.dashElapsed / this.state.dashDuration);
      const eased = easeOutQuint(progress);

      this.state.x =
        this.state.dashStartX + (this.state.dashTargetX - this.state.dashStartX) * eased;
      this.state.y =
        this.state.dashStartY + (this.state.dashTargetY - this.state.dashStartY) * eased;

      const stepDist = Math.hypot(this.state.x - prevX, this.state.y - prevY);
      this.state.vx = dt > 0 ? (this.state.x - prevX) / dt : 0;
      this.state.vy = dt > 0 ? (this.state.y - prevY) / dt : 0;

      // Dense elongated velocity afterimages
      this.lastTrailDist += stepDist;
      if (this.lastTrailDist >= 9) {
        this.lastTrailDist = 0;
        const speedNorm = Math.min(1, Math.hypot(this.state.vx, this.state.vy) / 1800);
        this.state.trail.push({
          x: this.state.x,
          y: this.state.y,
          angle: this.state.aimAngle,
          stretch: 1 + speedNorm * 0.95,
          alpha: 0.88,
        });
        if (this.state.trail.length > 22) {
          this.state.trail.shift();
        }
      }

      if (progress >= 1) {
        this.state.isDashing = false;
        this.state.vx = 0;
        this.state.vy = 0;
        this.state.justLanded = true;
      }
    }

    // Smooth longer decay on dash trail ghosts
    for (let i = this.state.trail.length - 1; i >= 0; i--) {
      this.state.trail[i].alpha -= dt * 2.4;
      if (this.state.trail[i].alpha <= 0) {
        this.state.trail.splice(i, 1);
      }
    }
  }
}
