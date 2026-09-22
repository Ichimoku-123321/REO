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
  | 'ERASE_FLOOR_RECT'
  | 'PLACE_ELEMENT'
  | 'ERASE';

const SKU_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

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
  selectedSkuChip: string | null;
  onSelectSkuChip: (skuId: string | null) => void;
  selectedSkuForBox?: SkuItem | null;
  skuList: SkuItem[];
  onSelectSkuForBox?: (sku: SkuItem) => void;

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
  selectedSkuChip,
  onSelectSkuChip,
  skuList,
  totalRacks,
  totalPalletCapacity,
  inboundDocksCount,
  outboundDocksCount,
  calculatedAreaSqm,
  ceilingHeightM,
}) => {
  const [isFloorDropdownOpen, setIsFloorDropdownOpen] = useState(false);
  const [isSkuDropdownOpen, setIsSkuDropdownOpen] = useState(false);

  const isFloorActive = interactionMode === 'DRAW_RECT' || interactionMode === 'ERASE_FLOOR_RECT';

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

          {/* 2. Draw / Delete Floor Dropdown/Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsSkuDropdownOpen(false);
                if (isFloorActive && !isFloorDropdownOpen) {
                  onChangeInteractionMode('SELECT');
                } else {
                  setIsFloorDropdownOpen((prev) => !prev);
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase transition rounded-none cursor-pointer border ${
                isFloorActive
                  ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#BFA02E]'
                  : 'bg-[#F9F9F6] text-[#4F4F47] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
              }`}
              title="Добавить или удалить пол склада"
            >
              <Square className="w-3.5 h-3.5 text-[#8A6826]" />
              <span>
                {interactionMode === 'DRAW_RECT'
                  ? '[ 📐 Добавить пол ]'
                  : interactionMode === 'ERASE_FLOOR_RECT'
                  ? '[ 🧹 Удалить пол ]'
                  : '[ 📐 Пол ]'}
              </span>
              <ChevronDown className="w-3 h-3 text-[#8A6826]" />
            </button>

            {/* Floor Dropdown Options */}
            {isFloorDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-[#FFFFFF] border border-[#D4AF37] shadow-xl z-30 py-1 min-w-[170px] rounded-none">
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
                  <span>Добавить пол</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (interactionMode === 'ERASE_FLOOR_RECT') {
                      onChangeInteractionMode('SELECT');
                    } else {
                      onChangeInteractionMode('ERASE_FLOOR_RECT');
                    }
                    setIsFloorDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-bold uppercase flex items-center gap-2 hover:bg-[#F4F4F0] cursor-pointer ${
                    interactionMode === 'ERASE_FLOOR_RECT' ? 'text-[#8A6826] bg-[#D4AF37]/10' : 'text-[#1A1A1A]'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5 text-red-600" />
                  <span>Удалить пол</span>
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-[#D4AF37]/30 mx-0.5" />

          {/* 3. Palette Elements */}
          {paletteTools.map((tool) => {
            const isSelected =
              tool.type === 'EMPTY_FLOOR'
                ? interactionMode === 'ERASE'
                : interactionMode === 'PLACE_ELEMENT' && selectedTileType === tool.type;
            return (
              <button
                key={tool.type}
                type="button"
                onClick={() => {
                  setIsFloorDropdownOpen(false);
                  setIsSkuDropdownOpen(false);
                  if (tool.type === 'EMPTY_FLOOR') {
                    if (interactionMode === 'ERASE') {
                      onChangeInteractionMode('SELECT');
                    } else {
                      onChangeInteractionMode('ERASE');
                    }
                  } else {
                    if (interactionMode === 'PLACE_ELEMENT' && selectedTileType === tool.type) {
                      onChangeInteractionMode('SELECT');
                    } else {
                      onSelectTileType(tool.type);
                      onChangeInteractionMode('PLACE_ELEMENT');
                    }
                  }
                }}
                className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold transition rounded-none cursor-pointer border ${
                  isSelected
                    ? 'bg-[#1A1A1A] text-[#F9F9F6] border-[#1A1A1A]'
                    : 'bg-[#F9F9F6] text-[#1A1A1A] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
                }`}
                title={tool.type === 'EMPTY_FLOOR' ? 'Ластик (стирание объектов)' : `Разместить элемент (${tool.label})`}
              >
                {tool.icon}
                <span>[{tool.label}]</span>
              </button>
            );
          })}

          <div className="h-4 w-px bg-[#D4AF37]/30 mx-0.5" />

          {/* 4. SKU Assignment Selection Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsFloorDropdownOpen(false);
                setIsSkuDropdownOpen((prev) => !prev);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase transition rounded-none cursor-pointer border ${
                selectedSkuChip !== null
                  ? 'bg-[#1A1A1A] text-[#F9F9F6] border-[#1A1A1A]'
                  : 'bg-[#F9F9F6] text-[#1A1A1A] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
              }`}
              title="Выберите товар для автоматического назначения при выделении стеллажей"
            >
              <Package className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>
                {selectedSkuChip === 'CLEAR_SKU'
                  ? '[ 🧹 Снятие товара ]'
                  : selectedSkuChip
                  ? `[ 📦 Товар: ${skuList.find((s) => s.id === selectedSkuChip)?.name || selectedSkuChip} ]`
                  : '[ 📦 Товар не выбран ]'}
              </span>
              <ChevronDown className="w-3 h-3 text-[#D4AF37]" />
            </button>

            {isSkuDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-[#FFFFFF] border border-[#D4AF37] shadow-xl z-30 py-1 min-w-[200px] rounded-none">
                <button
                  type="button"
                  onClick={() => {
                    onSelectSkuChip(null);
                    setIsSkuDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-bold uppercase flex items-center gap-2 hover:bg-[#F4F4F0] cursor-pointer ${
                    selectedSkuChip === null ? 'bg-[#D4AF37]/10 text-[#8A6826]' : 'text-[#1A1A1A]'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full border border-gray-400 bg-gray-200 inline-block shrink-0" />
                  <span>Товар не выбран</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectSkuChip('CLEAR_SKU');
                    setIsSkuDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-bold uppercase flex items-center gap-2 hover:bg-[#F4F4F0] cursor-pointer ${
                    selectedSkuChip === 'CLEAR_SKU' ? 'bg-[#D4AF37]/10 text-[#8A6826]' : 'text-[#1A1A1A]'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span>Снятие товара</span>
                </button>

                <div className="h-px bg-[#D4AF37]/30 my-1" />

                {skuList.map((sku, idx) => {
                  const color = SKU_PALETTE[idx % SKU_PALETTE.length];
                  const isSelected = selectedSkuChip === sku.id;
                  return (
                    <button
                      key={sku.id}
                      type="button"
                      onClick={() => {
                        onSelectSkuChip(sku.id);
                        setIsSkuDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-[11px] font-bold flex items-center gap-2 hover:bg-[#F4F4F0] cursor-pointer ${
                        isSelected ? 'bg-[#D4AF37]/10 text-[#8A6826]' : 'text-[#1A1A1A]'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-none shrink-0 border border-black/20"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate">{sku.name} ({sku.weightPerUnitKg} кг)</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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

          {/* Selected Actions: Rotate */}
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
            </div>
          )}

          {/* Reset Grid Button */}
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Очистить весь чертеж склада?')) {
                onResetGrid();
              }
            }}
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
