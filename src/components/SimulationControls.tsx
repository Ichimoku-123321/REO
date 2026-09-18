import React from 'react';
import type { SimulationTelemetry } from '../engine/simulation_engine.js';
import type { SpectralAnalysisResult } from '../engine/spectral_analyzer.js';
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
  Network,
  Volume2,
  VolumeX,
  Maximize,
} from 'lucide-react';

interface SimulationControlsProps {
  isPlaying: boolean;
  onTogglePlayPause: () => void;
  onReset: () => void;
  speedMultiplier: number;
  onSpeedChange: (speed: number) => void;
  currentTimestampSec: number;
  totalDurationSec?: number;
  onSeek: (seconds: number) => void;
  volume: number;
  onVolumeChange: (level: number) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  telemetry: SimulationTelemetry;
  targetThroughputPerHour: number;
  fleetSize: number;
  selectedRobotName: string | null;
  spectralAnalysis?: SpectralAnalysisResult;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  isPlaying,
  onTogglePlayPause,
  onReset,
  speedMultiplier,
  onSpeedChange,
  currentTimestampSec,
  totalDurationSec = 3600,
  onSeek,
  volume,
  onVolumeChange,
  isMuted,
  onToggleMute,
  onToggleFullscreen,
  telemetry,
  targetThroughputPerHour,
  fleetSize,
  selectedRobotName,
  spectralAnalysis,
}) => {
  const isDisabled = fleetSize === 0 || !selectedRobotName;
  const speedOptions = [1, 2, 5, 10];

  const formatTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const mm = mins.toString().padStart(2, '0');
    const ss = secs.toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const getConnectivityBadge = () => {
    if (!spectralAnalysis) return null;
    const { algebraicConnectivity } = spectralAnalysis;

    const isBottleneck =
      algebraicConnectivity < 0.05 && (telemetry.queuedCount >= 2 || telemetry.congestionDetected);

    if (isBottleneck) {
      return {
        label: `Связность сети (λ₂ = ${algebraicConnectivity}) — Обнаружено узкое горлышко`,
        statusText: 'Узкое горлышко',
        colorClass: 'text-red-400',
        bgClass: 'bg-red-500/10 border-red-500/20',
      };
    }

    if (algebraicConnectivity >= 0.15) {
      return {
        label: `Связность сети (λ₂ = ${algebraicConnectivity}) — Свободная топология`,
        statusText: 'Свободная топология',
        colorClass: 'text-emerald-400',
        bgClass: 'bg-emerald-500/10 border-emerald-500/20',
      };
    }

    return {
      label: `Связность сети (λ₂ = ${algebraicConnectivity}) — Высокая проходимость`,
      statusText: 'Высокая проходимость',
      colorClass: 'text-emerald-400',
      bgClass: 'bg-emerald-500/10 border-emerald-500/20',
    };
  };

  const connectivityBadge = getConnectivityBadge();

  return (
    <div className="bg-slate-900/95 border-b border-slate-700/80 p-4">
      {/* 1. Timeline Scrubber HUD Bar */}
      <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3 mb-4">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-2">
          <span className="text-blue-400 font-mono text-sm">
            {formatTime(currentTimestampSec)}
          </span>
          <span className="text-slate-400 text-[11px]">Воспроизведение реплея</span>
          <span className="text-slate-400 font-mono text-xs">
            {formatTime(totalDurationSec)}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max={totalDurationSec}
          step="1"
          value={Math.round(currentTimestampSec)}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          disabled={isDisabled}
          className="w-full accent-blue-500 bg-slate-700 h-2 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        />
      </div>

      {/* 2. Top Playback & HUD Control Row */}
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

        {/* Volume & Audio Synth Control */}
        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg p-1.5 px-3">
          <button
            type="button"
            onClick={onToggleMute}
            className="text-slate-300 hover:text-white transition-colors"
            title={isMuted ? 'Включить звук' : 'Выключить звук'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-blue-400" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-16 accent-blue-500 bg-slate-700 h-1.5 rounded cursor-pointer"
          />
        </div>

        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition-colors"
          title="Полноэкранный режим"
        >
          <Maximize className="w-4 h-4 text-slate-400" />
          <span>Fullscreen</span>
        </button>

        {/* Selected Robot & Fleet Size Badge */}
        <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-lg">
          <Bot className="w-4 h-4 text-blue-400" />
          <span>
            {selectedRobotName ? (
              <>
                <strong>{selectedRobotName}</strong> ({fleetSize} ед.)
              </>
            ) : (
              <span className="text-amber-400">Робот не выбран</span>
            )}
          </span>
        </div>
      </div>

      {/* Live Telemetry KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* 1. Throughput KPI Card */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 shrink-0">
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
          <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-lg border border-purple-500/20 shrink-0">
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
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 shrink-0">
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
              <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20 animate-pulse shrink-0">
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
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-400">Трафик и заторы</p>
                <p className="text-xs font-bold text-emerald-400">Движение свободное</p>
              </div>
            </>
          )}
        </div>

        {/* 5. Spectral Graph Connectivity Card */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg border shrink-0 ${
              connectivityBadge?.bgClass || 'bg-slate-700/50 border-slate-600'
            }`}
          >
            <Network className={`w-5 h-5 ${connectivityBadge?.colorClass || 'text-slate-400'}`} />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400">Связность сети (λ₂)</p>
            {spectralAnalysis ? (
              <p className={`text-xs font-bold ${connectivityBadge?.colorClass}`}>
                λ₂ = {spectralAnalysis.algebraicConnectivity}{' '}
                <span className="text-[10px] opacity-80 block font-normal">
                  ({connectivityBadge?.statusText})
                </span>
              </p>
            ) : (
              <p className="text-xs font-semibold text-slate-400">—</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
