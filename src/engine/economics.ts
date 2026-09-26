import type { FacilityRequirements } from '../types/facility.js';
import type { Robot } from '../types/robot.js';
import type { FacilityTopology } from '../types/topology.js';
import { generateFacilityTopology } from './topology_generator.js';
import { SimulationEngine } from './simulation_engine.js';

// ==========================================
// 1. ТИПЫ И ИНТЕРФЕЙСЫ ФИНАНСОВОЙ МОДЕЛИ
// ==========================================

export interface WhatIfParams {
  salaryChangePercent: number;     // e.g. -30 to +50%
  throughputChangePercent: number; // e.g. 50 to 200% (100% = номинал)
  capexDiscountPercent: number;    // e.g. 0 to 30%
}

export const DEFAULT_WHAT_IF_PARAMS: WhatIfParams = {
  salaryChangePercent: 0,
  throughputChangePercent: 100,
  capexDiscountPercent: 0,
};

export type FeasibilityVerdict = 'green' | 'yellow' | 'red';

export interface AnnualCashFlow {
  year: number;
  manualOpexRub: number;
  robotOpexRub: number;
  grossSavingsRub: number;
  taxShieldRub: number;
  netCashFlowRub: number;
  discountFactor: number;
  discountedCashFlowRub: number;
  cumulativeDcfRub: number;
}

export interface ScenarioMetrics {
  title: string;
  capex: number;
  grossCapex: number;
  subsidyDeductionRub: number;
  annualOpex: number;
  netAnnualSavings: number;
  paybackYears: number | null;
  discountedPaybackYears: number | null;
  fiveYearRoi: number | null;
  fiveYearTco: number;
  npvRub: number;
  irrPercent: number | null;
  piRatio: number | null;
  cashFlows: AnnualCashFlow[];
  verdict: FeasibilityVerdict;
  verdictText: string;
}

export interface EconomicEvaluation {
  // Физико-эксплуатационные параметры
  fleetSize: number;
  chargersCount: number;
  availabilityCoeff: number;
  effectiveThroughput: number;
  effectiveSalary: number;
  manualStaffCount: number;
  retainedSupervisorsCount: number;
  trafficEfficiencyEta: number;
  totalFleetThroughput: number;
  quotaFulfilledPercent: number;
  isQuotaDeficit: boolean;

  // Энергетика и инфраструктура
  annualEnergyKwh: number;
  annualEnergyCostRub: number;
  infrastructureCapexRub: number;
  integrationCapexRub: number;

  // 3 сценария реализации автоматизации
  asIs: ScenarioMetrics;
  capexPurchase: ScenarioMetrics;
  raas: ScenarioMetrics;

  // Стресс-тест сценарии чувствительности (Sensitivity Analysis)
  conservativeScenario: ScenarioMetrics;
  optimisticScenario: ScenarioMetrics;

  recommendedScenario: 'asIs' | 'capexPurchase' | 'raas';
}

// ==========================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ЧИСЛЕННЫЕ АЛГОРИТМЫ
// ==========================================

/**
 * Вычисление внутренней нормы доходности (IRR) методом Ньютона-Рафсона.
 */
export function calculateIrr(
  initialInvestment: number,
  cashFlows: number[],
  maxIterations: number = 100,
  tolerance: number = 1e-6
): number | null {
  if (initialInvestment <= 0 || cashFlows.length === 0) return null;

  // Проверка смены знака (необходимое условие существования корня IRR)
  const totalInflow = cashFlows.reduce((acc, cf) => acc + cf, 0);
  if (totalInflow <= initialInvestment) return null;

  let rate = 0.15; // Начальное приближение 15%

  for (let iter = 0; iter < maxIterations; iter++) {
    let npv = -initialInvestment;
    let dNpv = 0; // Производная по rate

    for (let t = 0; t < cashFlows.length; t++) {
      const year = t + 1;
      const denom = Math.pow(1 + rate, year);
      npv += cashFlows[t] / denom;
      dNpv -= (year * cashFlows[t]) / (denom * (1 + rate));
    }

    if (Math.abs(npv) < tolerance) {
      return Math.round(rate * 10000) / 100; // в процентах с 2 знаками
    }

    if (Math.abs(dNpv) < 1e-9) break;

    const nextRate = rate - npv / dNpv;
    if (nextRate <= -0.99 || isNaN(nextRate)) break;
    rate = nextRate;
  }

  return rate > 0 && rate < 10 ? Math.round(rate * 10000) / 100 : null;
}

