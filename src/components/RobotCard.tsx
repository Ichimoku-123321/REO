import React from 'react';
import type { Robot } from '../types/robot.js';
import { ShieldCheck, Truck, Zap, Gauge, DollarSign } from 'lucide-react';

interface RobotCardProps {
  robot: Robot;
}

export const RobotCard: React.FC<RobotCardProps> = ({ robot }) => {
  const formattedCapex = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(robot.capexCostRub);

  const operationLabels: Record<string, string> = {
    transport: 'Транспортировка',
    cleaning: 'Клининг',
    sorting: 'Сортировка',
    palletizing: 'Паллетирование',
  };

  const navLabels: Record<string, string> = {
    lidar_slam: 'LiDAR SLAM',
    qr_code: 'QR-коды',
    mixed: 'Комбинированная',
    gps_inertial: 'GPS / Инерциальная',
  };

  return (
    <div className="bg-slate-800/90 border border-emerald-500/30 rounded-xl p-5 shadow-lg hover:border-emerald-500/60 transition duration-200 flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {robot.vendor}
            </span>
            <h3 className="text-xl font-bold text-slate-100 leading-tight">
              {robot.model}
            </h3>
          </div>
          <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium px-2.5 py-1 rounded-full shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
            Совместим
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="bg-slate-700/80 text-slate-200 text-xs px-2.5 py-1 rounded-md font-medium">
            {operationLabels[robot.operationType] || robot.operationType}
          </span>
          <span className="bg-slate-700/80 text-slate-300 text-xs px-2.5 py-1 rounded-md">
            {navLabels[robot.navigationType] || robot.navigationType}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4 bg-slate-900/50 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2 text-slate-300">
            <Truck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="text-[11px] text-slate-400">Грузоподъемность</p>
              <p className="font-semibold">{robot.payloadKg} кг</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <Gauge className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <p className="text-[11px] text-slate-400">Макс. скорость</p>
              <p className="font-semibold">{robot.maxSpeedMps} м/с</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <p className="text-[11px] text-slate-400">Автономность</p>
              <p className="font-semibold">{robot.batteryRuntimeHours} ч</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <div className="w-4 h-4 rounded-full border border-slate-400 flex items-center justify-center text-[10px] text-slate-300 shrink-0">
              ↔
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Мин. проезд</p>
              <p className="font-semibold">{robot.minAisleWidthMm} мм</p>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-700/60 flex items-center justify-between">
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5 text-slate-400" /> CAPEX стоимость
        </span>
        <span className="text-lg font-bold text-emerald-400">{formattedCapex}</span>
      </div>
    </div>
  );
};
