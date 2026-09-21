import React, { useState } from 'react';
import type { ConstructorTileType, SkuItem, SupplySchedule } from '../engine/constructor_engine.js';
import {
  Boxes,
  ShieldAlert,
  Zap,
  ArrowRightCircle,
  ArrowLeftCircle,
  Eraser,
  RotateCcw,
  Grid,
  Magnet,
  Square,
  Pentagon,
  Package,
  Truck,
  RotateCw,
  Trash2,
  MousePointer,
  ChevronDown,
} from 'lucide-react';

export type CtorInteractionMode =
  | 'SELECT'
  | 'DRAW_RECT'
  | 'DRAW_POLY'
  | 'PLACE_ELEMENT'
  | 'ERASE';

interface ConstructorToolbarProps {
  interactionMode: CtorInteractionMode;
  onChangeInteractionMode: (mode: CtorInteractionMode) => void;
  selectedTileType: ConstructorTileType;
  onSelectTileType: (type: ConstructorTileType) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  snappingEnabled: boolean;
  onToggleSnapping: () => void;
  onResetGrid: () => void;

  // Selected Object Actions
  selectedTileKeys: Set<string>;
  onRotateSelected: () => void;
  onDeleteSelected: () => void;

  // Modals & Panels
  onOpenSkuModal: () => void;
  onOpenSchedulePanel: () => void;
  selectedSkuForBox: SkuItem | null;
  skuList: SkuItem[];
  onSelectSkuForBox: (sku: SkuItem) => void;

  // Facility / Geometry Metrics for Zone 2 Bar
  totalRacks: number;
  totalPalletCapacity: number;
  inboundDocksCount: number;
  outboundDocksCount: number;
  calculatedAreaSqm: number;
  ceilingHeightM: number;
}

