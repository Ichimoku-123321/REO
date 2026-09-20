import { z } from 'zod';

export const facilityTypeSchema = z.enum(['warehouse', 'airport', 'hospital', 'custom']);
export type FacilityType = z.infer<typeof facilityTypeSchema>;

export const floorSurfaceQualitySchema = z.enum(['standard', 'uneven', 'superflat']);
export type FloorSurfaceQuality = z.infer<typeof floorSurfaceQualitySchema>;

export const cleanlinessClassSchema = z.enum(['standard_dry', 'dusty', 'cleanroom']);
export type CleanlinessClass = z.infer<typeof cleanlinessClassSchema>;

export const facilityRequirementsSchema = z.object({
  industry: facilityTypeSchema,
  totalAreaSqm: z.number().positive(),
  aisleWidthM: z.number().positive(),
  ceilingHeightM: z.number().positive().default(8.0),
  floorSurfaceQuality: floorSurfaceQualitySchema.default('standard'),
  operatingTempRange: z.object({
    min: z.number(),
    max: z.number(),
  }),
  cleanlinessClass: cleanlinessClassSchema.default('standard_dry'),

  targetThroughputPerHour: z.number().positive(),
  peakHourFactor: z.number().min(1.0).max(2.0).default(1.0),
  shiftsPerDay: z.number().min(1).max(3),
  hoursPerDay: z.number().min(1).max(24),
  annualOperatingDays: z.number().default(247),

  manualWorkerNorm: z.number().min(1).max(100).default(12),
  averageWorkerSalaryRub: z.number().positive(),
  payrollTaxesPercent: z.number().min(0).default(30.2),
  hrOverheadPercent: z.number().min(0).default(10.0),

  electricityTariffRubPerKwh: z.number().min(0).default(7.5),
  integrationMarkupPercent: z.number().min(0).default(15.0),
  waccDiscountRatePercent: z.number().min(0).default(18.0),
  wageInflationPercent: z.number().min(0).default(8.0),
  governmentSubsidyPercent: z.number().min(0).max(50).default(0.0),

  requiredPayloadKg: z.number().positive(),
});

export interface FacilityRequirements {
  industry: FacilityType;
  totalAreaSqm: number;
  aisleWidthM: number;
  ceilingHeightM?: number;
  floorSurfaceQuality?: FloorSurfaceQuality;
  operatingTempRange: {
    min: number;
    max: number;
  };
  cleanlinessClass?: CleanlinessClass;

  targetThroughputPerHour: number;
  peakHourFactor?: number;
  shiftsPerDay: number;
  hoursPerDay: number;
  annualOperatingDays?: number;

  manualWorkerNorm?: number;
  averageWorkerSalaryRub: number;
  payrollTaxesPercent?: number;
  hrOverheadPercent?: number;

  electricityTariffRubPerKwh?: number;
  integrationMarkupPercent?: number;
  waccDiscountRatePercent?: number;
  wageInflationPercent?: number;
  governmentSubsidyPercent?: number;

  requiredPayloadKg: number;
}
