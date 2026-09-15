import React from 'react';
import type { WhatIfParams } from '../engine/economics.js';
import { Sliders, RotateCcw, Info } from 'lucide-react';

interface WhatIfPanelProps {
  whatIf: WhatIfParams;
  onChange: (updated: WhatIfParams) => void;
  onOpenFormulaModal: () => void;
}

export const WhatIfPanel: React.FC<WhatIfPanelProps> = ({
  whatIf,
  onChange,
  onOpenFormulaModal,
}) => {
  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...whatIf, salaryChangePercent: Number(e.target.value) });
  };

  const handleThroughputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...whatIf, throughputChangePercent: Number(e.target.value) });
  };

  const handleCapexDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...whatIf, capexDiscountPercent: Number(e.target.value) });
  };

  const handleReset = () => {
    onChange({
      salaryChangePercent: 0,
      throughputChangePercent: 100,
      capexDiscountPercent: 0,
    });
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 shadow-md mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-purple-400" />
            Интерактивный Что-Если Анализ (Шаг 6)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Моделирование сценариев с изменением внешних макроэкономических факторов
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenFormulaModal}
            className="flex items-center gap-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            <Info className="w-4 h-4" />
            <span>Исходные предпосылки и формулы</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сброс</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Slider 1: Salary modifier */}
        <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-700/50">
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold text-slate-300">
              Изменение ФОТ оператора
            </label>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                whatIf.salaryChangePercent > 0
                  ? 'bg-rose-500/20 text-rose-400'
                  : whatIf.salaryChangePercent < 0
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              {whatIf.salaryChangePercent > 0 ? `+${whatIf.salaryChangePercent}%` : `${whatIf.salaryChangePercent}%`}
            </span>
          </div>
          <input
            type="range"
            min="-30"
            max="50"
            step="5"
            value={whatIf.salaryChangePercent}
            onChange={handleSalaryChange}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>-30%</span>
            <span>0%</span>
            <span>+50%</span>
          </div>
        </div>

        {/* Slider 2: Target Throughput modifier */}
        <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-700/50">
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold text-slate-300">
              Изменение целевого объема
            </label>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
              {whatIf.throughputChangePercent}%
            </span>
          </div>
          <input
            type="range"
            min="50"
            max="200"
            step="10"
            value={whatIf.throughputChangePercent}
            onChange={handleThroughputChange}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>50%</span>
            <span>100%</span>
            <span>200%</span>
          </div>
        </div>

        {/* Slider 3: CAPEX Discount */}
        <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-700/50">
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold text-slate-300">
              Скидка / Субсидия на CAPEX
            </label>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
              {whatIf.capexDiscountPercent}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="30"
            step="5"
            value={whatIf.capexDiscountPercent}
            onChange={handleCapexDiscountChange}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>0%</span>
            <span>15%</span>
            <span>30%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
