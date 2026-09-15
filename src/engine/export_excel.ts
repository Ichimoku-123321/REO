import * as XLSX from 'xlsx';
import type { ProjectExportData } from './export_types.js';
import { MANDATORY_LEGAL_DISCLAIMER } from './export_types.js';

export function generateFinancialExcel(data: ProjectExportData): void {
  const wb = XLSX.utils.book_new();
  const { facility, selectedRobot, fleetSize, economicEvaluation, whatIf, generatedAt } = data;

  // Sheet 1: «Параметры объекта и робота»
  const sheet1Data = [
    ['ПАРАМЕТРЫ ИСХОДНОГО ОБЪЕКТА И ВЫБРАННОЙ РОБОТОТЕХНИКИ'],
    ['Дата формирования', generatedAt.toLocaleString('ru-RU')],
    ['Версия СППР', data.version || 'v1.0'],
    [''],
    ['1. Параметры объекта (Facility)'],
    ['Отрасль / Профиль', facility.industry],
    ['Общая площадь (кв. м)', facility.totalAreaSqm],
    ['Ширина прохода (м)', facility.aisleWidthM],
    ['Высота потолков (м)', facility.ceilingHeightM],
    ['Число смен в сутки', facility.shiftsPerDay],
    ['Часов работы в сутки', facility.hoursPerDay],
    ['Требуемая грузоподъемность (кг)', facility.requiredPayloadKg],
    ['Целевой грузопоток (ед/час)', facility.targetThroughputPerHour],
    ['Средний ФОТ оператора (руб/мес)', facility.averageWorkerSalaryRub],
    [''],
    ['2. Характеристики выбранного робота (Robot Specification)'],
    ['Вендор / Производитель', selectedRobot.vendor],
    ['Модель', selectedRobot.model],
    ['Тип операции', selectedRobot.operationType],
    ['Навигация', selectedRobot.navigationType],
    ['Грузоподъемность (кг)', selectedRobot.payloadKg],
    ['Макс. скорость (м/с)', selectedRobot.maxSpeedMps],
    ['Габариты (Д х Ш х В, мм)', `${selectedRobot.dimensionsMm.length} x ${selectedRobot.dimensionsMm.width} x ${selectedRobot.dimensionsMm.height}`],
    ['Автономность работы (часов)', selectedRobot.batteryRuntimeHours],
    ['Время быстрой зарядки (мин)', selectedRobot.batteryChargeMinutes],
    ['Паспортная выработка (ед/час)', selectedRobot.throughputPerHour],
    ['Стоимость закупки CAPEX (руб)', selectedRobot.capexCostRub],
    ['Годовой OPEX обслуживания (руб)', selectedRobot.annualOpexCostRub],
    ['Месячная ставка RaaS (руб/мес)', selectedRobot.monthlyRaasCostRub],
    [''],
    ['3. Расчетные параметры флота'],
    ['Коэффициент готовности (k_avail)', Math.round(economicEvaluation.availabilityCoeff * 1000) / 1000],
    ['Расчетный размер флота (N_fleet)', fleetSize],
    ['Фактический грузопоток (с учетом What-If)', economicEvaluation.effectiveThroughput],
    ['Фактический ФОТ (с учетом What-If)', economicEvaluation.effectiveSalary],
    [''],
    ['4. Параметры What-If анализа'],
    ['Изменение ФОТ (%)', whatIf.salaryChangePercent],
    ['Изменение грузопотока (%)', whatIf.throughputChangePercent],
    ['Скидка на CAPEX (%)', whatIf.capexDiscountPercent],
    [''],
    ['ДИСКЛЕЙМЕР', MANDATORY_LEGAL_DISCLAIMER],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

  // Sheet 2: «Сравнение сценариев»
  const sheet2Data = [
    ['СРАВНИТЕЛЬНЫЙ АНАЛИЗ ФИНАНСОВЫХ СЦЕНАРИЕВ (5-ЛЕТНИЙ ГОРИЗОНТ)'],
    [''],
    ['Показатель', 'Базовый (As-Is)', 'Покупка (CAPEX)', 'Подписка (RaaS)'],
    [
      'Первоначальный CAPEX (руб)',
      economicEvaluation.asIs.capex,
      economicEvaluation.capexPurchase.capex,
      economicEvaluation.raas.capex,
    ],
    [
      'Ежегодный OPEX (руб)',
      economicEvaluation.asIs.annualOpex,
      economicEvaluation.capexPurchase.annualOpex,
      economicEvaluation.raas.annualOpex,
    ],
    [
      'Чистая годовая экономия (руб)',
      economicEvaluation.asIs.netAnnualSavings,
      economicEvaluation.capexPurchase.netAnnualSavings,
      economicEvaluation.raas.netAnnualSavings,
    ],
    [
      'Срок окупаемости (лет)',
      'Н/Д',
      economicEvaluation.capexPurchase.paybackYears
        ? Math.round(economicEvaluation.capexPurchase.paybackYears * 10) / 10
        : 'Н/Д (>5 лет)',
      'Мгновенно (<0.5 года)',
    ],
    [
      '5-летний ROI (%)',
      'Н/Д',
      economicEvaluation.capexPurchase.fiveYearRoi
        ? Math.round(economicEvaluation.capexPurchase.fiveYearRoi * 10) / 10
        : 'Н/Д',
      'Н/Д (без CAPEX)',
    ],
    [
      'Совокупная стоимость владения (5-Year TCO, руб)',
      economicEvaluation.asIs.fiveYearTco,
      economicEvaluation.capexPurchase.fiveYearTco,
      economicEvaluation.raas.fiveYearTco,
    ],
    [''],
    ['ИТОГОВЫЙ ВЕРДИКТ И РЕКОМЕНДАЦИЯ'],
    ['Статус окупаемости', economicEvaluation.capexPurchase.verdict || 'yellow'],
    ['Рекомендованный сценарий', economicEvaluation.recommendedScenario],
    ['Пояснение вердикта', economicEvaluation.capexPurchase.verdictText || ''],
    [''],
    ['ДИСКЛЕЙМЕР', MANDATORY_LEGAL_DISCLAIMER],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);

  // Sheet 3: «Погодовой Cash Flow на 5 лет»
  const salaryIndexationRate = 0.07; // 7% annual salary indexation

  const cashFlowHeader = [
    'Статья денежного потока / Год',
    'Год 0 (Старт)',
    'Год 1',
    'Год 2',
    'Год 3',
    'Год 4',
    'Год 5',
    'Итого за 5 лет',
  ];

  // As-Is Cash Flow
  const asIsBaseOpex = economicEvaluation.asIs.annualOpex;
  const asIsOpexByYear = [1, 2, 3, 4, 5].map((y) => Math.round(asIsBaseOpex * Math.pow(1 + salaryIndexationRate, y - 1)));
  const asIsTotalTco = asIsOpexByYear.reduce((sum, v) => sum + v, 0);

  // CAPEX Cash Flow
  const initialCapexBuy = economicEvaluation.capexPurchase.capex;
  const baseSupervisorOpex = economicEvaluation.retainedSupervisorsCount * economicEvaluation.effectiveSalary * 1.3 * 12;
  const robotOpexBase = fleetSize * selectedRobot.annualOpexCostRub;

  const capexNetCashFlowByYear: number[] = [];
  const capexCumCashFlowByYear: number[] = [];
  let cumCapex = -initialCapexBuy;

  for (let y = 1; y <= 5; y++) {
    const indexedSupervisorOpex = baseSupervisorOpex * Math.pow(1 + salaryIndexationRate, y - 1);
    // Battery replacement / maintenance buffer on Year 3 and Year 4 (15% extra robot maintenance)
    const batteryBuffer = y === 3 || y === 4 ? fleetSize * selectedRobot.capexCostRub * 0.1 : 0;
    const yearCapexOpex = robotOpexBase + indexedSupervisorOpex + batteryBuffer;
    const yearSavings = asIsOpexByYear[y - 1] - yearCapexOpex;

    capexNetCashFlowByYear.push(Math.round(yearSavings));
    cumCapex += yearSavings;
    capexCumCashFlowByYear.push(Math.round(cumCapex));
  }

  // RaaS Cash Flow
  const raasOpexBase = fleetSize * selectedRobot.monthlyRaasCostRub * 12;
  const raasNetCashFlowByYear: number[] = [];
  const raasCumCashFlowByYear: number[] = [];
  let cumRaas = 0;

  for (let y = 1; y <= 5; y++) {
    const indexedSupervisorOpex = baseSupervisorOpex * Math.pow(1 + salaryIndexationRate, y - 1);
    const yearRaasOpex = raasOpexBase + indexedSupervisorOpex;
    const yearSavings = asIsOpexByYear[y - 1] - yearRaasOpex;

    raasNetCashFlowByYear.push(Math.round(yearSavings));
    cumRaas += yearSavings;
    raasCumCashFlowByYear.push(Math.round(cumRaas));
  }

  const sheet3Data = [
    ['ПОГОДОВОЙ CASH FLOW И ДИНАМИКА СБЕРЕЖЕНИЙ НА 5 ЛЕТ'],
    ['Макро-параметры: Индексация ФОТ = 7%/год, Буфер обслуживания батарей = 10% на 3 и 4 год.'],
    [''],
    cashFlowHeader,
    ['--- СЦЕНАРИЙ 1: AS-IS (РУЧНОЙ ТРУД) ---'],
    ['Инвестиции (CAPEX)', 0, 0, 0, 0, 0, 0, 0],
    ['Операционные расходы (OPEX с учетом +7% ФОТ)', 0, ...asIsOpexByYear, asIsTotalTco],
    ['Накопленный расход (Cumulative TCO)', 0, ...asIsOpexByYear.reduce<number[]>((acc, val, i) => {
      acc.push((acc[i - 1] || 0) + val);
      return acc;
    }, []), asIsTotalTco],
    [''],
    ['--- СЦЕНАРИЙ 2: ПОКУПКА (CAPEX) ---'],
    ['Инвестиции (CAPEX)', -initialCapexBuy, 0, 0, 0, 0, 0, -initialCapexBuy],
    ['Чистый операционный экономический эффект (Savings vs As-Is)', 0, ...capexNetCashFlowByYear, capexNetCashFlowByYear.reduce((a, b) => a + b, 0)],
    ['Накопленный денежный поток (Cumulative Net Cash Flow)', -initialCapexBuy, ...capexCumCashFlowByYear, capexCumCashFlowByYear[4]],
    [''],
    ['--- СЦЕНАРИЙ 3: ПОДПИСКА (RaaS) ---'],
    ['Инвестиции (CAPEX)', 0, 0, 0, 0, 0, 0, 0],
    ['Чистый операционный экономический эффект (Savings vs As-Is)', 0, ...raasNetCashFlowByYear, raasNetCashFlowByYear.reduce((a, b) => a + b, 0)],
    ['Накопленный денежный поток (Cumulative Net Cash Flow)', 0, ...raasCumCashFlowByYear, raasCumCashFlowByYear[4]],
    [''],
    ['ДИСКЛЕЙМЕР', MANDATORY_LEGAL_DISCLAIMER],
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);

  XLSX.utils.book_append_sheet(wb, ws1, 'Параметры объекта и робота');
  XLSX.utils.book_append_sheet(wb, ws2, 'Сравнение сценариев');
  XLSX.utils.book_append_sheet(wb, ws3, 'Cash Flow на 5 лет');

  XLSX.writeFile(wb, `Financial_Model_${facility.industry}_${Date.now()}.xlsx`);
}
