import { facilityRequirementsSchema } from '../types/facility.js';
import type { FacilityRequirements, FacilityType } from '../types/facility.js';

export interface ImportResult {
  success: boolean;
  data?: FacilityRequirements;
  errors: string[];
}

const COLUMN_ALIASES: Record<string, keyof FacilityRequirements | string> = {
  // Russian aliases
  'отрасль': 'industry',
  'тип объекта': 'industry',
  'площадь_м2': 'totalAreaSqm',
  'площадь (кв.м)': 'totalAreaSqm',
  'площадь': 'totalAreaSqm',
  'ширина_проезда_м': 'aisleWidthM',
  'ширина проезда (м)': 'aisleWidthM',
  'ширина прохода (м)': 'aisleWidthM',
  'высота_потолков_м': 'ceilingHeightM',
  'высота потолков (м)': 'ceilingHeightM',
  'высота потолка (м)': 'ceilingHeightM',
  'мин_температура_c': 'tempMin',
  'мин. температура (c)': 'tempMin',
  'макс_температура_c': 'tempMax',
  'макс. температура (c)': 'tempMax',
  'число_смен': 'shiftsPerDay',
  'число смен в сутки': 'shiftsPerDay',
  'смен в сутки': 'shiftsPerDay',
  'часов_в_сутки': 'hoursPerDay',
  'часов работы в сутки': 'hoursPerDay',
  'часов в смену': 'hoursPerDay',
  'требуемая_нагрузка_кг': 'requiredPayloadKg',
  'требуемая нагрузка (кг)': 'requiredPayloadKg',
  'грузоподъемность (кг)': 'requiredPayloadKg',
  'целевой_грузопоток_шт_ч': 'targetThroughputPerHour',
  'целевой грузопоток (шт/ч)': 'targetThroughputPerHour',
  'грузопоток (ед/час)': 'targetThroughputPerHour',
  'фот_оператора_руб': 'averageWorkerSalaryRub',
  'фот оператора (руб/мес)': 'averageWorkerSalaryRub',
  'зарплата оператора (руб)': 'averageWorkerSalaryRub',

  // English keys
  'industry': 'industry',
  'totalareasqm': 'totalAreaSqm',
  'aislewidthm': 'aisleWidthM',
  'ceilingheightm': 'ceilingHeightM',
  'tempmin': 'tempMin',
  'tempmax': 'tempMax',
  'shiftsperday': 'shiftsPerDay',
  'hoursperday': 'hoursPerDay',
  'requiredpayloadkg': 'requiredPayloadKg',
  'targetthroughputperhour': 'targetThroughputPerHour',
  'averageworkersalaryrub': 'averageWorkerSalaryRub',
};

const INDUSTRY_MAP: Record<string, FacilityType> = {
  'warehouse': 'warehouse',
  'склад': 'warehouse',
  'логистика': 'warehouse',
  'airport': 'airport',
  'аэропорт': 'airport',
  'hospital': 'hospital',
  'больница': 'hospital',
  'медицина': 'hospital',
  'custom': 'custom',
  'пользовательский': 'custom',
};

function normalizeHeaderKey(header: string): string {
  const cleaned = header.trim().toLowerCase().replace(/[\s\-_]+/g, '');
  return cleaned;
}

export function parseFacilityImport(content: string, filename: string): ImportResult {
  const errors: string[] = [];
  const isJson = filename.toLowerCase().endsWith('.json') || content.trim().startsWith('{');

  if (isJson) {
    try {
      const parsed = JSON.parse(content);
      const validation = facilityRequirementsSchema.safeParse(parsed);
      if (validation.success) {
        return { success: true, data: validation.data, errors: [] };
      } else {
        const issues = validation.error.issues.map(
          (i) => `Поле "${i.path.join('.')}": ${i.message}`
        );
        return { success: false, errors: issues };
      }
    } catch (e) {
      return { success: false, errors: [`Ошибка синтаксиса JSON: ${(e as Error).message}`] };
    }
  }

  // Parse CSV
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      success: false,
      errors: ['CSV файл должен содержать заголовок и минимум одну строку данных.'],
    };
  }

  const separator = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(separator).map((h) => h.trim());
  const values = lines[1].split(separator).map((v) => v.trim());

  const rawObj: Record<string, unknown> = {};
  let tempMin = 5;
  let tempMax = 35;

  headers.forEach((header, idx) => {
    const valStr = values[idx];
    if (valStr === undefined || valStr === '') return;

    const lowerH = header.trim().toLowerCase();
    const mappedKey = COLUMN_ALIASES[lowerH] || COLUMN_ALIASES[normalizeHeaderKey(header)] || header;

    if (mappedKey === 'industry') {
      const normInd = valStr.trim().toLowerCase();
      rawObj.industry = INDUSTRY_MAP[normInd] || 'warehouse';
    } else if (mappedKey === 'tempMin') {
      tempMin = parseFloat(valStr) || 5;
    } else if (mappedKey === 'tempMax') {
      tempMax = parseFloat(valStr) || 35;
    } else {
      const numVal = parseFloat(valStr.replace(/\s/g, '').replace(',', '.'));
      if (!isNaN(numVal)) {
        rawObj[mappedKey] = numVal;
      } else {
        rawObj[mappedKey] = valStr;
      }
    }
  });

  rawObj.operatingTempRange = { min: tempMin, max: tempMax };

  // Set default values if omitted
  if (!rawObj.industry) rawObj.industry = 'warehouse';
  if (rawObj.ceilingHeightM === undefined) rawObj.ceilingHeightM = 6.0;

  const validation = facilityRequirementsSchema.safeParse(rawObj);
  if (validation.success) {
    return { success: true, data: validation.data, errors: [] };
  } else {
    const issues = validation.error.issues.map(
      (i) => `Поле "${i.path.join('.')}": ${i.message}`
    );
    return { success: false, errors: issues };
  }
}

export function downloadCsvTemplate(): void {
  const headers = [
    'Отрасль',
    'Площадь_м2',
    'Ширина_проезда_м',
    'Высота_потолков_м',
    'Мин_температура_C',
    'Макс_температура_C',
    'Число_смен',
    'Часов_в_сутки',
    'Требуемая_нагрузка_кг',
    'Целевой_грузопоток_шт_ч',
    'ФОТ_оператора_руб',
  ];

  const sampleRow = [
    'warehouse',
    '12000',
    '2.6',
    '6.0',
    '5',
    '30',
    '2',
    '22',
    '800',
    '85',
    '85000',
  ];

  const csvContent = '\uFEFF' + headers.join(';') + '\n' + sampleRow.join(';');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'facility_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
