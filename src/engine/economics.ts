import type { FacilityRequirements } from '../types/facility.js';
import type { Robot } from '../types/robot.js';
import { generateFacilityTopology } from './topology_generator.js';
import { SimulationEngine } from './simulation_engine.js';

export interface WhatIfParams {
  salaryChangePercent: number; // e.g., -30 to 50
  throughputChangePercent: number; // e.g., 50 to 200 (100 = nominal)
  capexDiscountPercent: number; // e.g., 0 to 30
}

export const DEFAULT_WHAT_IF_PARAMS: WhatIfParams = {
  salaryChangePercent: 0,
  throughputChangePercent: 100,
  capexDiscountPercent: 0,
};

export type FeasibilityVerdict = 'green' | 'yellow' | 'red';

export interface ScenarioMetrics {
  title: string;
  capex: number;
  annualOpex: number;
  netAnnualSavings: number;
  paybackYears: number | null;
  fiveYearRoi: number | null;
  fiveYearTco: number;
  verdict?: FeasibilityVerdict;
  verdictText?: string;
}

export interface EconomicEvaluation {
  fleetSize: number;
  availabilityCoeff: number;
  effectiveThroughput: number;
  effectiveSalary: number;
  manualStaffCount: number;
  retainedSupervisorsCount: number;
  trafficEfficiencyEta?: number;
  asIs: ScenarioMetrics;
  capexPurchase: ScenarioMetrics;
  raas: ScenarioMetrics;
  recommendedScenario: 'asIs' | 'capexPurchase' | 'raas';
}

/**
 * Calculates battery availability coefficient (k_avail)
 */
export function calculateAvailabilityCoefficient(
  batteryRuntimeHours: number,
  batteryChargeMinutes: number
): number {
  if (batteryRuntimeHours <= 0) return 0;
  const chargeHours = Math.max(0, batteryChargeMinutes) / 60;
  return batteryRuntimeHours / (batteryRuntimeHours + chargeHours);
}

/**
 * Calculates fleet size N_fleet required for target throughput
 */
export function calculateFleetSize(
  targetThroughputPerHour: number,
  robotThroughputPerHour: number,
  kAvail: number
): number {
  if (robotThroughputPerHour <= 0 || kAvail <= 0 || targetThroughputPerHour <= 0) {
    return 1;
  }
  const effectiveRobotCapacity = robotThroughputPerHour * kAvail;
  return Math.ceil(targetThroughputPerHour / effectiveRobotCapacity);
}

/**
 * Evaluates the 3 economic scenarios for a given robot and facility under optional What-If modifiers.
 */
