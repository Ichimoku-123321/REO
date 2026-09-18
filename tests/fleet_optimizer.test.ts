import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { FacilityRequirements } from '../src/types/facility.js';
import type { Robot } from '../src/types/robot.js';
import { optimizeFleetComposition } from '../src/engine/fleet_optimizer.js';

describe('Fleet Optimizer (src/engine/fleet_optimizer.ts)', () => {
  const baseFacility: FacilityRequirements = {
    industry: 'warehouse',
    totalAreaSqm: 5000,
    aisleWidthM: 2.5,
    ceilingHeightM: 8,
    operatingTempRange: { min: 0, max: 35 },
    shiftsPerDay: 2,
    hoursPerDay: 16,
    requiredPayloadKg: 500,
    targetThroughputPerHour: 300,
    averageWorkerSalaryRub: 70000,
  };

  const robotA: Robot = {
    id: 'robot-a',
    vendor: 'VendorA',
    model: 'Model A (Standard)',
    supportedIndustries: ['warehouse'],
    operationType: 'transport',
    payloadKg: 600,
    maxSpeedMps: 1.5,
    dimensionsMm: { length: 1000, width: 800, height: 1200 },
    minAisleWidthMm: 2000,
    navigationType: 'lidar_slam',
    batteryRuntimeHours: 8,
    batteryChargeMinutes: 120, // k_avail = 8 / (8 + 2) = 0.8
    operatingTempRange: { min: -10, max: 40 },
    throughputPerHour: 30, // Effective = 30 * 0.8 = 24 pcs/h
    capexCostRub: 2000000,
    annualOpexCostRub: 150000,
    monthlyRaasCostRub: 80000,
  };

  const robotB: Robot = {
    id: 'robot-b',
    vendor: 'VendorB',
    model: 'Model B (Heavy Duty)',
    supportedIndustries: ['warehouse'],
    operationType: 'transport',
    payloadKg: 1000,
    maxSpeedMps: 2.0,
    dimensionsMm: { length: 1200, width: 1000, height: 1500 },
    minAisleWidthMm: 2200,
    navigationType: 'lidar_slam',
    batteryRuntimeHours: 10,
    batteryChargeMinutes: 120, // k_avail = 10 / (10 + 2) = 0.8333
    operatingTempRange: { min: -5, max: 45 },
    throughputPerHour: 100, // Effective = 100 * (10/12) = 83.33 pcs/h
    capexCostRub: 5000000,
    annualOpexCostRub: 300000,
    monthlyRaasCostRub: 180000,
  };

  const robotIneligible: Robot = {
    id: 'robot-ineligible',
    vendor: 'VendorX',
    model: 'Model X (Small)',
    supportedIndustries: ['warehouse'],
    operationType: 'transport',
    payloadKg: 200, // Меньше требуемых 500 кг
    maxSpeedMps: 1.0,
    dimensionsMm: { length: 800, width: 600, height: 800 },
    minAisleWidthMm: 1500,
    navigationType: 'qr_code',
    batteryRuntimeHours: 6,
    batteryChargeMinutes: 60,
    operatingTempRange: { min: 10, max: 30 },
    throughputPerHour: 20,
    capexCostRub: 1000000,
    annualOpexCostRub: 80000,
    monthlyRaasCostRub: 40000,
  };

  it('должен возвращать fallback при отсутствии подходящих роботов', () => {
    const result = optimizeFleetComposition(baseFacility, [robotIneligible]);

    assert.strictEqual(result.isHeterogeneous, false);
    assert.strictEqual(result.composition.length, 0);
    assert.strictEqual(result.totalFleetSize, 0);
    assert.strictEqual(result.totalThroughputPerHour, 0);
    assert.strictEqual(result.fiveYearTcoRub, 0);
    assert.strictEqual(result.tcoSavingsPercentVsBestMono, 0);
    assert.strictEqual(result.bestMonoRobotId, '');
    assert.strictEqual(result.bestMonoTcoRub, 0);
  });

  it('должен выбирать монофлот, если комбинация не дает выгоды > 5%', () => {
    const result = optimizeFleetComposition(baseFacility, [robotA, robotB]);

    assert.strictEqual(result.isHeterogeneous, false);
    assert.strictEqual(result.composition.length, 1);
    assert.ok(result.totalFleetSize > 0);
    assert.ok(result.fiveYearTcoRub > 0);
    assert.strictEqual(result.tcoSavingsPercentVsBestMono, 0);
    assert.strictEqual(result.bestMonoRobotId, result.composition[0].robot.id);
  });

  it('должен выбирать гетерогенный флот, когда связка роботов дает экономию TCO > 5%', () => {
    // Сценарий с выверенными математическими параметрами:
    // TargetQ = 1000 pcs/h
    // Robot C: throughput = 400, singleUnitTco = 10M
    //   Mono C count = ceil(1000/400) = 3 -> TCO = 30M
    // Robot D: throughput = 100, singleUnitTco = 3M
    //   Mono D count = ceil(1000/100) = 10 -> TCO = 30M
    // Mix (2 C + 2 D): 2 * 400 + 2 * 100 = 1000 Q -> TCO = 2 * 10M + 2 * 3M = 26M
    // Экономия TCO = (30M - 26M) / 30M = 13.33% (> 5%)

    const robotC: Robot = {
      id: 'robot-c',
      vendor: 'VendorHeavy',
      model: 'Heavy Hauler',
      supportedIndustries: ['warehouse'],
      operationType: 'transport',
      payloadKg: 1000,
      maxSpeedMps: 2.0,
      dimensionsMm: { length: 1500, width: 1200, height: 1800 },
      minAisleWidthMm: 2400,
      navigationType: 'lidar_slam',
      batteryRuntimeHours: 10,
      batteryChargeMinutes: 0, // k_avail = 1.0
      operatingTempRange: { min: -10, max: 40 },
      throughputPerHour: 400,
      capexCostRub: 6000000,
      annualOpexCostRub: 620000,
      monthlyRaasCostRub: 300000,
    };

    const robotD: Robot = {
      id: 'robot-d',
      vendor: 'VendorLight',
      model: 'Light Runner',
      supportedIndustries: ['warehouse'],
      operationType: 'transport',
      payloadKg: 500,
      maxSpeedMps: 1.8,
      dimensionsMm: { length: 900, width: 700, height: 1000 },
      minAisleWidthMm: 1800,
      navigationType: 'lidar_slam',
      batteryRuntimeHours: 8,
      batteryChargeMinutes: 0, // k_avail = 1.0
      operatingTempRange: { min: -10, max: 40 },
      throughputPerHour: 100,
      capexCostRub: 2000000,
      annualOpexCostRub: 140000,
      monthlyRaasCostRub: 80000,
    };

    const facilityHighThroughput: FacilityRequirements = {
      ...baseFacility,
      targetThroughputPerHour: 1000,
    };

    const result = optimizeFleetComposition(facilityHighThroughput, [robotC, robotD]);

    assert.strictEqual(result.isHeterogeneous, true);
    assert.strictEqual(result.composition.length, 2);
    assert.ok(result.tcoSavingsPercentVsBestMono >= 5.0);
    assert.strictEqual(result.bestMonoTcoRub, 30000000);
    assert.strictEqual(result.fiveYearTcoRub, 26000000);
    assert.ok(result.totalThroughputPerHour >= 1000);
  });

  it('стресс-тест производительности: 100 прогонов выполняются быстрее 50 мс', () => {
    // Создаем массив из 30 разнообразных моделей роботов
    const robots30: Robot[] = Array.from({ length: 30 }, (_, index) => ({
      id: `robot-bench-${index}`,
      vendor: `Vendor-${index}`,
      model: `Model-${index}`,
      supportedIndustries: ['warehouse'],
      operationType: 'transport',
      payloadKg: 500 + index * 50,
      maxSpeedMps: 1.0 + (index % 5) * 0.2,
      dimensionsMm: { length: 1000, width: 800, height: 1200 },
      minAisleWidthMm: 1800 + (index % 3) * 100,
      navigationType: 'lidar_slam',
      batteryRuntimeHours: 6 + (index % 4),
      batteryChargeMinutes: 60 + (index % 3) * 30,
      operatingTempRange: { min: -10, max: 40 },
      throughputPerHour: 20 + index * 5,
      capexCostRub: 1500000 + index * 300000,
      annualOpexCostRub: 100000 + index * 20000,
      monthlyRaasCostRub: 60000 + index * 10000,
    }));

    // Прогрев JIT
    optimizeFleetComposition(baseFacility, robots30);

    const startTime = performance.now();
    const ITERATIONS = 100;

    for (let i = 0; i < ITERATIONS; i++) {
      optimizeFleetComposition(baseFacility, robots30);
    }

    const duration = performance.now() - startTime;
    console.log(`Время выполнения ${ITERATIONS} итераций optimization: ${duration.toFixed(2)} мс`);

    assert.ok(
      duration < 50,
      `Стресс-тест производительности превысил 50 мс: фактически ${duration.toFixed(2)} мс`
    );
  });
});
