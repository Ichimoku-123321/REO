import type { FacilityRequirements } from '../types/facility.js';
import type { Robot } from '../types/robot.js';
import type { WhatIfParams } from './economics.js';
import { DEFAULT_WHAT_IF_PARAMS, calculateAvailabilityCoefficient } from './economics.js';

export interface FleetCompositionItem {
  robot: Robot;
  count: number;
  totalThroughputPerHour: number;
  totalCapexRub: number;
  totalAnnualOpexRub: number;
  fiveYearTcoRub: number;
}

export interface HeterogeneousOptimizationResult {
  isHeterogeneous: boolean; // true, если мульти-флот экономически выгоднее монофлота минимум на 5%
  composition: FleetCompositionItem[];
  totalFleetSize: number;
  totalThroughputPerHour: number;
  fiveYearTcoRub: number;
  tcoSavingsPercentVsBestMono: number; // Экономия TCO относительно лучшего монофлота в %
  bestMonoRobotId: string;
  bestMonoTcoRub: number;
}

/**
 * Вспомогательный интерфейс для внутренней предварительной оценки моделей роботов
 */
interface RobotEvaluation {
  robot: Robot;
  kAvail: number;
  effectiveThroughputPerUnit: number;
  singleUnitTcoRub: number;
}

/**
 * Проверяет физическую и отраслевую совместимость модели робота с требованиями объекта.
 */
function isRobotEligible(facility: FacilityRequirements, robot: Robot): boolean {
  // 1. Отраслевая совместимость (если объект не пользовательский 'custom')
  if (facility.industry !== 'custom' && !robot.supportedIndustries.includes(facility.industry)) {
    return false;
  }

  // 2. Ширина проезда (минимальная ширина проезда робота в мм <= ширина проезда объекта в мм)
  const aisleWidthMm = facility.aisleWidthM * 1000;
  if (robot.minAisleWidthMm > aisleWidthMm) {
    return false;
  }

  // 3. Грузоподъемность: Q_m^payload >= P_req (грузоподъемность робота должна быть не меньше требуемой)
  const robotPayload = robot.payloadKg ?? (robot as { maxPayloadKg?: number }).maxPayloadKg ?? 0;
  if (robotPayload < facility.requiredPayloadKg) {
    return false;
  }

  // 4. Температурный режим (диапазон объекта должен полностью входить в диапазон робота)
  if (
    facility.operatingTempRange.min < robot.operatingTempRange.min ||
    facility.operatingTempRange.max > robot.operatingTempRange.max
  ) {
    return false;
  }

  return true;
}

/**
 * Рассчитывает финансово-производственную позицию состава парка для выбранного типа робота.
 */
function createFleetCompositionItem(
  robot: Robot,
  count: number,
  kAvail: number,
  capexDiscountFactor: number
): FleetCompositionItem {
  // Эффективный часовой грузопоток группы роботов с учетом коэффициента готовности АКБ
  const totalThroughputPerHour = count * robot.throughputPerHour * kAvail;

  // CAPEX с учетом коэффициента интеграции/инфраструктуры (1.15) и скидки What-If
  const totalCapexRub = count * robot.capexCostRub * 1.15 * capexDiscountFactor;

  // Ежегодные операционные расходы (OPEX)
  const totalAnnualOpexRub = count * robot.annualOpexCostRub;

  // Совокупная стоимость владения (TCO) за 5 лет
  const fiveYearTcoRub = totalCapexRub + 5 * totalAnnualOpexRub;

  return {
    robot,
    count,
    totalThroughputPerHour,
    totalCapexRub,
    totalAnnualOpexRub,
    fiveYearTcoRub,
  };
}

/**
 * Вычисляет оптимальный состав парка (моно- или гетерогенный), минимизирующий 5-летний TCO
 * при безусловном выполнении целевого грузопотока объекта.
 */