export const ConstructorToolbar: React.FC<ConstructorToolbarProps> = ({
  interactionMode,
  onChangeInteractionMode,
  selectedTileType,
  onSelectTileType,
  showGrid,
  onToggleGrid,
  snappingEnabled,
  onToggleSnapping,
  onResetGrid,
  selectedTileKeys,
  onRotateSelected,
  onDeleteSelected,
  onOpenSkuModal,
  onOpenSchedulePanel,
  totalRacks,
  totalPalletCapacity,
  inboundDocksCount,
  outboundDocksCount,
  calculatedAreaSqm,
  ceilingHeightM,
}) => {
  const [isFloorDropdownOpen, setIsFloorDropdownOpen] = useState(false);

  const isFloorActive = interactionMode === 'DRAW_RECT' || interactionMode === 'DRAW_POLY';

  const paletteTools: Array<{
    type: ConstructorTileType;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      type: 'RACK',
      label: 'Стеллаж',
      icon: <Boxes className="w-3.5 h-3.5 text-[#D4AF37]" />,
    },
    {
      type: 'OBSTACLE',
      label: 'Стена',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-red-600" />,
    },
    {
      type: 'CHARGER',
      label: 'Зарядка',
      icon: <Zap className="w-3.5 h-3.5 text-amber-500" />,
    },
    {
      type: 'DOCK_INBOUND',
      label: 'Приемка',
      icon: <ArrowRightCircle className="w-3.5 h-3.5 text-blue-600" />,
    },
    {
      type: 'DOCK_OUTBOUND',
      label: 'Отгрузка',
      icon: <ArrowLeftCircle className="w-3.5 h-3.5 text-sky-600" />,
    },
    {
      type: 'EMPTY_FLOOR',
      label: 'Ластик',
      icon: <Eraser className="w-3.5 h-3.5 text-emerald-600" />,
    },
  ];

  return (
    <div className="absolute top-3 left-3 right-3 z-20 flex flex-col gap-2 pointer-events-auto select-none font-mono">
      {/* SINGLE HORIZONTAL CAD TOOLBAR */}
      <div className="bg-[#FFFFFF] border border-[#D4AF37]/40 p-1.5 shadow-lg flex flex-wrap items-center justify-between gap-2 text-xs rounded-none">

        {/* Left Section: Single Row Tools */}
        <div className="flex flex-wrap items-center gap-1">
          {/* 1. Select Tool (2-in-1: Click object -> select, Drag empty floor -> marquee box) */}
          <button
            type="button"
            onClick={() => {
              setIsFloorDropdownOpen(false);
              onChangeInteractionMode('SELECT');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase transition rounded-none cursor-pointer border ${
              interactionMode === 'SELECT'
                ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#BFA02E]'
                : 'bg-[#F9F9F6] text-[#4F4F47] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
            }`}
            title="Выбор объектов кликом или рамка выделения по пустому полу"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>[ ↖ Выбор ]</span>
          </button>

          <div className="h-4 w-px bg-[#D4AF37]/30 mx-0.5" />

          {/* 2. Draw Floor Dropdown/Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsFloorDropdownOpen((prev) => !prev);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase transition rounded-none cursor-pointer border ${
                isFloorActive
                  ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#BFA02E]'
                  : 'bg-[#F9F9F6] text-[#4F4F47] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
              }`}
              title="Нарисовать контур пола склада"
            >
              <Square className="w-3.5 h-3.5 text-[#8A6826]" />
              <span>
                {interactionMode === 'DRAW_POLY' ? '[ 📐 Пол: Полигон ]' : '[ 📐 Пол ]'}
              </span>
              <ChevronDown className="w-3 h-3 text-[#8A6826]" />
            </button>

            {/* Floor Dropdown Options */}
            {isFloorDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-[#FFFFFF] border border-[#D4AF37] shadow-xl z-30 py-1 min-w-[160px] rounded-none">
                <button
                  type="button"
                  onClick={() => {
                    if (interactionMode === 'DRAW_RECT') {
                      onChangeInteractionMode('SELECT');
                    } else {
                      onChangeInteractionMode('DRAW_RECT');
                    }
                    setIsFloorDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-bold uppercase flex items-center gap-2 hover:bg-[#F4F4F0] cursor-pointer ${
                    interactionMode === 'DRAW_RECT' ? 'text-[#8A6826] bg-[#D4AF37]/10' : 'text-[#1A1A1A]'
                  }`}
                >
                  <Square className="w-3.5 h-3.5 text-[#8A6826]" />
                  <span>Прямоугольник</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (interactionMode === 'DRAW_POLY') {
                      onChangeInteractionMode('SELECT');
                    } else {
                      onChangeInteractionMode('DRAW_POLY');
                    }
                    setIsFloorDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-bold uppercase flex items-center gap-2 hover:bg-[#F4F4F0] cursor-pointer ${
                    interactionMode === 'DRAW_POLY' ? 'text-[#8A6826] bg-[#D4AF37]/10' : 'text-[#1A1A1A]'
                  }`}
                >
                  <Pentagon className="w-3.5 h-3.5 text-[#8A6826]" />
                  <span>Полигон</span>
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-[#D4AF37]/30 mx-0.5" />

          {/* 3. Palette Elements */}
          {paletteTools.map((tool) => {
            const isSelected =
              interactionMode === 'PLACE_ELEMENT' && selectedTileType === tool.type;
            return (
              <button
                key={tool.type}
                type="button"
                onClick={() => {
                  setIsFloorDropdownOpen(false);
                  if (interactionMode === 'PLACE_ELEMENT' && selectedTileType === tool.type) {
                  onChangeInteractionMode('SELECT');
                } else {
                  onSelectTileType(tool.type);
                  onChangeInteractionMode('PLACE_ELEMENT');
                }
                }}
                className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold transition rounded-none cursor-pointer border ${
                  isSelected
                    ? 'bg-[#1A1A1A] text-[#F9F9F6] border-[#1A1A1A]'
                    : 'bg-[#F9F9F6] text-[#1A1A1A] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
                }`}
                title={`Разместить элемент (${tool.label})`}
              >
                {tool.icon}
                <span>[{tool.label}]</span>
              </button>
            );
          })}
        </div>
          <div className="h-4 w-px bg-[#D4AF37]/30 mx-0.5" />



        {/* Right Section: Toggles, Hotkeys & Modals */}
        <div className="flex flex-wrap items-center gap-1">
          <div className="h-4 w-px bg-[#D4AF37]/30 mx-0.5" />

          {/* Snapping Toggle */}
          <button
            type="button"
            onClick={onToggleSnapping}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold transition rounded-none cursor-pointer border ${
              snappingEnabled
                ? 'bg-[#D4AF37]/20 text-[#8A6826] border-[#D4AF37]'
                : 'bg-[#F9F9F6] text-[#4F4F47] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
            }`}
            title="Магнитный снаппинг по осям [S]"
          >
            <Magnet className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>[ S Снаппинг ]</span>
          </button>

          {/* Grid Toggle */}
          <button
            type="button"
            onClick={onToggleGrid}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold transition rounded-none cursor-pointer border ${
              showGrid
                ? 'bg-[#D4AF37]/20 text-[#8A6826] border-[#D4AF37]'
                : 'bg-[#F9F9F6] text-[#4F4F47] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
            }`}
            title="Отображение сетки пола [G]"
          >
            <Grid className="w-3.5 h-3.5 text-[#8A6826]" />
            <span>[ G Сетка ]</span>
          </button>

          <div className="h-4 w-px bg-[#D4AF37]/30 mx-0.5" />

          {/* SKU Panel Modal Button */}
          <button
            type="button"
            onClick={onOpenSkuModal}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-[#FFFFFF] hover:bg-[#F4F4F0] text-[#1A1A1A] border border-[#D4AF37]/50 rounded-none cursor-pointer"
            title="Управление номенклатурой товаров"
          >
            <Package className="w-3.5 h-3.5 text-[#8A6826]" />
            <span>[ 📦 Товары ]</span>
          </button>

          {/* Schedule Panel Button */}
          <button
            type="button"
            onClick={onOpenSchedulePanel}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-[#FFFFFF] hover:bg-[#F4F4F0] text-[#1A1A1A] border border-[#D4AF37]/50 rounded-none cursor-pointer"
            title="Настройка графиков приемки и отгрузки"
          >
            <Truck className="w-3.5 h-3.5 text-[#8A6826]" />
            <span>[ ⏱️ Расписание ]</span>
          </button>

          {/* Selected Actions: Rotate & Delete */}
          {selectedTileKeys.size > 0 && (
            <div className="flex items-center gap-1 bg-[#D4AF37]/15 p-0.5 border border-[#D4AF37]/40">
              <button
                type="button"
                onClick={onRotateSelected}
                className="p-1 bg-[#FFFFFF] hover:bg-[#F4F4F0] text-[#1A1A1A] border border-[#D4AF37]/30 rounded-none cursor-pointer"
                title="Повернуть элемент на 90 градусов [R]"
              >
                <RotateCw className="w-3.5 h-3.5 text-[#8A6826]" />
              </button>
              <button
                type="button"
                onClick={onDeleteSelected}
                className="p-1 bg-red-100 hover:bg-red-200 text-red-800 border border-red-300 rounded-none cursor-pointer"
                title="Удалить элемент [Delete / Backspace]"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-700" />
              </button>
            </div>
          )}

          {/* Reset Grid Button */}
          <button
            type="button"
            onClick={onResetGrid}
            className="p-1 bg-[#F9F9F6] hover:bg-[#EAEAE6] text-[#4F4F47] border border-[#D4AF37]/30 rounded-none cursor-pointer"
            title="Сбросить схему чертежа"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ZONE 2 GEOMETRY STATUS STRIP RIGHT UNDER TOOLBAR */}
      <div className="bg-[#FFFFFF]/95 border border-[#D4AF37]/40 px-3 py-1 shadow-md flex items-center justify-between text-[11px] text-[#1A1A1A] rounded-none">
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          <span className="font-semibold">
            [ Площадь: <strong className="text-[#8A6826] tabular-nums">{calculatedAreaSqm} м²</strong> ]
          </span>
          <span className="text-[#D4AF37]">•</span>
          <span className="font-semibold">
            [ Высота: <strong className="text-[#8A6826] tabular-nums">{ceilingHeightM} м</strong> ]
          </span>
          <span className="text-[#D4AF37]">•</span>
          <span className="font-semibold">
            [ Стеллажей: <strong className="text-[#8A6826] tabular-nums">{totalRacks} шт.</strong> ]
          </span>
          <span className="text-[#D4AF37]">•</span>
          <span className="font-semibold">
            [ Вместимость: <strong className="text-[#8A6826] tabular-nums">{totalPalletCapacity} паллет</strong> ]
          </span>
          <span className="text-[#D4AF37]">•</span>
          <span className="font-semibold">
            [ Ворота: Вх: <strong className="text-[#8A6826] tabular-nums">{inboundDocksCount}</strong> / Вых:{' '}
            <strong className="text-[#8A6826] tabular-nums">{outboundDocksCount}</strong> ]
          </span>
        </div>
      </div>
    </div>
  );
};
