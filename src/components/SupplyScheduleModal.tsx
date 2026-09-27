import React from 'react';
import type { SupplySchedule } from '../engine/constructor_engine.js';
import { Truck, AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface SupplyScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: SupplySchedule;
  onChangeSchedule: (updated: SupplySchedule) => void;
  totalPalletCapacity: number;
  totalRacks: number;
  onApplySchedule?: (calculatedThroughputPerHour: number) => void;
}

function getHoursFromInterval(val: number, unit: 'hours' | 'days' | 'minutes'): number {
  if (unit === 'minutes') return val / 60;
  if (unit === 'days') return val * 24;
  return val;
}

export const SupplyScheduleModal: React.FC<SupplyScheduleModalProps> = ({
  isOpen,
  onClose,
  schedule,
  onChangeSchedule,
  totalPalletCapacity,
  totalRacks,
  onApplySchedule,
}) => {
  if (!isOpen) return null;

  const inHours = getHoursFromInterval(schedule.inboundIntervalValue, schedule.inboundIntervalUnit);
  const outHours = getHoursFromInterval(schedule.outboundIntervalValue, schedule.outboundIntervalUnit);

  // Валидация нулевых объемов
  const isInboundZero = !schedule.inboundBatchVolume || schedule.inboundBatchVolume <= 0;
  const isOutboundZero = !schedule.outboundBatchVolume || schedule.outboundBatchVolume <= 0;
  const isZeroFlow = isInboundZero || isOutboundZero;

  // Расчет суточных скоростей
  const rInPerDay = inHours > 0 && !isInboundZero ? (schedule.inboundBatchVolume / inHours) * 24 : 0;
  const rOutPerDay = outHours > 0 && !isOutboundZero ? (schedule.outboundBatchVolume / outHours) * 24 : 0;

  // Проверка переполнения вместимости стеллажей
  const isSingleBatchOverflow = totalPalletCapacity > 0 && schedule.inboundBatchVolume > totalPalletCapacity;
  const hasNoRacks = totalPalletCapacity === 0;

  const netAccumulationPerDay = Math.round(rInPerDay - rOutPerDay);
  const diffOutboundExcess = Math.round(rOutPerDay - rInPerDay);

  const hoursToFull = netAccumulationPerDay > 0 && totalPalletCapacity > 0
    ? Math.round((totalPalletCapacity / (rInPerDay - rOutPerDay)) * 24)
    : null;
  const daysToFull = hoursToFull !== null ? (hoursToFull / 24).toFixed(1) : null;

  const isFormValid = !isZeroFlow && totalPalletCapacity > 0 && schedule.inboundBatchVolume <= totalPalletCapacity;
  
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 font-mono text-xs">
      <div className="bg-[#F9F9F6] border-2 border-[#D4AF37] w-full max-w-lg p-5 shadow-2xl rounded-none text-[#1A1A1A]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#D4AF37]/40 mb-4">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#8A6826]" />
            <h3 className="text-sm font-bold uppercase tracking-tight">
              График поставок и отгрузок (Баланс буфера)
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

        {/* Capacity Summary Badge */}
        <div className="p-3 bg-[#FFFFFF] border border-[#D4AF37]/40 mb-4 space-y-1">
          <div className="text-xs font-bold text-[#1A1A1A] flex justify-between">
            <span>Общая вместимость стеллажей (C_total):</span>
            <span className="text-[#8A6826] tabular-nums font-extrabold text-sm">
              {totalPalletCapacity} паллет
            </span>
          </div>
          <div className="text-[11px] text-[#4F4F47] flex justify-between">
            <span>Количество секций стеллажей (N_racks):</span>
            <span className="font-bold tabular-nums">{totalRacks} шт.</span>
          </div>
        </div>

        {/* Form Inputs */}
        <div className="space-y-4 mb-5">
          {/* Inbound Schedule (Приемка) */}
          <div className="p-3 bg-[#FFFFFF] border border-[#D4AF37]/30 space-y-2">
            <h4 className="font-bold text-[#8A6826] uppercase flex items-center gap-1.5">
              <span>📥 Входящий поток (Приемка)</span>
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#4F4F47] text-[11px] font-semibold mb-1">
                  Интервал привоза:
                </label>
                <div className="flex">
                  <input
                    type="number"
                    min="0.1"
                    step="0.5"
                    value={schedule.inboundIntervalValue}
                    onChange={(e) =>
                      onChangeSchedule({
                        ...schedule,
                        inboundIntervalValue: Math.max(0.1, parseFloat(e.target.value) || 1),
                      })
                    }
                    className="w-full bg-[#F9F9F6] border border-[#D4AF37]/50 px-2 py-1 text-[#1A1A1A] outline-none rounded-none"
                  />
                  <select
                    value={schedule.inboundIntervalUnit}
                    onChange={(e) =>
                      onChangeSchedule({
                        ...schedule,
                        inboundIntervalUnit: e.target.value as 'hours' | 'days' | 'minutes',
                      })
                    }
                    className="bg-[#EAEAE6] border border-l-0 border-[#D4AF37]/50 px-1 py-1 text-[#1A1A1A] font-bold rounded-none"
                  >
                    <option value="hours">ч</option>
                    <option value="days">дн</option>
                    <option value="minutes">мин</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#4F4F47] text-[11px] font-semibold mb-1">
                  Объем партии (Q_in):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={schedule.inboundBatchVolume || ''}
                    placeholder="мин. 1"
                    onChange={(e) =>
                      onChangeSchedule({
                        ...schedule,
                        inboundBatchVolume: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className={`w-full bg-[#F9F9F6] border px-2 py-1 text-[#1A1A1A] outline-none rounded-none ${
                      isInboundZero ? 'border-red-400 focus:border-red-500' : 'border-[#D4AF37]/50'
                    }`}
                  />
                  <span className="absolute right-2 top-1 text-[#4F4F47] font-bold text-[10px]">
                    паллет
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Outbound Schedule (Отгрузка) */}
          <div className="p-3 bg-[#FFFFFF] border border-[#D4AF37]/30 space-y-2">
            <h4 className="font-bold text-[#0284c7] uppercase flex items-center gap-1.5">
              <span>📤 Исходящий поток (Отгрузка)</span>
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#4F4F47] text-[11px] font-semibold mb-1">
                  Интервал отгрузки:
                </label>
                <div className="flex">
                  <input
                    type="number"
                    min="0.1"
                    step="0.5"
                    value={schedule.outboundIntervalValue}
                    onChange={(e) =>
                      onChangeSchedule({
                        ...schedule,
                        outboundIntervalValue: Math.max(0.1, parseFloat(e.target.value) || 1),
                      })
                    }
                    className="w-full bg-[#F9F9F6] border border-[#D4AF37]/50 px-2 py-1 text-[#1A1A1A] outline-none rounded-none"
                  />
                  <select
                    value={schedule.outboundIntervalUnit}
                    onChange={(e) =>
                      onChangeSchedule({
                        ...schedule,
                        outboundIntervalUnit: e.target.value as 'hours' | 'days' | 'minutes',
                      })
                    }
                    className="bg-[#EAEAE6] border border-l-0 border-[#D4AF37]/50 px-1 py-1 text-[#1A1A1A] font-bold rounded-none"
                  >
                    <option value="hours">ч</option>
                    <option value="days">дн</option>
                    <option value="minutes">мин</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#4F4F47] text-[11px] font-semibold mb-1">
                  Объем отгрузки (Q_out):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={schedule.outboundBatchVolume || ''}
                    placeholder="мин. 1"
                    onChange={(e) =>
                      onChangeSchedule({
                        ...schedule,
                        outboundBatchVolume: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className={`w-full bg-[#F9F9F6] border px-2 py-1 text-[#1A1A1A] outline-none rounded-none ${
                      isOutboundZero ? 'border-red-400 focus:border-red-500' : 'border-[#D4AF37]/50'
                    }`}
                  />
                  <span className="absolute right-2 top-1 text-[#4F4F47] font-bold text-[10px]">
                    паллет
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Status / Alert Banner */}
        {isZeroFlow ? (
          <div className="p-3 bg-red-50 border border-red-400 text-red-900 font-bold mb-4 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="uppercase text-xs tracking-tight">⚠️ Требуется задать грузопоток</div>
              <div className="text-[11px] font-normal mt-0.5">
                Объемы входящей и исходящей партий должны быть строго более 0 паллет. Нулевой грузопоток заблокирован.
              </div>
            </div>
          </div>
        ) : isSingleBatchOverflow ? (
          <div className="p-3 bg-red-100 border border-red-400 text-red-900 font-bold mb-4 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="uppercase text-xs tracking-tight">⚠️ Внимание: Переполнение буфера партии!</div>
              <div className="text-[11px] font-normal mt-0.5">
                Объем входящей партии (Q_in = {schedule.inboundBatchVolume} паллет) превышает общую вместимость стеллажей (C_total = {totalPalletCapacity} паллет).
              </div>
            </div>
          </div>
        ) : hasNoRacks ? (
          <div className="p-3 bg-amber-50 border border-amber-400 text-amber-900 font-bold mb-4 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              ⚠️ На складе пока нет стеллажей. Разместите секции в CAD для буферизации грузов.
            </div>
          </div>
        ) : netAccumulationPerDay > 0 ? (
          <div className="p-3 bg-amber-50 border border-amber-400 text-amber-900 font-bold mb-4 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              ⚠️ Привоз превышает отгрузку на {netAccumulationPerDay} паллет/сут. Стеллажи заполнятся примерно через {hoursToFull} ч. ({daysToFull} дн.).
            </div>
          </div>
        ) : diffOutboundExcess > 0 ? (
          <div className="p-3 bg-emerald-50 border border-emerald-400 text-emerald-800 font-bold mb-4 flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              ℹ️ Объем отгрузки превышает привоз на {diffOutboundExcess} паллет/сут. Линия отгрузки работает с запасом пропускной способности.
            </div>
          </div>
        ) : (
          <div className="p-3 bg-emerald-50 border border-emerald-400 text-emerald-800 font-bold mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-xs">✅ Баланс партий в норме: суточный входящий поток полностью соответствует исходящему.</span>
          </div>
        )}

        <button
          type="button"
          disabled={!isFormValid}
          onClick={() => {
            if (!isFormValid) return;
            const inH = getHoursFromInterval(schedule.inboundIntervalValue, schedule.inboundIntervalUnit);
            const outH = getHoursFromInterval(schedule.outboundIntervalValue, schedule.outboundIntervalUnit);

            const qInPerHour = inH > 0 ? schedule.inboundBatchVolume / inH : 0;
            const qOutPerHour = outH > 0 ? schedule.outboundBatchVolume / outH : 0;

            const totalRequiredPerHour = Math.max(1, Math.ceil(qInPerHour + qOutPerHour));

            if (onApplySchedule) {
              onApplySchedule(totalRequiredPerHour);
            }
            onClose();
          }}
          className={`w-full py-2.5 font-bold uppercase tracking-tight transition rounded-none select-none ${
            isFormValid
              ? 'bg-[#D4AF37] hover:bg-[#BFA02E] active:bg-[#8A6826] text-[#1A1A1A] cursor-pointer shadow-sm'
              : 'bg-[#E5E5DF] text-[#8C8C85] border border-[#D1D1CB] cursor-not-allowed opacity-80'
          }`}
        >
          {isZeroFlow ? '[ УКАЖИТЕ ОБЪЕМ ПАРТИЙ > 0 ]' : 'Применить расписание'}
        </button>
      </div>
    </div>
  );
};
