import { pgTable, text, integer, doublePrecision, jsonb, timestamp } from 'drizzle-orm/pg-core';
import type { FacilityRequirements, FacilityType } from '../types/facility.js';
import type { RobotOperationType, RobotNavigationType } from '../types/robot.js';

export const robots = pgTable('robots', {
  id: text('id').primaryKey(),
  vendor: text('vendor').notNull(),
  model: text('model').notNull(),
  supportedIndustries: jsonb('supported_industries').$type<FacilityType[]>().notNull(),
  operationType: text('operation_type').$type<RobotOperationType>().notNull(),
  payloadKg: doublePrecision('payload_kg').notNull(),
  maxSpeedMps: doublePrecision('max_speed_mps').notNull(),
  dimensionsMm: jsonb('dimensions_mm').$type<{ length: number; width: number; height: number }>().notNull(),
  minAisleWidthMm: integer('min_aisle_width_mm').notNull(),
  maxLiftingHeightMm: integer('max_lifting_height_mm'),
  navigationType: text('navigation_type').$type<RobotNavigationType>().notNull(),
  batteryRuntimeHours: doublePrecision('battery_runtime_hours').notNull(),
  batteryChargeMinutes: integer('battery_charge_minutes').notNull(),
  operatingTempRange: jsonb('operating_temp_range').$type<{ min: number; max: number }>().notNull(),
  throughputPerHour: doublePrecision('throughput_per_hour').notNull(),
  capexCostRub: doublePrecision('capex_cost_rub').notNull(),
  annualOpexCostRub: doublePrecision('annual_opex_cost_rub').notNull(),
  monthlyRaasCostRub: doublePrecision('monthly_raas_cost_rub').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const facilityPresets = pgTable('facility_presets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  industry: text('industry').$type<FacilityType>().notNull(),
  description: text('description'),
  requirements: jsonb('requirements').$type<FacilityRequirements>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
