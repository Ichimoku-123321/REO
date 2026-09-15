import type { FacilityRequirements } from '../types/facility.js';

export interface FacilityPreset {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  requirements: FacilityRequirements;
}

export const FACILITY_PRESETS: FacilityPreset[] = [
  {
    id: 'warehouse',
    name: 'Распределительный комплекс Класса A',
    subtitle: 'Складской логистический комплекс',
    icon: '📦',
    requirements: {
      industry: 'warehouse',
      totalAreaSqm: 2500,
      aisleWidthM: 2.5,
      ceilingHeightM: 6.0,
      operatingTempRange: { min: 5, max: 25 },
      shiftsPerDay: 2,
      hoursPerDay: 16,
      requiredPayloadKg: 1000,
      targetThroughputPerHour: 50,
      averageWorkerSalaryRub: 85000,
    },
  },
  {
    id: 'airport',
    name: 'Международный грузовой терминал',
    subtitle: 'Зона обработки багажа и перрон',
    icon: '✈️',
    requirements: {
      industry: 'airport',
      totalAreaSqm: 12000,
      aisleWidthM: 3.5,
      ceilingHeightM: 8.0,
      operatingTempRange: { min: -35, max: 40 },
      shiftsPerDay: 3,
      hoursPerDay: 24,
      requiredPayloadKg: 2500,
      targetThroughputPerHour: 35,
      averageWorkerSalaryRub: 95000,
    },
  },
  {
    id: 'hospital',
    name: 'Городская клиническая больница',
    subtitle: 'Внутренняя логистика отделений и медикаментов',
    icon: '🏥',
    requirements: {
      industry: 'hospital',
      totalAreaSqm: 1800,
      aisleWidthM: 1.4,
      ceilingHeightM: 3.2,
      operatingTempRange: { min: 18, max: 25 },
      shiftsPerDay: 2,
      hoursPerDay: 16,
      requiredPayloadKg: 35,
      targetThroughputPerHour: 25,
      averageWorkerSalaryRub: 70000,
    },
  },
];
