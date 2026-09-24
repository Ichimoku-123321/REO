import React from 'react';
import type { Robot } from '../types/robot.js';
import type { FacilityRequirements } from '../types/facility.js';
import type { FleetCompositionItem, HeterogeneousOptimizationResult } from '../engine/fleet_optimizer.js';
import { SEED_ROBOTS } from '../data/robots.seed.js';
import { isRobotEligible } from '../engine/dss.js';
import {
  Sparkles,
  Sliders,
  Check,
  Plus,
  Minus,
  Bot,
  Percent,
  AlertTriangle,
} from 'lucide-react';

export type FleetConfigMode = 'ai' | 'manual';

interface FleetConfigPanelProps {
  mode: FleetConfigMode;
  onModeChange: (mode: FleetConfigMode) => void;
  aiOptimizationResult: HeterogeneousOptimizationResult;
  manualFleetCounts: Record<string, number>;
  onManualCountChange: (robotId: string, count: number) => void;
  facility: FacilityRequirements;
  allRobots?: Robot[];
  eligibleRobots?: Robot[];
  onRunSimulation: () => void;
  isCalculating: boolean;
}

export const FleetConfigPanel: React.FC<FleetConfigPanelProps> = ({
  mode,
  onModeChange,
  aiOptimizationResult,
  manualFleetCounts,
  onManualCountChange,
  facility,
  allRobots = SEED_ROBOTS,
  onRunSimulation,
  isCalculating,
}) => {
  return (
    <div className="bg-[#FFFFFF] border border-[#D4AF37]/30 p-3 space-y-3 rounded-none text-xs text-[#1A1A1A]">
      <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-2 rounded-none">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#1A1A1A] flex items-center gap-1.5">
            <Bot className="w-4 h-4 text-[#8A6826]" />
            Конфигуратор состава флота
          </h2>
        </div>

        {/* Mode Selector Toggle */}
        <div className="flex border border-[#D4AF37]/40 text-[10px] font-mono rounded-none">
          <button
            type="button"
            onClick={() => onModeChange('ai')}
            className={`px-2 py-0.5 font-bold transition cursor-pointer rounded-none ${
              mode === 'ai'
                ? 'bg-[#D4AF37] text-[#1A1A1A]'
                : 'bg-[#FFFFFF] text-[#4F4F47] hover:text-[#1A1A1A]'
            }`}
          >
            ИИ
          </button>

          <button
            type="button"
            onClick={() => onModeChange('manual')}
            className={`px-2 py-0.5 font-bold transition cursor-pointer rounded-none ${
              mode === 'manual'
                ? 'bg-[#D4AF37] text-[#1A1A1A]'
                : 'bg-[#FFFFFF] text-[#4F4F47] hover:text-[#1A1A1A]'
            }`}
          >
            Все 9
          </button>
        </div>
      </div>

      {/* Mode 1: AI Composition Display */}
      {mode === 'ai' && (
        <div className="p-2.5 bg-[#FFFFFF] border border-[#D4AF37]/30 text-xs rounded-none space-y-1.5">
          {aiOptimizationResult.composition.length === 0 ? (
            <div className="p-2.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-none space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>⚠️ Склад не готов к расчету</span>
              </div>
              <p className="text-[10px] leading-tight text-amber-900">
                Разместите ворота приемки, ворота отгрузки и хотя бы один стеллаж в CAD-конструкторе. Невозможно рассчитать флот при нулевой вместимости.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#8A6826] font-semibold uppercase flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#8A6826]" />
                  Оптимальное решение REO:
                </span>

                {aiOptimizationResult.isHeterogeneous ? (
                  <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 border border-emerald-300 rounded-none">
                    Мульти-флот (TCO -{aiOptimizationResult.tcoSavingsPercentVsBestMono}%)
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold bg-[#D4AF37]/20 text-[#8A6826] px-1.5 py-0.5 rounded-none">
                    Монофлот
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {aiOptimizationResult.composition.map((item: FleetCompositionItem) => (
                  <div
                    key={item.robot.id}
                    className="p-2 bg-[#F4F4F0] border border-[#D4AF37]/20 flex items-center justify-between rounded-none"
                  >
                    <div>
                      <p className="text-xs font-bold text-[#1A1A1A] leading-tight">{item.robot.vendor} {item.robot.model}</p>
                      <p className="text-[10px] text-[#4F4F47]">до {item.robot.payloadKg} кг</p>
                    </div>
                    <span className="bg-[#D4AF37] text-[#1A1A1A] text-xs font-bold font-mono px-2 py-0.5 rounded-none">
                      {item.count} ед.
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            onClick={onRunSimulation}
            disabled={isCalculating}
            className="w-full mt-2 py-2 bg-[#D4AF37] hover:bg-[#BFA02E] text-[#1A1A1A] font-bold text-[11px] uppercase tracking-wider border border-[#BFA02E] transition rounded-none cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#1A1A1A]" />
            <span>⚡ РАССЧИТАТЬ ОПТИМАЛЬНЫЙ ФЛОТ</span>
          </button>
        </div>
      )}

      {/* Mode 2: Manual Selection Grid (All 9 Sandbox Robots) */}
      {mode === 'manual' && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5 rounded-none">
          <p className="text-[10px] text-[#8A6826] font-semibold uppercase mb-1">
            Песочница моделей (все 9 роботов):
          </p>

          <div className="grid grid-cols-1 gap-2.5 rounded-none">
            {allRobots.map((robot) => {
              const currentCount = manualFleetCounts[robot.id] || 0;
              const isSelected = currentCount > 0;
              const { isEligible, exclusionReasons } = isRobotEligible(facility, robot);

              return (
                <div
                  key={robot.id}
                  className={`p-2 border text-[11px] rounded-none transition-all ${
                    !isEligible
                      ? 'bg-amber-50/60 border-amber-300 text-amber-900'
                      : isSelected
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37]'
                      : 'bg-[#FFFFFF] border-[#D4AF37]/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          onManualCountChange(robot.id, isSelected ? 0 : 1)
                        }
                        className={`w-4 h-4 shrink-0 font-bold flex items-center justify-center border text-[10px] rounded-none transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#D4AF37] border-[#BFA02E] text-[#1A1A1A]'
                            : 'border-[#D4AF37]/40 bg-[#FFFFFF] text-[#1A1A1A]'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                      <div className="truncate">
                        <span className="font-bold truncate text-[#1A1A1A] block leading-tight">
                          {robot.vendor} {robot.model}
                        </span>
                      </div>
                    </div>

                    <span className="text-[9px] font-mono shrink-0 text-[#8A6826] font-semibold">
                      {robot.payloadKg} кг
                    </span>
                  </div>

                  {/* Warning Badge if Ineligible */}
                  {!isEligible && (
                    <div className="mb-1.5 p-1 bg-amber-100/80 border border-amber-300 text-[10px] text-amber-900 font-medium leading-tight flex items-start gap-1 rounded-none">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <span>
                        ⚠️ Ограничение: {exclusionReasons[0]}
                      </span>
                    </div>
                  )}

                  {/* Count Stepper Control (unblocked) */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#D4AF37]/20 font-mono">
                    <span className="text-[10px] text-[#4F4F47]">Количество:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onManualCountChange(robot.id, Math.max(0, currentCount - 1))
                        }
                        disabled={currentCount === 0}
                        className="w-5 h-5 bg-[#EAEAE5] hover:bg-[#D4AF37] hover:text-[#1A1A1A] font-bold flex items-center justify-center text-xs text-[#1A1A1A] rounded-none disabled:opacity-30 cursor-pointer"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-bold text-[#8A6826] text-xs">
                        {currentCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => onManualCountChange(robot.id, currentCount + 1)}
                        className="w-5 h-5 bg-[#EAEAE5] hover:bg-[#D4AF37] hover:text-[#1A1A1A] font-bold flex items-center justify-center text-xs text-[#1A1A1A] rounded-none cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Action Button (Gold background with graphite text) */}
      <div className="pt-1">
        <button
          type="button"
          onClick={onRunSimulation}
          disabled={isCalculating}
          className="w-full py-2.5 bg-[#D4AF37] hover:bg-[#BFA02E] active:bg-[#8A6826] text-[#1A1A1A] font-bold uppercase tracking-wider text-xs border border-[#BFA02E] shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 rounded-none"
        >
          <span className="w-2 h-2 bg-[#1A1A1A]"></span>
          <span>{isCalculating ? 'REO: Расчет в процессе...' : 'Запустить моделирование и расчет'}</span>
        </button>
      </div>
    </div>
  );
};
