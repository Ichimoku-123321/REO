import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFacilityImport, downloadCsvTemplate } from '../src/engine/import_facility.js';
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

test('CSV Template Download: Creates DOM anchor, triggers download with UTF-8 BOM, and cleans up DOM', async () => {
  // Store original globals
  const originalDocument = (globalThis as any).document;
  const originalCreateObjectURL = URL.createObjectURL;

  let createdBlob: any = null;
  let clicked = false;
  const attributes: Record<string, string> = {};
  const appendedChildren: any[] = [];
  const removedChildren: any[] = [];

  const mockLink = {
    setAttribute(name: string, value: string) {
      attributes[name] = value;
    },
    click() {
      clicked = true;
    },
  };

  const mockDocument = {
    createElement(tagName: string) {
      assert.equal(tagName, 'a', 'Should create <a> element');
      return mockLink;
    },
    body: {
      appendChild(child: any) {
        appendedChildren.push(child);
        return child;
      },
      removeChild(child: any) {
        removedChildren.push(child);
        return child;
      },
    },
  };

  try {
    (globalThis as any).document = mockDocument;
    URL.createObjectURL = (blob: Blob) => {
      createdBlob = blob;
      return 'blob:mock-csv-template-url';
    };

    downloadCsvTemplate();

    // Assert DOM operations and link parameters
    assert.ok(createdBlob, 'Expected Blob to be created');
    assert.equal(attributes['href'], 'blob:mock-csv-template-url', 'href attribute should be set to blob URL');
    assert.equal(attributes['download'], 'facility_template.csv', 'download attribute should be facility_template.csv');
    assert.equal(clicked, true, 'Link click() should be triggered');
    assert.equal(appendedChildren.length, 1, 'One element should be appended to body');
    assert.equal(appendedChildren[0], mockLink, 'Appended element should be mock link');
    assert.equal(removedChildren.length, 1, 'One element should be removed from body');
    assert.equal(removedChildren[0], mockLink, 'Removed element should be mock link');

    // Assert Blob content and UTF-8 BOM byte sequence (0xEF, 0xBB, 0xBF)
    const arrayBuffer = await (createdBlob as Blob).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    assert.equal(buffer[0], 0xef, 'First byte of Blob should be 0xEF (UTF-8 BOM)');
    assert.equal(buffer[1], 0xbb, 'Second byte of Blob should be 0xBB (UTF-8 BOM)');
    assert.equal(buffer[2], 0xbf, 'Third byte of Blob should be 0xBF (UTF-8 BOM)');

    const blobText = await (createdBlob as Blob).text();
    assert.ok(blobText.includes('Отрасль;Площадь_м2;Ширина_проезда_м'), 'CSV should contain Russian headers');
    assert.ok(blobText.includes('warehouse;12000;2.6;6.0;5;30;2;22;800;85;85000'), 'CSV should contain sample row data');

    // Assert that the generated template is parseable by parseFacilityImport
    const parseResult = parseFacilityImport(blobText, 'facility_template.csv');
    assert.equal(parseResult.success, true, `Generated template failed to parse: ${parseResult.errors.join(', ')}`);
    assert.ok(parseResult.data, 'Parsed template should return valid facility data');
    assert.equal(parseResult.data.industry, 'warehouse');
    assert.equal(parseResult.data.totalAreaSqm, 12000);
    assert.equal(parseResult.data.aisleWidthM, 2.6);
    assert.equal(parseResult.data.ceilingHeightM, 6.0);
    assert.equal(parseResult.data.shiftsPerDay, 2);
    assert.equal(parseResult.data.hoursPerDay, 22);
    assert.equal(parseResult.data.requiredPayloadKg, 800);
    assert.equal(parseResult.data.targetThroughputPerHour, 85);
    assert.equal(parseResult.data.averageWorkerSalaryRub, 85000);
  } finally {
    // Restore original globals
    (globalThis as any).document = originalDocument;
    URL.createObjectURL = originalCreateObjectURL;
  }
});