export function calculateCompositionEconomics(
  facility: FacilityRequirements,
  composition: Array<{ robot: Robot; count: number; totalCapexRub: number; totalAnnualOpexRub: number; fiveYearTcoRub: number }>,
  whatIf: WhatIfParams = DEFAULT_WHAT_IF_PARAMS
): EconomicEvaluation {
  const effectiveThroughput = Math.max(
    1,
    facility.targetThroughputPerHour * (whatIf.throughputChangePercent / 100)
  );
  const effectiveSalary = Math.max(
    0,
    facility.averageWorkerSalaryRub * (1 + whatIf.salaryChangePercent / 100)
  );

  const totalFleetSize = composition.reduce((sum, item) => sum + item.count, 0);

  // Average availability coefficient across fleet items
  let totalKAvailWeighted = 0;
  composition.forEach((item) => {
    const kAvail = calculateAvailabilityCoefficient(
      item.robot.batteryRuntimeHours,
      item.robot.batteryChargeMinutes
    );
    totalKAvailWeighted += kAvail * item.count;
  });
  const availabilityCoeff = totalFleetSize > 0 ? totalKAvailWeighted / totalFleetSize : 1.0;

  // 1. As-Is Scenario
  const manualStaffCount = Math.max(
    1,
    Math.ceil(effectiveThroughput / 12) * facility.shiftsPerDay
  );
  const asIsAnnualOpex = manualStaffCount * effectiveSalary * 1.3 * 12;
  const asIsFiveYearTco = asIsAnnualOpex * 5;

  const asIs: ScenarioMetrics = {
    title: 'Базовый (Как есть)',
    capex: 0,
    annualOpex: asIsAnnualOpex,
    netAnnualSavings: 0,
    paybackYears: null,
    fiveYearRoi: null,
    fiveYearTco: asIsFiveYearTco,
  };

  // 2. CAPEX Purchase Scenario
  const capexPurchaseTotalCapex = composition.reduce((sum, item) => sum + item.totalCapexRub, 0);

  const retainedSupervisorsCount = 1 * facility.shiftsPerDay;
  const supervisorAnnualOpex = retainedSupervisorsCount * effectiveSalary * 1.3 * 12;
  const fleetAnnualOpex = composition.reduce((sum, item) => sum + item.totalAnnualOpexRub, 0);
  const capexPurchaseAnnualOpex = fleetAnnualOpex + supervisorAnnualOpex;

  const capexPurchaseNetSavings = asIsAnnualOpex - capexPurchaseAnnualOpex;
  const capexPurchaseFiveYearTco = capexPurchaseTotalCapex + capexPurchaseAnnualOpex * 5;

  let capexPaybackYears: number | null = null;
  let capexFiveYearRoi: number | null = null;
  let verdict: FeasibilityVerdict = 'red';
  let verdictText = 'Низкая окупаемость, ручной труд выгоднее';

  if (capexPurchaseNetSavings > 0 && capexPurchaseTotalCapex > 0) {
    capexPaybackYears = capexPurchaseTotalCapex / capexPurchaseNetSavings;
    capexFiveYearRoi =
      ((capexPurchaseNetSavings * 5 - capexPurchaseTotalCapex) / capexPurchaseTotalCapex) * 100;

    if (capexPaybackYears <= 3.0) {
      verdict = 'green';
      verdictText = 'Экономически высокоэффективно';
    } else if (capexPaybackYears <= 5.0) {
      verdict = 'yellow';
      verdictText = 'Умеренная окупаемость, рекомендуется рассмотреть RaaS';
    } else {
      verdict = 'red';
      verdictText = 'Низкая окупаемость, ручной труд выгоднее';
    }
  }

  const capexPurchase: ScenarioMetrics = {
    title: 'Покупка парка (CAPEX)',
    capex: capexPurchaseTotalCapex,
    annualOpex: capexPurchaseAnnualOpex,
    netAnnualSavings: capexPurchaseNetSavings,
    paybackYears: capexPaybackYears,
    fiveYearRoi: capexFiveYearRoi,
    fiveYearTco: capexPurchaseFiveYearTco,
    verdict,
    verdictText,
  };

  // 3. RaaS Scenario
  const raasRobotAnnualOpex = composition.reduce(
    (sum, item) => sum + item.count * item.robot.monthlyRaasCostRub * 12,
    0
  );
  const raasAnnualOpex = raasRobotAnnualOpex + supervisorAnnualOpex;
  const raasNetSavings = asIsAnnualOpex - raasAnnualOpex;
  const raasFiveYearTco = raasAnnualOpex * 5;

  const raas: ScenarioMetrics = {
    title: 'Сервисная модель (RaaS)',
    capex: 0,
    annualOpex: raasAnnualOpex,
    netAnnualSavings: raasNetSavings,
    paybackYears: null,
    fiveYearRoi: null,
    fiveYearTco: raasFiveYearTco,
  };

  let recommendedScenario: 'asIs' | 'capexPurchase' | 'raas' = 'asIs';
  const validCapex = capexPurchase.paybackYears !== null && capexPurchase.paybackYears <= 5.0;
  const validRaas = raas.netAnnualSavings > 0;

  if (validCapex && validRaas) {
    if (capexPurchase.fiveYearTco <= raas.fiveYearTco && capexPurchase.fiveYearTco < asIs.fiveYearTco) {
      recommendedScenario = 'capexPurchase';
    } else if (raas.fiveYearTco < asIs.fiveYearTco) {
      recommendedScenario = 'raas';
    } else {
      recommendedScenario = 'asIs';
    }
  } else if (validCapex) {
    recommendedScenario = capexPurchase.fiveYearTco < asIs.fiveYearTco ? 'capexPurchase' : 'asIs';
  } else if (validRaas) {
    recommendedScenario = raas.fiveYearTco < asIs.fiveYearTco ? 'raas' : 'asIs';
  } else {
    recommendedScenario = 'asIs';
  }

  return {
    fleetSize: totalFleetSize,
    availabilityCoeff,
    effectiveThroughput,
    effectiveSalary,
    manualStaffCount,
    retainedSupervisorsCount,
    trafficEfficiencyEta: 1.0,
    asIs,
    capexPurchase,
    raas,
    recommendedScenario,
  };
}

