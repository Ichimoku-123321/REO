import React from 'react';
import type { ConstructorTileType } from '../engine/constructor_engine.js';
import {
  Boxes,
  ShieldAlert,
  Zap,
  ArrowRightCircle,
  ArrowLeftCircle,
  Eraser,
  Eye,
  RotateCcw,
} from 'lucide-react';

interface ConstructorToolbarProps {
  selectedTileType: ConstructorTileType;
  onSelectTileType: (type: ConstructorTileType) => void;
  showBottleneckHeatmap: boolean;
  onToggleBottleneckHeatmap: () => void;
  onResetGrid: () => void;
}

export const ConstructorToolbar: React.FC<ConstructorToolbarProps> = ({
  selectedTileType,
  onSelectTileType,
  showBottleneckHeatmap,
  onToggleBottleneckHeatmap,
  onResetGrid,
}) => {
  const tools: Array<{
    type: ConstructorTileType;
    label: string;
    icon: React.ReactNode;
    color: string;
  }> = [
    {
      type: 'RACK',
      label: 'Стеллаж',
      icon: <Boxes className="w-4 h-4" />,
      color: 'bg-slate-700 text-slate-200 border-slate-600',
    },
    {
      type: 'OBSTACLE',
      label: 'Колонна',
      icon: <ShieldAlert className="w-4 h-4 text-red-400" />,
      color: 'bg-red-950/60 text-red-200 border-red-800/60',
    },
    {
      type: 'CHARGER',
      label: 'Зарядка',
      icon: <Zap className="w-4 h-4 text-amber-400" />,
      color: 'bg-amber-950/60 text-amber-200 border-amber-800/60',
    },
    {
      type: 'DOCK_INBOUND',
      label: 'Приемка',
      icon: <ArrowRightCircle className="w-4 h-4 text-blue-400" />,
      color: 'bg-blue-950/60 text-blue-200 border-blue-800/60',
    },
    {
      type: 'DOCK_OUTBOUND',
      label: 'Отгрузка',
      icon: <ArrowLeftCircle className="w-4 h-4 text-sky-400" />,
      color: 'bg-sky-950/60 text-sky-200 border-sky-800/60',
    },
    {
      type: 'EMPTY_FLOOR',
      label: 'Очистить',
      icon: <Eraser className="w-4 h-4 text-emerald-400" />,
      color: 'bg-emerald-950/60 text-emerald-200 border-emerald-800/60',
    },
  ];

  return (
    <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 bg-slate-900/95 border border-slate-700/90 rounded-xl p-2 shadow-2xl backdrop-blur">
      <span className="text-xs font-bold text-slate-300 px-2 flex items-center gap-1.5 border-r border-slate-700/80 pr-3">
        🛠️ Инструменты:
      </span>

      {/* Palette Tools */}
      <div className="flex items-center gap-1.5">
        {tools.map((tool) => {
          const isSelected = selectedTileType === tool.type;
          return (
            <button
              key={tool.type}
              type="button"
              onClick={() => onSelectTileType(tool.type)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-400 shadow-md ring-2 ring-blue-500/40'
                  : 'bg-slate-800/90 hover:bg-slate-700/90 text-slate-300 border-slate-700'
              }`}
            >
              {tool.icon}
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>

      <div className="h-5 w-px bg-slate-700/80 mx-1" />

      {/* Heatmap & Reset Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleBottleneckHeatmap}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
            showBottleneckHeatmap
              ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400 shadow-lg shadow-amber-600/20 ring-2 ring-amber-500/30'
              : 'bg-slate-800/90 hover:bg-slate-700/90 text-slate-300 border-slate-700'
          }`}
        >
          <Eye className="w-4 h-4 text-amber-300" />
          <span>🔍 Тепловая карта узких мест</span>
        </button>

        <button
          type="button"
          onClick={onResetGrid}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/90 hover:bg-slate-700/90 text-slate-400 hover:text-slate-200 border border-slate-700 transition-all"
          title="Сбросить конструктор к исходному виду"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Сброс</span>
        </button>
      </div>
    </div>
  );
};
