import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationEngine } from '../src/engine/simulation_engine.js';
import { generateFacilityTopology } from '../src/engine/topology_generator.js';
import { SEED_ROBOTS } from '../src/data/robots.seed.js';
import type { FacilityRequirements } from '../src/types/facility.js';
import type { FleetCompositionItem } from '../src/engine/fleet_optimizer.js';

const mockFacility: FacilityRequirements = {
  industry: 'warehouse',
  totalAreaSqm: 2000,
  aisleWidthM: 2.5,
  ceilingHeightM: 6.0,
  operatingTempRange: { min: 10, max: 25 },
  shiftsPerDay: 2,
  hoursPerDay: 16,
  requiredPayloadKg: 800,
  targetThroughputPerHour: 40,
  averageWorkerSalaryRub: 80000,
};

test('Heterogeneous Simulation: Validates mixed fleet agent initialization', () => {
  const topology = generateFacilityTopology(mockFacility);
  const heavyAmr = SEED_ROBOTS.find((r) => r.id === 'dmr-carrier-p')!; // Heavy AMR (length 2050mm, width 1975mm)
  const courier = SEED_ROBOTS.find((r) => r.id === 'ronavi-sr')!; // Light courier (length 650mm, width 500mm)

  const fleetConfig: FleetCompositionItem[] = [
    {
      robot: heavyAmr,
      count: 2,
      totalThroughputPerHour: 20,
      totalCapexRub: 8000000,
      totalAnnualOpexRub: 800000,
      fiveYearTcoRub: 12000000,
    },
    {
      robot: courier,
      count: 2,
      totalThroughputPerHour: 200,
      totalCapexRub: 2000000,
      totalAnnualOpexRub: 200000,
      fiveYearTcoRub: 3000000,
    },
  ];

  const engine = new SimulationEngine(topology, fleetConfig);

  assert.equal(engine.agents.length, 4);
  assert.equal(engine.fleetSize, 4);

  // First 2 agents should be heavy AMRs
  assert.equal(engine.agents[0].robotSpec.id, heavyAmr.id);
  assert.equal(engine.agents[1].robotSpec.id, heavyAmr.id);
  assert.ok(engine.agents[0].robotRadius > 0.8, 'Heavy AMR radius should be > 0.8m');

  // Next 2 agents should be light couriers
  assert.equal(engine.agents[2].robotSpec.id, courier.id);
  assert.equal(engine.agents[3].robotSpec.id, courier.id);
  assert.ok(engine.agents[2].robotRadius < 0.6, 'Light courier radius should be < 0.6m');

  // Verify non-null required physical and battery attributes in AgentState
  engine.agents.forEach((agent) => {
    assert.ok(agent.robotSpec);
    assert.ok(typeof agent.robotRadius === 'number' && agent.robotRadius > 0);
    assert.ok(typeof agent.maxSpeed === 'number' && agent.maxSpeed > 0);
    assert.ok(typeof agent.payloadKg === 'number');
    assert.ok(typeof agent.batteryCapacityHours === 'number' && agent.batteryCapacityHours > 0);
    assert.ok(typeof agent.chargeRatePerSec === 'number' && agent.chargeRatePerSec > 0);
    assert.ok(typeof agent.dischargeRatePerSec === 'number' && agent.dischargeRatePerSec > 0);
  });
});

test('Heterogeneous Simulation: Stress test 7200 ticks completes under 100 ms', () => {
  const topology = generateFacilityTopology(mockFacility);
  const heavyAmr = SEED_ROBOTS[0];
  const courier = SEED_ROBOTS[1];

  const fleetConfig: FleetCompositionItem[] = [
    {
      robot: heavyAmr,
      count: 2,
      totalThroughputPerHour: 20,
      totalCapexRub: 8000000,
      totalAnnualOpexRub: 800000,
      fiveYearTcoRub: 12000000,
    },
    {
      robot: courier,
      count: 2,
      totalThroughputPerHour: 200,
      totalCapexRub: 2000000,
      totalAnnualOpexRub: 200000,
      fiveYearTcoRub: 3000000,
    },
  ];

  const engine = new SimulationEngine(topology, fleetConfig);

  const startMs = performance.now();
  const result = engine.runOneHourSimulation(50);
  const durationMs = performance.now() - startMs;

  assert.ok(durationMs < 100, `Expected runOneHourSimulation to take < 100 ms, took ${durationMs.toFixed(2)} ms`);
  assert.equal(result.simulatedSeconds, 3600);
  assert.equal(result.totalTicks, 7200);
  assert.equal(result.targetThroughputPerHour, 50);
  assert.ok(result.realizedThroughputPerHour >= 0);
  assert.ok(result.trafficCongestionFactor >= 0 && result.trafficCongestionFactor <= 1.0);
  assert.ok(typeof result.averageIdleTimePercent === 'number' && result.averageIdleTimePercent >= 0);
  assert.ok(typeof result.deadlocksDetected === 'number' && result.deadlocksDetected >= 0);

  assert.ok(heavyAmr.id in result.deliveriesByRobotType);
  assert.ok(courier.id in result.deliveriesByRobotType);
});

test('Heterogeneous Simulation: Vector evasion prevents severe inter-robot overlap across 7200 ticks', () => {
  const topology = generateFacilityTopology(mockFacility);
  const heavyAmr = SEED_ROBOTS.find((r) => r.id === 'dmr-carrier-p')!;
  const courier = SEED_ROBOTS.find((r) => r.id === 'ronavi-sr')!;

  const fleetConfig: FleetCompositionItem[] = [
    {
      robot: heavyAmr,
      count: 2,
      totalThroughputPerHour: 20,
      totalCapexRub: 8000000,
      totalAnnualOpexRub: 800000,
      fiveYearTcoRub: 12000000,
    },
    {
      robot: courier,
      count: 2,
      totalThroughputPerHour: 200,
      totalCapexRub: 2000000,
      totalAnnualOpexRub: 200000,
      fiveYearTcoRub: 3000000,
    },
  ];

  const engine = new SimulationEngine(topology, fleetConfig);
  engine.initializeFleet();

  const dtSim = 0.5;
  const ticks = 7200;

  for (let tick = 0; tick < ticks; tick++) {
    engine.update(dtSim);

    for (let i = 0; i < engine.agents.length; i++) {
      for (let j = i + 1; j < engine.agents.length; j++) {
        const a1 = engine.agents[i];
        const a2 = engine.agents[j];
        const dist = Math.hypot(a1.x - a2.x, a1.y - a2.y);
        const minAllowed = (a1.robotRadius + a2.robotRadius) * 0.4;

        assert.ok(
          dist >= minAllowed,
          `Tick ${tick}: Agent ${a1.id} (r=${a1.robotRadius}) and Agent ${a2.id} (r=${a2.robotRadius}) severe collision: d=${dist.toFixed(4)} < minAllowed=${minAllowed.toFixed(4)}`
        );
      }
    }
  }
});

test('Heterogeneous Simulation: Backward compatibility with single robot legacy signature', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const fleetSize = 3;

  const engine = new SimulationEngine(topology, robot, fleetSize);

  assert.equal(engine.agents.length, 3);
  assert.equal(engine.fleetSize, 3);

  const result = engine.runOneHourSimulation(40);
  assert.equal(result.simulatedSeconds, 3600);
  assert.equal(result.totalTicks, 7200);
  assert.ok(result.realizedThroughputPerHour >= 0);
  assert.ok(robot.id in result.deliveriesByRobotType);
});
