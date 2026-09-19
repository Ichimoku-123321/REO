import React from 'react';
import type { Robot } from '../types/robot.js';
import type { FacilityRequirements } from '../types/facility.js';
import type { FleetCompositionItem, HeterogeneousOptimizationResult } from '../engine/fleet_optimizer.js';
import { SEED_ROBOTS } from '../data/robots.seed.js';
import { isRobotEligible } from '../engine/dss.js';
import {
  Sparkles,
  Sliders,
  Play,
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
    <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-5 mb-8 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 border-b border-slate-700/80 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-400" />
            Конфигурация состава флота
          </h2>
          <p className="text-xs text-slate-400">
            Выберите режим формирования парка роботов или настройте количество моделей вручную
          </p>
        </div>

        {/* Mode Selector Toggle */}
        <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl p-1">
          <button
            type="button"
            onClick={() => onModeChange('ai')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'ai'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Режим 1: Оптимум ИИ</span>
          </button>

          <button
            type="button"
            onClick={() => onModeChange('manual')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'manual'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>Режим 2: Ручной выбор</span>
          </button>
        </div>
      </div>

      {/* Mode 1: AI Composition Display */}
      {mode === 'ai' && (
        <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-4 mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Рекомендованный алгоритмом состав флота:
            </span>

            {aiOptimizationResult.isHeterogeneous ? (
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/30">
                <Percent className="w-3.5 h-3.5" />
                Экономия TCO: {aiOptimizationResult.tcoSavingsPercentVsBestMono}% (Мульти-флот)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-blue-500/10 text-blue-400 text-xs font-bold px-3 py-1 rounded-full border border-blue-500/30">
                Монофлот (Оптимальный CAPEX/TCO)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {aiOptimizationResult.composition.map((item: FleetCompositionItem) => (
              <div
                key={item.robot.id}
                className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold text-slate-100">{item.robot.model}</p>
                  <p className="text-[11px] text-slate-400">{item.robot.vendor}</p>
                </div>
                <div className="text-right">
                  <span className="bg-blue-600/30 text-blue-300 text-xs font-bold px-2.5 py-1 rounded border border-blue-500/30">
                    {item.count} ед.
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mode 2: Manual Selection Grid (All 9 Sandbox Robots) */}
      {mode === 'manual' && (
        <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-4 mb-5">
          <p className="text-xs font-bold text-slate-300 mb-3">
            Песочница моделей (все 9 роботов из базы):
          </p>

          <div className="grid grid-cols-1 gap-2.5">
            {allRobots.map((robot) => {
              const currentCount = manualFleetCounts[robot.id] || 0;
              const isSelected = currentCount > 0;
              const { isEligible, exclusionReasons } = isRobotEligible(facility, robot);

              return (
                <div
                  key={robot.id}
                  className={`border rounded-xl p-3 transition-all ${
                    !isEligible
                      ? 'bg-amber-950/20 border-amber-500/70'
                      : isSelected
                      ? 'bg-blue-950/40 border-blue-500/60 shadow-md'
                      : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          onManualCountChange(robot.id, isSelected ? 0 : 1)
                        }
                        className={`w-5 h-5 rounded shrink-0 flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'border-slate-600 bg-slate-800'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-100 leading-tight truncate">
                          {robot.model}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">{robot.vendor}</p>
                      </div>
                    </div>

                    <span className="text-[10px] shrink-0 bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                      до {robot.payloadKg} кг
                    </span>
                  </div>

                  {/* Warning Badge if Ineligible */}
                  {!isEligible && (
                    <div className="mb-2 p-1.5 bg-amber-500/10 border border-amber-500/30 rounded text-[10px] text-amber-300 font-medium leading-tight flex items-start gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        ⚠️ Ограничение: {exclusionReasons[0]}
                      </span>
                    </div>
                  )}

                  {/* Count Stepper Control (unblocked) */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
                    <span className="text-[11px] text-slate-400">Количество:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onManualCountChange(robot.id, Math.max(0, currentCount - 1))
                        }
                        disabled={currentCount === 0}
                        className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={currentCount}
                        onChange={(e) =>
                          onManualCountChange(
                            robot.id,
                            Math.max(0, parseInt(e.target.value, 10) || 0)
                          )
                        }
                        className="w-12 bg-slate-900 border border-slate-700 text-center text-xs font-bold text-slate-100 rounded py-0.5 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => onManualCountChange(robot.id, currentCount + 1)}
                        className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Action Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRunSimulation}
          disabled={isCalculating}
          className="flex items-center gap-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-blue-600/25 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="w-5 h-5 fill-current" />
          <span>Запустить моделирование и расчет</span>
        </button>
      </div>
    </div>
  );
};
