import React from 'react';
import { HardDrive, Clock, AlertTriangle } from 'lucide-react';

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
    <div className="bg-[#FFFFFF] border border-[#D4AF37]/30 p-3 space-y-3 rounded-none text-xs text-[#1A1A1A]">
      <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-1.5 rounded-none">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#8A6826] flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-[#8A6826]" />
          Параметры симуляции и расчета
        </h3>
        <span className="text-[10px] font-mono font-bold text-[#8A6826]">REO ENGINE</span>
      </div>

      {/* 1. Target Hourly Quota (Q_target) */}
      <div>
        <label className="block text-[11px] font-semibold text-[#1A1A1A] mb-1 flex items-center justify-between">
          <span>Целевой грузопоток (Q_target):</span>
          <span className="text-[10px] text-[#4F4F47] font-mono">шт/час</span>
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
            className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-3 py-1 font-mono text-xs text-[#1A1A1A] font-bold focus:outline-none focus:border-[#D4AF37] rounded-none"
          />
        </div>
      </div>

      {/* 2. Simulation Duration (T) */}
      <div>
        <label className="block text-[11px] font-semibold text-[#1A1A1A] mb-1">
          Длительность симуляции (T, часов):
        </label>
        <div className="flex items-center gap-1 mb-1.5 font-mono">
          {[1, 8, 24, 72].map((presetHours) => (
            <button
              key={presetHours}
              type="button"
              onClick={() => onChange({ ...params, durationHours: presetHours })}
              className={`flex-1 py-1 text-[10px] font-mono font-bold border transition-all cursor-pointer rounded-none ${
                params.durationHours === presetHours
                  ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#BFA02E]'
                  : 'bg-[#F4F4F0] text-[#4F4F47] border-[#D4AF37]/30 hover:bg-[#EAEAE5]'
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
          className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-3 py-1 font-mono text-xs text-[#1A1A1A] font-bold focus:outline-none focus:border-[#D4AF37] rounded-none"
        />
      </div>

      {/* 3. Replay Buffer Size & RAM Badge */}
      <div>
        <label className="block text-[11px] font-semibold text-[#1A1A1A] mb-1">
          Размер буфера кадров реплея (K_frames):
        </label>
        <div className="flex items-center gap-1 mb-1.5 font-mono">
          {[3600, 7200, 14400].map((presetFrames) => (
            <button
              key={presetFrames}
              type="button"
              onClick={() =>
                onChange({ ...params, targetReplayFramesCount: presetFrames })
              }
              className={`flex-1 py-1 text-[10px] font-mono font-bold border transition-all cursor-pointer rounded-none ${
                params.targetReplayFramesCount === presetFrames
                  ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#BFA02E]'
                  : 'bg-[#F4F4F0] text-[#4F4F47] border-[#D4AF37]/30 hover:bg-[#EAEAE5]'
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
          className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-3 py-1 font-mono text-xs text-[#1A1A1A] font-bold focus:outline-none focus:border-[#D4AF37] mb-2 rounded-none"
        />

        {/* Dynamic RAM Indicator */}
        <div className="p-2 bg-[#F4F4F0] border border-[#D4AF37]/30 flex flex-col gap-1 rounded-none">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-[#4F4F47] flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-[#8A6826]" />
              Расчетный буфер RAM:
            </span>
            <span
              className={`font-bold tabular-nums ${
                isHighRamWarning ? 'text-amber-700' : 'text-[#8A6826]'
              }`}
            >
              RAM ≈ {estimatedRamMb < 0.1 ? '<0.1' : estimatedRamMb.toFixed(2)} МБ
            </span>
          </div>

          {isHighRamWarning && (
            <div className="mt-1 p-1.5 bg-amber-50 border border-amber-300 rounded-none text-[10px] text-amber-900 font-medium flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
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
