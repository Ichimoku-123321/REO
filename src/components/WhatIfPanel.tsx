import React from 'react';
import type { WhatIfParams } from '../engine/economics.js';
import { Sliders, RotateCcw } from 'lucide-react';

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
    <div className="bg-[#FFFFFF] border border-[#D4AF37]/30 p-3 space-y-3 rounded-none text-xs text-[#1A1A1A]">
      <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-1.5 rounded-none">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#8A6826] flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#8A6826]" />
          Анализ чувствительности (What-If)
        </h3>
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-[10px] text-[#8A6826] hover:text-[#1A1A1A] font-mono cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Сброс</span>
        </button>
      </div>

      <div className="space-y-3 rounded-none">
        {/* Slider 1: Salary modifier */}
        <div className="p-2.5 bg-[#F4F4F0] border border-[#D4AF37]/20 rounded-none">
          <div className="flex justify-between items-center mb-1 font-mono text-[11px]">
            <span className="text-[#4F4F47]">Индексация зарплат ФОТ:</span>
            <strong className="text-[#8A6826] font-bold">
              {whatIf.salaryChangePercent > 0 ? `+${whatIf.salaryChangePercent}%` : `${whatIf.salaryChangePercent}%`}
            </strong>
          </div>
          <input
            type="range"
            min="-30"
            max="50"
            step="5"
            value={whatIf.salaryChangePercent}
            onChange={handleSalaryChange}
            className="w-full accent-[#D4AF37] cursor-pointer"
          />
        </div>

        {/* Slider 2: Target Throughput modifier */}
        <div className="p-2.5 bg-[#F4F4F0] border border-[#D4AF37]/20 rounded-none">
          <div className="flex justify-between items-center mb-1 font-mono text-[11px]">
            <span className="text-[#4F4F47]">Масштаб грузопотока:</span>
            <strong className="text-[#8A6826] font-bold">{whatIf.throughputChangePercent}%</strong>
          </div>
          <input
            type="range"
            min="50"
            max="200"
            step="10"
            value={whatIf.throughputChangePercent}
            onChange={handleThroughputChange}
            className="w-full accent-[#D4AF37] cursor-pointer"
          />
        </div>

        {/* Slider 3: CAPEX Discount */}
        <div className="p-2.5 bg-[#F4F4F0] border border-[#D4AF37]/20 rounded-none">
          <div className="flex justify-between items-center mb-1 font-mono text-[11px]">
            <span className="text-[#4F4F47]">Субсидия / Скидка CAPEX:</span>
            <strong className="text-[#8A6826] font-bold">{whatIf.capexDiscountPercent}%</strong>
          </div>
          <input
            type="range"
            min="0"
            max="30"
            step="5"
            value={whatIf.capexDiscountPercent}
            onChange={handleCapexDiscountChange}
            className="w-full accent-[#D4AF37] cursor-pointer"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenFormulaModal}
        className="w-full py-2 bg-[#FFFFFF] border border-[#D4AF37]/40 hover:bg-[#F4F4F0] font-mono text-xs text-[#8A6826] font-bold cursor-pointer rounded-none"
      >
        Показать формулы расчета (XAI)
      </button>
    </div>
  );
};
