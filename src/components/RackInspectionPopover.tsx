import React from 'react';
import type { SkuItem } from '../engine/constructor_engine.js';
import { Boxes, Package, Trash2, X } from 'lucide-react';

interface RackInspectionPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  rackKey: string;
  gridX: number;
  gridY: number;
  currentSkuId?: string;
  slotsPerRack?: number;
  skuList: SkuItem[];
  onAssignSku: (rackKey: string, skuId: string | undefined) => void;
  onChangeCapacity: (rackKey: string, capacity: number) => void;
  onDeleteRack: (rackKey: string) => void;
  screenPos?: { x: number; y: number };
}

interface RackInspectionPopoverPropsExtended extends RackInspectionPopoverProps {
  onStartDrag?: (e: React.PointerEvent) => void;
}

export const RackInspectionPopover: React.FC<RackInspectionPopoverPropsExtended> = ({
  isOpen,
  onClose,
  rackKey,
  gridX,
  gridY,
  currentSkuId,
  slotsPerRack = 12,
  skuList,
  onAssignSku,
  onChangeCapacity,
  onDeleteRack,
  screenPos,
  onStartDrag,
}) => {
  if (!isOpen) return null;

  const currentSku = skuList.find((s) => s.id === currentSkuId);

  const popoverW = 288;
  const popoverH = 280;

  // Clamp screenPos so that the window never leaves the viewport by even 1 pixel
  const posX = screenPos
    ? Math.max(0, Math.min(screenPos.x, window.innerWidth - popoverW))
    : Math.max(0, (window.innerWidth - popoverW) / 2);
  const posY = screenPos
    ? Math.max(0, Math.min(screenPos.y, window.innerHeight - popoverH))
    : Math.max(0, (window.innerHeight - popoverH) / 2);

  const style: React.CSSProperties = {
    position: 'fixed',
    left: `${posX}px`,
    top: `${posY}px`,
  };

  const stopProp = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      style={style}
      onPointerDown={stopProp}
      onPointerUp={stopProp}
      onMouseDown={stopProp}
      onMouseUp={stopProp}
      onClick={stopProp}
      className="z-30 w-72 bg-[#FFFFFF] border-2 border-[#D4AF37] p-3.5 shadow-2xl font-mono text-xs text-[#1A1A1A] rounded-none pointer-events-auto cursor-default"
    >
      {/* Header - Drag Handle */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onStartDrag?.(e);
        }}
        className="flex items-center justify-between pb-2 border-b border-[#D4AF37]/40 mb-2.5 select-none bg-[#F9F9F6] -mx-3.5 -mt-3.5 p-2.5 mb-2.5 border-b border-[#D4AF37]/30"
      >
        <div className="flex items-center gap-1.5 font-bold uppercase text-[11px] text-[#8A6826]">
          <Boxes className="w-4 h-4 text-[#D4AF37]" />
          <span>Стеллаж ({gridX}, {gridY})</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-0.5 hover:bg-[#F4F4F0] text-[#4F4F47] hover:text-[#1A1A1A] transition rounded-none"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Rack Capacity Metric */}
      <div className="p-2 bg-[#F9F9F6] border border-[#D4AF37]/30 mb-2.5 space-y-1">
        <div className="flex justify-between items-center font-bold text-[11px]">
          <span className="text-[#4F4F47]">Вместимость:</span>
          <div className="flex items-center gap-1 text-[#8A6826] tabular-nums">
            <input
              type="number"
              min="1"
              max="200"
              value={slotsPerRack}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val > 0) {
                  onChangeCapacity(rackKey, val);
                }
              }}
              className="w-14 bg-[#FFFFFF] border border-[#D4AF37]/50 px-1 py-0.5 text-right outline-none"
            />
            <span>паллет</span>
          </div>
        </div>
      </div>

      {/* Current SKU & Assign Dropdown */}
      <div className="space-y-2 mb-3">
        <label className="block text-[#4F4F47] text-[10px] font-bold uppercase tracking-tight">
          Назначенный товар (SKU):
        </label>

        <div className="p-2 bg-[#F4F4F0] border border-[#D4AF37]/40 text-xs">
          {currentSku ? (
            <div className="flex items-center gap-1.5 font-bold text-[#1A1A1A]">
              <Package className="w-3.5 h-3.5 text-[#8A6826] shrink-0" />
              <span>Хранение: "{currentSku.name}" ({currentSku.weightPerUnitKg} кг)</span>
            </div>
          ) : (
            <div className="text-[#4F4F47] italic">Пустой стеллаж (Товар не назначен)</div>
          )}
        </div>

        <select
          value={currentSkuId ?? ''}
          onChange={(e) => {
            const val = e.target.value || undefined;
            onAssignSku(rackKey, val);
          }}
          className="w-full bg-[#FFFFFF] border border-[#D4AF37] px-2 py-1 text-xs text-[#1A1A1A] outline-none rounded-none focus:border-[#1A1A1A]"
        >
          <option value="">-- Выберите SKU из номенклатуры --</option>
          {skuList.map((sku) => (
            <option key={sku.id} value={sku.id}>
              {sku.name} ({sku.weightPerUnitKg} кг)
            </option>
          ))}
        </select>
      </div>

      {/* Delete Rack Button */}
      <button
        type="button"
        onClick={() => {
          onDeleteRack(rackKey);
          onClose();
        }}
        className="w-full bg-red-100 hover:bg-red-200 text-red-900 border border-red-300 font-bold py-1.5 uppercase text-[10px] tracking-tight transition flex items-center justify-center gap-1 rounded-none"
      >
        <Trash2 className="w-3.5 h-3.5 text-red-700" />
        <span>Удалить стеллаж</span>
      </button>
    </div>
  );
};
