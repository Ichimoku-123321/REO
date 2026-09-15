import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createInitialConstructorGrid,
  rebuildTopologyFromGrid,
  checkGraphIsolation,
  getTileKey,
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
});
