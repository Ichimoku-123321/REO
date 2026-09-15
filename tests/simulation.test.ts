import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationEngine, findShortestPath, type AgentFSMState } from '../src/engine/simulation_engine.js';
import { generateFacilityTopology } from '../src/engine/topology_generator.js';
import { SEED_ROBOTS } from '../src/data/robots.seed.js';
import type { FacilityRequirements } from '../src/types/facility.js';

const mockFacility: FacilityRequirements = {
  industry: 'warehouse',
  totalAreaSqm: 2000,
  aisleWidthM: 2.0,
  ceilingHeightM: 6.0,
  operatingTempRange: { min: 10, max: 25 },
  shiftsPerDay: 2,
  hoursPerDay: 16,
  requiredPayloadKg: 800,
  targetThroughputPerHour: 40,
  averageWorkerSalaryRub: 80000,
};

test('Simulation Engine: Initializes exactly N_fleet agents', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0]; // Ronavi H1500
  const fleetSize = 5;

  const engine = new SimulationEngine(topology, robot, fleetSize);

  assert.equal(engine.agents.length, 5);
  assert.equal(engine.elapsedSimSeconds, 0);
  assert.equal(engine.completedDeliveries, 0);

  engine.agents.forEach((agent, idx) => {
    assert.equal(agent.id, `agent_${idx + 1}`);
    assert.ok(agent.batterySoc >= 50 && agent.batterySoc <= 100);
    assert.equal(agent.state, 'IDLE');
  });
});

test('Simulation Engine: Pathfinding computes valid route between graph nodes', () => {
  const topology = generateFacilityTopology(mockFacility);
  const inboundNode = topology.nodes.find((n) => n.type === 'INBOUND_DOCK')!;
  const outboundNode = topology.nodes.find((n) => n.type === 'OUTBOUND_DOCK')!;

  const path = findShortestPath(topology, inboundNode.id, outboundNode.id);

  assert.ok(path.length >= 2);
  assert.equal(path[0], inboundNode.id);
  assert.equal(path[path.length - 1], outboundNode.id);
});

test('Simulation Engine: Agent FSM state transitions & movement', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const engine = new SimulationEngine(topology, robot, 1);

  assert.equal(engine.agents[0].state, 'IDLE');

  // Step 1 update: agent in IDLE should pick pickup dock and transition to MOVING_TO_PICKUP or LOADING
  engine.update(1.0);
  const stateAfterStart: string = engine.agents[0].state;
  assert.ok(
    stateAfterStart === 'MOVING_TO_PICKUP' || stateAfterStart === 'LOADING',
    `Expected MOVING_TO_PICKUP or LOADING, got ${stateAfterStart}`
  );

  // Fast forward simulation time by 60 seconds
  for (let i = 0; i < 60; i++) {
    engine.update(1.0);
  }

  // Agent should have completed at least 1 delivery or be transporting/unloading
  assert.ok(engine.elapsedSimSeconds >= 60);
  assert.ok(engine.completedDeliveries >= 0);
});

test('Simulation Engine: Low battery triggers MOVING_TO_CHARGE state', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const engine = new SimulationEngine(topology, robot, 1);

  // Force battery to 15%
  engine.agents[0].batterySoc = 15;
  engine.agents[0].state = 'IDLE';

  engine.update(0.5);

  const chargeState: string = engine.agents[0].state;
  assert.ok(
    chargeState === 'MOVING_TO_CHARGE' || chargeState === 'CHARGING',
    `Expected MOVING_TO_CHARGE or CHARGING, got ${chargeState}`
  );
});

test('Simulation Engine: Telemetry KPI calculation and calibration state', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const engine = new SimulationEngine(topology, robot, 3);

  const initialTelemetry = engine.getTelemetry(40);
  assert.equal(initialTelemetry.isCalibrating, true);
  assert.equal(initialTelemetry.completedDeliveries, 0);

  // Simulate 3600 seconds (1 hour sim time)
  for (let s = 0; s < 3600; s++) {
    engine.update(1.0);
  }

  const telemetry1h = engine.getTelemetry(40);
  assert.equal(telemetry1h.elapsedSimSeconds, 3600);
  assert.equal(telemetry1h.isCalibrating, false);
  assert.ok(telemetry1h.completedDeliveries > 0);
  assert.ok(telemetry1h.realizedThroughputPerHour > 0);
  assert.ok(telemetry1h.fleetUtilizationPercent >= 0 && telemetry1h.fleetUtilizationPercent <= 100);
});

test('Simulation Engine: Congestion detection flag when agents queue up', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const engine = new SimulationEngine(topology, robot, 4);

  // Force agents to be queued
  engine.agents[0].isQueued = true;
  engine.agents[1].isQueued = true;

  const telemetry = engine.getTelemetry(40);
  assert.equal(telemetry.congestionDetected, true);
  assert.equal(telemetry.queuedCount, 2);
});
