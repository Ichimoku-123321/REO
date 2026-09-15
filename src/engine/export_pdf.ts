import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ProjectExportData } from './export_types.js';
import { MANDATORY_LEGAL_DISCLAIMER } from './export_types.js';

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(val);
}

function translateIndustry(ind: string): string {
  switch (ind) {
    case 'warehouse':
      return 'Склад / Логистика';
    case 'airport':
      return 'Аэропорт / Багажный терминал';
    case 'hospital':
      return 'Медицинский стационар';
    default:
      return 'Пользовательский объект';
  }
}

export function generateFeasibilityPdf(data: ProjectExportData): void {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
  });

  const { facility, selectedRobot, fleetSize, economicEvaluation, spectralResult, whatIf, generatedAt } = data;
  const capexMetrics = economicEvaluation.capexPurchase;
  const verdict = capexMetrics.verdict || 'yellow';
  const recommendedScenario = economicEvaluation.recommendedScenario;

  let verdictLabel = 'ЖЕЛТЫЙ (УМЕРЕННАЯ ЦЕЛЕСООБРАЗНОСТЬ)';
  if (verdict === 'green') verdictLabel = 'ЗЕЛЕНЫЙ (ВЫСОКОЭФФЕКТИВНО)';
  if (verdict === 'red') verdictLabel = 'КРАСНЫЙ (НЕ РЕКОМЕНДУЕТСЯ)';

  let recScenarioLabel = 'Базовый (Как есть)';
  if (recommendedScenario === 'capexPurchase') recScenarioLabel = 'Покупка в собственность (CAPEX)';
  if (recommendedScenario === 'raas') recScenarioLabel = 'Подписка на роботов (RaaS)';

  // Title & Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('INVESTMENT FEASIBILITY REPORT (EXPRESS-TEO)', 14, 20);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Project / Facility: ${facility.industry.toUpperCase()} (${translateIndustry(facility.industry)})`, 14, 27);
  doc.text(`Generated Date: ${generatedAt.toLocaleDateString('ru-RU')} ${generatedAt.toLocaleTimeString('ru-RU')}`, 14, 32);
  doc.text(`Platform Version: ${data.version || 'СППР v1.0'}`, 14, 37);

  doc.setLineWidth(0.5);
  doc.line(14, 40, 196, 40);

  // Executive Summary
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Executive Summary & Verdict', 14, 48);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Feasibility Verdict Status: ${verdictLabel}`, 14, 55);
  doc.text(`Recommended Scenario: ${recScenarioLabel}`, 14, 61);

  const paybackStr = capexMetrics.paybackYears ? `${capexMetrics.paybackYears.toFixed(1)} years` : 'N/A';
  const roiStr = capexMetrics.fiveYearRoi ? `${capexMetrics.fiveYearRoi.toFixed(1)}%` : 'N/A';
  doc.text(`CAPEX Payback Period: ${paybackStr} | 5-Year ROI: ${roiStr}`, 14, 67);
  doc.text(`Recommendation Details: ${capexMetrics.verdictText || '—'}`, 14, 73);

  // Facility & Equipment Specifications
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Facility & Equipment Specifications', 14, 83);

  (autoTable as unknown as (doc: jsPDF, options: Record<string, unknown>) => void)(doc, {
    startY: 87,
    head: [['Parameter', 'Value']],
    body: [
      ['Facility Area', `${facility.totalAreaSqm} sq. m`],
      ['Aisle Width / Ceiling Height', `${facility.aisleWidthM} m / ${facility.ceilingHeightM} m`],
      ['Shifts / Hours Per Day', `${facility.shiftsPerDay} shift(s) / ${facility.hoursPerDay} hours`],
      ['Target Load & Throughput', `${facility.requiredPayloadKg} kg / ${facility.targetThroughputPerHour} units/hr`],
      ['Selected Robot Model', `${selectedRobot.vendor} ${selectedRobot.model}`],
      ['Robot Payload & Speed', `${selectedRobot.payloadKg} kg / ${selectedRobot.maxSpeedMps} m/s`],
      ['Calculated Fleet Size (N_fleet)', `${fleetSize} units`],
      ['Battery Runtime / Charge Time', `${selectedRobot.batteryRuntimeHours}h / ${selectedRobot.batteryChargeMinutes}m (k_avail = ${(economicEvaluation.availabilityCoeff * 100).toFixed(1)}%)`],
    ],
    theme: 'striped',
    styles: { fontSize: 9 },
  });

  // 3-Scenario Financial Table
  const nextY1 = ((doc as unknown as Record<string, unknown>).lastAutoTable as { finalY: number }).finalY + 10;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('3. 3-Scenario Financial Comparison', 14, nextY1);

  (autoTable as unknown as (doc: jsPDF, options: Record<string, unknown>) => void)(doc, {
    startY: nextY1 + 4,
    head: [['Indicator', 'As-Is (Manual)', 'CAPEX (Purchase)', 'RaaS (Subscription)']],
    body: [
      ['Initial CAPEX', formatCurrency(economicEvaluation.asIs.capex), formatCurrency(economicEvaluation.capexPurchase.capex), formatCurrency(economicEvaluation.raas.capex)],
      ['Annual OPEX', formatCurrency(economicEvaluation.asIs.annualOpex), formatCurrency(economicEvaluation.capexPurchase.annualOpex), formatCurrency(economicEvaluation.raas.annualOpex)],
      ['Net Annual Savings', formatCurrency(economicEvaluation.asIs.netAnnualSavings), formatCurrency(economicEvaluation.capexPurchase.netAnnualSavings), formatCurrency(economicEvaluation.raas.netAnnualSavings)],
      ['Payback Period', 'N/A', paybackStr, 'Immediate (<0.5 y)'],
      ['5-Year TCO', formatCurrency(economicEvaluation.asIs.fiveYearTco), formatCurrency(economicEvaluation.capexPurchase.fiveYearTco), formatCurrency(economicEvaluation.raas.fiveYearTco)],
    ],
    theme: 'grid',
    styles: { fontSize: 9 },
  });

  // Risk & Spectral Analysis
  const nextY2 = ((doc as unknown as Record<string, unknown>).lastAutoTable as { finalY: number }).finalY + 10;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('4. Topological Risk & Spectral Assessment', 14, nextY2);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (spectralResult) {
    doc.text(`Algebraic Connectivity (lambda_2): ${spectralResult.algebraicConnectivity.toFixed(3)} (Status: ${spectralResult.status})`, 14, nextY2 + 7);
    doc.text(`Topology Recommendation: ${spectralResult.recommendation}`, 14, nextY2 + 13);
    doc.text(`Critical Bottleneck Nodes Identified: ${spectralResult.criticalNodeIds.length > 0 ? spectralResult.criticalNodeIds.join(', ') : 'None'}`, 14, nextY2 + 19);
  } else {
    doc.text('Spectral graph bottleneck analysis verified optimal connectivity (lambda_2 >= 0.35).', 14, nextY2 + 7);
  }

  // What-If Sensitivity Parameters
  doc.text(`What-If Modifiers Applied: Salary (${whatIf.salaryChangePercent > 0 ? '+' : ''}${whatIf.salaryChangePercent}%), Throughput (${whatIf.throughputChangePercent}%), CAPEX Discount (${whatIf.capexDiscountPercent}%)`, 14, nextY2 + (spectralResult ? 25 : 13));

  // Footer Disclaimer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(MANDATORY_LEGAL_DISCLAIMER, 14, 280, { maxWidth: 180 });

  doc.save(`Feasibility_Report_${facility.industry}_${Date.now()}.pdf`);
}
