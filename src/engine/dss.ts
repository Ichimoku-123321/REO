import type { FacilityRequirements } from '../types/facility.js';
import type { Robot, EvaluatedRobot } from '../types/robot.js';

export function evaluateEligibility(
  facility: FacilityRequirements,
  robots: Robot[]
): EvaluatedRobot[] {
  const evaluated: EvaluatedRobot[] = robots.map((robot) => {
    const reasons: string[] = [];

    // 1. Отраслевое соответствие
    if (facility.industry !== 'custom' && !robot.supportedIndustries.includes(facility.industry)) {
      reasons.push(`Решение не поддерживает выбранный тип объекта: ${facility.industry}`);
    }

    // 2. Габариты и ширина проходов (метры -> мм)
    const aisleWidthMm = facility.aisleWidthM * 1000;
    if (aisleWidthMm < robot.minAisleWidthMm) {
      reasons.push(
        `Ширина проезда ${facility.aisleWidthM} м < ${(robot.minAisleWidthMm / 1000).toFixed(1)} м`
      );
    }

    // 3. Грузоподъемность
    if (facility.requiredPayloadKg > robot.payloadKg) {
      reasons.push(
        `Нагрузка ${facility.requiredPayloadKg} кг > ${robot.payloadKg} кг`
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
        `Температура [${facilityMin}..${facilityMax}°C] вне [${robot.operatingTempRange.min}..${robot.operatingTempRange.max}°C]`
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

export function isRobotEligible(
  facility: FacilityRequirements,
  robot: Robot
): { isEligible: boolean; exclusionReasons: string[] } {
  const evaluated = evaluateEligibility(facility, [robot]);
  return evaluated[0].result;
}
