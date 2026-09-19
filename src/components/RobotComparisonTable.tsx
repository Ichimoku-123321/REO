import React from 'react';
import type { Robot } from '../types/robot.js';
import type { FacilityRequirements } from '../types/facility.js';
import type { WhatIfParams } from '../engine/economics.js';
import {
  calculateAvailabilityCoefficient,
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
    <div className="bg-[#FFFFFF] border border-[#D4AF37]/30 p-3 space-y-3 rounded-none text-xs text-[#1A1A1A]">
      <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-1.5 rounded-none">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#8A6826] flex items-center gap-1.5">
          <Table className="w-3.5 h-3.5 text-[#8A6826]" />
          Сравнительный ТТХ анализ
        </h3>
        <span className="text-[10px] font-mono text-[#4F4F47]">Совместимо: {robots.length}</span>
      </div>

      <div className="overflow-x-auto rounded-none">
        <table className="w-full text-left text-xs text-[#1A1A1A] font-mono">
          <thead className="bg-[#F4F4F0] text-[10px] uppercase text-[#8A6826] border-b border-[#D4AF37]/30">
            <tr>
              <th className="py-2 px-2">Модель</th>
              <th className="py-2 px-2 text-right">Нагрузка</th>
              <th className="py-2 px-2 text-right">Проезд</th>
              <th className="py-2 px-2 text-right">Парк N</th>
              <th className="py-2 px-2 text-right">CAPEX</th>
              <th className="py-2 px-2 text-right">Окупаемость</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D4AF37]/20 rounded-none">
            {robots.map((robot) => {
              const isSelected = robot.id === selectedRobotId;
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
                  className={`cursor-pointer transition-colors rounded-none ${
                    isSelected
                      ? 'bg-[#D4AF37]/20 font-bold'
                      : 'hover:bg-[#F4F4F0]'
                  }`}
                >
                  <td className="py-2 px-2 font-semibold text-[#1A1A1A]">
                    {robot.vendor} {robot.model}
                  </td>
                  <td className="py-2 px-2 text-right font-medium">{robot.payloadKg} кг</td>
                  <td className="py-2 px-2 text-right font-medium">{robot.minAisleWidthMm} мм</td>
                  <td className="py-2 px-2 text-right font-bold text-[#8A6826]">
                    {econ.fleetSize}
                  </td>
                  <td className="py-2 px-2 text-right font-semibold text-[#1A1A1A]">
                    {formatMoney(econ.capexPurchase.capex)}
                  </td>
                  <td className="py-2 px-2 text-right font-semibold">
                    <span
                      className={`px-1 py-0.5 text-[10px] rounded-none ${
                        econ.capexPurchase.verdict === 'green'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : econ.capexPurchase.verdict === 'yellow'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
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
