import type { Robot } from '../types/robot.js';
import type { FacilityRequirements } from '../types/facility.js';

export interface FastMarchingGridOptions {
  widthM: number;
  lengthM: number;
  resolutionM?: number; // default 0.5m
  obstacleBoxes: Array<{ minX: number; maxX: number; minY: number; maxY: number }>;
  facility?: FacilityRequirements;
  robot?: Robot;
}

export class FastMarchingSolver {
  public widthCols: number;
  public heightRows: number;
  public resolutionM: number;
  public slownessMap: Float64Array; // tau(x, y) = 1 / v(x, y)
  private obstacleBoxes: Array<{ minX: number; maxX: number; minY: number; maxY: number }>;
  private eikonalCache: Map<string, Float64Array> = new Map();

  constructor(options: FastMarchingGridOptions) {
    this.resolutionM = options.resolutionM ?? 0.5;
    this.widthCols = Math.max(1, Math.ceil(options.widthM / this.resolutionM));
    this.heightRows = Math.max(1, Math.ceil(options.lengthM / this.resolutionM));
    this.obstacleBoxes = options.obstacleBoxes;
    this.slownessMap = new Float64Array(this.widthCols * this.heightRows);

    this.computeSlownessMap(options.facility, options.robot);
  }

  /**
   * Computes tau(x, y) = 1 / v(x, y) considering obstacle clearance, floor quality, cargo weight, and robot specs.
   */
  public computeSlownessMap(
    facility?: FacilityRequirements,
    robot?: Robot,
    cargoLoaded: boolean = false
  ): void {
    this.eikonalCache.clear();
    const baseSpeed = robot ? robot.maxSpeedMps : 1.5;

    // Floor surface quality factor
    let floorSpeedFactor = 1.0;
    if (facility?.floorSurfaceQuality === 'uneven') {
      const maxAllowed = robot?.maxFloorUnevennessMm ?? 5;
      // Slowness increases as floor unevenness increases
      floorSpeedFactor = Math.max(0.2, 1.0 - 0.05 * Math.max(1, 10 - maxAllowed));
    } else if (facility?.floorSurfaceQuality === 'superflat') {
      floorSpeedFactor = 1.15;
    }

    // Cargo payload slowdown factor
    let payloadFactor = 1.0;
    if (cargoLoaded && facility && robot) {
      const payloadRatio = Math.min(1.0, facility.requiredPayloadKg / (robot.payloadKg || 1));
      payloadFactor = Math.max(0.7, 1.0 - 0.15 * payloadRatio);
    }

    const effectiveBaseSpeed = Math.max(0.1, baseSpeed * floorSpeedFactor * payloadFactor);
    const robotRadius = robot
      ? Math.max(0.3, Math.hypot(robot.dimensionsMm.width / 1000, robot.dimensionsMm.length / 1000) / 2)
      : 0.5;

    for (let r = 0; r < this.heightRows; r++) {
      for (let c = 0; c < this.widthCols; c++) {
        const x = (c + 0.5) * this.resolutionM;
        const y = (r + 0.5) * this.resolutionM;
        const idx = r * this.widthCols + c;

        // Check distance to static obstacles
        let minDistToObstacle = Infinity;
        for (const box of this.obstacleBoxes) {
          const cx = Math.max(box.minX, Math.min(x, box.maxX));
          const cy = Math.max(box.minY, Math.min(y, box.maxY));
          const d = Math.hypot(x - cx, y - cy);
          if (d < minDistToObstacle) {
            minDistToObstacle = d;
          }
        }

        if (minDistToObstacle < robotRadius + 0.1) {
          // Impassable obstacle / safety zone
          this.slownessMap[idx] = Infinity;
        } else {
          // Speed slows down smoothly near obstacles (zone of influence)
          const safetyMargin = 1.0;
          let clearanceFactor = 1.0;
          if (minDistToObstacle < robotRadius + safetyMargin) {
            const ratio = (minDistToObstacle - robotRadius) / safetyMargin;
            clearanceFactor = 0.3 + 0.7 * Math.max(0, Math.min(1, ratio));
          }

          const localSpeed = Math.max(0.05, effectiveBaseSpeed * clearanceFactor);
          this.slownessMap[idx] = 1.0 / localSpeed;
        }
      }
    }
  }

