import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SimulationEngine,
  findShortestPath,
  lineIntersectsAABB,
  type AgentFSMState,
} from '../src/engine/simulation_engine.js';
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

test('Simulation Engine: Line-of-Sight Liang-Barsky intersection check', () => {
  const box = { minX: 10, maxX: 20, minY: 10, maxY: 20 };

  // Line segment passing straight through box
  assert.equal(lineIntersectsAABB(0, 15, 30, 15, box), true);

  // Line segment completely clear of box
  assert.equal(lineIntersectsAABB(0, 5, 30, 5, box), false);
});

test('Simulation Engine: Continuous Vector Steering & dynamic lateral evasion', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const engine = new SimulationEngine(topology, robot, 2);

  // Place two agents facing each other close by (< 1.5m)
  engine.agents[0].x = 10.0;
  engine.agents[0].y = 10.0;
  engine.agents[0].headingRad = 0; // facing right (+x)
  engine.agents[0].state = 'MOVING_TO_PICKUP';
  engine.agents[0].targetNodeId = topology.nodes[0].id;
  engine.agents[0].pathNodeIds = [topology.nodes[0].id];

  engine.agents[1].x = 11.0;
  engine.agents[1].y = 10.0;
  engine.agents[1].headingRad = Math.PI; // facing left (-x)
  engine.agents[1].state = 'MOVING_TO_PICKUP';
  engine.agents[1].targetNodeId = topology.nodes[0].id;
  engine.agents[1].pathNodeIds = [topology.nodes[0].id];

  // Advance continuous physics frame
  engine.update(0.1);

  // Positions and headings should update continuously without stopping or freezing
  assert.notEqual(engine.agents[0].x, 10.0);
  assert.ok(typeof engine.agents[0].headingRad === 'number');
});

test('Simulation Engine: Line-of-Sight respects robot radius obstacle inflation', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const engine = new SimulationEngine(topology, robot, 1);

  // Set an obstacle box
  engine.obstacleBoxes = [{ minX: 10, maxX: 20, minY: 10, maxY: 20 }];

  // Line segment passing 0.3m outside raw box (minY - 0.3 = 9.7)
  // Without inflation, line (0, 9.7) -> (30, 9.7) does not intersect (10..20, 10..20).
  // With robotRadius (~0.7m), box expands minY to 9.3, so line intersects inflated box.
  assert.equal(engine.hasLineOfSight(0, 9.7, 30, 9.7), false);
});

test('Simulation Engine: Hard boundary push-out when robot penetrates obstacle buffer', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const engine = new SimulationEngine(topology, robot, 1);

  // Add a test box
  engine.obstacleBoxes = [{ minX: 10, maxX: 20, minY: 10, maxY: 20 }];

  const agent = engine.agents[0];
  // Position agent inside box boundary buffer (e.g. at x=9.8, y=15.0 -> dObs = 0.2 < robotRadius)
  agent.x = 9.8;
  agent.y = 15.0;
  agent.state = 'MOVING_TO_PICKUP';
  agent.targetNodeId = topology.nodes[0].id;
  agent.pathNodeIds = [topology.nodes[0].id];

  engine.update(0.05);

  // Agent should be pushed out so that dObs >= robotRadius
  const cx = Math.max(10, Math.min(agent.x, 20));
  const cy = Math.max(10, Math.min(agent.y, 20));
  const dObs = Math.hypot(agent.x - cx, agent.y - cy);

  assert.ok(dObs >= engine.robotRadius - 0.01, `Expected dObs >= ${engine.robotRadius}, got ${dObs}`);
});

test('Simulation Engine: Agent FSM state transitions & movement', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const engine = new SimulationEngine(topology, robot, 1);

  assert.equal(engine.agents[0].state, 'IDLE');

  engine.update(1.0);
  const stateAfterStart: string = engine.agents[0].state;
  assert.ok(
    stateAfterStart === 'MOVING_TO_PICKUP' || stateAfterStart === 'LOADING',
    `Expected MOVING_TO_PICKUP or LOADING, got ${stateAfterStart}`
  );

  for (let i = 0; i < 60; i++) {
    engine.update(1.0);
  }

  assert.ok(engine.elapsedSimSeconds >= 60);
  assert.ok(engine.completedDeliveries >= 0);
});

test('Simulation Engine: Low battery triggers MOVING_TO_CHARGE state', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const engine = new SimulationEngine(topology, robot, 1);

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

  engine.agents[0].isQueued = true;
  engine.agents[1].isQueued = true;

  const telemetry = engine.getTelemetry(40);
  assert.equal(telemetry.congestionDetected, true);
  assert.equal(telemetry.queuedCount, 2);
});

test('Simulation Engine: runSimulation with custom duration, quota and frame decimation', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const engine = new SimulationEngine(topology, robot, 3);

  const options = {
    targetHourlyQuota: 50,
    durationHours: 2.0,
    recordReplay: true,
    targetReplayFramesCount: 7200,
  };

  const res = engine.runSimulation(options);

  assert.equal(res.durationHours, 2.0);
  assert.equal(res.simulatedSeconds, 7200);
  assert.equal(res.totalTicks, 14400);
  assert.equal(res.targetHourlyQuota, 50);
  assert.equal(res.totalTargetQuota, 100);
  assert.ok(res.totalDelivered >= 0);
  assert.ok(res.realizedThroughputPerHour >= 0);
  assert.ok(res.quotaFulfillmentPercent >= 0);
  assert.ok(res.trafficCongestionFactor >= 0 && res.trafficCongestionFactor <= 1.0);

  // Decimation check: 14400 ticks with target 7200 frames => stride = 2 => exactly 7200 frames recorded
  assert.equal(engine.replayFrames.length, 7200);
  assert.equal(engine.replayFrames[0].timestampSec, 0);
  assert.equal(engine.replayFrames[1].timestampSec, 1.0);

  // Verify AgentSnapshot extended fields
  const sampleAgent = engine.replayFrames[0].agents[0];
  assert.ok(typeof sampleAgent.isQueued === 'boolean');
  assert.ok(typeof sampleAgent.isDeadlocked === 'boolean');
  assert.ok(typeof sampleAgent.speedMps === 'number');
});
