import React from 'react';
import type { FacilityRequirements, FacilityType } from '../types/facility.js';
import { FACILITY_PRESETS } from '../data/presets.js';
import { Building2, Sparkles } from 'lucide-react';

interface FacilityFormProps {
  facility: FacilityRequirements;
  onChange: (updated: FacilityRequirements) => void;
  onPresetSelect: (presetId: string) => void;
  activePresetId?: string;
}

export const FacilityForm: React.FC<FacilityFormProps> = ({
  facility,
  onChange,
  onPresetSelect,
  activePresetId,
}) => {
  const handleNumericChange = (field: keyof FacilityRequirements, val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      onChange({
        ...facility,
        [field]: num,
      });
    }
  };

  const handleTempChange = (field: 'min' | 'max', val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      onChange({
        ...facility,
        operatingTempRange: {
          ...facility.operatingTempRange,
          [field]: num,
        },
      });
    }
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 shadow-xl mb-8">
      {/* Top Preset Buttons */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Быстрый выбор пресета объекта (1 клик):
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {FACILITY_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPresetSelect(preset.id)}
                className={`p-3.5 rounded-lg border text-left transition duration-150 flex items-start gap-3 cursor-pointer ${
                  isActive
                    ? 'bg-blue-600/20 border-blue-500 ring-2 ring-blue-500/30'
                    : 'bg-slate-900/60 border-slate-700 hover:border-slate-500 hover:bg-slate-900/90'
                }`}
              >
                <span className="text-2xl shrink-0">{preset.icon}</span>
                <div className="overflow-hidden">
                  <div className="font-bold text-sm text-slate-100 truncate">
                    {preset.name}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {preset.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-slate-700/60 pt-6">
        <h3 className="text-base font-bold text-slate-200 mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-400" />
          Параметры и ограничения объекта
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Industry Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Отраслевой профиль
            </label>
            <select
              value={facility.industry}
              onChange={(e) =>
                onChange({ ...facility, industry: e.target.value as FacilityType })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="warehouse">📦 Склад (warehouse)</option>
              <option value="airport">✈️ Аэропорт (airport)</option>
              <option value="hospital">🏥 Больница (hospital)</option>
              <option value="custom">⚙️ Произвольный (custom)</option>
            </select>
          </div>

          {/* Area */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Общая площадь (м²)
            </label>
            <input
              type="number"
              min={1}
              value={facility.totalAreaSqm}
              onChange={(e) => handleNumericChange('totalAreaSqm', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Aisle width */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Ширина проезда (м)
            </label>
            <input
              type="number"
              step="0.1"
              min={0.5}
              value={facility.aisleWidthM}
              onChange={(e) => handleNumericChange('aisleWidthM', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Ceiling height */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Высота потолков (м)
            </label>
            <input
              type="number"
              step="0.1"
              min={1}
              value={facility.ceilingHeightM}
              onChange={(e) => handleNumericChange('ceilingHeightM', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Temperature min */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Мин. температура (°C)
            </label>
            <input
              type="number"
              value={facility.operatingTempRange.min}
              onChange={(e) => handleTempChange('min', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Temperature max */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Макс. температура (°C)
            </label>
            <input
              type="number"
              value={facility.operatingTempRange.max}
              onChange={(e) => handleTempChange('max', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Shifts per day */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Число смен в сутки
            </label>
            <input
              type="number"
              min={1}
              max={3}
              value={facility.shiftsPerDay}
              onChange={(e) => handleNumericChange('shiftsPerDay', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Hours per day */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Часов работы в сутки (ч)
            </label>
            <input
              type="number"
              min={1}
              max={24}
              value={facility.hoursPerDay}
              onChange={(e) => handleNumericChange('hoursPerDay', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Required Payload */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Требуемая нагрузка (кг)
            </label>
            <input
              type="number"
              min={1}
              value={facility.requiredPayloadKg}
              onChange={(e) => handleNumericChange('requiredPayloadKg', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Target Throughput */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Целевой грузопоток (шт/ч)
            </label>
            <input
              type="number"
              min={1}
              value={facility.targetThroughputPerHour}
              onChange={(e) => handleNumericChange('targetThroughputPerHour', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Worker Salary */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Зарплата оператора (руб/мес)
            </label>
            <input
              type="number"
              min={10000}
              value={facility.averageWorkerSalaryRub}
              onChange={(e) => handleNumericChange('averageWorkerSalaryRub', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
