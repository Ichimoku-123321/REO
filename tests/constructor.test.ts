import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createInitialConstructorGrid,
  rebuildTopologyFromGrid,
  checkGraphIsolation,
  getTileKey,
  calculateShoelaceArea,
  findMagneticSnapPosition,
  calculateWarehouseCapacity,
} from '../src/engine/constructor_engine.js';

describe('2.5D Constructor Engine & Topology Rebuilder', () => {
  it('creates initial grid matching dimensions and cell size', () => {
    const grid = createInitialConstructorGrid(20, 20, 2.0);
    assert.strictEqual(grid.cols, 10);
    assert.strictEqual(grid.rows, 10);
    assert.strictEqual(grid.cellSizeM, 2.0);
    assert.ok(grid.tiles.size > 0);
  });

  it('rebuilds topology nodes and passable edges when tiles are placed', () => {
    const grid = createInitialConstructorGrid(10, 10, 2.0);
    const initialTopology = rebuildTopologyFromGrid(grid, 10, 10);

    assert.ok(initialTopology.nodes.length > 0);
    assert.ok(initialTopology.edges.length > 0);

    // Place an obstacle in the middle
    grid.tiles.set(getTileKey(2, 2), 'OBSTACLE');
    const updatedTopology = rebuildTopologyFromGrid(grid, 10, 10);

    // Node count should decrease because OBSTACLE creates no passable graph node
    assert.ok(updatedTopology.nodes.length < initialTopology.nodes.length);
    assert.ok(!updatedTopology.nodes.some((n) => n.id === 'c_node_2_2'));
  });

  it('detects graph isolation when obstacles block dock connectivity', () => {
    const grid = createInitialConstructorGrid(6, 6, 2.0);

    // Place obstacles across column x=1 to cut off inbound dock at x=0
    for (let y = 0; y < grid.rows; y++) {
      grid.tiles.set(getTileKey(1, y), 'OBSTACLE');
    }

    const isolatedTopology = rebuildTopologyFromGrid(grid, 6, 6);
    const isIsolated = checkGraphIsolation(isolatedTopology);

    assert.strictEqual(isIsolated, true);
  });

  it('calculates polygon surface area via Gauss Shoelace formula', () => {
    // 10x20 rectangle
    const rect = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 20 },
      { x: 0, z: 20 },
    ];
    assert.strictEqual(calculateShoelaceArea(rect), 200);

    // L-shaped polygon
    const lShape = [
      { x: 0, z: 0 },
      { x: 20, z: 0 },
      { x: 20, z: 10 },
      { x: 10, z: 10 },
      { x: 10, z: 30 },
      { x: 0, z: 30 },
    ];
    // Area = (20*10) + (10*20) = 200 + 200 = 400
    assert.strictEqual(calculateShoelaceArea(lShape), 400);
  });

  it('performs magnetic axis snapping within threshold', () => {
    const existing = [{ x: 10.0, z: 15.0 }];

    // Target close to X=10.0 (dist = 0.2m < 0.35m)
    const target1 = { x: 10.2, z: 5.0 };
    const res1 = findMagneticSnapPosition(target1, existing, 0.35);
    assert.strictEqual(res1.snapped.x, 10.0);
    assert.strictEqual(res1.guideX, 10.0);

    // Target far from existing (dist > 0.35m)
    const target2 = { x: 12.0, z: 5.0 };
    const res2 = findMagneticSnapPosition(target2, existing, 0.35);
    assert.strictEqual(res2.snapped.x, 12.0);
    assert.strictEqual(res2.guideX, null);
  });

  it('calculates warehouse rack capacity live', () => {
    const grid = createInitialConstructorGrid(30, 30, 2.0);
    const capacity = calculateWarehouseCapacity(grid);
    assert.ok(capacity.totalRacks > 0);
    assert.strictEqual(capacity.totalPalletCapacity, capacity.totalRacks * 12);
  });

  it('assigns custom SKU to rack element details map', () => {
    const grid = createInitialConstructorGrid(10, 10, 2.0);
    const rackKey = getTileKey(2, 2);
    grid.tiles.set(rackKey, 'RACK');

    const detailsMap = new Map(grid.elementDetails || []);
    detailsMap.set(rackKey, { skuId: 'sku-cucumber', slotsPerRack: 12 });
    grid.elementDetails = detailsMap;

    assert.strictEqual(grid.elementDetails.get(rackKey)?.skuId, 'sku-cucumber');
    assert.strictEqual(grid.elementDetails.get(rackKey)?.slotsPerRack, 12);
  });

  it('detects storage capacity overflow when inbound batch volume exceeds total capacity', () => {
    const grid = createInitialConstructorGrid(10, 10, 2.0);
    // 1 rack section = 12 slots
    grid.tiles.set(getTileKey(2, 2), 'RACK');

    const capacity = calculateWarehouseCapacity(grid);
    assert.strictEqual(capacity.totalPalletCapacity, 12);

    const inboundBatchSmall = 10;
    const isOverflowSmall = inboundBatchSmall > capacity.totalPalletCapacity;
    assert.strictEqual(isOverflowSmall, false);

    const inboundBatchLarge = 50;
    const isOverflowLarge = inboundBatchLarge > capacity.totalPalletCapacity;
    assert.strictEqual(isOverflowLarge, true);
  });
});
