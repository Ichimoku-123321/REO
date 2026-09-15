import React, { useState } from 'react';
import type { EvaluatedRobot } from '../types/robot.js';
import { ChevronDown, AlertTriangle, XCircle, DollarSign } from 'lucide-react';

interface ExcludedRobotsAccordionProps {
  excludedRobots: EvaluatedRobot[];
}

export const ExcludedRobotsAccordion: React.FC<ExcludedRobotsAccordionProps> = ({
  excludedRobots,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (excludedRobots.length === 0) {
    return null;
  }

  return (
    <div className="border border-amber-500/40 rounded-xl bg-slate-800/60 overflow-hidden shadow-lg">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-amber-500/10 hover:bg-amber-500/20 transition duration-150 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
              Исключенные решения
              <span className="bg-amber-500/30 text-amber-300 text-xs font-extrabold px-2.5 py-0.5 rounded-full border border-amber-500/40">
                {excludedRobots.length}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Нажмите, чтобы просмотреть роботов, не прошедших физические и отраслевые ограничения
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-amber-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="p-4 border-t border-amber-500/20 bg-slate-900/50 space-y-4">
          {excludedRobots.map(({ robot, result }) => (
            <div
              key={robot.id}
              className="bg-slate-800/80 border border-slate-700/80 rounded-lg p-4 transition"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    {robot.vendor}
                  </span>
                  <h4 className="text-base font-bold text-slate-200">{robot.model}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-full">
                    <XCircle className="w-3.5 h-3.5" />
                    Не подходит
                  </span>
                </div>
              </div>

              <div className="mb-3 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                <span>Грузоподъемность: <strong className="text-slate-200">{robot.payloadKg} кг</strong></span>
                <span>Мин. проезд: <strong className="text-slate-200">{robot.minAisleWidthMm} мм</strong></span>
                <span>Темп. диапазон: <strong className="text-slate-200">{robot.operatingTempRange.min}°C .. {robot.operatingTempRange.max}°C</strong></span>
                <span>CAPEX: <strong className="text-slate-200">{robot.capexCostRub.toLocaleString('ru-RU')} ₽</strong></span>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-rose-300 uppercase tracking-wider">
                  Причины дисквалификации:
                </p>
                <div className="flex flex-col gap-1.5">
                  {result.exclusionReasons.map((reason, idx) => (
                    <div
                      key={idx}
                      className="text-xs bg-rose-950/40 border border-rose-800/50 text-rose-200 px-3 py-1.5 rounded-md flex items-start gap-2"
                    >
                      <span className="text-rose-400 font-bold">•</span>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