export function optimizeFleetComposition(
  facility: FacilityRequirements,
  availableRobots: Robot[],
  whatIf: WhatIfParams = DEFAULT_WHAT_IF_PARAMS
): HeterogeneousOptimizationResult {
  // Безопасный дефолтный результат (fallback)
  const emptyFallback: HeterogeneousOptimizationResult = {
    isHeterogeneous: false,
    composition: [],
    totalFleetSize: 0,
    totalThroughputPerHour: 0,
    fiveYearTcoRub: 0,
    tcoSavingsPercentVsBestMono: 0,
    bestMonoRobotId: '',
    bestMonoTcoRub: 0,
  };

  if (!availableRobots || availableRobots.length === 0) {
    return emptyFallback;
  }

  // Шаг 1: Расчет эффективных параметров с учетом сценария What-If
  const throughputFactor = (whatIf?.throughputChangePercent ?? 100) / 100;
  const capexDiscountPercent = whatIf?.capexDiscountPercent ?? 0;
  const capexDiscountFactor = Math.max(0, 1 - capexDiscountPercent / 100);

  const targetQ = Math.max(0, facility.targetThroughputPerHour * throughputFactor);
  if (targetQ <= 0) {
    return emptyFallback;
  }

  // Шаг 2: Фильтрация допустимости (Physical & Industry Compatibility Filter)
  const eligibleEvals: RobotEvaluation[] = [];

  for (const robot of availableRobots) {
    if (isRobotEligible(facility, robot)) {
      const kAvail = calculateAvailabilityCoefficient(
        robot.batteryRuntimeHours,
        robot.batteryChargeMinutes
      );
      const effectiveThroughputPerUnit = robot.throughputPerHour * kAvail;

      if (effectiveThroughputPerUnit > 0) {
        const singleUnitCapex = robot.capexCostRub * 1.15 * capexDiscountFactor;
        const singleUnitOpex = robot.annualOpexCostRub;
        const singleUnitTcoRub = singleUnitCapex + 5 * singleUnitOpex;

        eligibleEvals.push({
          robot,
          kAvail,
          effectiveThroughputPerUnit,
          singleUnitTcoRub,
        });
      }
    }
  }

  if (eligibleEvals.length === 0) {
    return emptyFallback;
  }

  // Шаг 3: Оценка монофлота (поиск лучшей единичной модели с минимальным 5-летним TCO)
  let bestMonoItem: FleetCompositionItem | null = null;

  for (const item of eligibleEvals) {
    const count = Math.ceil(targetQ / item.effectiveThroughputPerUnit);
    const compositionItem = createFleetCompositionItem(
      item.robot,
      count,
      item.kAvail,
      capexDiscountFactor
    );

    if (!bestMonoItem || compositionItem.fiveYearTcoRub < bestMonoItem.fiveYearTcoRub) {
      bestMonoItem = compositionItem;
    }
  }

  if (!bestMonoItem) {
    return emptyFallback;
  }

  // Шаг 4: Поиск бинарных комбинаций (мульти-флот из 2 типов роботов)
  // Модель Bounded Knapsack с высокой производительностью (без выделения объектов в цикле)
  let bestHeteroComposition: [FleetCompositionItem, FleetCompositionItem] | null = null;
  let bestHeteroTco = Infinity;

  const numEligible = eligibleEvals.length;

  for (let i = 0; i < numEligible; i++) {
    const evalI = eligibleEvals[i];
    const qI = evalI.effectiveThroughputPerUnit;
    const tcoI = evalI.singleUnitTcoRub;

    for (let j = i + 1; j < numEligible; j++) {
      const evalJ = eligibleEvals[j];
      const qJ = evalJ.effectiveThroughputPerUnit;
      const tcoJ = evalJ.singleUnitTcoRub;

      // Максимально необходимое количество единиц робота I для закрытия целевого потока
      const nIMax = Math.ceil(targetQ / qI);

      if (nIMax <= 1) {
        continue;
      }

      // Для больших nIMax используем динамический шаг оптимизации
      let step = 1;
      if (nIMax > 1000) {
        step = Math.ceil(nIMax / 500);
      }

      let bestPairCountI = 0;
      let bestPairCountJ = 0;
      let minPairTco = Infinity;

      for (let nI = 1; nI < nIMax; nI += step) {
        const qRem = targetQ - nI * qI;
        const nJ = Math.max(1, Math.ceil(qRem / qJ));
        const pairTco = nI * tcoI + nJ * tcoJ;
        if (pairTco < minPairTco) {
          minPairTco = pairTco;
          bestPairCountI = nI;
          bestPairCountJ = nJ;
        }
      }

      if (step > 1 && bestPairCountI > 0) {
        const start = Math.max(1, bestPairCountI - step);
        const end = Math.min(nIMax - 1, bestPairCountI + step);
        for (let nI = start; nI <= end; nI++) {
          const qRem = targetQ - nI * qI;
          const nJ = Math.max(1, Math.ceil(qRem / qJ));
          const pairTco = nI * tcoI + nJ * tcoJ;
          if (pairTco < minPairTco) {
            minPairTco = pairTco;
            bestPairCountI = nI;
            bestPairCountJ = nJ;
          }
        }
      }

      if (minPairTco < bestHeteroTco && bestPairCountI > 0 && bestPairCountJ > 0) {
        bestHeteroTco = minPairTco;
        const finalItemI = createFleetCompositionItem(
          evalI.robot,
          bestPairCountI,
          evalI.kAvail,
          capexDiscountFactor
        );
        const finalItemJ = createFleetCompositionItem(
          evalJ.robot,
          bestPairCountJ,
          evalJ.kAvail,
          capexDiscountFactor
        );
        bestHeteroComposition = [finalItemI, finalItemJ];
      }
    }
  }

  // Шаг 5: Сравнение с лучшим монофлотом и правило переключения на мульти-флот (порог 5%)
  const bestMonoTco = bestMonoItem.fiveYearTcoRub;

  if (bestHeteroComposition && bestHeteroTco < bestMonoTco) {
    const savingsRatio = (bestMonoTco - bestHeteroTco) / bestMonoTco;
    const savingsPercent = savingsRatio * 100;

    // Переключаемся на мульти-флот, если экономия составляет не менее 5%
    if (savingsRatio >= 0.05 - 1e-9) {
      const totalFleetSize = bestHeteroComposition[0].count + bestHeteroComposition[1].count;
      const totalThroughputPerHour =
        bestHeteroComposition[0].totalThroughputPerHour +
        bestHeteroComposition[1].totalThroughputPerHour;

      return {
        isHeterogeneous: true,
        composition: bestHeteroComposition,
        totalFleetSize,
        totalThroughputPerHour,
        fiveYearTcoRub: bestHeteroTco,
        tcoSavingsPercentVsBestMono: Math.round(savingsPercent * 100) / 100,
        bestMonoRobotId: bestMonoItem.robot.id,
        bestMonoTcoRub: bestMonoTco,
      };
    }
  }

  // В противном случае возвращаем лучший монофлот (isHeterogeneous = false)
  return {
    isHeterogeneous: false,
    composition: [bestMonoItem],
    totalFleetSize: bestMonoItem.count,
    totalThroughputPerHour: bestMonoItem.totalThroughputPerHour,
    fiveYearTcoRub: bestMonoTco,
    tcoSavingsPercentVsBestMono: 0,
    bestMonoRobotId: bestMonoItem.robot.id,
    bestMonoTcoRub: bestMonoTco,
  };
}
