import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createInitialConstructorGrid,
  rebuildTopologyFromGrid,
  checkGraphIsolation,
} from '../src/engine/constructor_engine.js';

describe('Constructor Engine Performance Benchmark', () => {
  it('benchmarks checkGraphIsolation on a large grid', () => {
    // Construct a grid with 30x30 tiles (900 nodes)
    const grid = createInitialConstructorGrid(60, 60, 2.0); // 30 cols x 30 rows
    const topology = rebuildTopologyFromGrid(grid, 60, 60);

    const inboundCount = topology.nodes.filter((n) => n.type === 'INBOUND_DOCK').length;
    const outboundCount = topology.nodes.filter((n) => n.type === 'OUTBOUND_DOCK').length;
    const chargerCount = topology.nodes.filter((n) => n.type === 'CHARGING_HUB').length;

    assert.ok(topology.nodes.length > 0);
    assert.ok(outboundCount > 0);
    assert.ok(chargerCount > 0);

    const iterations = 50;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      const isolated = checkGraphIsolation(topology);
      assert.strictEqual(isolated, false);
    }

    const endTime = performance.now();
    const totalMs = endTime - startTime;
    const avgMs = totalMs / iterations;

    console.log(
      `[BENCHMARK] Grid Nodes: ${topology.nodes.length}, Edges: ${topology.edges.length}, Inbound: ${inboundCount}, Outbound: ${outboundCount}, Chargers: ${chargerCount}`
    );
    console.log(
      `[BENCHMARK] Total time for ${iterations} checkGraphIsolation runs: ${totalMs.toFixed(2)} ms (avg: ${avgMs.toFixed(4)} ms/op)`
    );
  });
});
