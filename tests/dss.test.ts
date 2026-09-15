import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility } from '../src/engine/dss.js';
import { SEED_ROBOTS } from '../src/data/robots.seed.js';
import type { FacilityRequirements } from '../src/types/facility.js';

test('DSS: Warehouse pallet flow accepts Ronavi H1500 and rejects light robots', () => {
  const warehouseReqs: FacilityRequirements = {
    industry: 'warehouse',
    totalAreaSqm: 2500,
    aisleWidthM: 1.8,
    ceilingHeightM: 6.0,
    operatingTempRange: { min: 10, max: 20 },
    shiftsPerDay: 2,
    hoursPerDay: 16,
    requiredPayloadKg: 1000,
    targetThroughputPerHour: 50,
    averageWorkerSalaryRub: 80000,
  };

  const results = evaluateEligibility(warehouseReqs, SEED_ROBOTS);
  const eligible = results.filter((r) => r.result.isEligible);
  const eligibleIds = eligible.map((r) => r.robot.id);

  assert.ok(eligibleIds.includes('ronavi-h1500'), 'Ronavi H1500 should be eligible');
  assert.ok(!eligibleIds.includes('pudubot-2'), 'PuduBot 2 must be excluded (payload + industry)');
  assert.ok(!eligibleIds.includes('moros-amr-100'), 'Moros AMR 100 must be excluded (payload)');
});

test('DSS: Strict aisle constraint excludes wide equipment', () => {
  const narrowWarehouse: FacilityRequirements = {
    industry: 'warehouse',
    totalAreaSqm: 1000,
    aisleWidthM: 1.5, // 1500 mm
    ceilingHeightM: 4.0,
    operatingTempRange: { min: 15, max: 25 },
    shiftsPerDay: 1,
    hoursPerDay: 8,
    requiredPayloadKg: 1200,
    targetThroughputPerHour: 20,
    averageWorkerSalaryRub: 75000,
  };

  const results = evaluateEligibility(narrowWarehouse, SEED_ROBOTS);
  const dmr = results.find((r) => r.robot.id === 'dmr-carrier-p');

  assert.ok(dmr);
  assert.equal(dmr.result.isEligible, false);
  assert.ok(
    dmr.result.exclusionReasons.some((msg) => msg.includes('Ширина проезда')),
    'Should contain Russian aisle width reason'
  );
});

test('DSS: Sub-zero cold storage allows only Stelcon shuttle and Evocargo', () => {
  const coldStorage: FacilityRequirements = {
    industry: 'warehouse',
    totalAreaSqm: 3000,
    aisleWidthM: 4.0,
    ceilingHeightM: 8.0,
    operatingTempRange: { min: -25, max: -10 },
    shiftsPerDay: 2,
    hoursPerDay: 16,
    requiredPayloadKg: 1000,
    targetThroughputPerHour: 30,
    averageWorkerSalaryRub: 90000,
  };

  const results = evaluateEligibility(coldStorage, SEED_ROBOTS);
  const eligible = results.filter((r) => r.result.isEligible);
  const eligibleIds = eligible.map((r) => r.robot.id);

  assert.ok(eligibleIds.includes('stelcon-pallet-shuttle'));
  assert.ok(!eligibleIds.includes('ronavi-h1500'), 'Standard indoor AMR cannot operate at -25C');
});