/**
 * Дисконтированный срок окупаемости (DPP) с дробной интерполяцией.
 */
export function calculateDpp(capex: number, discountedCashFlows: number[]): number | null {
  if (capex <= 0) return 0;
  let cumulative = 0;

  for (let i = 0; i < discountedCashFlows.length; i++) {
    const prev = cumulative;
    cumulative += discountedCashFlows[i];

    if (cumulative >= capex) {
      const needed = capex - prev;
      const frac = needed / discountedCashFlows[i];
      return Math.round((i + frac) * 10) / 10;
    }
  }

  return null;
}

/**
 * Коэффициент технической готовности флота (k_avail).
 */
export function calculateAvailabilityCoefficient(
  batteryRuntimeHours: number,
  batteryChargeMinutes: number
): number {
  if (batteryRuntimeHours <= 0) return 0.5;
  const chargeHours = Math.max(0, batteryChargeMinutes) / 60;
  return Math.round((batteryRuntimeHours / (batteryRuntimeHours + chargeHours)) * 100) / 100;
}

/**
 * Расчёт необходимого парка с учётом готовности батарей и топологического трафика.
 */
export function calculateFleetSize(
  targetThroughputPerHour: number,
  robotThroughputPerHour: number,
  kAvail: number,
  etaTraffic: number = 0.92
): number {
  if (robotThroughputPerHour <= 0 || kAvail <= 0 || targetThroughputPerHour <= 0) {
    return 1;
  }
  const effectiveRobotCapacity = robotThroughputPerHour * kAvail * Math.max(0.5, etaTraffic);
  return Math.max(1, Math.ceil(targetThroughputPerHour / effectiveRobotCapacity));
}

// ==========================================
// 3. СКВОЗНОЙ DCF-ДВИЖОК РАСЧЁТА ТЭО
// ==========================================

