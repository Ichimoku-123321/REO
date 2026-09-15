import { z } from 'zod';

export const facilityTypeSchema = z.enum(['warehouse', 'airport', 'hospital', 'custom']);
export type FacilityType = z.infer<typeof facilityTypeSchema>;

export const facilityRequirementsSchema = z.object({
  industry: facilityTypeSchema,
  totalAreaSqm: z.number().positive(),
  aisleWidthM: z.number().positive(),
  ceilingHeightM: z.number().positive(),
  operatingTempRange: z.object({
    min: z.number(),
    max: z.number(),
  }),
  shiftsPerDay: z.number().min(1).max(3),
  hoursPerDay: z.number().min(1).max(24),
  requiredPayloadKg: z.number().positive(),
  targetThroughputPerHour: z.number().positive(),
  averageWorkerSalaryRub: z.number().positive(),
});

export type FacilityRequirements = z.infer<typeof facilityRequirementsSchema>;
