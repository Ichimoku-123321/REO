import type { FacilityRequirements } from '../types/facility.js';
import type { Robot } from '../types/robot.js';
import type { EconomicEvaluation, WhatIfParams } from './economics.js';
import type { SpectralAnalysisResult } from './spectral_analyzer.js';

export interface ProjectExportData {
  projectTitle: string;
  facility: FacilityRequirements;
  selectedRobot: Robot;
  fleetSize: number;
  economicEvaluation: EconomicEvaluation;
  spectralResult?: SpectralAnalysisResult;
  whatIf: WhatIfParams;
  generatedAt: Date;
  version: string;
}

export const MANDATORY_LEGAL_DISCLAIMER =
  'Настоящий расчет носит предварительный характер (экспресс-ТЭО) и требует обязательного предпроектного аудита геометрии объекта, качества напольного покрытия и сетевой инфраструктуры.';
