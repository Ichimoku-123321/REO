import type { FacilityRequirements } from '../types/facility.js';
import type { Robot } from '../types/robot.js';
import type { FacilityTopology } from '../types/topology.js';
import type { WhatIfParams } from './economics.js';
import { DEFAULT_WHAT_IF_PARAMS, calculateAvailabilityCoefficient } from './economics.js';
import { checkGraphIsolation } from './constructor_engine.js';

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
 * Валидирует готовность объекта склада для расчета флота (CAD Guard).
 * Склад считается валидным, если:
 * 1. inboundDocks.length >= 1
 * 2. outboundDocks.length >= 1
 * 3. racks.length >= 1 и totalPalletCapacity > 0
 * 4. checkGraphIsolation(topology) === false (доки и стеллажи физически соединены связным графом)
 */
export function isWarehouseValidForFleet(topology?: FacilityTopology | null): boolean {
  if (!topology || !topology.nodes || topology.nodes.length === 0) {
    return false;
  }

  const inboundDocks =
    (topology as any).inboundDocks ??
    topology.nodes.filter((n) => n.type === 'INBOUND_DOCK');
  const outboundDocks =
    (topology as any).outboundDocks ??
    topology.nodes.filter((n) => n.type === 'OUTBOUND_DOCK');
  const racks =
    (topology as any).racks ??
    topology.nodes.filter((n) => n.type === 'STORAGE_AISLE');
  const totalPalletCapacity =
    (topology as any).totalPalletCapacity ??
    (racks.length > 0 ? racks.length * 12 : 0);

  if (inboundDocks.length < 1) return false;
  if (outboundDocks.length < 1) return false;
  if (racks.length < 1) return false;
  if (totalPalletCapacity <= 0) return false;

  if (checkGraphIsolation(topology)) {
    return false;
  }

  return true;
}

/**
 * Кратчайшее расстояние между узлами графа по алгоритму Дейкстры.
 */
function getShortestDistance(
  topology: FacilityTopology,
  startNodeId: string,
  targetNodeId: string
): number {
  if (startNodeId === targetNodeId) return 0;

  const adj = new Map<string, Array<{ target: string; distance: number }>>();
  topology.nodes.forEach((n) => adj.set(n.id, []));

  topology.edges.forEach((e) => {
    adj.get(e.source)?.push({ target: e.target, distance: e.distanceM });
    if (e.bidirectional) {
      adj.get(e.target)?.push({ target: e.source, distance: e.distanceM });
    }
  });

  const distances = new Map<string, number>();
  const unvisited = new Set<string>();

  topology.nodes.forEach((n) => {
    distances.set(n.id, Infinity);
    unvisited.add(n.id);
  });

  distances.set(startNodeId, 0);

  while (unvisited.size > 0) {
    let current: string | null = null;
    let minD = Infinity;

    unvisited.forEach((id) => {
      const d = distances.get(id)!;
      if (d < minD) {
        minD = d;
        current = id;
      }
    });

    if (current === null || minD === Infinity) break;
    if (current === targetNodeId) return minD;

    unvisited.delete(current);

    const neighbors = adj.get(current) || [];
    for (const edge of neighbors) {
      if (!unvisited.has(edge.target)) continue;
      const alt = minD + edge.distance;
      if (alt < distances.get(edge.target)!) {
        distances.set(edge.target, alt);
      }
    }
  }

  const res = distances.get(targetNodeId);
  return res !== undefined && res !== Infinity ? res : Infinity;
}

/**
 * Вычисляет среднюю длину полного цикла транспортировки:
 * D_cycle = L_avg(Dock_in -> Rack) + L_avg(Rack -> Dock_out)
 */
export function calculateCycleDistance(topology: FacilityTopology): number {
  const inboundNodes = topology.nodes.filter((n) => n.type === 'INBOUND_DOCK');
  const outboundNodes = topology.nodes.filter((n) => n.type === 'OUTBOUND_DOCK');
  const rackNodes = topology.nodes.filter((n) => n.type === 'STORAGE_AISLE');

  if (inboundNodes.length === 0 || outboundNodes.length === 0 || rackNodes.length === 0) {
    return 0;
  }

  let totalInboundDist = 0;
  let inboundCount = 0;
  for (const inNode of inboundNodes) {
    for (const rackNode of rackNodes) {
      const d = getShortestDistance(topology, inNode.id, rackNode.id);
      if (d < Infinity) {
        totalInboundDist += d;
        inboundCount++;
      }
    }
  }

  let totalOutboundDist = 0;
  let outboundCount = 0;
  for (const rackNode of rackNodes) {
    for (const outNode of outboundNodes) {
      const d = getShortestDistance(topology, rackNode.id, outNode.id);
      if (d < Infinity) {
        totalOutboundDist += d;
        outboundCount++;
      }
    }
  }

  const avgInbound = inboundCount > 0 ? totalInboundDist / inboundCount : 0;
  const avgOutbound = outboundCount > 0 ? totalOutboundDist / outboundCount : 0;

  return avgInbound + avgOutbound;
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
  capexDiscountFactor: number,
  unitThroughputPerHour?: number
): FleetCompositionItem {
  const baseThroughput = unitThroughputPerHour ?? robot.throughputPerHour;
  // Эффективный часовой грузопоток группы роботов с учетом коэффициента готовности АКБ
  const totalThroughputPerHour = count * baseThroughput * kAvail;

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
  whatIf: WhatIfParams = DEFAULT_WHAT_IF_PARAMS,
  topology?: FacilityTopology | null
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

  // Расчет дистанции цикла D_cycle по графу топологии склада (если она передана и валидна)
  let cycleDistanceM = 0;
  if (topology && isWarehouseValidForFleet(topology)) {
    cycleDistanceM = calculateCycleDistance(topology);
  }

  // Шаг 2: Фильтрация допустимости (Physical & Industry Compatibility Filter)
  const eligibleEvals: RobotEvaluation[] = [];

  for (const robot of availableRobots) {
    if (isRobotEligible(facility, robot)) {
      const kAvail = calculateAvailabilityCoefficient(
        robot.batteryRuntimeHours,
        robot.batteryChargeMinutes
      );

      // Рассчитываем динамическую производительность throughputPerHour если есть топология
      let unitThroughputPerHour = robot.throughputPerHour;
      if (cycleDistanceM > 0) {
        const vMax = robot.maxSpeedMps > 0 ? robot.maxSpeedMps : 1.5;
        const etaTraffic = 0.85; // Коэффициент замедления в трафике
        const tTripSec = cycleDistanceM / (vMax * etaTraffic) + 10; // +10s (tau_load + tau_unload)
        unitThroughputPerHour = Math.round((3600 / tTripSec) * 100) / 100;
      }

      const effectiveThroughputPerUnit = unitThroughputPerHour * kAvail;

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
      capexDiscountFactor,
      item.effectiveThroughputPerUnit / item.kAvail
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
          capexDiscountFactor,
          evalI.effectiveThroughputPerUnit / evalI.kAvail
        );
        const finalItemJ = createFleetCompositionItem(
          evalJ.robot,
          bestPairCountJ,
          evalJ.kAvail,
          capexDiscountFactor,
          evalJ.effectiveThroughputPerUnit / evalJ.kAvail
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
