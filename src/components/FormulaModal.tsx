import React from 'react';
import {
  Calculator,
  X,
  Zap,
  Users,
  DollarSign,
  TrendingUp,
  Cpu,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

interface FormulaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FormulaModal: React.FC<FormulaModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs font-mono text-[#1A1A1A] select-none">
      <div className="bg-[#FFFFFF] border-2 border-[#D4AF37] w-full max-w-4xl max-h-[90vh] flex flex-col rounded-none shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-[#F9F9F6] border-b border-[#D4AF37]/50 px-5 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#D4AF37]/20 border border-[#D4AF37] text-[#8A6826]">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A]">
                [ МЕТОДОЛОГИЯ И МАТЕМАТИЧЕСКИЙ БАЗИС СППР REO ]
              </h2>
              <p className="text-[10px] text-[#4F4F47]">
                Сквозные формулы кинематической калибровки, DCF-моделирования и инвестиционного аудита
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#4F4F47] hover:text-[#1A1A1A] hover:bg-[#EAEAE6] border border-transparent hover:border-[#D4AF37]/40 transition rounded-none cursor-pointer"
            title="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body / Scrollable Formulas */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* РАЗДЕЛ 1: КИНЕМАТИКА И ПАРК */}
          <div className="border border-[#D4AF37]/40 bg-[#FFFFFF] p-3.5 space-y-2 rounded-none shadow-2xs">
            <div className="flex items-center gap-2 text-[#8A6826] font-bold uppercase text-[11px] border-b border-[#D4AF37]/30 pb-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>1. Расчёт размера флота (N_fleet) и микро-имитационная калибровка</span>
            </div>

            <div className="space-y-1.5 text-[11px] text-[#4F4F47]">
              <p className="font-semibold text-[#1A1A1A]">
                1.1. Цикл рейса и эффективная производительность робота:
              </p>
              <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 p-2 font-mono text-[10.5px] text-[#1A1A1A] overflow-x-auto leading-relaxed">
                k_avail = batteryRuntimeHours / (batteryRuntimeHours + batteryChargeMinutes / 60)
                <br />
                t_trip = D_cycle / (v_max × η_traffic) + τ_манипуляций (70 с на подъем/опускание паллеты)
                <br />
                Q_effective = min(robot.throughputPerHour, 3600 / t_trip) × k_avail
                <br />
                N_nominal = ⌈ targetThroughputPerHour / Q_effective ⌉
              </div>

              <p className="font-semibold text-[#1A1A1A] pt-1">
                1.2. Верификация цифровым двойником (Дискретно-событийная 3D FSM-симуляция):
              </p>
              <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 p-2 font-mono text-[10.5px] text-[#1A1A1A] overflow-x-auto leading-relaxed">
                η_traffic = Q_simulated / Q_theoretical (фактор плотности трафика и ожидания разъездов)
                <br />
                N_fleet = max(N_nominal, ⌈ N_nominal / max(0.5, η_traffic) ⌉)
                <br />
                N_chargers = max(1, ⌈ N_fleet × (1 - k_avail) × 1.15 ⌉)
              </div>
            </div>
          </div>

          {/* РАЗДЕЛ 2: БАЗОВЫЙ ФОТ (AS-IS) */}
          <div className="border border-[#D4AF37]/40 bg-[#FFFFFF] p-3.5 space-y-2 rounded-none shadow-2xs">
            <div className="flex items-center gap-2 text-[#8A6826] font-bold uppercase text-[11px] border-b border-[#D4AF37]/30 pb-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>2. Базовые расходы на персонал (Сценарий As-Is)</span>
            </div>

            <div className="space-y-1.5 text-[11px] text-[#4F4F47]">
              <p className="font-semibold text-[#1A1A1A]">
                2.1. Эквивалентный штат ручных комплектовщиков (норматив 12 паллет/час на человека):
              </p>
              <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 p-2 font-mono text-[10.5px] text-[#1A1A1A] overflow-x-auto leading-relaxed">
                Workers_shift = ⌈ targetThroughputPerHour / 12 ⌉
                <br />
                Staff_base = Workers_shift × shiftsPerDay
                <br />
                Staff_manual = ⌈ Staff_base × 1.15 ⌉ (коэффициент замещения на отпуска/больничные по ТК РФ)
              </div>

              <p className="font-semibold text-[#1A1A1A] pt-1">
                2.2. Годовой фонд оплаты труда с налогами и накладными расходами:
              </p>
              <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 p-2 font-mono text-[10.5px] text-[#1A1A1A] overflow-x-auto leading-relaxed">
                LoadedSalary = salary × 12 × (1 + insuranceRate[30.2%]) × (1 + hrOverhead[10.0%])
                <br />
                OPEX_manual = Staff_manual × LoadedSalary + Staff_manual × 140 000 ₽ (ТО рохлей и техники)
              </div>
            </div>
          </div>

          {/* РАЗДЕЛ 3: СТРУКТУРА CAPEX */}
          <div className="border border-[#D4AF37]/40 bg-[#FFFFFF] p-3.5 space-y-2 rounded-none shadow-2xs">
            <div className="flex items-center gap-2 text-[#8A6826] font-bold uppercase text-[11px] border-b border-[#D4AF37]/30 pb-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              <span>3. Капитальные затраты роботизации (CAPEX)</span>
            </div>

            <div className="space-y-1.5 text-[11px] text-[#4F4F47]">
              <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 p-2 font-mono text-[10.5px] text-[#1A1A1A] overflow-x-auto leading-relaxed">
                CAPEX_hardware = N_fleet × robot.capexCostRub + N_chargers × 280 000 ₽ + 1 200 000 ₽ (RMS/WMS)
                <br />
                CAPEX_integration = CAPEX_hardware × k_integration[15%]
                <br />
                CAPEX_gross = (CAPEX_hardware + CAPEX_integration) × (1 - WhatIf.capexDiscount)
                <br />
                CAPEX_net = CAPEX_gross × (1 - StateSubsidyGrant[%])
              </div>
            </div>
          </div>

          {/* РАЗДЕЛ 4: OPEX РОБОТИЗАЦИИ И ШТРАФЫ SLA */}
          <div className="border border-[#D4AF37]/40 bg-[#FFFFFF] p-3.5 space-y-2 rounded-none shadow-2xs">
            <div className="flex items-center gap-2 text-[#8A6826] font-bold uppercase text-[11px] border-b border-[#D4AF37]/30 pb-1.5">
              <Cpu className="w-3.5 h-3.5" />
              <span>4. Операционные затраты (OPEX) и штрафная модель SLA</span>
            </div>

            <div className="space-y-1.5 text-[11px] text-[#4F4F47]">
              <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 p-2 font-mono text-[10.5px] text-[#1A1A1A] overflow-x-auto leading-relaxed">
                OPEX_supervisors = 1 × shiftsPerDay × (salary × 1.25) × 12 × (1 + 30.2%) × (1 + 10%)
                <br />
                Energy_kwh = N_fleet × 0.85 кВт × (shiftsPerDay × 8 × 250 ч) × 0.8
                <br />
                OPEX_energy = Energy_kwh × energyTariff[7.5 ₽/кВт·ч]
                <br />
                OPEX_maintenance = N_fleet × robot.annualOpexRub + 350 000 ₽ (серверное сопровождение)
                <br />
                <span className="text-red-700 font-bold">
                  SLA_Penalty = max(0, targetThroughputPerHour - Q_simulated) × Hours_annual × 1 200 ₽/палл
                </span>
                <br />
                <div className="pt-1 mt-1 border-t border-[#D4AF37]/20">
                  <strong>[CAPEX OPEX]:</strong> OPEX_robot = OPEX_supervisors + OPEX_energy + OPEX_maintenance + SLA_Penalty
                  <br />
                  <strong>[RaaS OPEX]:</strong> OPEX_raas = (N_fleet × monthlyRaas × 12) + OPEX_supervisors + OPEX_energy + SLA_Penalty
                </div>
              </div>
            </div>
          </div>

          {/* РАЗДЕЛ 5: DCF, NPV, IRR, НАЛОГОВЫЙ ЩИТ */}
          <div className="border-2 border-[#D4AF37] bg-[#FFFFFF] p-3.5 space-y-2 rounded-none shadow-2xs">
            <div className="flex items-center gap-2 text-[#8A6826] font-bold uppercase text-[11px] border-b border-[#D4AF37]/30 pb-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>5. Динамическая финансовая модель (5-летний DCF и инвестиционные критерии)</span>
            </div>

            <div className="space-y-1.5 text-[11px] text-[#4F4F47]">
              <p className="font-semibold text-[#1A1A1A]">
                5.1. Динамический денежный поток года t с раздельной индексацией:
              </p>
              <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 p-2 font-mono text-[10.5px] text-[#1A1A1A] overflow-x-auto leading-relaxed">
                ΔOPEX_t = OPEX_manual × (1 + fotInflation[8%])^(t-1) - OPEX_robot,t
                <br />
                TaxShield_t = (CAPEX_net / 5) × 20% (амортизационная защита по налогу на прибыль, только CAPEX)
                <br />
                CF_t = ΔOPEX_t + TaxShield_t
                <br />
                DCF_t = CF_t / (1 + WACC[18%])^t
              </div>

              <p className="font-semibold text-[#1A1A1A] pt-1">
                5.2. Интегральные показатели экономической эффективности:
              </p>
              <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 p-2 font-mono text-[10.5px] text-[#1A1A1A] overflow-x-auto leading-relaxed">
                NPV = ∑ [t=1..5] DCF_t - CAPEX_net
                <br />
                DPP = t_prev + (CAPEX_net - CumulativeDCF_prev) / DCF_current (дробный дисконтированный срок)
                <br />
                IRR: численное решение уравнения ∑ [t=1..5] (CF_t / (1 + IRR)^t) - CAPEX_net = 0 (метод Ньютона-Рафсона)
                <br />
                PI = (NPV + CAPEX_net) / CAPEX_net (индекс рентабельности инвестиций)
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#F9F9F6] border-t border-[#D4AF37]/50 px-5 py-2.5 flex items-center justify-between shrink-0">
          <div className="text-[10px] text-[#4F4F47] flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>Методология соответствует регламентам инвестиционного аудита промышленных объектов</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 bg-[#D4AF37] hover:bg-[#BFA02E] active:bg-[#8A6826] text-[#1A1A1A] font-bold text-xs uppercase tracking-wider border border-[#BFA02E] transition rounded-none cursor-pointer shadow-xs"
          >
            [ ПОНЯТНО: ЗАКРЫТЬ ]
          </button>
        </div>
      </div>
    </div>
  );
};
