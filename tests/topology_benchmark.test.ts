import test from 'node:test';
import assert from 'node:assert';
import { generateFacilityTopology } from '../src/engine/topology_generator.js';
import type { FacilityRequirements } from '../src/types/facility.js';

test('Topology Generation Benchmark', () => {
  const largeWarehouseReq: FacilityRequirements = {
    industry: 'warehouse',
    totalAreaSqm: 500000, // 500,000 sqm large facility
    aisleWidthM: 2.0,
    ceilingHeightM: 10,
    operatingTempRange: { min: -10, max: 40 },
    shiftsPerDay: 3,
    hoursPerDay: 24,
    requiredPayloadKg: 1000,
    targetThroughputPerHour: 500,
    averageWorkerSalaryRub: 80000,
  };

  const iterations = 50;
  const startTime = performance.now();

  let totalNodes = 0;
  let totalEdges = 0;

  for (let i = 0; i < iterations; i++) {
    const topology = generateFacilityTopology(largeWarehouseReq);
    totalNodes += topology.nodes.length;
    totalEdges += topology.edges.length;
  }

  const endTime = performance.now();
  const totalDurationMs = endTime - startTime;
  const avgDurationMs = totalDurationMs / iterations;

  console.log(`\n================ BENCHMARK RESULTS (BASELINE) ================`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Nodes per topology: ${totalNodes / iterations}`);
  console.log(`Edges per topology: ${totalEdges / iterations}`);
  console.log(`Total execution time: ${totalDurationMs.toFixed(2)} ms`);
  console.log(`Average time per generation: ${avgDurationMs.toFixed(4)} ms`);
  console.log(`==============================================================\n`);

  assert.ok(totalNodes > 0);
  assert.ok(totalEdges > 0);
});
