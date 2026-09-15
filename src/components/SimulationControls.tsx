import React from 'react';
import type { SimulationTelemetry } from '../engine/simulation_engine.js';
import {
  Play,
  Pause,
  RotateCcw,
  Zap,
  Activity,
  Gauge,
  Bot,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

interface SimulationControlsProps {
  isPlaying: boolean;
  onTogglePlayPause: () => void;
  onReset: () => void;
  speedMultiplier: number;
  onSpeedChange: (speed: number) => void;
  telemetry: SimulationTelemetry;
  targetThroughputPerHour: number;
  fleetSize: number;
  selectedRobotName: string | null;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  isPlaying,
  onTogglePlayPause,
  onReset,
  speedMultiplier,
  onSpeedChange,
  telemetry,
  targetThroughputPerHour,
  fleetSize,
  selectedRobotName,
}) => {
  const isDisabled = fleetSize === 0 || !selectedRobotName;
  const speedOptions = [1, 2, 5, 10];

  return (
    <div className="bg-slate-900/90 border-b border-slate-700/80 p-4">
      {/* Top Playback Control Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        {/* Play/Pause & Reset Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onTogglePlayPause}
            disabled={isDisabled}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all shadow-md ${
              isDisabled
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Пауза</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Старт</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onReset}
            disabled={isDisabled}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs border transition-all ${
              isDisabled
                ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сброс</span>
          </button>
        </div>

        {/* Speed Multiplier Selectors */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400 mr-1 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Ускорение:
          </span>
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-1">
            {speedOptions.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => onSpeedChange(speed)}
                disabled={isDisabled}
                className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                  speedMultiplier === speed
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Selected Robot & Fleet Size Badge */}
        <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-lg">
          <Bot className="w-4 h-4 text-blue-400" />
          <span>
            {selectedRobotName ? (
              <>
                <strong>{selectedRobotName}</strong> ({fleetSize} ед. в симуляции)
              </>
            ) : (
              <span className="text-amber-400">Робот не выбран</span>
            )}
          </span>
        </div>
      </div>

      {/* Live Telemetry KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Throughput KPI Card */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400">Фактическая выработка</p>
            <p className="text-sm font-bold text-slate-100">
              {telemetry.isCalibrating ? (
                <span className="text-blue-400 text-xs italic">Калибровка...</span>
              ) : (
                <>
                  <span className="text-blue-400 text-base">{telemetry.realizedThroughputPerHour}</span>
                  <span className="text-slate-400 font-normal"> / {targetThroughputPerHour} шт/ч</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* 2. Fleet Utilization KPI Card */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-lg border border-purple-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400">Загрузка парка</p>
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-purple-400">
                {telemetry.fleetUtilizationPercent}%
              </p>
              <div className="w-16 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${telemetry.fleetUtilizationPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Fleet Status Breakdown */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400">Статус парка</p>
            <p className="text-xs font-semibold text-slate-200">
              <span className="text-emerald-400">{telemetry.activeInTransitCount}</span> на линии /{' '}
              <span className="text-amber-400">{telemetry.chargingCount}</span> на зарядке
            </p>
          </div>
        </div>

        {/* 4. Traffic & Congestion Badge Card */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
          {telemetry.congestionDetected ? (
            <>
              <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20 animate-pulse">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-400">Трафик и заторы</p>
                <p className="text-xs font-bold text-amber-400 leading-tight">
                  Обнаружено ожидание: {telemetry.congestionNodeLabel || 'узловая точка'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-400">Трафик и заторы</p>
                <p className="text-xs font-bold text-emerald-400">Движение свободное</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
