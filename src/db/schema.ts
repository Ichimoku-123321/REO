import type { FacilityRequirements, FacilityType } from '../types/facility.js';
import type { Robot } from '../types/robot.js';

export interface FacilityPresetEntity {
  id: string;
  name: string;
  industry: FacilityType;
  description?: string;
  requirements: FacilityRequirements;
  createdAt: Date;
}

export interface RobotEntity extends Robot {
  createdAt: Date;
}