export function calculateEconomics(
  facility: FacilityRequirements,
  robot: Robot,
  whatIf: WhatIfParams = DEFAULT_WHAT_IF_PARAMS,
  customTopology?: FacilityTopology
): EconomicEvaluation {
  // 1. Извлечение параметров с дефолтами из Блока 1, 4 и 5
  const insuranceTaxRate = ((facility as any).insuranceRatePct ?? 30.2) / 100;
  const hrOverheadRate = ((facility as any).hrOverheadPct ?? 10.0) / 100;
  const energyTariffRubKwh = (facility as any).energyTariffRubKwh ?? 7.5;
  const wacc = ((facility as any).waccPct ?? 18.0) / 100;
  const wageInflationRate = ((facility as any).fotIndexationPct ?? 8.0) / 100;
  const energyInflationRate = 0.06; // Отраслевой рост тарифов 6%
  const integrationMarkupRate = ((facility as any).integrationMarkupPct ?? 15.0) / 100;
  const stateSubsidyRate = ((facility as any).stateSubsidyPct ?? 0.0) / 100;
  const shiftsPerDay = Math.max(1, Math.min(3, facility.shiftsPerDay || 2));
  const operatingHoursPerYear = shiftsPerDay * 8 * 250; // 250 рабочих смен в год

  // 2. Применение параметров What-If
  const effectiveThroughput = Math.max(
    1,
    facility.targetThroughputPerHour * (whatIf.throughputChangePercent / 100)
  );
  const effectiveSalary = Math.max(
    0,
    facility.averageWorkerSalaryRub * (1 + whatIf.salaryChangePercent / 100)
  );
  const capexDiscountFactor = Math.max(0, 1 - whatIf.capexDiscountPercent / 100);

  // 3. Кинематика и определение парка
  const availabilityCoeff = calculateAvailabilityCoefficient(
    robot.batteryRuntimeHours,
    robot.batteryChargeMinutes
  );

  // Определение потерь на перекрёстках (traffic efficiency eta)
  let trafficEfficiencyEta = 0.92;
  try {
    const topology = customTopology && customTopology.nodes.length > 0
      ? customTopology
      : generateFacilityTopology(facility);
    const simEngine = new SimulationEngine(topology, robot, 2);
    const simResult = simEngine.runHeadlessFastForward(1200, 0.5);
    if (simResult.trafficEfficiencyEta > 0) {
      trafficEfficiencyEta = simResult.trafficEfficiencyEta;
    }
  } catch {
    trafficEfficiencyEta = 0.92;
  }

  const nominalFleetSize = calculateFleetSize(
    effectiveThroughput,
    robot.throughputPerHour,
    availabilityCoeff,
    trafficEfficiencyEta
  );

  const fleetSize = nominalFleetSize;
  const chargersCount = Math.max(1, Math.ceil(fleetSize * (1 - availabilityCoeff) * 1.15));

  // 4. Расчёт структуры CAPEX
  const robotsHardwareCapex = fleetSize * robot.capexCostRub;
  const chargerUnitCostRub = 280000; // Быстрый промышленный пост зарядки
  const chargingInfrastructureCapex = chargersCount * chargerUnitCostRub;
  const serverAndSoftwareCapex = 1200000; // Сервер RMS + лицензии шлюзов WMS
  const baseHardwareCapex = robotsHardwareCapex + chargingInfrastructureCapex + serverAndSoftwareCapex;

  const integrationCapexRub = Math.round(baseHardwareCapex * integrationMarkupRate);
  const grossCapexRub = Math.round((baseHardwareCapex + integrationCapexRub) * capexDiscountFactor);
  const subsidyDeductionRub = Math.round(grossCapexRub * stateSubsidyRate);
  const netCapexRub = Math.max(0, grossCapexRub - subsidyDeductionRub);

  // 5. Расчёт параметров базового сценария As-Is (ручной труд)
  // Норматив: 1 рабочий обрабатывает ~12 паллет/час
  const workersPerShift = Math.max(1, Math.ceil(effectiveThroughput / 12));
  // Коэффициент замещения 1.15 (отпуска, больничные, сменный график 2/2)
  const manualStaffCount = Math.ceil(workersPerShift * shiftsPerDay * 1.15);

  const loadedWorkerAnnualSalaryRub =
    effectiveSalary * 12 * (1 + insuranceTaxRate) * (1 + hrOverheadRate);
  // Эксплуатация ручной техники (рохли, ричтраки, ТО, аренда) ~15% от ФОТ
  const manualEquipmentOpexRub = manualStaffCount * 140000;
  const baseManualAnnualOpex = Math.round(manualStaffCount * loadedWorkerAnnualSalaryRub + manualEquipmentOpexRub);

  // 6. Расчёт параметров роботизированного сценария (CAPEX-покупка)
  // 1 оператор RMS / супервайзер на смену
  const retainedSupervisorsCount = 1 * shiftsPerDay;
  const supervisorAnnualOpex = Math.round(
    retainedSupervisorsCount * (effectiveSalary * 1.25) * 12 * (1 + insuranceTaxRate) * (1 + hrOverheadRate)
  );

  // Энергопотребление: средняя мощность ~0.85 кВт на робота
  const robotPowerKw = 0.85;
  const annualEnergyKwh = Math.round(fleetSize * robotPowerKw * operatingHoursPerYear * 0.8);
  const annualEnergyCostRub = Math.round(annualEnergyKwh * energyTariffRubKwh);

  // Сервисный контракт (SLA) и регламентное ТО
  const robotMaintenanceAnnualRub = fleetSize * robot.annualOpexCostRub;
  const serverSupportAnnualRub = 350000;

  const baseRobotAnnualOpex = Math.round(
    supervisorAnnualOpex + annualEnergyCostRub + robotMaintenanceAnnualRub + serverSupportAnnualRub
  );

  // 7. Построение многолетней таблицы денежных потоков (5 лет DCF)
  const buildCashFlows = (capexVal: number, manualBase: number, robotBase: number, waccVal: number): {
    flows: AnnualCashFlow[];
    npv: number;
    dpp: number | null;
    irr: number | null;
    fiveYearSavings: number;
  } => {
    const flows: AnnualCashFlow[] = [];
    let cumulativeDcf = -capexVal;
    let totalDiscountedInflows = 0;
    let totalGrossSavings = 0;
    const netCashFlowsArray: number[] = [];

    for (let t = 1; t <= 5; t++) {
      // Раздельная индексация затрат
      const manualOpex = Math.round(manualBase * Math.pow(1 + wageInflationRate, t - 1));
      const robotLabor = supervisorAnnualOpex * Math.pow(1 + wageInflationRate, t - 1);
      const robotEnergy = annualEnergyCostRub * Math.pow(1 + energyInflationRate, t - 1);
      const robotMaint = (robotMaintenanceAnnualRub + serverSupportAnnualRub) * Math.pow(1 + 0.05, t - 1);
      const robotOpex = Math.round(robotLabor + robotEnergy + robotMaint);

      const grossSavings = manualOpex - robotOpex;
      totalGrossSavings += grossSavings;

      // Амортизационный налоговый щит (линейная амортизация 5 лет, ставка налога на прибыль 20%)
      const annualDepreciation = capexVal / 5;
      const taxShield = Math.round(annualDepreciation * 0.20);
      const netCashFlow = grossSavings + taxShield;
      netCashFlowsArray.push(netCashFlow);

      const discountFactor = 1 / Math.pow(1 + waccVal, t);
      const discountedCashFlow = Math.round(netCashFlow * discountFactor);
      totalDiscountedInflows += discountedCashFlow;
      cumulativeDcf += discountedCashFlow;

      flows.push({
        year: t,
        manualOpexRub: manualOpex,
        robotOpexRub: robotOpex,
        grossSavingsRub: grossSavings,
        taxShieldRub: taxShield,
        netCashFlowRub: netCashFlow,
        discountFactor: Math.round(discountFactor * 1000) / 1000,
        discountedCashFlowRub: discountedCashFlow,
        cumulativeDcfRub: cumulativeDcf,
      });
    }

    const npv = Math.round(totalDiscountedInflows - capexVal);
    const dcfList = flows.map((f) => f.discountedCashFlowRub);
    const dpp = calculateDpp(capexVal, dcfList);
    const irr = calculateIrr(capexVal, netCashFlowsArray);

    return { flows, npv, dpp, irr, fiveYearSavings: totalGrossSavings };
  };

  const capexDcf = buildCashFlows(netCapexRub, baseManualAnnualOpex, baseRobotAnnualOpex, wacc);

  // 8. Формирование сценария As-Is
  const asIsFiveYearTco = Math.round(
    Array.from({ length: 5 }).reduce<number>(
      (acc, _, i) => acc + baseManualAnnualOpex * Math.pow(1 + wageInflationRate, i),
      0
    )
  );

  const asIs: ScenarioMetrics = {
    title: 'Базовый (Как есть — ручной труд)',
    capex: 0,
    grossCapex: 0,
    subsidyDeductionRub: 0,
    annualOpex: baseManualAnnualOpex,
    netAnnualSavings: 0,
    paybackYears: null,
    discountedPaybackYears: null,
    fiveYearRoi: null,
    fiveYearTco: asIsFiveYearTco,
    npvRub: 0,
    irrPercent: null,
    piRatio: null,
    cashFlows: [],
    verdict: 'yellow',
    verdictText: 'Текущий операционный базис без инвестиций',
  };

  // 9. Формирование сценария CAPEX-покупки
  const capexSimplePayback =
    capexDcf.flows[0].grossSavingsRub > 0
      ? Math.round((netCapexRub / capexDcf.flows[0].grossSavingsRub) * 10) / 10
      : null;

  const capexFiveYearRoi =
    netCapexRub > 0 ? Math.round(((capexDcf.fiveYearSavings - netCapexRub) / netCapexRub) * 100) : null;

  const capexFiveYearTco = netCapexRub + capexDcf.flows.reduce((acc, f) => acc + f.robotOpexRub, 0);
  const piRatio = netCapexRub > 0 ? Math.round(((capexDcf.npv + netCapexRub) / netCapexRub) * 100) / 100 : null;

  let capexVerdict: FeasibilityVerdict = 'red';
  let capexVerdictText = 'Низкая инвестиционная отдача при текущей стоимости капитала';

  if (capexDcf.npv > 0 && capexDcf.dpp !== null && capexDcf.dpp <= 3.5) {
    capexVerdict = 'green';
    capexVerdictText = 'Высокоэффективный инвестиционный проект (NPV > 0, DPP < 3.5 лет)';
  } else if (capexDcf.npv > 0 || (capexSimplePayback !== null && capexSimplePayback <= 4.5)) {
    capexVerdict = 'yellow';
    capexVerdictText = 'Умеренная эффективность. Чувствителен к WACC и индексации ФОТ';
  }

  const capexPurchase: ScenarioMetrics = {
    title: 'Покупка робототехнического комплекса (CAPEX)',
    capex: netCapexRub,
    grossCapex: grossCapexRub,
    subsidyDeductionRub,
    annualOpex: baseRobotAnnualOpex,
    netAnnualSavings: capexDcf.flows[0].grossSavingsRub,
    paybackYears: capexSimplePayback,
    discountedPaybackYears: capexDcf.dpp,
    fiveYearRoi: capexFiveYearRoi,
    fiveYearTco: capexFiveYearTco,
    npvRub: capexDcf.npv,
    irrPercent: capexDcf.irr,
    piRatio,
    cashFlows: capexDcf.flows,
    verdict: capexVerdict,
    verdictText: capexVerdictText,
  };

  // 10. Формирование сценария RaaS (сервисная подписка)
  const raasRobotAnnualCost = fleetSize * robot.monthlyRaasCostRub * 12;
  const baseRaasAnnualOpex = Math.round(raasRobotAnnualCost + supervisorAnnualOpex + annualEnergyCostRub);
  const raasNetAnnualSavings = baseManualAnnualOpex - baseRaasAnnualOpex;

  const raasDcf = buildCashFlows(0, baseManualAnnualOpex, baseRaasAnnualOpex, wacc);
  const raasFiveYearTco = raasDcf.flows.reduce((acc, f) => acc + f.robotOpexRub, 0);

  let raasVerdict: FeasibilityVerdict = 'red';
  let raasVerdictText = 'Подписка превышает расходы на ручной труд';

  if (raasNetAnnualSavings > 0) {
    raasVerdict = 'green';
    raasVerdictText = 'Положительный чистый денежный поток с первого месяца без первоначального CAPEX';
  }

  const raas: ScenarioMetrics = {
    title: 'Роботизация как сервис (RaaS-подписка)',
    capex: 0,
    grossCapex: 0,
    subsidyDeductionRub: 0,
    annualOpex: baseRaasAnnualOpex,
    netAnnualSavings: raasNetAnnualSavings,
    paybackYears: 0,
    discountedPaybackYears: 0,
    fiveYearRoi: null,
    fiveYearTco: raasFiveYearTco,
    npvRub: raasDcf.npv,
    irrPercent: null,
    piRatio: null,
    cashFlows: raasDcf.flows,
    verdict: raasVerdict,
    verdictText: raasVerdictText,
  };

  // 11. Стресс-тест сценарии (Conservative & Optimistic)
  const conservativeCapex = Math.round(netCapexRub * 1.12);
  const conservativeManual = Math.round(baseManualAnnualOpex * 0.95);
  const conservativeRobot = Math.round(baseRobotAnnualOpex * 1.10);
  const conservativeDcf = buildCashFlows(conservativeCapex, conservativeManual, conservativeRobot, wacc + 0.03);

  const conservativeScenario: ScenarioMetrics = {
    title: 'Консервативный (Stress-тест: WACC +3%, CAPEX +12%)',
    capex: conservativeCapex,
    grossCapex: Math.round(grossCapexRub * 1.12),
    subsidyDeductionRub,
    annualOpex: conservativeRobot,
    netAnnualSavings: conservativeDcf.flows[0]?.grossSavingsRub ?? 0,
    paybackYears: calculateDpp(conservativeCapex, conservativeDcf.flows.map((f) => f.grossSavingsRub)),
    discountedPaybackYears: conservativeDcf.dpp,
    fiveYearRoi: Math.round(((conservativeDcf.fiveYearSavings - conservativeCapex) / conservativeCapex) * 100),
    fiveYearTco: conservativeCapex + conservativeDcf.flows.reduce((acc, f) => acc + f.robotOpexRub, 0),
    npvRub: conservativeDcf.npv,
    irrPercent: conservativeDcf.irr,
    piRatio: Math.round(((conservativeDcf.npv + conservativeCapex) / conservativeCapex) * 100) / 100,
    cashFlows: conservativeDcf.flows,
    verdict: conservativeDcf.npv > 0 ? 'yellow' : 'red',
    verdictText: conservativeDcf.npv > 0 ? 'Устойчив к стресс-факторам' : 'Высокий риск при ухудшении макросреды',
  };

  const optimisticCapex = Math.round(netCapexRub * 0.92);
  const optimisticManual = Math.round(baseManualAnnualOpex * 1.08);
  const optimisticRobot = Math.round(baseRobotAnnualOpex * 0.95);
  const optimisticDcf = buildCashFlows(optimisticCapex, optimisticManual, optimisticRobot, Math.max(0.08, wacc - 0.03));

  const optimisticScenario: ScenarioMetrics = {
    title: 'Оптимистичный (WACC -3%, субсидии, опережающий ФОТ)',
    capex: optimisticCapex,
    grossCapex: Math.round(grossCapexRub * 0.92),
    subsidyDeductionRub,
    annualOpex: optimisticRobot,
    netAnnualSavings: optimisticDcf.flows[0]?.grossSavingsRub ?? 0,
    paybackYears: calculateDpp(optimisticCapex, optimisticDcf.flows.map((f) => f.grossSavingsRub)),
    discountedPaybackYears: optimisticDcf.dpp,
    fiveYearRoi: Math.round(((optimisticDcf.fiveYearSavings - optimisticCapex) / optimisticCapex) * 100),
    fiveYearTco: optimisticCapex + optimisticDcf.flows.reduce((acc, f) => acc + f.robotOpexRub, 0),
    npvRub: optimisticDcf.npv,
    irrPercent: optimisticDcf.irr,
    piRatio: Math.round(((optimisticDcf.npv + optimisticCapex) / optimisticCapex) * 100) / 100,
    cashFlows: optimisticDcf.flows,
    verdict: 'green',
    verdictText: 'Сверхвысокая доходность на инвестированный капитал',
  };

  // 12. Логика выбора финальной рекомендации
  let recommendedScenario: 'asIs' | 'capexPurchase' | 'raas' = 'asIs';

  if (capexPurchase.verdict === 'green') {
    recommendedScenario = capexPurchase.fiveYearTco <= raas.fiveYearTco ? 'capexPurchase' : 'raas';
  } else if (raas.verdict === 'green') {
    recommendedScenario = 'raas';
  } else if (capexPurchase.verdict === 'yellow') {
    recommendedScenario = capexPurchase.fiveYearTco < asIs.fiveYearTco ? 'capexPurchase' : 'asIs';
  } else {
    recommendedScenario = 'asIs';
  }

  const totalFleetThroughput = fleetSize * robot.throughputPerHour * availabilityCoeff;
  const quotaFulfilledPercent = Math.round((totalFleetThroughput / effectiveThroughput) * 100);

  return {
    fleetSize,
    chargersCount,
    availabilityCoeff,
    effectiveThroughput,
    effectiveSalary,
    manualStaffCount,
    retainedSupervisorsCount,
    trafficEfficiencyEta,
    totalFleetThroughput,
    quotaFulfilledPercent,
    isQuotaDeficit: quotaFulfilledPercent < 90,
    annualEnergyKwh,
    annualEnergyCostRub,
    infrastructureCapexRub: chargingInfrastructureCapex + serverAndSoftwareCapex,
    integrationCapexRub,
    asIs,
    capexPurchase,
    raas,
    conservativeScenario,
    optimisticScenario,
    recommendedScenario,
  };
}

/**
 * Совместимость с мульти-роботными парками
 */
export function calculateCompositionEconomics(
  facility: FacilityRequirements,
  composition: Array<{
    robot: Robot;
    count: number;
    totalThroughputPerHour: number;
    totalCapexRub: number;
    totalAnnualOpexRub: number;
    fiveYearTcoRub: number;
  }>,
  whatIf: WhatIfParams = DEFAULT_WHAT_IF_PARAMS
): EconomicEvaluation {
  if (!composition || composition.length === 0) {
    throw new Error('Composition cannot be empty');
  }
  // Используем ведущего робота в качестве бенчмарка для сквозного DCF
  const primaryItem = composition[0];
  const evalResult = calculateEconomics(facility, primaryItem.robot, whatIf);
  return evalResult;
}
