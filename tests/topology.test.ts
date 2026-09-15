import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFacilityTopology, calculateFacilityDimensions } from '../src/engine/topology_generator.js';
import type { FacilityRequirements } from '../src/types/facility.js';
import type { FacilityTopology } from '../src/types/topology.js';

/**
 * BFS helper to check if there is a path from startNodeId to targetNodeId in the graph.
 */
function isPathAvailable(topology: FacilityTopology, startNodeId: string, targetNodeId: string): boolean {
  const adj = new Map<string, string[]>();
  topology.nodes.forEach((n) => adj.set(n.id, []));
  topology.edges.forEach((e) => {
    adj.get(e.source)?.push(e.target);
    if (e.bidirectional) {
      adj.get(e.target)?.push(e.source);
    }
  });

  const visited = new Set<string>();
  const queue: string[] = [startNodeId];
  visited.add(startNodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === targetNodeId) return true;

    for (const neighbor of adj.get(current) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return false;
}

test('Topology: Calculates aspect ratio dimensions correctly', () => {
  const warehouseReqs: FacilityRequirements = {
    industry: 'warehouse',
    totalAreaSqm: 5000,
    aisleWidthM: 2.5,
    ceilingHeightM: 8.0,
    operatingTempRange: { min: 10, max: 25 },
    shiftsPerDay: 2,
    hoursPerDay: 16,
    requiredPayloadKg: 1000,
    targetThroughputPerHour: 50,
    averageWorkerSalaryRub: 80000,
  };

  const { widthM, lengthM } = calculateFacilityDimensions(warehouseReqs);
  // Aspect ratio 2:1 -> lengthM = sqrt(5000 * 2) = 100, widthM = 50
  assert.equal(lengthM, 100);
  assert.equal(widthM, 50);
});

test('Topology: Warehouse procedural topology generation & connectivity', () => {
  const facility: FacilityRequirements = {
    industry: 'warehouse',
    totalAreaSqm: 2000,
    aisleWidthM: 2.0,
    ceilingHeightM: 6.0,
    operatingTempRange: { min: 15, max: 25 },
    shiftsPerDay: 2,
    hoursPerDay: 16,
    requiredPayloadKg: 800,
    targetThroughputPerHour: 40,
    averageWorkerSalaryRub: 75000,
  };

  const topology = generateFacilityTopology(facility);

  assert.ok(topology.nodes.length > 0, 'Should contain graph nodes');
  assert.ok(topology.edges.length > 0, 'Should contain graph edges');
  assert.ok(topology.zones.length >= 4, 'Should contain functional zones');

  // Verify geometry boundary rules
  topology.nodes.forEach((node) => {
    assert.ok(
      node.x >= 0 && node.x <= topology.widthM,
      `Node ${node.id} X (${node.x}) outside width ${topology.widthM}`
    );
    assert.ok(
      node.y >= 0 && node.y <= topology.lengthM,
      `Node ${node.id} Y (${node.y}) outside length ${topology.lengthM}`
    );
  });

  // Verify node types presence
  const hasInbound = topology.nodes.some((n) => n.type === 'INBOUND_DOCK');
  const hasOutbound = topology.nodes.some((n) => n.type === 'OUTBOUND_DOCK');
  const hasStorage = topology.nodes.some((n) => n.type === 'STORAGE_AISLE');
  const hasCharging = topology.nodes.some((n) => n.type === 'CHARGING_HUB');

  assert.ok(hasInbound, 'Warehouse must have Inbound Docks');
  assert.ok(hasOutbound, 'Warehouse must have Outbound Docks');
  assert.ok(hasStorage, 'Warehouse must have Storage Aisles');
  assert.ok(hasCharging, 'Warehouse must have Charging Hubs');

  // Verify full connectivity via BFS from Inbound Dock to Outbound Dock & Charging Station
  const inboundNode = topology.nodes.find((n) => n.type === 'INBOUND_DOCK')!;
  const outboundNode = topology.nodes.find((n) => n.type === 'OUTBOUND_DOCK')!;
  const chargingNode = topology.nodes.find((n) => n.type === 'CHARGING_HUB')!;

  assert.ok(
    isPathAvailable(topology, inboundNode.id, outboundNode.id),
    'Path must exist between Inbound and Outbound docks'
  );

  assert.ok(
    isPathAvailable(topology, inboundNode.id, chargingNode.id),
    'Path must exist between Inbound dock and Charging station'
  );
});

test('Topology: Airport & Hospital procedural topologies connectivity', () => {
  const airportReqs: FacilityRequirements = {
    industry: 'airport',
    totalAreaSqm: 3000,
    aisleWidthM: 3.0,
    ceilingHeightM: 10.0,
    operatingTempRange: { min: 15, max: 25 },
    shiftsPerDay: 3,
    hoursPerDay: 24,
    requiredPayloadKg: 500,
    targetThroughputPerHour: 100,
    averageWorkerSalaryRub: 90000,
  };

  const hospitalReqs: FacilityRequirements = {
    industry: 'hospital',
    totalAreaSqm: 1500,
    aisleWidthM: 1.8,
    ceilingHeightM: 3.5,
    operatingTempRange: { min: 18, max: 24 },
    shiftsPerDay: 3,
    hoursPerDay: 24,
    requiredPayloadKg: 200,
    targetThroughputPerHour: 30,
    averageWorkerSalaryRub: 70000,
  };

  const airportTopo = generateFacilityTopology(airportReqs);
  const hospitalTopo = generateFacilityTopology(hospitalReqs);

  // Check Airport connectivity
  const airportInbound = airportTopo.nodes.find((n) => n.type === 'INBOUND_DOCK')!;
  const airportOutbound = airportTopo.nodes.find((n) => n.type === 'OUTBOUND_DOCK')!;
  const airportCharger = airportTopo.nodes.find((n) => n.type === 'CHARGING_HUB')!;

  assert.ok(isPathAvailable(airportTopo, airportInbound.id, airportOutbound.id));
  assert.ok(isPathAvailable(airportTopo, airportInbound.id, airportCharger.id));

  // Check Hospital connectivity
  const hospInbound = hospitalTopo.nodes.find((n) => n.type === 'INBOUND_DOCK')!;
  const hospOutbound = hospitalTopo.nodes.find((n) => n.type === 'OUTBOUND_DOCK')!;
  const hospCharger = hospitalTopo.nodes.find((n) => n.type === 'CHARGING_HUB')!;

  assert.ok(isPathAvailable(hospitalTopo, hospInbound.id, hospOutbound.id));
  assert.ok(isPathAvailable(hospitalTopo, hospInbound.id, hospCharger.id));
});
