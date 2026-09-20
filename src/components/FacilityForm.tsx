import React, { useState, useEffect, useRef } from 'react';
import type { FacilityRequirements, FacilityType } from '../types/facility.js';
import { Building2 } from 'lucide-react';

interface FacilityFormProps {
  facility: FacilityRequirements;
  onChange: (updated: FacilityRequirements) => void;
}

export const FacilityForm: React.FC<FacilityFormProps> = ({
  facility,
  onChange,
}) => {
  const [localFacility, setLocalFacility] = useState<FacilityRequirements>(facility);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync local state when external facility prop changes
  useEffect(() => {
    setLocalFacility(facility);
  }, [facility]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const triggerDebouncedChange = (updated: FacilityRequirements) => {
    setLocalFacility(updated);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onChange(updated);
    }, 500);
  };

  const handleNumericChange = (field: keyof FacilityRequirements, val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const updated = {
        ...localFacility,
        [field]: num,
      };
      triggerDebouncedChange(updated);
    }
  };

  const handleTempChange = (field: 'min' | 'max', val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const updated = {
        ...localFacility,
        operatingTempRange: {
          ...localFacility.operatingTempRange,
          [field]: num,
        },
      };
      triggerDebouncedChange(updated);
    }
  };

  const handleIndustryChange = (industry: FacilityType) => {
    const updated = { ...localFacility, industry };
    setLocalFacility(updated);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onChange(updated);
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 shadow-xl mb-8">
      <div>
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
              value={localFacility.industry}
              onChange={(e) => handleIndustryChange(e.target.value as FacilityType)}
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
              value={localFacility.totalAreaSqm}
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
              value={localFacility.aisleWidthM}
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
              value={localFacility.ceilingHeightM}
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
              value={localFacility.operatingTempRange.min}
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
              value={localFacility.operatingTempRange.max}
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
              value={localFacility.shiftsPerDay}
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
              value={localFacility.hoursPerDay}
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
              value={localFacility.requiredPayloadKg}
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
              value={localFacility.targetThroughputPerHour}
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
              value={localFacility.averageWorkerSalaryRub}
              onChange={(e) => handleNumericChange('averageWorkerSalaryRub', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
