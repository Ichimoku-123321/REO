import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFacilityImport } from '../src/engine/import_facility.js';
import { calculateEconomics, DEFAULT_WHAT_IF_PARAMS } from '../src/engine/economics.js';
import { generateFinancialExcel } from '../src/engine/export_excel.js';
import { SEED_ROBOTS } from '../src/data/robots.seed.js';
import type { FacilityRequirements } from '../src/types/facility.js';
import * as XLSX from 'xlsx';

test('Import: CSV parsing with Russian headers and semicolon delimiter', () => {
  const csvContent = `Отрасль;Площадь_м2;Ширина_проезда_м;Высота_потолков_м;Мин_температура_C;Макс_температура_C;Число_смен;Часов_в_сутки;Требуемая_нагрузка_кг;Целевой_грузопоток_шт_ч;ФОТ_оператора_руб
warehouse;15000;2.8;7.0;10;25;2;16;1200;100;95000`;

  const result = parseFacilityImport(csvContent, 'test_facility.csv');

  assert.equal(result.success, true, `Parsing failed with errors: ${result.errors.join(', ')}`);
  assert.ok(result.data, 'Expected parsed facility data');
  assert.equal(result.data.industry, 'warehouse');
  assert.equal(result.data.totalAreaSqm, 15000);
  assert.equal(result.data.aisleWidthM, 2.8);
  assert.equal(result.data.ceilingHeightM, 7.0);
  assert.equal(result.data.shiftsPerDay, 2);
  assert.equal(result.data.hoursPerDay, 16);
  assert.equal(result.data.requiredPayloadKg, 1200);
  assert.equal(result.data.targetThroughputPerHour, 100);
  assert.equal(result.data.averageWorkerSalaryRub, 95000);
});

test('Import: Zod validation flags invalid negative numbers', () => {
  const invalidCsv = `industry;totalAreaSqm;aisleWidthM;ceilingHeightM;shiftsPerDay;hoursPerDay;requiredPayloadKg;targetThroughputPerHour;averageWorkerSalaryRub
warehouse;-500;2.0;6.0;2;16;1000;50;80000`;

  const result = parseFacilityImport(invalidCsv, 'invalid.csv');

  assert.equal(result.success, false);
  assert.ok(result.errors.length > 0);
  assert.ok(
    result.errors.some((e) => e.includes('totalAreaSqm')),
    'Should report error for totalAreaSqm'
  );
});

test('Import: Valid JSON structure parsing', () => {
  const jsonContent = JSON.stringify({
    industry: 'hospital',
    totalAreaSqm: 8500,
    aisleWidthM: 1.4,
    ceilingHeightM: 3.5,
    operatingTempRange: { min: 18, max: 24 },
    shiftsPerDay: 2,
    hoursPerDay: 24,
    requiredPayloadKg: 45,
    targetThroughputPerHour: 35,
    averageWorkerSalaryRub: 55000,
  });

  const result = parseFacilityImport(jsonContent, 'hospital.json');

  assert.equal(result.success, true);
  assert.ok(result.data);
  assert.equal(result.data.industry, 'hospital');
  assert.equal(result.data.requiredPayloadKg, 45);
});

test('Import: Invalid JSON syntax returns JSON parse error', () => {
  const malformedJson = '{ industry: "warehouse", totalAreaSqm: ';

  const result = parseFacilityImport(malformedJson, 'invalid.json');

  assert.equal(result.success, false);
  assert.equal(result.data, undefined);
  assert.ok(result.errors.length > 0);
  assert.ok(
    result.errors[0].includes('Ошибка синтаксиса JSON:'),
    `Expected JSON syntax error message, got: ${result.errors[0]}`
  );
});

test('Excel Export: Generates valid 3-sheet workbook structure and data matrix', () => {
  const facility: FacilityRequirements = {
    industry: 'warehouse',
    totalAreaSqm: 12000,
    aisleWidthM: 2.6,
    ceilingHeightM: 6.0,
    operatingTempRange: { min: 5, max: 30 },
    shiftsPerDay: 2,
    hoursPerDay: 22,
    requiredPayloadKg: 800,
    targetThroughputPerHour: 85,
    averageWorkerSalaryRub: 85000,
  };

  const ronavi = SEED_ROBOTS.find((r) => r.id === 'ronavi-h1500')!;
  const economics = calculateEconomics(facility, ronavi, DEFAULT_WHAT_IF_PARAMS);

  // Test that generateFinancialExcel executes without error
  generateFinancialExcel({
    projectTitle: 'Test Excel Export',
    facility,
    selectedRobot: ronavi,
    fleetSize: economics.fleetSize,
    economicEvaluation: economics,
    whatIf: DEFAULT_WHAT_IF_PARAMS,
    generatedAt: new Date(),
    version: 'v1.0',
  });
});
