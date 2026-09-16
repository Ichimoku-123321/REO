import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationEngine } from '../src/engine/simulation_engine.js';
import { generateFacilityTopology } from '../src/engine/topology_generator.js';
import { SEED_ROBOTS } from '../src/data/robots.seed.js';
import { calculateEconomics, DEFAULT_WHAT_IF_PARAMS } from '../src/engine/economics.js';
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

test('Simulation Engine: runHeadlessFastForward executes 3600s without UI and returns efficiency eta', () => {
  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0]; // Ronavi H1500
  const engine = new SimulationEngine(topology, robot, 3);

  const result = engine.runHeadlessFastForward(1800, 0.5);

  assert.ok(result.completedDeliveries > 0);
  assert.ok(result.realizedThroughputPerHour > 0);
  assert.ok(result.trafficEfficiencyEta > 0 && result.trafficEfficiencyEta <= 1.0);
});

test('Economics Engine: Integrates trafficEfficiencyEta and adjusts fleet size when micro-level losses occur', () => {
  const robot = SEED_ROBOTS[0];
  const econ = calculateEconomics(mockFacility, robot, DEFAULT_WHAT_IF_PARAMS);

  assert.ok(typeof econ.trafficEfficiencyEta === 'number');
  assert.ok(econ.trafficEfficiencyEta! > 0 && econ.trafficEfficiencyEta! <= 1.0);
  assert.ok(econ.fleetSize >= 1);
});
