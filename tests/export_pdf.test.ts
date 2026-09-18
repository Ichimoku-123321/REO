import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { generateFeasibilityPdf } from '../src/engine/export_pdf.js';
import { calculateEconomics, DEFAULT_WHAT_IF_PARAMS } from '../src/engine/economics.js';
import { SEED_ROBOTS } from '../src/data/robots.seed.js';
import type { FacilityRequirements } from '../src/types/facility.js';
import type { ProjectExportData } from '../src/engine/export_types.js';
import type { SpectralAnalysisResult } from '../src/engine/spectral_analyzer.js';
import { MANDATORY_LEGAL_DISCLAIMER } from '../src/engine/export_types.js';

// Base mock facility setup
const mockWarehouseFacility: FacilityRequirements = {
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

const mockRobot = SEED_ROBOTS.find((r) => r.id === 'ronavi-h1500')!;
const baseEconomics = calculateEconomics(mockWarehouseFacility, mockRobot, DEFAULT_WHAT_IF_PARAMS);

const baseExportData: ProjectExportData = {
  projectTitle: 'Инвестиционный отчет ТЭО',
  facility: mockWarehouseFacility,
  selectedRobot: mockRobot,
  fleetSize: baseEconomics.fleetSize,
  economicEvaluation: baseEconomics,
  whatIf: DEFAULT_WHAT_IF_PARAMS,
  generatedAt: new Date('2025-01-15T10:00:00'),
  version: 'СППР v1.0',
};

// Helper function to intercept jsPDF API methods and track document creation and text/line/font/save operations
function spyPdfExecution(exportData: ProjectExportData) {
  const textCalls: { text: string | string[]; x: number; y: number; options?: any }[] = [];
  const lineCalls: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const fontCalls: { name: string; style?: string }[] = [];
  const fontSizeCalls: number[] = [];
  let saveFilename = '';

  const api = jsPDF.API as any;

  // Intercept text calls via jsPDF.API postProcessText event
  const textHandler = (args: any) => {
    let rawText = args.text;
    if (Array.isArray(rawText)) {
      rawText = rawText.map((t: any) => (Array.isArray(t) ? t[0] : t)).join(' ');
    }
    textCalls.push({ text: rawText, x: args.x, y: args.y, options: args.options });
  };
  api.events.push(['postProcessText', textHandler]);

  // Intercept method calls on jsPDF.API
  const originalLine = api.line;
  const originalSetFont = api.setFont;
  const originalSetFontSize = api.setFontSize;
  const originalSave = api.save;

  api.line = function (this: any, x1: any, y1: any, x2: any, y2: any) {
    lineCalls.push({ x1, y1, x2, y2 });
    return originalLine ? originalLine.call(this, x1, y1, x2, y2) : this;
  };

  api.setFont = function (this: any, name: any, style?: any) {
    fontCalls.push({ name, style });
    return originalSetFont ? originalSetFont.call(this, name, style) : this;
  };

  api.setFontSize = function (this: any, size: any) {
    fontSizeCalls.push(size);
    return originalSetFontSize ? originalSetFontSize.call(this, size) : this;
  };

  api.save = function (this: any, filename?: any, options?: any): any {
    saveFilename = filename || '';
    return this;
  };

  try {
    generateFeasibilityPdf(exportData);
  } finally {
    // Restore original API methods and cleanup handler
    api.line = originalLine;
    api.setFont = originalSetFont;
    api.setFontSize = originalSetFontSize;
    api.save = originalSave;

    const idx = api.events.findIndex((e: any) => e[0] === 'postProcessText' && e[1] === textHandler);
    if (idx !== -1) {
      api.events.splice(idx, 1);
    }
  }

  return {
    textCalls,
    lineCalls,
    fontCalls,
    fontSizeCalls,
    saveFilename,
  };
}

test('PDF Export: Generates report with correct structure, headers, sections, and legal disclaimer', () => {
  const result = spyPdfExecution(baseExportData);

  // Verify title and header
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('INVESTMENT FEASIBILITY REPORT (EXPRESS-TEO)')),
    'Report title missing'
  );
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('Project / Facility: WAREHOUSE (Склад / Логистика)')),
    'Facility header missing or improperly translated'
  );
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('Platform Version: СППР v1.0')),
    'Platform version missing'
  );

  // Verify Executive Summary section
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('1. Executive Summary & Verdict')),
    'Section 1 header missing'
  );
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('Feasibility Verdict Status:')),
    'Verdict status line missing'
  );
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('Recommended Scenario:')),
    'Recommended scenario line missing'
  );

  // Verify Specifications & Financial Sections
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('2. Facility & Equipment Specifications')),
    'Section 2 header missing'
  );
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('3. 3-Scenario Financial Comparison')),
    'Section 3 header missing'
  );
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('4. Topological Risk & Spectral Assessment')),
    'Section 4 header missing'
  );

  // Verify Footer Disclaimer
  assert.ok(
    result.textCalls.some((c) => c.text === MANDATORY_LEGAL_DISCLAIMER),
    'Mandatory legal disclaimer missing in footer'
  );

  // Verify line separator
  assert.ok(result.lineCalls.some((l) => l.x1 === 14 && l.y1 === 40 && l.x2 === 196 && l.y2 === 40), 'Header separator line missing');

  // Verify save filename format
  assert.ok(result.saveFilename.startsWith('Feasibility_Report_warehouse_'), `Save filename unexpected: ${result.saveFilename}`);
  assert.ok(result.saveFilename.endsWith('.pdf'), `Save filename should end with .pdf: ${result.saveFilename}`);
});

