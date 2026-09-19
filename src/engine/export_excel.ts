import * as XLSX from 'xlsx';
import type { FacilityRequirements } from '../types/facility.js';
import type { Robot } from '../types/robot.js';
import type { EconomicEvaluation, WhatIfParams } from './economics.js';
import type { FleetCompositionItem } from './fleet_optimizer.js';
import type { ProjectExportData } from './export_types.js';
import { MANDATORY_LEGAL_DISCLAIMER } from './export_types.js';

export function exportFeasibilityToExcel(
  facility: FacilityRequirements,
  composition: FleetCompositionItem[] | Robot,
  economics: EconomicEvaluation | null,
  whatIf: WhatIfParams
): void {
  const wb = XLSX.utils.book_new();

  // Normalize composition into FleetCompositionItem array
  const compositionItems: FleetCompositionItem[] = Array.isArray(composition)
    ? composition
    : [
        {
          robot: composition,
          count: economics?.fleetSize ?? 1,
          totalThroughputPerHour:
            (economics?.fleetSize ?? 1) * composition.throughputPerHour,
          totalCapexRub: (economics?.fleetSize ?? 1) * composition.capexCostRub * 1.15,
          totalAnnualOpexRub:
            (economics?.fleetSize ?? 1) * composition.annualOpexCostRub,
          fiveYearTcoRub:
            (economics?.fleetSize ?? 1) * composition.capexCostRub * 1.15 +
            5 * (economics?.fleetSize ?? 1) * composition.annualOpexCostRub,
        },
      ];

  // Sheet 1: «Параметры объекта»
  const sheet1Data = [
    ['ПАРАМЕТРЫ ИСХОДНОГО ОБЪЕКТА (FACILITY REQUIREMENTS)'],
    ['Дата формирования', new Date().toLocaleString('ru-RU')],
    ['Версия СППР', 'v1.0 (REO Platform)'],
    [''],
    ['Показатель', 'Значение', 'Единица измерения'],
    ['Отрасль / Профиль объекта', facility.industry, 'тип'],
    ['Общая площадь', facility.totalAreaSqm, 'кв. м'],
    ['Ширина проезда', facility.aisleWidthM, 'м'],
    ['Высота потолков', facility.ceilingHeightM, 'м'],
    ['Сменность работы', facility.shiftsPerDay, 'смен/сут'],
    ['Часов работы в сутки', facility.hoursPerDay, 'часов/сут'],
    ['Требуемая грузоподъемность', facility.requiredPayloadKg, 'кг'],
    ['Целевой грузопоток (Q_target)', facility.targetThroughputPerHour, 'шт/час'],
    ['ФОТ оператора в месяц', facility.averageWorkerSalaryRub, 'руб/мес'],
    [''],
    ['Параметры What-If моделирования:'],
    ['Индексация/Изменение ФОТ', `${whatIf.salaryChangePercent || 0}%`, '%'],
    ['Масштабирование грузопотока', `${whatIf.throughputChangePercent ?? 100}%`, '%'],
    ['Субсидия / Скидка на CAPEX', `${whatIf.capexDiscountPercent || 0}%`, '%'],
    [''],
    ['ДИСКЛЕЙМЕР', MANDATORY_LEGAL_DISCLAIMER],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

  // Sheet 2: «Состав флота»
  const sheet2Header = [
    'Производитель',
    'Модель робота',
    'Тип операции',
    'Количество (ед.)',
    'Автономность (ч)',
    'Зарядка (мин)',
    'Паспортная выработка (шт/ч)',
    'CAPEX за ед. (руб)',
    'Годовой OPEX за ед. (руб)',
    'RaaS ставка/мес (руб)',
    'Итоговый CAPEX флота (руб)',
    'Итоговый OPEX флота (руб/год)',
  ];

  const sheet2Rows = compositionItems.map((item) => [
    item.robot.vendor,
    item.robot.model,
    item.robot.operationType,
    item.count,
    item.robot.batteryRuntimeHours,
    item.robot.batteryChargeMinutes,
    item.robot.throughputPerHour,
    item.robot.capexCostRub,
    item.robot.annualOpexCostRub,
    item.robot.monthlyRaasCostRub,
    item.totalCapexRub,
    item.totalAnnualOpexRub,
  ]);

  const totalFleetSize = compositionItems.reduce((s, i) => s + i.count, 0);
  const totalFleetCapex = compositionItems.reduce((s, i) => s + i.totalCapexRub, 0);
  const totalFleetAnnualOpex = compositionItems.reduce(
    (s, i) => s + i.totalAnnualOpexRub,
    0
  );

  const sheet2Data = [
    ['СОСТАВ И ХАРАКТЕРИСТИКИ ВЫБРАННОГО РОБОТИЗИРОВАННОГО ФЛОТА'],
    ['Суммарный размер флота (ед.)', totalFleetSize],
    [''],
    sheet2Header,
    ...sheet2Rows,
    [''],
    [
      'ИТОГО ПО ФЛОТУ',
      '',
      '',
      totalFleetSize,
      '',
      '',
      '',
      '',
      '',
      '',
      totalFleetCapex,
      totalFleetAnnualOpex,
    ],
    [''],
    ['ДИСКЛЕЙМЕР', MANDATORY_LEGAL_DISCLAIMER],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);

  // Sheet 3: «Сравнение 3 сценариев»
  const asIsCapex = economics?.asIs.capex ?? 0;
  const asIsOpex = economics?.asIs.annualOpex ?? 0;
  const asIsTco = economics?.asIs.fiveYearTco ?? asIsOpex * 5;

  const capexCapex = economics?.capexPurchase.capex ?? totalFleetCapex;
  const capexOpex = economics?.capexPurchase.annualOpex ?? totalFleetAnnualOpex;
  const capexSavings = economics?.capexPurchase.netAnnualSavings ?? (asIsOpex - capexOpex);
  const capexPayback = economics?.capexPurchase.paybackYears ?? (capexSavings > 0 ? capexCapex / capexSavings : 99);
  const capexTco = economics?.capexPurchase.fiveYearTco ?? (capexCapex + 5 * capexOpex);
  const capexRoi = economics?.capexPurchase.fiveYearRoi ?? (capexCapex > 0 ? ((5 * capexSavings - capexCapex) / capexCapex) * 100 : 0);

  const raasCapex = economics?.raas.capex ?? 0;
  const raasOpex = economics?.raas.annualOpex ?? compositionItems.reduce((s, i) => s + i.count * i.robot.monthlyRaasCostRub * 12, 0);
  const raasSavings = economics?.raas.netAnnualSavings ?? (asIsOpex - raasOpex);
  const raasTco = economics?.raas.fiveYearTco ?? (raasOpex * 5);

  const sheet3Data = [
    ['СРАВНИТЕЛЬНЫЙ АНАЛИЗ ФИНАНСОВЫХ СЦЕНАРИЕВ (5-ЛЕТНИЙ ГОРИЗОНТ)'],
    [''],
    ['Финансовый показатель', 'Базовый (As-Is: Люди)', 'Покупка (CAPEX: Парк)', 'Подписка (RaaS)'],
    ['Первоначальный CAPEX (руб)', asIsCapex, capexCapex, raasCapex],
    ['Годовой OPEX (руб/год)', asIsOpex, capexOpex, raasOpex],
    ['Чистая экономия в год (руб/год)', 0, capexSavings, raasSavings],
    ['Срок окупаемости (лет)', 'Н/Д', capexPayback > 5 ? '>5 лет' : Math.round(capexPayback * 10) / 10, 'Мгновенно (<0.5 года)'],
    ['5-летний ROI (%)', 'Н/Д', Math.round(capexRoi * 10) / 10, 'Н/Д (без CAPEX)'],
    ['5-летний TCO (руб)', asIsTco, capexTco, raasTco],
    [''],
    ['ИТОГОВЫЙ ВЕРДИКТ И ЭКСПЕРТНАЯ РЕКОМЕНДАЦИЯ REO'],
    ['Статус вердикта', economics?.capexPurchase.verdict || 'FEASIBLE'],
    ['Рекомендованный сценарий', economics?.recommendedScenario || 'capexPurchase'],
    ['Пояснение', economics?.capexPurchase.verdictText || 'Инвестиционно привлекательный проект'],
    [''],
    ['ДИСКЛЕЙМЕР', MANDATORY_LEGAL_DISCLAIMER],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);

  // Sheet 4: «TCO по годам (1–5 лет)»
  const salaryIndexationRate = 0.07;
  const asIsYears = [1, 2, 3, 4, 5].map((y) => Math.round(asIsOpex * Math.pow(1 + salaryIndexationRate, y - 1)));
  const capexYears = [1, 2, 3, 4, 5].map((y) => Math.round(capexOpex * Math.pow(1 + salaryIndexationRate * 0.5, y - 1)));
  const raasYears = [1, 2, 3, 4, 5].map((y) => Math.round(raasOpex * Math.pow(1 + salaryIndexationRate * 0.5, y - 1)));

  let cumAsIs = 0;
  const asIsCum = asIsYears.map((val) => {
    cumAsIs += val;
    return cumAsIs;
  });

  let cumCapexVal = capexCapex;
  const capexCum = capexYears.map((val) => {
    cumCapexVal += val;
    return cumCapexVal;
  });

  let cumRaasVal = 0;
  const raasCum = raasYears.map((val) => {
    cumRaasVal += val;
    return cumRaasVal;
  });

  const sheet4Data = [
    ['ПОГОДОВАЯ ДИНАМИКА НАКОПЛЕННЫХ ЗАТРАТ (TCO ПО ГОДАМ 1-5)'],
    ['Ежегодная индексация затрат: +7%/год для ручного труда, +3.5%/год для обслуживания роботов'],
    [''],
    ['Показатель / Год', 'Год 0 (Старт)', 'Год 1', 'Год 2', 'Год 3', 'Год 4', 'Год 5'],
    ['--- СЦЕНАРИЙ 1: AS-IS (РУЧНОЙ ТРУД) ---'],
    ['Ежегодные затраты OPEX (руб)', 0, ...asIsYears],
    ['Накопленные затраты (Cumulative TCO, руб)', 0, ...asIsCum],
    [''],
    ['--- СЦЕНАРИЙ 2: ПОКУПКА (CAPEX) ---'],
    ['Инвестиции CAPEX (руб)', capexCapex, 0, 0, 0, 0, 0],
    ['Ежегодные затраты OPEX (руб)', 0, ...capexYears],
    ['Накопленные затраты (Cumulative TCO, руб)', capexCapex, ...capexCum],
    ['Накопленная экономия vs As-Is (руб)', -capexCapex, ...asIsCum.map((a, idx) => a - capexCum[idx])],
    [''],
    ['--- СЦЕНАРИЙ 3: ПОДПИСКА (RaaS) ---'],
    ['Ежегодные затраты OPEX (руб)', 0, ...raasYears],
    ['Накопленные затраты (Cumulative TCO, руб)', 0, ...raasCum],
    ['Накопленная экономия vs As-Is (руб)', 0, ...asIsCum.map((a, idx) => a - raasCum[idx])],
    [''],
    ['ДИСКЛЕЙМЕР', MANDATORY_LEGAL_DISCLAIMER],
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Data);

  XLSX.utils.book_append_sheet(wb, ws1, 'Параметры объекта');
  XLSX.utils.book_append_sheet(wb, ws2, 'Состав флота');
  XLSX.utils.book_append_sheet(wb, ws3, 'Сравнение 3 сценариев');
  XLSX.utils.book_append_sheet(wb, ws4, 'TCO по годам (1–5 лет)');

  XLSX.writeFile(
    wb,
    `Feasibility_Model_${facility.industry}_${Date.now()}.xlsx`
  );
}

export function generateFinancialExcel(data: ProjectExportData): void {
  const { facility, selectedRobot, fleetSize, economicEvaluation, whatIf } = data;
  const compositionItem: FleetCompositionItem = {
    robot: selectedRobot,
    count: fleetSize,
    totalThroughputPerHour: fleetSize * selectedRobot.throughputPerHour,
    totalCapexRub: fleetSize * selectedRobot.capexCostRub * 1.15,
    totalAnnualOpexRub: fleetSize * selectedRobot.annualOpexCostRub,
    fiveYearTcoRub:
      fleetSize * selectedRobot.capexCostRub * 1.15 +
      5 * fleetSize * selectedRobot.annualOpexCostRub,
  };

  exportFeasibilityToExcel(facility, [compositionItem], economicEvaluation, whatIf);
}