export function calculateEconomics(
  facility: FacilityRequirements,
  robot: Robot,
  whatIf: WhatIfParams = DEFAULT_WHAT_IF_PARAMS
): EconomicEvaluation {
  // Apply What-If parameters
  const effectiveThroughput = Math.max(
    1,
    facility.targetThroughputPerHour * (whatIf.throughputChangePercent / 100)
  );
  const effectiveSalary = Math.max(
    0,
    facility.averageWorkerSalaryRub * (1 + whatIf.salaryChangePercent / 100)
  );
  const capexDiscountFactor = Math.max(0, 1 - whatIf.capexDiscountPercent / 100);

  // Availability coefficient & Nominal fleet sizing
  const availabilityCoeff = calculateAvailabilityCoefficient(
    robot.batteryRuntimeHours,
    robot.batteryChargeMinutes
  );
  const nominalFleetSize = calculateFleetSize(
    effectiveThroughput,
    robot.throughputPerHour,
    availabilityCoeff
  );

  // Micro-simulation Headless Fast-Forward pass to derive real traffic efficiency factor eta
  let trafficEfficiencyEta = 1.0;
  try {
    const topology = generateFacilityTopology(facility);
    const simEngine = new SimulationEngine(topology, robot, nominalFleetSize);
    const simResult = simEngine.runHeadlessFastForward(1800, 0.5); // 30 min fast-forward pass
    if (simResult.trafficEfficiencyEta > 0) {
      trafficEfficiencyEta = simResult.trafficEfficiencyEta;
    }
  } catch (e) {
    // Fallback gracefully if topology generation or simulation engine encounters edge case
    trafficEfficiencyEta = 1.0;
  }

  // Adjusted Fleet Size incorporating micro-level traffic losses (eta)
  const fleetSize = Math.max(
    nominalFleetSize,
    Math.ceil(nominalFleetSize / Math.max(0.2, trafficEfficiencyEta))
  );

  // 1. Scenario 1: As-Is (Manual Labor)
  const manualStaffCount = Math.max(
    1,
    Math.ceil(effectiveThroughput / 12) * facility.shiftsPerDay
  );
  const asIsAnnualOpex = manualStaffCount * effectiveSalary * 1.3 * 12;
  const asIsFiveYearTco = asIsAnnualOpex * 5;

  const asIs: ScenarioMetrics = {
    title: 'Базовый (Как есть)',
    capex: 0,
    annualOpex: asIsAnnualOpex,
    netAnnualSavings: 0,
    paybackYears: null,
    fiveYearRoi: null,
    fiveYearTco: asIsFiveYearTco,
  };

  // 2. Scenario 2: Robot Purchase (CAPEX)
  const baseCapex = fleetSize * robot.capexCostRub * 1.15;
  const capexPurchaseTotalCapex = baseCapex * capexDiscountFactor;

  const retainedSupervisorsCount = 1 * facility.shiftsPerDay;
  const supervisorAnnualOpex = retainedSupervisorsCount * effectiveSalary * 1.3 * 12;
  const robotAnnualOpex = fleetSize * robot.annualOpexCostRub;
  const capexPurchaseAnnualOpex = robotAnnualOpex + supervisorAnnualOpex;

  const capexPurchaseNetSavings = asIsAnnualOpex - capexPurchaseAnnualOpex;
  const capexPurchaseFiveYearTco = capexPurchaseTotalCapex + capexPurchaseAnnualOpex * 5;

  let capexPaybackYears: number | null = null;
  let capexFiveYearRoi: number | null = null;
  let verdict: FeasibilityVerdict = 'red';
  let verdictText = 'Низкая окупаемость, ручной труд выгоднее';

  if (capexPurchaseNetSavings > 0) {
    capexPaybackYears = capexPurchaseTotalCapex / capexPurchaseNetSavings;
    capexFiveYearRoi =
      ((capexPurchaseNetSavings * 5 - capexPurchaseTotalCapex) / capexPurchaseTotalCapex) * 100;

    if (capexPaybackYears <= 3.0) {
      verdict = 'green';
      verdictText = 'Экономически высокоэффективно';
    } else if (capexPaybackYears <= 5.0) {
      verdict = 'yellow';
      verdictText = 'Умеренная окупаемость, рекомендуется рассмотреть RaaS';
    } else {
      verdict = 'red';
      verdictText = 'Низкая окупаемость, ручной труд выгоднее';
    }
  }

  const capexPurchase: ScenarioMetrics = {
    title: 'Покупка парка (CAPEX)',
    capex: capexPurchaseTotalCapex,
    annualOpex: capexPurchaseAnnualOpex,
    netAnnualSavings: capexPurchaseNetSavings,
    paybackYears: capexPaybackYears,
    fiveYearRoi: capexFiveYearRoi,
    fiveYearTco: capexPurchaseFiveYearTco,
    verdict,
    verdictText,
  };

  // 3. Scenario 3: Robotics as a Service (RaaS / Subscription)
  const raasAnnualOpex =
    fleetSize * robot.monthlyRaasCostRub * 12 + supervisorAnnualOpex;
  const raasNetSavings = asIsAnnualOpex - raasAnnualOpex;
  const raasFiveYearTco = raasAnnualOpex * 5;

  const raas: ScenarioMetrics = {
    title: 'Сервисная модель (RaaS)',
    capex: 0,
    annualOpex: raasAnnualOpex,
    netAnnualSavings: raasNetSavings,
    paybackYears: null,
    fiveYearRoi: null,
    fiveYearTco: raasFiveYearTco,
  };

  // Determine recommended scenario based on lowest 5-Year TCO
  // Note: if capex purchase payback > 5 years or net savings <= 0, don't recommend CAPEX purchase
  let recommendedScenario: 'asIs' | 'capexPurchase' | 'raas' = 'asIs';

  const validCapex = capexPurchase.paybackYears !== null && capexPurchase.paybackYears <= 5.0;
  const validRaas = raas.netAnnualSavings > 0;

  if (validCapex && validRaas) {
    if (capexPurchase.fiveYearTco <= raas.fiveYearTco && capexPurchase.fiveYearTco < asIs.fiveYearTco) {
      recommendedScenario = 'capexPurchase';
    } else if (raas.fiveYearTco < asIs.fiveYearTco) {
      recommendedScenario = 'raas';
    } else {
      recommendedScenario = 'asIs';
    }
  } else if (validCapex) {
    recommendedScenario = capexPurchase.fiveYearTco < asIs.fiveYearTco ? 'capexPurchase' : 'asIs';
  } else if (validRaas) {
    recommendedScenario = raas.fiveYearTco < asIs.fiveYearTco ? 'raas' : 'asIs';
  } else {
    recommendedScenario = 'asIs';
  }

  return {
    fleetSize,
    availabilityCoeff,
    effectiveThroughput,
    effectiveSalary,
    manualStaffCount,
    retainedSupervisorsCount,
    trafficEfficiencyEta,
    asIs,
    capexPurchase,
    raas,
    recommendedScenario,
  };
}
