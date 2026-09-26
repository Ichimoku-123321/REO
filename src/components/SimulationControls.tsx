import React from 'react';
import type { SimulationTelemetry } from '../engine/simulation_engine.js';
import type { SpectralAnalysisResult } from '../engine/spectral_analyzer.js';
import {
  Play,
  Pause,
  Zap,
  Bot,
  Volume2,
  VolumeX,
  Maximize,
} from 'lucide-react';

interface SimulationControlsProps {
  isPlaying: boolean;
  onTogglePlayPause: () => void;
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
  fleetSize,
  selectedRobotName,
}) => {
  const isDisabled = fleetSize === 0 || !selectedRobotName;
  const speedOptions = [1, 2, 5, 10];

  const formatTime = (totalSeconds: number): string => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);
    const mm = mins.toString().padStart(2, '0');
    const ss = secs.toString().padStart(2, '0');
    if (totalDurationSec > 3600 || hrs > 0) {
      const hh = hrs.toString().padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }
    return `${mm}:${ss}`;
  };

  return (
    <div className="bg-[#FFFFFF] border-t border-[#D4AF37]/40 px-4 py-2.5 font-mono text-xs text-[#1A1A1A] select-none shadow-sm rounded-none">
      {/* 1. Timeline Scrubber HUD Bar */}
      <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 px-3 py-1.5 mb-2 rounded-none">
        <div className="flex items-center justify-between text-[11px] font-bold mb-1">
          <span className="text-[#8A6826] font-mono text-xs tabular-nums">
            {formatTime(currentTimestampSec)}
          </span>
          <span className="text-[#4F4F47] text-[10px] uppercase tracking-wider">
            [ ВОСПРОИЗВЕДЕНИЕ СИМУЛЯЦИОННОГО РЕПЛЕЯ ]
          </span>
          <span className="text-[#1A1A1A] font-mono text-xs tabular-nums">
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
          className="w-full accent-[#8A6826] bg-[#E5E5DF] h-1.5 cursor-pointer rounded-none disabled:opacity-40 disabled:cursor-not-allowed"
        />
      </div>

      {/* 2. Control Buttons & Fleet Status Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Play/Pause Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlayPause}
            disabled={isDisabled}
            className={`flex items-center gap-2 px-4 py-1.5 font-bold uppercase text-[11px] tracking-wider border rounded-none transition cursor-pointer ${
              isDisabled
                ? 'bg-[#E5E5DF] text-[#8C8C85] border-[#D1D1CB] cursor-not-allowed'
                : isPlaying
                ? 'bg-[#D4AF37] hover:bg-[#BFA02E] text-[#1A1A1A] border-[#BFA02E]'
                : 'bg-[#10B981] hover:bg-[#059669] text-white border-[#059669]'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Пауза</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Старт</span>
              </>
            )}
          </button>
        </div>

        {/* Speed Multipliers */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-[#4F4F47] mr-1 flex items-center gap-1">
            <Zap className="w-3 h-3 text-[#8A6826]" />
            СКОРОСТЬ:
          </span>
          <div className="flex items-center border border-[#D4AF37]/30 bg-[#F9F9F6]">
            {speedOptions.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => onSpeedChange(speed)}
                disabled={isDisabled}
                className={`px-2.5 py-1 text-[11px] font-bold transition rounded-none ${
                  speedMultiplier === speed
                    ? 'bg-[#D4AF37] text-[#1A1A1A]'
                    : 'text-[#4F4F47] hover:text-[#1A1A1A] hover:bg-[#F4F4F0]'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Volume & Audio Controls */}
        <div className="flex items-center gap-2 bg-[#F9F9F6] border border-[#D4AF37]/30 px-2.5 py-1">
          <button
            type="button"
            onClick={onToggleMute}
            className="text-[#4F4F47] hover:text-[#1A1A1A] transition"
            title={isMuted ? 'Включить звук' : 'Выключить звук'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-red-500" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-[#8A6826]" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-16 accent-[#8A6826] bg-[#E5E5DF] h-1 cursor-pointer rounded-none"
          />
        </div>

        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="flex items-center gap-1 px-2.5 py-1 bg-[#F9F9F6] hover:bg-[#F4F4F0] border border-[#D4AF37]/30 text-[11px] font-semibold text-[#1A1A1A] transition rounded-none"
          title="Полноэкранный режим"
        >
          <Maximize className="w-3.5 h-3.5 text-[#8A6826]" />
          <span>FULLSCREEN</span>
        </button>

        {/* Selected Robot Spec & Fleet Size Badge */}
        <div className="flex items-center gap-2 bg-[#F4F4F0] border border-[#D4AF37]/40 px-3 py-1 font-semibold text-[11px]">
          <Bot className="w-3.5 h-3.5 text-[#8A6826]" />
          <span>
            {selectedRobotName ? (
              <>
                <span className="text-[#1A1A1A] font-bold">{selectedRobotName}</span>{' '}
                <span className="text-[#8A6826] tabular-nums">({fleetSize} ед.)</span>
              </>
            ) : (
              <span className="text-amber-700">Парк не укомплектован</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
