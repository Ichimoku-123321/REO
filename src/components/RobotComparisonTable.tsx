import React from 'react';
import type { Robot } from '../types/robot.js';
import type { FacilityRequirements } from '../types/facility.js';
import type { WhatIfParams } from '../engine/economics.js';
import {
  calculateAvailabilityCoefficient,
  calculateFleetSize,
  calculateEconomics,
} from '../engine/economics.js';
import { Table, CheckCircle2 } from 'lucide-react';

interface RobotComparisonTableProps {
  robots: Robot[];
  facility: FacilityRequirements;
  whatIf: WhatIfParams;
  selectedRobotId: string;
  onSelectRobot: (robotId: string) => void;
}

export const RobotComparisonTable: React.FC<RobotComparisonTableProps> = ({
  robots,
  facility,
  whatIf,
  selectedRobotId,
  onSelectRobot,
}) => {
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (robots.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 shadow-md mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Table className="w-5 h-5 text-blue-400" />
            Сравнительный анализ допустимых роботов (Шаг 4)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Выберите модель для детального финансового моделирования и оценки окупаемости
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/80 text-xs uppercase text-slate-400 border-b border-slate-700">
            <tr>
              <th className="py-3 px-4">Выбор</th>
              <th className="py-3 px-4">Модель / Производитель</th>
              <th className="py-3 px-4 text-right">Грузоподъемность</th>
              <th className="py-3 px-4 text-right">Скорость</th>
              <th className="py-3 px-4 text-right">Автономность (k_avail)</th>
              <th className="py-3 px-4 text-right">Мин. проезд</th>
              <th className="py-3 px-4 text-right">Размер парка (N)</th>
              <th className="py-3 px-4 text-right">CAPEX парка</th>
              <th className="py-3 px-4 text-right">Срок окупаемости</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {robots.map((robot) => {
              const isSelected = robot.id === selectedRobotId;
              const kAvail = calculateAvailabilityCoefficient(
                robot.batteryRuntimeHours,
                robot.batteryChargeMinutes
              );
              const econ = calculateEconomics(facility, robot, whatIf);

              let paybackLabel = '—';
              if (econ.capexPurchase.paybackYears !== null) {
                paybackLabel = `${econ.capexPurchase.paybackYears.toFixed(1)} лет`;
              } else {
                paybackLabel = 'Не окупается';
              }

              return (
                <tr
                  key={robot.id}
                  onClick={() => onSelectRobot(robot.id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-950/40 border-l-4 border-l-blue-500'
                      : 'hover:bg-slate-700/30'
                  }`}
                >
                  <td className="py-3 px-4 text-center">
                    <div className="flex justify-center">
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-slate-500'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="w-4 h-4" />}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-100">
                    {robot.model}
                    <div className="text-xs text-slate-400 font-normal">{robot.vendor}</div>
                  </td>
                  <td className="py-3 px-4 text-right font-medium">{robot.payloadKg} кг</td>
                  <td className="py-3 px-4 text-right font-medium">{robot.maxSpeedMps} м/с</td>
                  <td className="py-3 px-4 text-right font-medium">
                    {robot.batteryRuntimeHours}ч ({Math.round(kAvail * 100)}%)
                  </td>
                  <td className="py-3 px-4 text-right font-medium">{robot.minAisleWidthMm} мм</td>
                  <td className="py-3 px-4 text-right font-bold text-blue-400">
                    {econ.fleetSize} шт.
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-100">
                    {formatMoney(econ.capexPurchase.capex)}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        econ.capexPurchase.verdict === 'green'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : econ.capexPurchase.verdict === 'yellow'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {paybackLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
