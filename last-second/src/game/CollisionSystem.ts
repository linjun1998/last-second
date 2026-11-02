// Arena uses normalized coordinates centered at (0, 0) with ARENA_RADIUS = 1.0 (e.g. 260 logical units)
export const ARENA_RADIUS = 250;
export const PLAYER_RADIUS = 12;

export interface Vec2 {
  x: number;
  y: number;
}

export interface OrientedBarHazard {
  kind: 'bar';
  cx: number;
  cy: number;
  angle: number; // orientation of bar's length axis (radians)
  halfLength: number;
  halfThickness: number;
  lethal: boolean; // false = warning telegraph, true = active deadly hazard
  warningProgress: number; // 0 to 1
  alpha?: number;
}

export interface CircleHazard {
  kind: 'circle';
  cx: number;
  cy: number;
  radius: number;
  invertSafeInside: boolean; // if true, OUTSIDE this circle is lethal!
  lethal: boolean;
  warningProgress: number;
}

export interface AnnulusSectorHazard {
  kind: 'ring_wall';
  innerRadius: number;
  outerRadius: number;
  safeAngleCenter: number;
  safeAngleHalfSpan: number; // radians of safe gap
  lethal: boolean;
  warningProgress: number;
}

export type HazardShape = OrientedBarHazard | CircleHazard | AnnulusSectorHazard;

export interface SafeZoneHint {
  x: number;
  y: number;
  radius: number;
  label?: string;
}

export interface CollisionCheckResult {
  collided: boolean;
  closestDistance: number; // distance from player edge to nearest lethal hazard edge (>0 when safe)
  closestWarningDistance: number;
}

function normalizeAngleDiff(a: number, b: number): number {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function distanceToBar(px: number, py: number, bar: OrientedBarHazard): number {
  const dx = px - bar.cx;
  const dy = py - bar.cy;
  const cos = Math.cos(-bar.angle);
  const sin = Math.sin(-bar.angle);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const qx = Math.abs(localX) - bar.halfLength;
  const qy = Math.abs(localY) - bar.halfThickness;

  const outsideDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const insideDist = Math.min(Math.max(qx, qy), 0);
  return outsideDist + insideDist; // signed distance from point to box surface
}

export function distanceToCircleHazard(px: number, py: number, circle: CircleHazard): number {
  const d = Math.hypot(px - circle.cx, py - circle.cy);
  if (circle.invertSafeInside) {
    // Inside circle is safe; outside circle is lethal.
    // Signed distance to lethal region = circle.radius - d (when d < radius, positive safe margin)
    return circle.radius - d;
  } else {
    // Circle itself is a lethal pillar
    return d - circle.radius;
  }
}

export function distanceToRingWall(px: number, py: number, ring: AnnulusSectorHazard): number {
  const r = Math.hypot(px, py);
  const ang = Math.atan2(py, px);
  const angDiff = Math.abs(normalizeAngleDiff(ang, ring.safeAngleCenter));

  // If within the safe angular gap, compute distance to the angular edges of the wall
  if (angDiff < ring.safeAngleHalfSpan) {
    if (r < ring.innerRadius) {
      return ring.innerRadius - r;
    }
    if (r > ring.outerRadius) {
      return r - ring.outerRadius;
    }
    // Inside the gap radially: distance to nearest angular edge
    const edgeAngleDiff = ring.safeAngleHalfSpan - angDiff;
    return r * Math.sin(Math.min(edgeAngleDiff, Math.PI / 2));
  }

  // Outside the safe gap: radial distance to annulus [innerRadius, outerRadius]
  if (r < ring.innerRadius) {
    return ring.innerRadius - r;
  }
  if (r > ring.outerRadius) {
    return r - ring.outerRadius;
  }
  // Inside lethal wall
  return -Math.min(r - ring.innerRadius, ring.outerRadius - r);
}

export function evaluateHazards(
  px: number,
  py: number,
  playerRadius: number,
  hazards: HazardShape[]
): CollisionCheckResult {
  let closestLethal = Infinity;
  let closestWarning = Infinity;
  let collided = false;

  for (const h of hazards) {
    let signedDist = Infinity;
    if (h.kind === 'bar') {
      signedDist = distanceToBar(px, py, h) - playerRadius;
    } else if (h.kind === 'circle') {
      signedDist = distanceToCircleHazard(px, py, h) - playerRadius;
    } else if (h.kind === 'ring_wall') {
      signedDist = distanceToRingWall(px, py, h) - playerRadius;
    }

    if (h.lethal) {
      if (signedDist < closestLethal) {
        closestLethal = signedDist;
      }
      if (signedDist <= 0) {
        collided = true;
      }
    } else {
      if (signedDist < closestWarning) {
        closestWarning = signedDist;
      }
    }
  }

  return {
    collided,
    closestDistance: closestLethal,
    closestWarningDistance: closestWarning,
  };
}
