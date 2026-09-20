import React from 'react';
import type { ConstructorTileType, SkuItem, SupplySchedule } from '../engine/constructor_engine.js';
import {
  Boxes,
  ShieldAlert,
  Zap,
  ArrowRightCircle,
  ArrowLeftCircle,
  Eraser,
  Eye,
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
  BoxSelect,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

export type CtorInteractionMode =
  | 'SELECT'
  | 'DRAW_RECT'
  | 'DRAW_POLY'
  | 'BOX_SELECT_SKU'
  | 'PLACE_ELEMENT';

interface ConstructorToolbarProps {
  interactionMode: CtorInteractionMode;
  onChangeInteractionMode: (mode: CtorInteractionMode) => void;
  selectedTileType: ConstructorTileType;
  onSelectTileType: (type: ConstructorTileType) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  snappingEnabled: boolean;
  onToggleSnapping: () => void;
  showBottleneckHeatmap: boolean;
  onToggleBottleneckHeatmap: () => void;
  onResetGrid: () => void;

  // Selected Object Actions
  selectedElementId: string | null;
  onRotateSelected: () => void;
  onDeleteSelected: () => void;

  // Modals & Panels
  onOpenSkuModal: () => void;
  onOpenSchedulePanel: () => void;
  selectedSkuForBox: SkuItem | null;
  skuList: SkuItem[];
  onSelectSkuForBox: (sku: SkuItem) => void;

  // Capacity & Buffer Metrics
  totalRacks: number;
  totalPalletCapacity: number;
  supplySchedule: SupplySchedule;
  calculatedAreaSqm: number;
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
  showBottleneckHeatmap,
  onToggleBottleneckHeatmap,
  onResetGrid,
  selectedElementId,
  onRotateSelected,
  onDeleteSelected,
  onOpenSkuModal,
  onOpenSchedulePanel,
  selectedSkuForBox,
  skuList,
  onSelectSkuForBox,
  totalRacks,
  totalPalletCapacity,
  supplySchedule,
  calculatedAreaSqm,
}) => {
  const isOverflow = totalPalletCapacity > 0 && supplySchedule.inboundBatchVolume > totalPalletCapacity;

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
      label: 'Стена / Колонна',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-red-600" />,
    },
    {
      type: 'CHARGER',
      label: 'Зарядный пост',
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
    <div className="absolute top-3 left-3 right-3 z-20 flex flex-col gap-2 pointer-events-auto">
      {/* Top Bar: Primary CAD Tools & Palette */}
      <div className="bg-[#FFFFFF] border border-[#D4AF37]/40 p-2 shadow-lg flex flex-wrap items-center justify-between gap-2 text-xs font-mono rounded-none">

        {/* Left Section: Modes, Floor Tool, Palette */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Select Mode */}
          <button
            type="button"
            onClick={() => onChangeInteractionMode('SELECT')}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold uppercase transition rounded-none cursor-pointer border ${
              interactionMode === 'SELECT'
                ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#BFA02E]'
                : 'bg-[#F9F9F6] text-[#4F4F47] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
            }`}
            title="Выделение и перемещение объектов"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Выделить</span>
          </button>

          {/* Draw Floor Dropdown/Buttons */}
          <div className="flex items-center border border-[#D4AF37]/40 bg-[#F9F9F6] rounded-none p-0.5">
            <button
              type="button"
              onClick={() => onChangeInteractionMode('DRAW_RECT')}
              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase transition rounded-none cursor-pointer ${
                interactionMode === 'DRAW_RECT'
                  ? 'bg-[#D4AF37] text-[#1A1A1A]'
                  : 'text-[#4F4F47] hover:text-[#1A1A1A]'
              }`}
              title="Нарисовать прямоугольный пол (клик и протягивание)"
            >
              <Square className="w-3 h-3 text-[#8A6826]" />
              <span>Прямоугольник</span>
            </button>
            <div className="w-px h-3 bg-[#D4AF37]/30 mx-0.5" />
            <button
              type="button"
              onClick={() => onChangeInteractionMode('DRAW_POLY')}
              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase transition rounded-none cursor-pointer ${
                interactionMode === 'DRAW_POLY'
                  ? 'bg-[#D4AF37] text-[#1A1A1A]'
                  : 'text-[#4F4F47] hover:text-[#1A1A1A]'
              }`}
              title="Нарисовать полигональный пол произвольного контура"
            >
              <Pentagon className="w-3 h-3 text-[#8A6826]" />
              <span>Полигон</span>
            </button>
          </div>

          <div className="h-4 w-px bg-[#D4AF37]/30 mx-0.5" />

          {/* Palette Elements */}
          <div className="flex items-center gap-1">
            {paletteTools.map((tool) => {
              const isSelected =
                interactionMode === 'PLACE_ELEMENT' && selectedTileType === tool.type;
              return (
                <button
                  key={tool.type}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', tool.type);
                  }}
                  onClick={() => {
                    onSelectTileType(tool.type);
                    onChangeInteractionMode('PLACE_ELEMENT');
                  }}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold transition rounded-none cursor-grab active:cursor-grabbing border ${
                    isSelected
                      ? 'bg-[#1A1A1A] text-[#F9F9F6] border-[#1A1A1A]'
                      : 'bg-[#F9F9F6] text-[#1A1A1A] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
                  }`}
                  title={`Перетащите или кликните для установки (${tool.label})`}
                >
                  {tool.icon}
                  <span>{tool.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Section: Toggles, Hotkeys & Modals */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Snapping Toggle */}
          <button
            type="button"
            onClick={onToggleSnapping}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold transition rounded-none cursor-pointer border ${
              snappingEnabled
                ? 'bg-[#D4AF37]/20 text-[#8A6826] border-[#D4AF37]'
                : 'bg-[#F9F9F6] text-[#4F4F47] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
            }`}
            title="Магнитный снаппинг по осям (Клавиша [S])"
          >
            <Magnet className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>[S] Снаппинг</span>
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
            title="Отображение сетки пола (Клавиша [G])"
          >
            <Grid className="w-3.5 h-3.5 text-[#8A6826]" />
            <span>[G] Сетка</span>
          </button>

          {/* Heatmap Toggle */}
          <button
            type="button"
            onClick={onToggleBottleneckHeatmap}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold transition rounded-none cursor-pointer border ${
              showBottleneckHeatmap
                ? 'bg-amber-100 text-amber-900 border-amber-400'
                : 'bg-[#F9F9F6] text-[#4F4F47] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-amber-600" />
            <span>Узкие места</span>
          </button>

          <div className="h-4 w-px bg-[#D4AF37]/30 mx-0.5" />

          {/* Box Selection Tool for Bulk SKU */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChangeInteractionMode('BOX_SELECT_SKU')}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase transition rounded-none cursor-pointer border ${
                interactionMode === 'BOX_SELECT_SKU'
                  ? 'bg-[#58111A] text-[#F9F9F6] border-[#58111A]'
                  : 'bg-[#F9F9F6] text-[#1A1A1A] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
              }`}
              title="Выделить рамкой группу стеллажей для массового назначения SKU"
            >
              <BoxSelect className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Рамка выделения</span>
            </button>

            {/* SKU Selector Dropdown for Box Select */}
            {interactionMode === 'BOX_SELECT_SKU' && (
              <select
                value={selectedSkuForBox?.id ?? ''}
                onChange={(e) => {
                  const sku = skuList.find((s) => s.id === e.target.value);
                  if (sku) onSelectSkuForBox(sku);
                }}
                className="bg-[#FFFFFF] border border-[#D4AF37] text-[11px] font-semibold px-1.5 py-1 text-[#1A1A1A] rounded-none outline-none"
              >
                {skuList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.weightPerUnitKg} кг)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="h-4 w-px bg-[#D4AF37]/30 mx-0.5" />

          {/* SKU Panel Modal Button */}
          <button
            type="button"
            onClick={onOpenSkuModal}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-[#FFFFFF] hover:bg-[#F4F4F0] text-[#1A1A1A] border border-[#D4AF37]/50 rounded-none cursor-pointer"
          >
            <Package className="w-3.5 h-3.5 text-[#8A6826]" />
            <span>Номенклатура</span>
          </button>

          {/* Schedule Panel Button */}
          <button
            type="button"
            onClick={onOpenSchedulePanel}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-[#FFFFFF] hover:bg-[#F4F4F0] text-[#1A1A1A] border border-[#D4AF37]/50 rounded-none cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5 text-[#8A6826]" />
            <span>Приемка / Отгрузка</span>
          </button>

          {/* Selected Actions: Rotate & Delete */}
          {selectedElementId && (
            <div className="flex items-center gap-1 bg-[#D4AF37]/15 p-0.5 border border-[#D4AF37]/40">
              <button
                type="button"
                onClick={onRotateSelected}
                className="p-1 bg-[#FFFFFF] hover:bg-[#F4F4F0] text-[#1A1A1A] border border-[#D4AF37]/30 rounded-none cursor-pointer"
                title="Повернуть элемент на 90 градусов (Клавиша [R])"
              >
                <RotateCw className="w-3.5 h-3.5 text-[#8A6826]" />
              </button>
              <button
                type="button"
                onClick={onDeleteSelected}
                className="p-1 bg-red-100 hover:bg-red-200 text-red-800 border border-red-300 rounded-none cursor-pointer"
                title="Удалить элемент (Клавиша [Delete] / [Backspace])"
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
            title="Сбросить схему к исходной"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

    </div>
  );
};
