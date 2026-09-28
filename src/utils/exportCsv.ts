import type { FacilityRequirements } from '../types/facility.js';
import type { Robot } from '../types/robot.js';
import type { EconomicEvaluation } from '../engine/economics.js';

/**
 * Формирует и скачивает полный финансово-эксплуатационный отчет в формате CSV (Excel-ready).
 * Использует UTF-8 BOM и разделитель ';', гарантируя корректное открытие кириллицы в Microsoft Excel и Google Таблицах.
 */
export function exportFinancialModelToCsv(
  facility: FacilityRequirements,
  robot: Robot,
  evaluation: EconomicEvaluation
): void {
  const { asIs, capexPurchase, raas } = evaluation;
  const delimiter = ';';
  const rows: string[][] = [];

  const addRow = (...cells: (string | number | null | undefined)[]) => {
    rows.push(
      cells.map((cell) => {
        if (cell === null || cell === undefined) return '""';
        const str = String(cell).replace(/"/g, '""');
        return `"${str}"`;
      })
    );
  };

  const addEmptyRow = () => rows.push([]);

  // 1. Метаданные отчета
  addRow('СППР REO: ТЕХНИКО-ЭКОНОМИЧЕСКОЕ ОБОСНОВАНИЕ РОБОТИЗАЦИИ СКЛАДА');
  addRow('Дата формирования', new Date().toLocaleDateString('ru-RU'));
  addRow('Версия расчетной модели', '1.0-DCF (WACC 18%, Налог на прибыль 25%)');
  addRow('Итоговая рекомендация', evaluation.recommendedScenario.toUpperCase());
  addEmptyRow();

  // 2. Исходные параметры объекта
  addRow('1. ПАРАМЕТРЫ ОБЪЕКТА И ОГРАНИЧЕНИЯ');
  addRow('Параметр', 'Значение', 'Ед. изм.');
  addRow('Отраслевой профиль', facility.industry, '');
  addRow('Общая площадь склада', facility.totalAreaSqm, 'м²');
  addRow('Ширина межстеллажных аллей', facility.aisleWidthM, 'м');
  addRow('Плановый грузопоток (квота)', evaluation.effectiveThroughput, 'палл/ч');
  addRow('Сменный график', `${facility.shiftsPerDay || 2} смены`, 'по 8 ч (250 дн/год)');
  addRow('Оклад комплектовщика Gross', facility.averageWorkerSalaryRub, 'руб/мес');
  addRow('Ставка WACC', '18.0', '%');
  addRow('Ставка налога на прибыль', '25.0', '%');
  addEmptyRow();

  // 3. Спецификация оборудования и кинематика
  addRow('2. ВЫБРАННОЕ ОБОРУДОВАНИЕ И РАСЧЕТ ПАРКА');
  addRow('Параметр', 'Значение', 'Ед. изм.');
  addRow('Модель робота', robot.model, '');
  addRow('Производитель / Интегратор', robot.vendor, '');
  addRow('Номинальная грузоподъемность', robot.payloadKg, 'кг');
  addRow('Максимальная скорость', robot.maxSpeedMps, 'м/с');
  addRow('Время работы / зарядки АКБ', `${robot.batteryRuntimeHours} ч / ${robot.batteryChargeMinutes} мин`, '');
  addRow('Коэффициент готовности (k_avail)', evaluation.availabilityCoeff, '');
  addRow('Потребный парк (N_fleet)', evaluation.fleetSize, 'ед.');
  addRow('Количество зарядных постов', evaluation.chargersCount, 'шт.');
  addRow('Фактический грузопоток симуляции', evaluation.realizedThroughput ?? evaluation.effectiveThroughput, 'палл/ч');
  addRow('Выполнение целевой квоты', `${evaluation.quotaFulfilledPercent}%`, '');
  addEmptyRow();

  // 4. Сравнительная матрица 3 сценариев
  addRow('3. СРАВНИТЕЛЬНАЯ МАТРИЦА 3 СЦЕНАРИЕВ');
  addRow(
    'Финансово-экономический параметр',
    'Ручной труд (As-Is)',
    'Покупка (CAPEX)',
    'Сервис (RaaS-подписка)'
  );
  addRow('Первоначальный CAPEX проекта (руб)', 0, capexPurchase.capex, 0);
  addRow('Годовые эксплуатационные затраты OPEX (руб)', asIs.annualOpex, capexPurchase.annualOpex, raas.annualOpex);
  addRow('Чистая годовая экономия ΔOPEX (руб)', 0, capexPurchase.netAnnualSavings, raas.netAnnualSavings);
  addRow(
    'Дисконтированный срок окупаемости DPP (лет)',
    '—',
    capexPurchase.discountedPaybackYears ?? 'Не окупаем',
    'С первого месяца'
  );
  addRow('Совокупная стоимость владения TCO 5 лет (руб)', asIs.fiveYearTco, capexPurchase.fiveYearTco, raas.fiveYearTco);
  addRow('Чистая приведенная стоимость NPV 5 лет (руб)', 0, capexPurchase.npvRub, raas.npvRub);
  addRow('Внутренняя норма доходности IRR (%)', '—', capexPurchase.irrPercent ? `${capexPurchase.irrPercent}%` : '—', '—');
  addEmptyRow();

  // 5. Детализация инвестиционного бюджета (CAPEX)
  addRow('4. СТРУКТУРА КАПИТАЛЬНЫХ ЗАТРАТ (CAPEX)');
  addRow('Статья инвестиций', 'Сумма (руб)', 'Доля (%)');
  const totalHardware = evaluation.fleetSize * robot.capexCostRub;
  addRow('Робототехнические платформы', totalHardware, capexPurchase.capex > 0 ? Math.round((totalHardware / capexPurchase.capex) * 100) : 0);
  addRow('Инфраструктура (зарядки + RMS-сервер)', evaluation.infrastructureCapexRub, capexPurchase.capex > 0 ? Math.round((evaluation.infrastructureCapexRub / capexPurchase.capex) * 100) : 0);
  addRow('Интеграция и пусконаладка (15%)', evaluation.integrationCapexRub, capexPurchase.capex > 0 ? Math.round((evaluation.integrationCapexRub / capexPurchase.capex) * 100) : 0);
  addRow('Субсидии / Господдержка', capexPurchase.subsidyDeductionRub ? -capexPurchase.subsidyDeductionRub : 0, '');
  addRow('ИТОГО ЧИСТЫЙ CAPEX', capexPurchase.capex, '100%');
  addEmptyRow();

  // 6. Потоки DCF по годам
  addRow('5. ДИСПЕРСИЯ ДЕНЕЖНЫХ ПОТОКОВ ПО ГОДАМ (5-ЛЕТНИЙ DCF)');
  addRow(
    'Год',
    'OPEX As-Is (+8% инфляция ФОТ)',
    'OPEX роботов (руб)',
    'Чистая экономия ΔOPEX (руб)',
    'Амортизационный щит 25% (руб)',
    'Чистый денежный поток CF (руб)',
    'Коэф. дисконтирования (18%)',
    'Дисконтированный поток DCF (руб)',
    'Накопленный DCF (руб)'
  );

  capexPurchase.cashFlows.forEach((flow) => {
    addRow(
      `${flow.year} год`,
      flow.manualOpexRub,
      flow.robotOpexRub,
      flow.grossSavingsRub,
      flow.taxShieldRub,
      flow.netCashFlowRub,
      flow.discountFactor,
      flow.discountedCashFlowRub,
      flow.cumulativeDcfRub
    );
  });
  addEmptyRow();

  // Собираем CSV строку
  const csvContent = '\uFEFF' + rows.map((r) => r.join(delimiter)).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `REO_Financial_Model_${facility.industry}_${Date.now()}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
