import { describe, it } from 'node:test';
import assert from 'node:assert';
import { analyzeTopologyBottlenecks } from '../src/engine/spectral_analyzer.js';
import type { FacilityTopology, GraphEdge, GraphNode } from '../src/types/topology.js';

describe('Spectral Bottleneck Analyzer', () => {
  it('detects bottleneck in dumbbell graph topology layout', () => {
    // Create dumbbell graph: two dense clusters of 3 nodes connected by a single narrow bridge node
    const nodes: GraphNode[] = [
      // Cluster A
      { id: 'a1', type: 'INBOUND_DOCK', x: 0, y: 0, zLevel: 0 },
      { id: 'a2', type: 'WAYPOINT', x: 2, y: 0, zLevel: 0 },
      { id: 'a3', type: 'WAYPOINT', x: 2, y: 2, zLevel: 0 },

      // Pinch point bridge
      { id: 'bridge', type: 'WAYPOINT', x: 10, y: 10, zLevel: 0 },

      // Cluster B
      { id: 'b1', type: 'OUTBOUND_DOCK', x: 20, y: 20, zLevel: 0 },
      { id: 'b2', type: 'WAYPOINT', x: 22, y: 20, zLevel: 0 },
      { id: 'b3', type: 'WAYPOINT', x: 22, y: 22, zLevel: 0 },
    ];

    const edges: GraphEdge[] = [
      // Cluster A internal
      { id: 'e_a1_a2', source: 'a1', target: 'a2', distanceM: 2, bidirectional: true },
      { id: 'e_a2_a3', source: 'a2', target: 'a3', distanceM: 2, bidirectional: true },
      { id: 'e_a3_a1', source: 'a3', target: 'a1', distanceM: 2, bidirectional: true },

      // Bridge connections (long bottleneck)
      { id: 'e_a2_br', source: 'a2', target: 'bridge', distanceM: 10, bidirectional: true },
      { id: 'e_br_b1', source: 'bridge', target: 'b1', distanceM: 10, bidirectional: true },

      // Cluster B internal
      { id: 'e_b1_b2', source: 'b1', target: 'b2', distanceM: 2, bidirectional: true },
      { id: 'e_b2_b3', source: 'b2', target: 'b3', distanceM: 2, bidirectional: true },
      { id: 'e_b3_b1', source: 'b3', target: 'b1', distanceM: 2, bidirectional: true },
    ];

    const dumbbellTopology: FacilityTopology = {
      widthM: 30,
      lengthM: 30,
      nodes,
      edges,
      zones: [],
    };

    const result = analyzeTopologyBottlenecks(dumbbellTopology);

    assert.ok(result.algebraicConnectivity < 0.15, `Expected algebraic connectivity < 0.15, got ${result.algebraicConnectivity}`);
    assert.strictEqual(result.status, 'CRITICAL');
    assert.ok(result.criticalNodeIds.includes('bridge'), 'Expected bridge node to be flagged as critical');
  });

  it('reports optimal connectivity on fully interconnected grid graph', () => {
    const nodes: GraphNode[] = [
      { id: 'n1', type: 'INBOUND_DOCK', x: 0, y: 0, zLevel: 0 },
      { id: 'n2', type: 'WAYPOINT', x: 2, y: 0, zLevel: 0 },
      { id: 'n3', type: 'OUTBOUND_DOCK', x: 2, y: 2, zLevel: 0 },
      { id: 'n4', type: 'CHARGING_HUB', x: 0, y: 2, zLevel: 0 },
    ];

    const edges: GraphEdge[] = [
      { id: 'e1', source: 'n1', target: 'n2', distanceM: 1, bidirectional: true },
      { id: 'e2', source: 'n2', target: 'n3', distanceM: 1, bidirectional: true },
      { id: 'e3', source: 'n3', target: 'n4', distanceM: 1, bidirectional: true },
      { id: 'e4', source: 'n4', target: 'n1', distanceM: 1, bidirectional: true },
      { id: 'e5', source: 'n1', target: 'n3', distanceM: 1, bidirectional: true },
      { id: 'e6', source: 'n2', target: 'n4', distanceM: 1, bidirectional: true },
    ];

    const gridTopology: FacilityTopology = {
      widthM: 10,
      lengthM: 10,
      nodes,
      edges,
      zones: [],
    };

    const result = analyzeTopologyBottlenecks(gridTopology);

    assert.ok(result.algebraicConnectivity >= 0.35, `Expected algebraic connectivity >= 0.35, got ${result.algebraicConnectivity}`);
    assert.strictEqual(result.status, 'OPTIMAL');
  });
});
