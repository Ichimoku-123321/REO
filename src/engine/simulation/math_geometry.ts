import type { Robot } from '../../types/robot.js';
import type { ObstacleBox } from './types.js';

/**
 * Liang-Barsky algorithm for 2D line segment to AABB intersection check.
 */
export function lineIntersectsAABB(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: ObstacleBox
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;

  const p = [-dx, dx, -dy, dy];
  const q = [x1 - box.minX, box.maxX - x1, y1 - box.minY, box.maxY - y1];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}

/**
 * Calculates physical collision radius for robot based on dimensions.
 */
export function calculateRobotRadius(robotSpec: Robot): number {
  const robotWidth = (robotSpec.dimensionsMm?.width ?? 800) / 1000;
  const robotLength = (robotSpec.dimensionsMm?.length ?? 1000) / 1000;
  return Math.max(0.4, Math.hypot(robotWidth, robotLength) / 2 + 0.1);
}
