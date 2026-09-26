import React, { useState } from 'react';
import type { WhatIfParams } from '../../engine/economics.js';
import { DEFAULT_WHAT_IF_PARAMS } from '../../engine/economics.js';
import { SlidersHorizontal, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react';

interface WhatIfDockProps {
  whatIf: WhatIfParams;
  onChange: (params: WhatIfParams) => void;
  onOpenFormulaModal?: () => void;
}

export const WhatIfDock: React.FC<WhatIfDockProps> = ({
  whatIf,
  onChange,
  onOpenFormulaModal,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const isModified =
    whatIf.salaryChangePercent !== DEFAULT_WHAT_IF_PARAMS.salaryChangePercent ||
    whatIf.throughputChangePercent !== DEFAULT_WHAT_IF_PARAMS.throughputChangePercent ||
    whatIf.capexDiscountPercent !== DEFAULT_WHAT_IF_PARAMS.capexDiscountPercent;

  const handleReset = () => {
    onChange({ ...DEFAULT_WHAT_IF_PARAMS });
  };

  const handleSliderChange = (key: keyof WhatIfParams, value: number) => {
    onChange({
      ...whatIf,
      [key]: value,
    });
  };

  return (
    <div className="border-t border-[#D4AF37]/50 bg-[#FFFFFF] font-mono text-xs text-[#1A1A1A] shrink-0 select-none rounded-none shadow-sm">
      {/* Dock Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#F9F9F6] border-b border-[#D4AF37]/30">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#8A6826]" />
          <span className="font-bold uppercase tracking-wider text-[11px] text-[#1A1A1A]">
            WHAT-IF АНАЛИЗ ЧУВСТВИТЕЛЬНОСТИ
          </span>
          {isModified && (
            <span className="px-1.5 py-0.2 bg-[#D4AF37]/20 border border-[#D4AF37] text-[9px] text-[#8A6826] font-bold">
              АКТИВЕН
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {onOpenFormulaModal && (
            <button
              type="button"
              onClick={onOpenFormulaModal}
              className="px-1.5 py-0.5 text-[10px] text-[#4F4F47] hover:text-[#1A1A1A] hover:bg-[#EAEAE6] transition rounded-none"
              title="Открыть формулы расчёта"
            >
              [ƒx Формулы]
            </button>
          )}

          {isModified && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-[#F4F4F0] hover:bg-[#EAEAE6] border border-[#D4AF37]/40 text-[#8A6826] font-bold transition rounded-none cursor-pointer"
              title="Сбросить к исходным параметрам"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Сброс</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1 text-[#4F4F47] hover:text-[#1A1A1A] transition rounded-none"
            title={isExpanded ? 'Свернуть панель' : 'Развернуть панель'}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Sliders Grid */}
      {isExpanded && (
        <div className="p-3 space-y-2.5 bg-[#FFFFFF]">
          {/* 1. ФОТ / Индексация */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#4F4F47]">Коррекция ФОТ:</span>
              <span
                className={`font-bold tabular-nums ${
                  whatIf.salaryChangePercent > 0
                    ? 'text-red-700'
                    : whatIf.salaryChangePercent < 0
                    ? 'text-emerald-700'
                    : 'text-[#1A1A1A]'
                }`}
              >
                {whatIf.salaryChangePercent > 0 ? `+${whatIf.salaryChangePercent}` : whatIf.salaryChangePercent}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-[#8C8C85]">-30%</span>
              <input
                type="range"
                min="-30"
                max="50"
                step="5"
                value={whatIf.salaryChangePercent}
                onChange={(e) => handleSliderChange('salaryChangePercent', parseInt(e.target.value, 10))}
                className="w-full accent-[#8A6826] bg-[#E5E5DF] h-1.5 cursor-pointer rounded-none"
              />
              <span className="text-[9px] text-[#8C8C85]">+50%</span>
            </div>
          </div>

          {/* 2. План выработки (Квота) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#4F4F47]">План выработки (квота):</span>
              <span
                className={`font-bold tabular-nums ${
                  whatIf.throughputChangePercent !== 100 ? 'text-[#8A6826]' : 'text-[#1A1A1A]'
                }`}
              >
                {whatIf.throughputChangePercent}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-[#8C8C85]">50%</span>
              <input
                type="range"
                min="50"
                max="200"
                step="5"
                value={whatIf.throughputChangePercent}
                onChange={(e) => handleSliderChange('throughputChangePercent', parseInt(e.target.value, 10))}
                className="w-full accent-[#8A6826] bg-[#E5E5DF] h-1.5 cursor-pointer rounded-none"
              />
              <span className="text-[9px] text-[#8C8C85]">200%</span>
            </div>
          </div>

          {/* 3. Субсидия / CAPEX-дисконт */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#4F4F47]">Субсидия / Скидка на CAPEX:</span>
              <span
                className={`font-bold tabular-nums ${
                  whatIf.capexDiscountPercent > 0 ? 'text-emerald-700' : 'text-[#1A1A1A]'
                }`}
              >
                {whatIf.capexDiscountPercent}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-[#8C8C85]">0%</span>
              <input
                type="range"
                min="0"
                max="30"
                step="1"
                value={whatIf.capexDiscountPercent}
                onChange={(e) => handleSliderChange('capexDiscountPercent', parseInt(e.target.value, 10))}
                className="w-full accent-[#8A6826] bg-[#E5E5DF] h-1.5 cursor-pointer rounded-none"
              />
              <span className="text-[9px] text-[#8C8C85]">30%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
