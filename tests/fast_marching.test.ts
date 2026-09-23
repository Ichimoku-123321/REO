import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FastMarchingSolver } from '../src/engine/fast_marching.js';
import { SEED_ROBOTS } from '../src/data/robots.seed.js';

describe('Fast Marching Method (Eikonal Solver) Tests', () => {
  it('solves travel time field T(x, y) correctly on open 2D grid', () => {
    const solver = new FastMarchingSolver({
      widthM: 20,
      lengthM: 20,
      resolutionM: 1.0,
      obstacleBoxes: [],
      robot: SEED_ROBOTS[0],
    });

    const T = solver.solveEikonalField(10, 10);
    assert.equal(T.length, 400);

    // Center cell (10, 10) -> col 10, row 10 -> index 210
    const centerIdx = 10 * 20 + 10;
    assert.equal(T[centerIdx], 0);

    // Neighbor cell should have non-zero travel time
    const neighborIdx = 10 * 20 + 11;
    assert.ok(T[neighborIdx] > 0);
    assert.ok(Number.isFinite(T[neighborIdx]));
  });

  it('computes gradient velocity towards target', () => {
    const solver = new FastMarchingSolver({
      widthM: 20,
      lengthM: 20,
      resolutionM: 1.0,
      obstacleBoxes: [],
      robot: SEED_ROBOTS[0],
    });

    const T = solver.solveEikonalField(10, 10);
    const grad = solver.getGradientVelocity(5, 10, T, 1.5);

    assert.equal(grad.arrived, false);
    assert.ok(grad.vx > 0); // Moving right towards target at x = 10
  });
});
