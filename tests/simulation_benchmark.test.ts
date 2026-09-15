import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'perf_hooks';
import { SimulationEngine } from '../src/engine/simulation_engine.js';
import { generateFacilityTopology } from '../src/engine/topology_generator.js';
import { SEED_ROBOTS } from '../src/data/robots.seed.js';
import type { FacilityRequirements } from '../src/types/facility.js';

test('Simulation Engine Benchmark: Measure 10,000 update ticks performance', () => {
  const mockFacility: FacilityRequirements = {
    industry: 'warehouse',
    totalAreaSqm: 50000,
    aisleWidthM: 2.0,
    ceilingHeightM: 6.0,
    operatingTempRange: { min: 10, max: 25 },
    shiftsPerDay: 3,
    hoursPerDay: 24,
    requiredPayloadKg: 800,
    targetThroughputPerHour: 500,
    averageWorkerSalaryRub: 80000,
  };

  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const fleetSize = 100;

  const engine = new SimulationEngine(topology, robot, fleetSize);

  const iterations = 10000;
  const dtSim = 1.0;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    engine.update(dtSim);
  }
  const end = performance.now();

  const durationMs = end - start;
  console.log(`[BENCHMARK RESULT] Executed ${iterations} ticks in ${durationMs.toFixed(2)} ms`);

  assert.ok(durationMs > 0, 'Duration should be positive');
});
