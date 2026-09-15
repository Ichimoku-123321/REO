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
      reasons.push(`Robot does not support facility type: ${facility.industry}`);
    }

    // 2. Габариты и ширина проходов (метры -> мм)
    const aisleWidthMm = facility.aisleWidthM * 1000;
    if (aisleWidthMm < robot.minAisleWidthMm) {
      reasons.push(
        `Facility aisle width (${facility.aisleWidthM}m) is less than required minimum clearance (${robot.minAisleWidthMm}mm)`
      );
    }

    // 3. Грузоподъемность
    if (facility.requiredPayloadKg > robot.payloadKg) {
      reasons.push(
        `Required payload (${facility.requiredPayloadKg}kg) exceeds robot maximum payload limit (${robot.payloadKg}kg)`
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
        `Facility temperature range [${facilityMin}°C, ${facilityMax}°C] exceeds robot limits [${robot.operatingTempRange.min}°C, ${robot.operatingTempRange.max}°C]`
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
