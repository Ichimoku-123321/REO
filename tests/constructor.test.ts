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
import {
  WarehouseElement,
  StorageElement,
  RackEntity,
  WallEntity,
  ChargerEntity,
  DockEntity,
  InboundDockEntity,
  OutboundDockEntity,
  buildElementsMap,
} from '../src/engine/cad_entities.js';

describe('3D CAD Constructor Engine & Topology Rebuilder', () => {
  it('creates initial grid matching dimensions and cell size with empty floor tiles', () => {
    const grid = createInitialConstructorGrid(20, 20, 2.0);
    assert.strictEqual(grid.cols, 10);
    assert.strictEqual(grid.rows, 10);
    assert.strictEqual(grid.cellSizeM, 2.0);
    assert.strictEqual(grid.tiles.size, 100);
    // All initial tiles are EMPTY_FLOOR
    assert.ok(Array.from(grid.tiles.values()).every((t) => t === 'EMPTY_FLOOR'));
  });

  it('rebuilds topology nodes and passable edges when tiles are placed', () => {
    const grid = createInitialConstructorGrid(10, 10, 2.0);
    // Populate some floor tiles with docks and racks
    grid.tiles.set(getTileKey(0, 0), 'DOCK_INBOUND');
    grid.tiles.set(getTileKey(1, 0), 'EMPTY_FLOOR');
    grid.tiles.set(getTileKey(2, 0), 'DOCK_OUTBOUND');

    const initialTopology = rebuildTopologyFromGrid(grid, 10, 10);

    assert.ok(initialTopology.nodes.length > 0);
    assert.ok(initialTopology.edges.length > 0);

    // Place an obstacle in place of empty floor
    grid.tiles.set(getTileKey(1, 0), 'OBSTACLE');
    const updatedTopology = rebuildTopologyFromGrid(grid, 10, 10);

    // Node count should decrease because OBSTACLE creates no passable graph node
    assert.ok(updatedTopology.nodes.length < initialTopology.nodes.length);
    assert.ok(!updatedTopology.nodes.some((n) => n.id === 'c_node_1_0'));
  });

  it('detects graph isolation when obstacles block dock connectivity', () => {
    const grid = createInitialConstructorGrid(6, 6, 2.0);
    grid.tiles.set(getTileKey(0, 0), 'DOCK_INBOUND');
    grid.tiles.set(getTileKey(5, 5), 'DOCK_OUTBOUND');

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
    // Initially empty grid has 0 racks
    const initialCapacity = calculateWarehouseCapacity(grid);
    assert.strictEqual(initialCapacity.totalRacks, 0);
    assert.strictEqual(initialCapacity.totalPalletCapacity, 0);

    // Add 2 racks
    grid.tiles.set(getTileKey(1, 1), 'RACK');
    grid.tiles.set(getTileKey(1, 2), 'RACK');
    const capacity = calculateWarehouseCapacity(grid);
    assert.strictEqual(capacity.totalRacks, 2);
    assert.strictEqual(capacity.totalPalletCapacity, 24);
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

  it('correctly constructs OOP WarehouseElement entity hierarchy and guards hasInspection', () => {
    const rack = new RackEntity(2, 2, 24, 'sku-apples');
    assert.ok(rack instanceof WarehouseElement);
    assert.ok(rack instanceof StorageElement);
    assert.ok(rack instanceof RackEntity);
    assert.strictEqual(rack.type, 'RACK');
    assert.strictEqual(rack.hasInspection, true);
    assert.strictEqual(rack.slotsPerRack, 24);
    assert.strictEqual(rack.skuId, 'sku-apples');
    assert.strictEqual(rack.colorHex, 0x334155);

    const wall = new WallEntity(4, 4);
    assert.ok(wall instanceof WarehouseElement);
    assert.ok(!(wall instanceof StorageElement));
    assert.strictEqual(wall.type, 'OBSTACLE');
    assert.strictEqual(wall.hasInspection, false);
    assert.strictEqual(wall.colorHex, 0xef4444);

    const charger = new ChargerEntity(6, 6);
    assert.ok(charger instanceof WarehouseElement);
    assert.ok(!(charger instanceof StorageElement));
    assert.strictEqual(charger.type, 'CHARGER');
    assert.strictEqual(charger.hasInspection, false);
    assert.strictEqual(charger.colorHex, 0xf59e0b);

    const inDock = new InboundDockEntity(0, 0);
    assert.ok(inDock instanceof WarehouseElement);
    assert.ok(inDock instanceof DockEntity);
    assert.ok(!(inDock instanceof StorageElement));
    assert.strictEqual(inDock.type, 'DOCK_INBOUND');
    assert.strictEqual(inDock.hasInspection, false);
    assert.strictEqual(inDock.colorHex, 0x10b981);
    assert.strictEqual(DockEntity.maxInstances, 1);

    const outDock = new OutboundDockEntity(10, 10);
    assert.ok(outDock instanceof WarehouseElement);
    assert.ok(outDock instanceof DockEntity);
    assert.ok(!(outDock instanceof StorageElement));
    assert.strictEqual(outDock.type, 'DOCK_OUTBOUND');
    assert.strictEqual(outDock.hasInspection, false);
    assert.strictEqual(outDock.colorHex, 0x0284c7);
  });

  it('builds elements map from grid and calculates capacity polymorphically', () => {
    const grid = createInitialConstructorGrid(20, 20, 2.0);
    const rackKey = getTileKey(1, 1);
    const wallKey = getTileKey(2, 2);
    const chargerKey = getTileKey(3, 3);
    const inDockKey = getTileKey(0, 0);
    const outDockKey = getTileKey(9, 9);

    grid.tiles.set(rackKey, 'RACK');
    grid.tiles.set(wallKey, 'OBSTACLE');
    grid.tiles.set(chargerKey, 'CHARGER');
    grid.tiles.set(inDockKey, 'DOCK_INBOUND');
    grid.tiles.set(outDockKey, 'DOCK_OUTBOUND');

    const detailsMap = new Map();
    detailsMap.set(rackKey, { slotsPerRack: 36, skuId: 'sku-box', rotationDeg: 90 });
    grid.elementDetails = detailsMap;

    const elementsMap = buildElementsMap(grid);
    assert.strictEqual(elementsMap.size, 5);

    const rackEl = elementsMap.get(rackKey);
    assert.ok(rackEl instanceof StorageElement);
    assert.strictEqual((rackEl as StorageElement).slotsPerRack, 36);
    assert.strictEqual((rackEl as StorageElement).skuId, 'sku-box');
    assert.strictEqual(rackEl.rotationDeg, 90);

    const wallEl = elementsMap.get(wallKey);
    assert.ok(wallEl instanceof WallEntity);
    assert.strictEqual(wallEl.hasInspection, false);

    const chargerEl = elementsMap.get(chargerKey);
    assert.ok(chargerEl instanceof ChargerEntity);
    assert.strictEqual(chargerEl.hasInspection, false);

    const inDockEl = elementsMap.get(inDockKey);
    assert.ok(inDockEl instanceof InboundDockEntity);
    assert.strictEqual(inDockEl.hasInspection, false);

    const outDockEl = elementsMap.get(outDockKey);
    assert.ok(outDockEl instanceof OutboundDockEntity);
    assert.strictEqual(outDockEl.hasInspection, false);

    // Dynamic capacity calculation test
    const capacity = calculateWarehouseCapacity(grid);
    assert.strictEqual(capacity.totalRacks, 1);
    assert.strictEqual(capacity.totalPalletCapacity, 36);
  });
});
