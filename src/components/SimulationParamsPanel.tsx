import React from 'react';
import { HardDrive, Clock, Target, AlertTriangle } from 'lucide-react';

export interface SimulationParams {
  targetHourlyQuota: number;
  durationHours: number;
  targetReplayFramesCount: number;
}

interface SimulationParamsPanelProps {
  params: SimulationParams;
  onChange: (updated: SimulationParams) => void;
  fleetSize: number;
}

export const SimulationParamsPanel: React.FC<SimulationParamsPanelProps> = ({
  params,
  onChange,
  fleetSize,
}) => {
  const effectiveFleetSize = Math.max(1, fleetSize);
  const estimatedRamMb =
    (effectiveFleetSize * params.targetReplayFramesCount * 100) / (1024 * 1024);
  const isHighRamWarning = estimatedRamMb > 500;

  return (
    <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-4 space-y-3.5">
      <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-amber-400" />
          Параметры симуляции и расчета
        </h3>
        <span className="text-[10px] font-mono font-semibold text-amber-400/80">REO ENGINE</span>
      </div>

      {/* 1. Target Hourly Quota (Q_target) */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center justify-between">
          <span>Целевой грузопоток (Q_target):</span>
          <span className="text-[10px] text-slate-400 font-mono">шт/час</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            value={params.targetHourlyQuota}
            onChange={(e) =>
              onChange({
                ...params,
                targetHourlyQuota: Math.max(1, parseInt(e.target.value, 10) || 1),
              })
            }
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-100 font-bold focus:outline-none focus:border-amber-400"
          />
        </div>
      </div>

      {/* 2. Simulation Duration (T) */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
          Длительность симуляции (T, часов):
        </label>
        <div className="flex items-center gap-1.5 mb-2">
          {[1, 8, 24, 72].map((presetHours) => (
            <button
              key={presetHours}
              type="button"
              onClick={() => onChange({ ...params, durationHours: presetHours })}
              className={`flex-1 py-1 text-[10px] font-mono font-bold rounded border transition-all ${
                params.durationHours === presetHours
                  ? 'bg-amber-400 text-slate-950 border-amber-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {presetHours}ч
            </button>
          ))}
        </div>
        <input
          type="number"
          min="1"
          value={params.durationHours}
          onChange={(e) =>
            onChange({
              ...params,
              durationHours: Math.max(1, parseInt(e.target.value, 10) || 1),
            })
          }
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-100 font-bold focus:outline-none focus:border-amber-400"
        />
      </div>

      {/* 3. Replay Buffer Size & RAM Badge */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
          Размер буфера кадров реплея (K_frames):
        </label>
        <div className="flex items-center gap-1.5 mb-2">
          {[3600, 7200, 14400].map((presetFrames) => (
            <button
              key={presetFrames}
              type="button"
              onClick={() =>
                onChange({ ...params, targetReplayFramesCount: presetFrames })
              }
              className={`flex-1 py-1 text-[10px] font-mono font-bold rounded border transition-all ${
                params.targetReplayFramesCount === presetFrames
                  ? 'bg-amber-400 text-slate-950 border-amber-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {presetFrames}
            </button>
          ))}
        </div>
        <input
          type="number"
          min="2"
          value={params.targetReplayFramesCount}
          onChange={(e) =>
            onChange({
              ...params,
              targetReplayFramesCount: Math.max(2, parseInt(e.target.value, 10) || 2),
            })
          }
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-100 font-bold focus:outline-none focus:border-amber-400 mb-2"
        />

        {/* Dynamic RAM Indicator */}
        <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400 flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-amber-400" />
              Расчетный буфер RAM:
            </span>
            <span
              className={`font-bold ${
                isHighRamWarning ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              RAM ≈ {estimatedRamMb < 0.1 ? '<0.1' : estimatedRamMb.toFixed(2)} МБ
            </span>
          </div>

          {isHighRamWarning && (
            <div className="mt-1 p-1.5 bg-amber-500/10 border border-amber-500/30 rounded text-[10px] text-amber-300 font-medium flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                ⚠️ Высокий расход RAM браузера (&gt;500 МБ), вкладка может зависнуть
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
