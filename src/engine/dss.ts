import type { FacilityRequirements } from '../types/facility.js';
import type { Robot, EvaluatedRobot } from '../types/robot.js';

export function evaluateEligibility(
  facility: FacilityRequirements,
  robots: Robot[]
): EvaluatedRobot[] {
  const evaluated: EvaluatedRobot[] = robots.map((robot) => {
    const reasons: string[] = [];

    // 1. Отраслевое соответствие
    if (!robot.supportedIndustries.includes(facility.industry)) {
      reasons.push(`Решение не поддерживает выбранный тип объекта: ${facility.industry}`);
    }

    // 2. Габариты и ширина проходов (метры -> мм)
    const aisleWidthMm = facility.aisleWidthM * 1000;
    if (aisleWidthMm < robot.minAisleWidthMm) {
      reasons.push(
        `Ширина проезда объекта (${facility.aisleWidthM} м) меньше минимального габарита робота (${robot.minAisleWidthMm} мм)`
      );
    }

    // 3. Грузоподъемность
    if (facility.requiredPayloadKg > robot.payloadKg) {
      reasons.push(
        `Требуемая нагрузка (${facility.requiredPayloadKg} кг) превышает грузоподъемность робота (${robot.payloadKg} кг)`
      );
    }

    // 4. Температурный режим
    const facilityMin = facility.operatingTempRange.min;
    const facilityMax = facility.operatingTempRange.max;
    if (
      facilityMin < robot.operatingTempRange.min ||
      facilityMax > robot.operatingTempRange.max
    ) {
      reasons.push(
        `Рабочая температура объекта выйдет за допустимый диапазон эксплуатации (${robot.operatingTempRange.min}°C .. ${robot.operatingTempRange.max}°C)`
      );
    }

    return {
      robot,
      result: {
        isEligible: reasons.length === 0,
        exclusionReasons: reasons,
      },
    };
  });

  // Eligible сортируются по CAPEX (дешевые вверху), Ineligible остаются внизу
  return evaluated.sort((a, b) => {
    if (a.result.isEligible && !b.result.isEligible) return -1;
    if (!a.result.isEligible && b.result.isEligible) return 1;
    if (a.result.isEligible && b.result.isEligible) {
      return a.robot.capexCostRub - b.robot.capexCostRub;
    }
    return a.robot.capexCostRub - b.robot.capexCostRub;
  });
}