test('PDF Export: Correctly formats all verdict status labels (green, yellow, red)', () => {
  const verdicts: Array<{ verdict: 'green' | 'yellow' | 'red'; expectedLabel: string }> = [
    { verdict: 'green', expectedLabel: 'ЗЕЛЕНЫЙ (ВЫСОКОЭФФЕКТИВНО)' },
    { verdict: 'yellow', expectedLabel: 'ЖЕЛТЫЙ (УМЕРЕННАЯ ЦЕЛЕСООБРАЗНОСТЬ)' },
    { verdict: 'red', expectedLabel: 'КРАСНЫЙ (НЕ РЕКОМЕНДУЕТСЯ)' },
  ];

  for (const { verdict, expectedLabel } of verdicts) {
    const customData: ProjectExportData = {
      ...baseExportData,
      economicEvaluation: {
        ...baseEconomics,
        capexPurchase: {
          ...baseEconomics.capexPurchase,
          verdict,
        },
      },
    };

    const result = spyPdfExecution(customData);
    assert.ok(
      result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes(`Feasibility Verdict Status: ${expectedLabel}`)),
      `Expected verdict label for ${verdict} to be "${expectedLabel}"`
    );
  }
});

test('PDF Export: Correctly formats all recommended scenario labels (capexPurchase, raas, default)', () => {
  const scenarios: Array<{ recommendedScenario: 'capexPurchase' | 'raas' | 'asIs'; expectedLabel: string }> = [
    { recommendedScenario: 'capexPurchase', expectedLabel: 'Покупка в собственность (CAPEX)' },
    { recommendedScenario: 'raas', expectedLabel: 'Подписка на роботов (RaaS)' },
    { recommendedScenario: 'asIs', expectedLabel: 'Базовый (Как есть)' },
  ];

  for (const { recommendedScenario, expectedLabel } of scenarios) {
    const customData: ProjectExportData = {
      ...baseExportData,
      economicEvaluation: {
        ...baseEconomics,
        recommendedScenario,
      },
    };

    const result = spyPdfExecution(customData);
    assert.ok(
      result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes(`Recommended Scenario: ${expectedLabel}`)),
      `Expected recommended scenario label for ${recommendedScenario} to be "${expectedLabel}"`
    );
  }
});

test('PDF Export: Handles optional and null financial metrics gracefully', () => {
  const customData: ProjectExportData = {
    ...baseExportData,
    economicEvaluation: {
      ...baseEconomics,
      capexPurchase: {
        ...baseEconomics.capexPurchase,
        paybackYears: null as any,
        fiveYearRoi: null as any,
        verdictText: '',
      },
    },
  };

  const result = spyPdfExecution(customData);
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('CAPEX Payback Period: N/A | 5-Year ROI: N/A')),
    'Expected N/A fallback for null paybackYears and fiveYearRoi'
  );
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('Recommendation Details: —')),
    'Expected dash fallback for empty verdictText'
  );
});

test('PDF Export: Renders topological risk section when spectralResult is present', () => {
  const spectralResult: SpectralAnalysisResult = {
    algebraicConnectivity: 0.12,
    status: 'CRITICAL',
    criticalNodeIds: ['node_5', 'node_12'],
    recommendation: 'Добавить параллельный межстеллажный проезд',
  };

  const customData: ProjectExportData = {
    ...baseExportData,
    spectralResult,
  };

  const result = spyPdfExecution(customData);

  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('Algebraic Connectivity (lambda_2): 0.120 (Status: CRITICAL)')),
    'Spectral connectivity line missing'
  );
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('Topology Recommendation: Добавить параллельный межстеллажный проезд')),
    'Spectral recommendation line missing'
  );
  assert.ok(
    result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes('Critical Bottleneck Nodes Identified: node_5, node_12')),
    'Critical bottleneck nodes line missing'
  );
});

test('PDF Export: Renders optimal connectivity fallback when spectralResult is undefined', () => {
  const customData: ProjectExportData = {
    ...baseExportData,
    spectralResult: undefined,
  };

  const result = spyPdfExecution(customData);

  assert.ok(
    result.textCalls.some(
      (c) => typeof c.text === 'string' && c.text.includes('Spectral graph bottleneck analysis verified optimal connectivity (lambda_2 >= 0.35).')
    ),
    'Optimal connectivity fallback message missing when spectralResult is undefined'
  );
});

test('PDF Export: Translates facility industry types correctly', () => {
  const industries: Array<{ industry: 'warehouse' | 'airport' | 'hospital' | 'custom'; expectedTranslation: string }> = [
    { industry: 'warehouse', expectedTranslation: 'Склад / Логистика' },
    { industry: 'airport', expectedTranslation: 'Аэропорт / Багажный терминал' },
    { industry: 'hospital', expectedTranslation: 'Медицинский стационар' },
    { industry: 'custom', expectedTranslation: 'Пользовательский объект' },
  ];

  for (const { industry, expectedTranslation } of industries) {
    const customData: ProjectExportData = {
      ...baseExportData,
      facility: {
        ...mockWarehouseFacility,
        industry,
      },
    };

    const result = spyPdfExecution(customData);
    assert.ok(
      result.textCalls.some((c) => typeof c.text === 'string' && c.text.includes(`(${expectedTranslation})`)),
      `Expected industry translation for ${industry} to be "${expectedTranslation}"`
    );
  }
});
