import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAvailabilityCoefficient,
  calculateFleetSize,
  calculateEconomics,
  DEFAULT_WHAT_IF_PARAMS,
} from '../src/engine/economics.js';
import type { FacilityRequirements } from '../src/types/facility.js';
import type { Robot } from '../src/types/robot.js';

const mockFacility: FacilityRequirements = {
  industry: 'warehouse',
  totalAreaSqm: 5000,
  aisleWidthM: 3.0,
  ceilingHeightM: 8.0,
  operatingTempRange: { min: 0, max: 40 },
  shiftsPerDay: 2,
  hoursPerDay: 16,
  requiredPayloadKg: 500,
  targetThroughputPerHour: 100,
  averageWorkerSalaryRub: 80000,
};

const mockRobot: Robot = {
  id: 'test-robot-1',
  vendor: 'Test Vendor',
  model: 'Test Model 1000',
  supportedIndustries: ['warehouse'],
  operationType: 'transport',
  payloadKg: 1000,
  maxSpeedMps: 1.5,
  dimensionsMm: { length: 1200, width: 800, height: 1500 },
  minAisleWidthMm: 2000,
  navigationType: 'lidar_slam',
  batteryRuntimeHours: 8,
  batteryChargeMinutes: 120, // 2 hours charge -> k_avail = 8 / (8 + 2) = 0.8
  operatingTempRange: { min: -10, max: 45 },
  throughputPerHour: 30, // 30 * 0.8 = 24 effective throughput per robot
  capexCostRub: 2_000_000,
  annualOpexCostRub: 150_000,
  monthlyRaasCostRub: 80_000,
  energyConsumptionKw: 1.5,
  maxFloorUnevennessMm: 5,
  mtbfOperatingHours: 10000,
};

describe('Economic Engine Tests', () => {
  it('calculates availability coefficient k_avail correctly', () => {
    // 8 hrs runtime, 120 mins (2 hrs) charge -> 8 / 10 = 0.8
    const kAvail = calculateAvailabilityCoefficient(8, 120);
    assert.equal(kAvail, 0.8);
  });

  it('calculates fleet size correctly', () => {
    // target = 100, robot throughput = 30, k_avail = 0.8 -> capacity per robot = 24
    // fleet size = ceil(100 / 24) = ceil(4.166) = 5
    const kAvail = calculateAvailabilityCoefficient(8, 120);
    const fleetSize = calculateFleetSize(100, 30, kAvail);
    assert.equal(fleetSize, 5);
  });

  it('calculates baseline manual labor costs (As-Is)', () => {
    // Target throughput = 100
    // Staff_manual = max(1, ceil(100 / 12) * 2) = ceil(8.33) * 2 = 9 * 2 = 18 staff
    // Annual OPEX = 18 * 80000 * 1.30 * 12 = 22,464,000 RUB
    const econ = calculateEconomics(mockFacility, mockRobot, DEFAULT_WHAT_IF_PARAMS);
    assert.equal(econ.manualStaffCount, 18);
    assert.equal(econ.asIs.capex, 0);
    assert.equal(econ.asIs.annualOpex, 22_464_000);
    assert.equal(econ.asIs.fiveYearTco, 22_464_000 * 5);
  });

  it('calculates Scenario 2 Purchase CAPEX, Payback, ROI, and Verdict correctly', () => {
    const econ = calculateEconomics(mockFacility, mockRobot, DEFAULT_WHAT_IF_PARAMS);

    const expectedCapex = econ.fleetSize * mockRobot.capexCostRub * 1.15;
    const supervisorAnnualOpex = 2 * 80_000 * 1.30 * 12; // 2,496,000
    const expectedAnnualOpex = econ.fleetSize * mockRobot.annualOpexCostRub + supervisorAnnualOpex;
    const expectedNetSavings = econ.asIs.annualOpex - expectedAnnualOpex;

    assert.equal(econ.capexPurchase.capex, expectedCapex);
    assert.equal(econ.capexPurchase.annualOpex, expectedAnnualOpex);
    assert.equal(econ.capexPurchase.netAnnualSavings, expectedNetSavings);
    assert.ok(econ.capexPurchase.paybackYears !== null);
    assert.ok(econ.capexPurchase.paybackYears! <= 5.0);
  });

  it('calculates Scenario 3 RaaS correctly', () => {
    const econ = calculateEconomics(mockFacility, mockRobot, DEFAULT_WHAT_IF_PARAMS);

    const supervisorAnnualOpex = 2 * 80_000 * 1.30 * 12; // 2,496,000
    const expectedRaasAnnualOpex = econ.fleetSize * mockRobot.monthlyRaasCostRub * 12 + supervisorAnnualOpex;
    const expectedRaasFiveYearTco = expectedRaasAnnualOpex * 5;

    assert.equal(econ.raas.capex, 0);
    assert.equal(econ.raas.annualOpex, expectedRaasAnnualOpex);
    assert.equal(econ.raas.fiveYearTco, expectedRaasFiveYearTco);
  });

  it('handles What-If parameter modifications accurately', () => {
    const econ = calculateEconomics(mockFacility, mockRobot, {
      salaryChangePercent: 10,
      throughputChangePercent: 100,
      capexDiscountPercent: 20,
    });

    const expectedCapex = econ.fleetSize * mockRobot.capexCostRub * 1.15 * 0.8;
    assert.equal(econ.capexPurchase.capex, expectedCapex);
  });
});