  /**
   * Fast Marching Method (Eikonal equation |grad T| = tau)
   * Computes travel time field T(x, y) starting from target coordinates.
   */
  public solveEikonalField(targetX: number, targetY: number): Float64Array {
    const cacheKey = `${Math.round(targetX * 2)}_${Math.round(targetY * 2)}`;
    const cached = this.eikonalCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const size = this.widthCols * this.heightRows;
    const T = new Float64Array(size);
    T.fill(Infinity);

    const state = new Uint8Array(size); // 0 = FAR, 1 = NARROW_BAND, 2 = FROZEN

    const targetC = Math.max(0, Math.min(this.widthCols - 1, Math.floor(targetX / this.resolutionM)));
    const targetR = Math.max(0, Math.min(this.heightRows - 1, Math.floor(targetY / this.resolutionM)));
    const targetIdx = targetR * this.widthCols + targetC;

    T[targetIdx] = 0;
    state[targetIdx] = 1; // NARROW_BAND

    // Simple priority queue using array/min-heap for Narrow Band
    const narrowBand: number[] = [targetIdx];

    const h = this.resolutionM;

    while (narrowBand.length > 0) {
      // Find node in narrowBand with minimum T
      let minIdx = 0;
      let minT = T[narrowBand[0]];

      for (let i = 1; i < narrowBand.length; i++) {
        if (T[narrowBand[i]] < minT) {
          minT = T[narrowBand[i]];
          minIdx = i;
        }
      }

      const current = narrowBand[minIdx];
      narrowBand.splice(minIdx, 1);
      state[current] = 2; // FROZEN

      const c = current % this.widthCols;
      const r = Math.floor(current / this.widthCols);

      // 4-neighbors
      const neighbors: Array<{ c: number; r: number }> = [];
      if (c > 0) neighbors.push({ c: c - 1, r });
      if (c < this.widthCols - 1) neighbors.push({ c: c + 1, r });
      if (r > 0) neighbors.push({ c, r: r - 1 });
      if (r < this.heightRows - 1) neighbors.push({ c, r: r + 1 });

      for (const nb of neighbors) {
        const nbIdx = nb.r * this.widthCols + nb.c;
        if (state[nbIdx] === 2) continue; // Skip frozen

        const tau = this.slownessMap[nbIdx];
        if (tau === Infinity) continue;

        // Upwind Eikonal update for T[nbIdx]
        const tLeft = nb.c > 0 ? T[nb.r * this.widthCols + (nb.c - 1)] : Infinity;
        const tRight = nb.c < this.widthCols - 1 ? T[nb.r * this.widthCols + (nb.c + 1)] : Infinity;
        const tUp = nb.r > 0 ? T[(nb.r - 1) * this.widthCols + nb.c] : Infinity;
        const tDown = nb.r < this.heightRows - 1 ? T[(nb.r + 1) * this.widthCols + nb.c] : Infinity;

        const Tx = Math.min(tLeft, tRight);
        const Ty = Math.min(tUp, tDown);

        let tNew = Infinity;

        if (Tx !== Infinity && Ty !== Infinity) {
          if (Math.abs(Tx - Ty) < tau * h) {
            tNew = (Tx + Ty + Math.sqrt(2 * tau * tau * h * h - (Tx - Ty) * (Tx - Ty))) / 2;
          } else {
            tNew = Math.min(Tx, Ty) + tau * h;
          }
        } else if (Tx !== Infinity) {
          tNew = Tx + tau * h;
        } else if (Ty !== Infinity) {
          tNew = Ty + tau * h;
        }

        if (tNew < T[nbIdx]) {
          T[nbIdx] = tNew;
          if (state[nbIdx] === 0) {
            state[nbIdx] = 1;
            narrowBand.push(nbIdx);
          }
        }
      }
    }

    this.eikonalCache.set(cacheKey, T);
    return T;
  }

  /**
   * Computes movement velocity vector (vx, vy) at (x, y) by gradient descent on travel time field T.
   */
  public getGradientVelocity(
    x: number,
    y: number,
    T: Float64Array,
    maxSpeed: number
  ): { vx: number; vy: number; arrived: boolean } {
    const c = Math.max(0, Math.min(this.widthCols - 1, Math.floor(x / this.resolutionM)));
    const r = Math.max(0, Math.min(this.heightRows - 1, Math.floor(y / this.resolutionM)));
    const idx = r * this.widthCols + c;

    if (T[idx] === Infinity || T[idx] <= 0.05) {
      return { vx: 0, vy: 0, arrived: true };
    }

    const tLeft = c > 0 ? T[r * this.widthCols + (c - 1)] : T[idx];
    const tRight = c < this.widthCols - 1 ? T[r * this.widthCols + (c + 1)] : T[idx];
    const tUp = r > 0 ? T[(r - 1) * this.widthCols + c] : T[idx];
    const tDown = r < this.heightRows - 1 ? T[(r + 1) * this.widthCols + c] : T[idx];

    let dTdx = (tRight - tLeft) / (2 * this.resolutionM);
    let dTdy = (tDown - tUp) / (2 * this.resolutionM);

    if (tLeft === Infinity) dTdx = (tRight - T[idx]) / this.resolutionM;
    if (tRight === Infinity) dTdx = (T[idx] - tLeft) / this.resolutionM;
    if (tUp === Infinity) dTdy = (tDown - T[idx]) / this.resolutionM;
    if (tDown === Infinity) dTdy = (T[idx] - tUp) / this.resolutionM;

    const gradMag = Math.hypot(dTdx, dTdy);
    if (gradMag < 0.0001) {
      return { vx: 0, vy: 0, arrived: true };
    }

    // Move in direction of negative gradient -grad(T)
    const vx = -maxSpeed * (dTdx / gradMag);
    const vy = -maxSpeed * (dTdy / gradMag);

    return { vx, vy, arrived: false };
  }
}
