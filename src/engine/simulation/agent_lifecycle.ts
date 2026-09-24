import type { AgentState } from './types.js';
import type { FacilityRequirements } from '../../types/facility.js';

export interface BatteryWearContext {
  dtSim: number;
  facility?: FacilityRequirements;
}

/**
 * Updates agent battery SoC and resource wear/breakdown hours.
 */
export function updateAgentBatteryAndWear(
  agent: AgentState,
  ctx: BatteryWearContext
): { breakdownOccurred: boolean } {
  const { dtSim, facility } = ctx;
  let breakdownOccurred = false;

  let dischargeMultiplier = 1.0;
  if (agent.cargoPayload) dischargeMultiplier *= 1.25;
  if (facility?.floorSurfaceQuality === 'uneven') dischargeMultiplier *= 1.2;

  const temp = facility?.operatingTempRange;
  if (
    temp &&
    (temp.min < agent.robotSpec.operatingTempRange.min ||
      temp.max > agent.robotSpec.operatingTempRange.max)
  ) {
    dischargeMultiplier *= 1.35;
  }

  agent.batterySoc = Math.max(
    0,
    agent.batterySoc - agent.dischargeRatePerSec * dischargeMultiplier * dtSim
  );

  agent.accumulatedOperatingHours += dtSim / 3600;
  const mtbf = agent.robotSpec.mtbfOperatingHours || 10000;
  if (agent.accumulatedOperatingHours >= mtbf) {
    agent.breakdownCount += 1;
    agent.accumulatedOperatingHours = 0;
    breakdownOccurred = true;
  }

  return { breakdownOccurred };
}
