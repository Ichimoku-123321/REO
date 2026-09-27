import React, { useState } from 'react';
import type { SkuItem } from '../engine/constructor_engine.js';
import { Package, Plus, Trash2, X, Scale } from 'lucide-react';

interface SkuInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  skuList: SkuItem[];
  onAddSku: (sku: SkuItem) => void;
  onDeleteSku: (id: string) => void;
}

export const SkuInventoryModal: React.FC<SkuInventoryModalProps> = ({
  isOpen,
  onClose,
  skuList,
  onAddSku,
  onDeleteSku,
}) => {
  const [name, setName] = useState('');
  const [weightKg, setWeightKg] = useState('500');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newSku: SkuItem = {
      id: `sku-${Date.now()}`,
      name: name.trim(),
      weightPerUnitKg: Math.max(1, parseFloat(weightKg) || 100),
    };

    onAddSku(newSku);
    setName('');
    setWeightKg('500');
  };

  const isOnlyOneSku = skuList.length <= 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#F9F9F6] border-2 border-[#D4AF37] w-full max-w-md p-5 shadow-2xl rounded-none text-[#1A1A1A] font-sans">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#D4AF37]/40 mb-4 font-mono">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-[#8A6826]" />
            <h3 className="text-sm font-bold uppercase tracking-tight">
              Номенклатура / Товары склада
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-[#EAEAE6] text-[#4F4F47] hover:text-[#1A1A1A] rounded-none transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add New SKU Form */}
        <form onSubmit={handleSubmit} className="space-y-3 mb-5 font-mono text-xs">
          <div>
            <label className="block text-[#4F4F47] font-semibold mb-1">
              Наименование товара / паллеты:
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Огурцы, Двигатели В-46, Паллеты..."
              className="w-full bg-[#FFFFFF] border border-[#D4AF37]/50 px-2.5 py-1.5 text-[#1A1A1A] outline-none rounded-none focus:border-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-[#4F4F47] font-semibold mb-1">
              Масса единицы / паллеты (m_unit, кг):
            </label>
            <div className="relative">
              <input
                type="number"
                required
                min="1"
                step="1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#D4AF37]/50 px-2.5 py-1.5 text-[#1A1A1A] outline-none rounded-none focus:border-[#D4AF37]"
              />
              <span className="absolute right-2.5 top-1.5 text-[#4F4F47] font-bold">
                кг
              </span>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-[#D4AF37] hover:bg-[#BFA02E] text-[#1A1A1A] font-bold py-2 uppercase tracking-tight transition flex items-center justify-center gap-1.5 rounded-none cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить в номенклатуру</span>
          </button>
        </form>

        {/* Active SKU List */}
        <div className="border-t border-[#D4AF37]/40 pt-3">
          <div className="flex items-center justify-between mb-2 font-mono">
            <h4 className="text-xs font-bold uppercase tracking-tight text-[#4F4F47]">
              Активный список товаров ({skuList.length}):
            </h4>
            {isOnlyOneSku && (
              <span className="text-[10px] text-amber-700 italic">
                (минимум 1 товар в базе)
              </span>
            )}
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 font-mono text-xs pr-1">
            {skuList.map((sku) => (
              <div
                key={sku.id}
                className="flex items-center justify-between p-2 bg-[#FFFFFF] border border-[#D4AF37]/30 hover:border-[#D4AF37] transition"
              >
                <div>
                  <div className="font-bold text-[#1A1A1A]">{sku.name}</div>
                  <div className="text-[10px] text-[#4F4F47] flex items-center gap-1">
                    <Scale className="w-3 h-3 text-[#8A6826]" />
                    <span>
                      Вес паллеты:{' '}
                      <strong className="text-[#1A1A1A]">{sku.weightPerUnitKg} кг</strong>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isOnlyOneSku}
                  onClick={() => {
                    if (!isOnlyOneSku) {
                      onDeleteSku(sku.id);
                    }
                  }}
                  className={`p-1.5 rounded-none transition ${
                    isOnlyOneSku
                      ? 'text-[#B0B0A8] cursor-not-allowed opacity-40'
                      : 'hover:bg-red-100 text-red-700 cursor-pointer'
                  }`}
                  title={
                    isOnlyOneSku
                      ? 'В номенклатуре склада должен быть хотя бы один товар'
                      : 'Удалить товар'
                  }
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
