import React, { useMemo, useState } from 'react';
import type { Robot } from '../../../types/robot.js';
import type { FacilityRequirements } from '../../../types/facility.js';
import type { WhatIfParams } from '../../../engine/economics.js';
import { calculateAvailabilityCoefficient } from '../../../engine/economics.js';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Bot,
  Check,
} from 'lucide-react';

interface SideBySideViewProps {
  robots: Robot[];
  facility: FacilityRequirements;
  whatIf: WhatIfParams;
  selectedRobotId: string;
  onSelectRobot: (robotId: string) => void;
}

interface RobotBenchmarkResult {
  robot: Robot;
  isEligible: boolean;
  exclusionReasons: string[];
  // Кинематика и парк
  cycleTimeSec: number;
  singleRobotThroughput: number;
  availabilityCoeff: number;
  calculatedFleetSize: number;
  // Финансы
  netCapexRub: number;
  annualOpexRub: number;
  netAnnualSavingsRub: number;
  paybackYears: number | null;
  fiveYearTcoRub: number;
}

export const SideBySideView: React.FC<SideBySideViewProps> = ({
  robots,
  facility,
  whatIf,
  selectedRobotId,
  onSelectRobot,
}) => {
  const [showExcluded, setShowExcluded] = useState(false);

  // 1. Быстрый аналитический расчёт для каждого робота
  const benchmarkResults = useMemo(() => {
    const insuranceTaxRate = ((facility as any).insuranceRatePct ?? 30.2) / 100;
    const hrOverheadRate = ((facility as any).hrOverheadPct ?? 10.0) / 100;
    const energyTariffRubKwh = (facility as any).energyTariffRubKwh ?? 7.5;
    const integrationMarkupRate = ((facility as any).integrationMarkupPct ?? 15.0) / 100;
    const stateSubsidyRate = ((facility as any).stateSubsidyPct ?? 0.0) / 100;
    const shiftsPerDay = Math.max(1, facility.shiftsPerDay || 2);
    const operatingHoursPerYear = shiftsPerDay * 8 * 250;

    const effectiveThroughput = Math.max(
      1,
      facility.targetThroughputPerHour * (whatIf.throughputChangePercent / 100)
    );
    const effectiveSalary = Math.max(
      0,
      facility.averageWorkerSalaryRub * (1 + whatIf.salaryChangePercent / 100)
    );
    const capexDiscountFactor = Math.max(0, 1 - whatIf.capexDiscountPercent / 100);

    // Базовый ФОТ ручного труда
    const workersPerShift = Math.max(1, Math.ceil(effectiveThroughput / 12));
    const manualStaffCount = Math.ceil(workersPerShift * shiftsPerDay * 1.15);
    const loadedWorkerAnnualSalary =
      effectiveSalary * 12 * (1 + insuranceTaxRate) * (1 + hrOverheadRate);
    const baseManualAnnualOpex = manualStaffCount * loadedWorkerAnnualSalary + manualStaffCount * 140000;

    // Среднее плечо пробега склада (оценка по габаритам или площади)
    const avgDistanceM = Math.max(25, Math.round(Math.sqrt(facility.totalAreaSqm || 2800) * 0.75));

    return robots.map((robot): RobotBenchmarkResult => {
      const exclusionReasons: string[] = [];

      // XAI-фильтр 1: Грузоподъемность
      if (robot.payloadKg < facility.requiredPayloadKg) {
        exclusionReasons.push(
          `Грузоподъёмность (${robot.payloadKg} кг) < требования объекта (${facility.requiredPayloadKg} кг)`
        );
      }

      // XAI-фильтр 2: Ширина прохода
      const minAisleRequired = (robot as any).minAisleWidthM ?? ((robot as any).dimensions?.widthM ?? 0.9) + 0.4;
      if (facility.aisleWidthM < minAisleRequired) {
        exclusionReasons.push(
          `Проход склада (${facility.aisleWidthM} м) < габарита робота с запасом (${minAisleRequired.toFixed(1)} м)`
        );
      }

      // XAI-фильтр 3: Температура
      const tempMin = (robot as any).operatingTempMin ?? 0;
      const tempMax = (robot as any).operatingTempMax ?? 40;
      if (
        facility.operatingTempRange &&
        (facility.operatingTempRange.min < tempMin || facility.operatingTempRange.max > tempMax)
      ) {
        exclusionReasons.push(
          `Темп. диапазон (${tempMin}..${tempMax}°C) не покрывает объект (${facility.operatingTempRange.min}..${facility.operatingTempRange.max}°C)`
        );
      }

      const isEligible = exclusionReasons.length === 0;

      // Аналитическая кинематика цикла рейса
      const speed = Math.max(0.5, robot.maxSpeedMps * 0.85); // 85% от макс. скорости
      const travelTimeSec = (2 * avgDistanceM) / speed;
      const dockHandlingSec = 25; // время захвата паллеты
      const rackHandlingSec = 20; // время выгрузки на стеллаж
      const cycleTimeSec = Math.round(travelTimeSec + dockHandlingSec + rackHandlingSec);

      const singleRobotThroughput = Math.max(1, Math.round(3600 / cycleTimeSec));
      const availabilityCoeff = calculateAvailabilityCoefficient(
        robot.batteryRuntimeHours,
        robot.batteryChargeMinutes
      );

      // Потребный парк N
      const effectiveRobotCapacity = singleRobotThroughput * availabilityCoeff * 0.92; // 0.92 eta
      const calculatedFleetSize = Math.max(1, Math.ceil(effectiveThroughput / effectiveRobotCapacity));

      // Финансовая модель
      const chargersCount = Math.max(1, Math.ceil(calculatedFleetSize * (1 - availabilityCoeff) * 1.15));
      const hardwareCapex = calculatedFleetSize * robot.capexCostRub + chargersCount * 280000 + 1200000;
      const integrationCapex = hardwareCapex * integrationMarkupRate;
      const grossCapex = (hardwareCapex + integrationCapex) * capexDiscountFactor;
      const netCapexRub = Math.round(grossCapex * (1 - stateSubsidyRate));

      // OPEX
      const supervisorOpex =
        1 * shiftsPerDay * (effectiveSalary * 1.25) * 12 * (1 + insuranceTaxRate) * (1 + hrOverheadRate);
      const energyKwh = calculatedFleetSize * 0.85 * operatingHoursPerYear * 0.8;
      const energyOpex = energyKwh * energyTariffRubKwh;
      const maintenanceOpex = calculatedFleetSize * robot.annualOpexCostRub + 350000;
      const annualOpexRub = Math.round(supervisorOpex + energyOpex + maintenanceOpex);

      const netAnnualSavingsRub = Math.round(baseManualAnnualOpex - annualOpexRub);
      const paybackYears =
        netAnnualSavingsRub > 0 ? Math.round((netCapexRub / netAnnualSavingsRub) * 10) / 10 : null;

      // Полный расчет 5-летнего TCO с учетом ежегодной индексации ФОТ и тарифов (синхронно с DCF)
      const wageInflationRate = ((facility as any).fotIndexationPct ?? 8.0) / 100;
      let fiveYearRobotOpex = 0;
      for (let t = 0; t < 5; t++) {
        fiveYearRobotOpex += Math.round(
          supervisorOpex * Math.pow(1 + wageInflationRate, t) +
          energyOpex * Math.pow(1 + 0.06, t) +
          maintenanceOpex * Math.pow(1 + 0.05, t)
        );
      }
      const fiveYearTcoRub = netCapexRub + fiveYearRobotOpex;

      return {
        robot,
        isEligible,
        exclusionReasons,
        cycleTimeSec,
        singleRobotThroughput,
        availabilityCoeff,
        calculatedFleetSize,
        netCapexRub,
        annualOpexRub,
        netAnnualSavingsRub,
        paybackYears,
        fiveYearTcoRub,
      };
    });
  }, [robots, facility, whatIf]);

  const eligibleRobots = benchmarkResults.filter((r) => r.isEligible);
  const excludedRobots = benchmarkResults.filter((r) => !r.isEligible);

  const formatCurrency = (val: number): string => {
    return `${Math.round(val).toLocaleString('ru-RU')} ₽`;
  };

  const formatMillions = (val: number): string => {
    return `${(val / 1000000).toFixed(2)} млн ₽`;
  };

  return (
    <div className="space-y-4 font-mono text-xs text-[#1A1A1A]">
      {/* Header Info */}
      <div className="bg-[#FFFFFF] border border-[#D4AF37]/40 p-2.5 flex items-center justify-between text-[11px] rounded-none shadow-xs">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-[#8A6826]" />
          <span className="font-bold uppercase tracking-wider">
            МАТРИЦА СРАВНЕНИЯ РОБОТОВ (SIDE-BY-SIDE)
          </span>
        </div>
        <div className="text-[10px] text-[#4F4F47]">
          Допущено: <strong className="text-emerald-700">{eligibleRobots.length}</strong> из{' '}
          {robots.length} моделей
        </div>
      </div>

      {/* Main Comparative Matrix Table */}
      <div className="border border-[#D4AF37]/40 bg-[#FFFFFF] overflow-x-auto shadow-xs rounded-none">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#F4F4F0] border-b border-[#D4AF37]/40 text-[#4F4F47]">
              <th className="p-2.5 font-bold uppercase tracking-wider sticky left-0 bg-[#F4F4F0] z-10 border-r border-[#D4AF37]/30 min-w-[170px]">
                Параметр / Модель
              </th>
              {eligibleRobots.map(({ robot }) => {
                const isSelected = robot.id === selectedRobotId;
                return (
                  <th
                    key={robot.id}
                    className={`p-2.5 min-w-[160px] text-center border-r border-[#D4AF37]/20 transition ${
                      isSelected ? 'bg-[#D4AF37]/15 border-t-2 border-t-[#D4AF37]' : ''
                    }`}
                  >
                    <div className="font-bold text-[#1A1A1A] truncate">{robot.model}</div>
                    <div className="text-[9px] text-[#8C8C85] uppercase tracking-wider font-normal">
                      {robot.vendor}
                    </div>
                    {isSelected && (
                      <span className="inline-block mt-1 px-1.5 py-0.2 bg-[#D4AF37] text-[#1A1A1A] font-bold text-[8px] uppercase tracking-wider">
                        [ ТЕКУЩИЙ ]
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-[#D4AF37]/20">
            {/* РАЗДЕЛ А: ТЕХНИЧЕСКИЕ ДАННЫЕ */}
            <tr className="bg-[#F9F9F6] font-bold text-[10px] text-[#8A6826] uppercase">
              <td
                colSpan={eligibleRobots.length + 1}
                className="p-1.5 px-2.5 sticky left-0 bg-[#F9F9F6] border-y border-[#D4AF37]/30"
              >
                [ А. ТЕХНИЧЕСКИЕ ПАРАМЕТРЫ И ДОПУСК ]
              </td>
            </tr>

            <tr>
              <td className="p-2 font-medium text-[#4F4F47] sticky left-0 bg-[#FFFFFF] border-r border-[#D4AF37]/30">
                Грузоподъёмность
              </td>
              {eligibleRobots.map(({ robot }) => (
                <td key={robot.id} className="p-2 text-center border-r border-[#D4AF37]/20 tabular-nums">
                  <strong>{robot.payloadKg}</strong> кг
                </td>
              ))}
            </tr>

            <tr>
              <td className="p-2 font-medium text-[#4F4F47] sticky left-0 bg-[#FFFFFF] border-r border-[#D4AF37]/30">
                Макс. скорость
              </td>
              {eligibleRobots.map(({ robot }) => (
                <td key={robot.id} className="p-2 text-center border-r border-[#D4AF37]/20 tabular-nums">
                  {robot.maxSpeedMps} м/с
                </td>
              ))}
            </tr>

            <tr>
              <td className="p-2 font-medium text-[#4F4F47] sticky left-0 bg-[#FFFFFF] border-r border-[#D4AF37]/30">
                АКБ: работа / зарядка
              </td>
              {eligibleRobots.map(({ robot }) => (
                <td key={robot.id} className="p-2 text-center border-r border-[#D4AF37]/20 tabular-nums">
                  {robot.batteryRuntimeHours}ч / {robot.batteryChargeMinutes}мин
                </td>
              ))}
            </tr>

            {/* РАЗДЕЛ Б: КИНЕМАТИКА И ПАРК */}
            <tr className="bg-[#F9F9F6] font-bold text-[10px] text-[#8A6826] uppercase">
              <td
                colSpan={eligibleRobots.length + 1}
                className="p-1.5 px-2.5 sticky left-0 bg-[#F9F9F6] border-y border-[#D4AF37]/30"
              >
                [ Б. КИНЕМАТИКА ЦИКЛА И РАСЧЁТНЫЙ ФЛОТ ]
              </td>
            </tr>

            <tr>
              <td className="p-2 font-medium text-[#4F4F47] sticky left-0 bg-[#FFFFFF] border-r border-[#D4AF37]/30">
                Время цикла рейса
              </td>
              {eligibleRobots.map(({ robot, cycleTimeSec }) => (
                <td key={robot.id} className="p-2 text-center border-r border-[#D4AF37]/20 tabular-nums">
                  {cycleTimeSec} сек
                </td>
              ))}
            </tr>

            <tr>
              <td className="p-2 font-medium text-[#4F4F47] sticky left-0 bg-[#FFFFFF] border-r border-[#D4AF37]/30">
                Выработка 1 машины
              </td>
              {eligibleRobots.map(({ robot, singleRobotThroughput }) => (
                <td key={robot.id} className="p-2 text-center border-r border-[#D4AF37]/20 tabular-nums">
                  {singleRobotThroughput} палл/ч
                </td>
              ))}
            </tr>

            <tr className="bg-[#F4F4F0]/60 font-semibold">
              <td className="p-2 text-[#1A1A1A] sticky left-0 bg-[#F4F4F0] border-r border-[#D4AF37]/30">
                Потребный парк
              </td>
              {eligibleRobots.map(({ robot, calculatedFleetSize }) => (
                <td
                  key={robot.id}
                  className="p-2 text-center border-r border-[#D4AF37]/20 tabular-nums text-sm font-bold text-[#8A6826]"
                >
                  {calculatedFleetSize} ед.
                </td>
              ))}
            </tr>

            {/* РАЗДЕЛ В: ИНВЕСТИЦИИ И ЭКОНОМИКА */}
            <tr className="bg-[#F9F9F6] font-bold text-[10px] text-[#8A6826] uppercase">
              <td
                colSpan={eligibleRobots.length + 1}
                className="p-1.5 px-2.5 sticky left-0 bg-[#F9F9F6] border-y border-[#D4AF37]/30"
              >
                [ В. ИНВЕСТИЦИОННЫЙ РАСЧЁТ (ТЭО) ]
              </td>
            </tr>

            <tr>
              <td className="p-2 font-medium text-[#4F4F47] sticky left-0 bg-[#FFFFFF] border-r border-[#D4AF37]/30">
                Полный CAPEX проекта
              </td>
              {eligibleRobots.map(({ robot, netCapexRub }) => (
                <td key={robot.id} className="p-2 text-center border-r border-[#D4AF37]/20 tabular-nums font-semibold">
                  {formatMillions(netCapexRub)}
                </td>
              ))}
            </tr>

            <tr>
              <td className="p-2 font-medium text-[#4F4F47] sticky left-0 bg-[#FFFFFF] border-r border-[#D4AF37]/30">
                Чистая экономия / год
              </td>
              {eligibleRobots.map(({ robot, netAnnualSavingsRub }) => (
                <td
                  key={robot.id}
                  className={`p-2 text-center border-r border-[#D4AF37]/20 tabular-nums font-bold ${
                    netAnnualSavingsRub > 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {formatMillions(netAnnualSavingsRub)}
                </td>
              ))}
            </tr>

            <tr className="bg-[#F4F4F0]/60 font-semibold">
              <td className="p-2 text-[#1A1A1A] sticky left-0 bg-[#F4F4F0] border-r border-[#D4AF37]/30">
                Срок окупаемости
              </td>
              {eligibleRobots.map(({ robot, paybackYears }) => (
                <td key={robot.id} className="p-2 text-center border-r border-[#D4AF37]/20 tabular-nums">
                  {paybackYears !== null ? (
                    <span
                      className={`font-bold ${
                        paybackYears <= 3.0
                          ? 'text-emerald-700'
                          : paybackYears <= 4.5
                          ? 'text-[#8A6826]'
                          : 'text-red-700'
                      }`}
                    >
                      {paybackYears} года
                    </span>
                  ) : (
                    <span className="text-red-700">Не окупаем</span>
                  )}
                </td>
              ))}
            </tr>

            <tr>
              <td className="p-2 font-medium text-[#4F4F47] sticky left-0 bg-[#FFFFFF] border-r border-[#D4AF37]/30">
                TCO за 5 лет
              </td>
              {eligibleRobots.map(({ robot, fiveYearTcoRub }) => (
                <td key={robot.id} className="p-2 text-center border-r border-[#D4AF37]/20 tabular-nums text-[#4F4F47]">
                  {formatMillions(fiveYearTcoRub)}
                </td>
              ))}
            </tr>

            {/* РАЗДЕЛ Г: ДЕЙСТВИЕ */}
            <tr className="bg-[#FFFFFF]">
              <td className="p-2.5 font-bold text-[#1A1A1A] sticky left-0 bg-[#FFFFFF] border-r border-[#D4AF37]/30">
                Действие
              </td>
              {eligibleRobots.map(({ robot }) => {
                const isSelected = robot.id === selectedRobotId;
                return (
                  <td key={robot.id} className="p-2 text-center border-r border-[#D4AF37]/20">
                    <button
                      type="button"
                      disabled={isSelected}
                      onClick={() => onSelectRobot(robot.id)}
                      className={`w-full py-1.5 px-2 font-bold uppercase text-[10px] tracking-wider transition rounded-none flex items-center justify-center gap-1 ${
                        isSelected
                          ? 'bg-[#E5E5DF] text-[#8A6826] border border-[#D4AF37]/60 cursor-default'
                          : 'bg-[#D4AF37] hover:bg-[#BFA02E] text-[#1A1A1A] border border-[#BFA02E] cursor-pointer shadow-2xs'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3 h-3 text-[#8A6826]" />
                          <span>АКТИВЕН</span>
                        </>
                      ) : (
                        <span>НАЗНАЧИТЬ</span>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Accordion: Отклонённые XAI роботы */}
      {excludedRobots.length > 0 && (
        <div className="border border-[#D4AF37]/30 bg-[#FFFFFF] rounded-none">
          <button
            type="button"
            onClick={() => setShowExcluded((prev) => !prev)}
            className="w-full p-2.5 px-3 bg-[#F9F9F6] flex items-center justify-between text-left text-[11px] font-bold text-[#4F4F47] hover:text-[#1A1A1A] transition rounded-none"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>НЕСОВМЕСТИМЫЕ МОДЕЛИ КАТАЛОГА ({excludedRobots.length}) — ОБЪЯСНЕНИЕ XAI</span>
            </div>
            {showExcluded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showExcluded && (
            <div className="p-3 divide-y divide-[#D4AF37]/20 space-y-2">
              {excludedRobots.map(({ robot, exclusionReasons }) => (
                <div key={robot.id} className="pt-2 first:pt-0 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[#1A1A1A]">
                      {robot.model}{' '}
                      <span className="text-[#8C8C85] font-normal">({robot.vendor})</span>
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-red-100 border border-red-300 text-red-700 font-bold uppercase">
                      ОТКЛОНЁН
                    </span>
                  </div>
                  <ul className="text-[10px] text-red-600 space-y-0.5 pl-3 list-disc">
                    {exclusionReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
