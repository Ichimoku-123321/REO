import { z } from 'zod';
import { facilityTypeSchema } from './facility.js';

export const robotOperationTypeSchema = z.enum(['transport', 'cleaning', 'sorting', 'palletizing']);
export type RobotOperationType = z.infer<typeof robotOperationTypeSchema>;

export const robotNavigationTypeSchema = z.enum(['lidar_slam', 'qr_code', 'mixed', 'gps_inertial']);
export type RobotNavigationType = z.infer<typeof robotNavigationTypeSchema>;

export const robotSchema = z.object({
  id: z.string(),
  vendor: z.string(),
  model: z.string(),
  supportedIndustries: z.array(facilityTypeSchema),
  operationType: robotOperationTypeSchema,
  payloadKg: z.number().nonnegative(),
  maxSpeedMps: z.number().positive(),
  dimensionsMm: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  minAisleWidthMm: z.number().positive(),
  maxLiftingHeightMm: z.number().optional(),
  navigationType: robotNavigationTypeSchema,
  batteryRuntimeHours: z.number().positive(),
  batteryChargeMinutes: z.number().positive(),
  operatingTempRange: z.object({
    min: z.number(),
    max: z.number(),
  }),
  throughputPerHour: z.number().positive(),
  capexCostRub: z.number().positive(),
  annualOpexCostRub: z.number().positive(),
  monthlyRaasCostRub: z.number().positive(),
  energyConsumptionKw: z.number().positive().default(1.5),
  maxFloorUnevennessMm: z.number().positive().default(5),
  mtbfOperatingHours: z.number().positive().default(10000),
});

export type Robot = z.infer<typeof robotSchema>;

export interface EligibilityResult {
  isEligible: boolean;
  exclusionReasons: string[];
}

export interface EvaluatedRobot {
  robot: Robot;
  result: EligibilityResult;
}
