import React, { useState } from 'react';
import type { EconomicEvaluation, ScenarioMetrics } from '../../../engine/economics.js';
import type { Robot } from '../../../types/robot.js';
import type { FacilityRequirements } from '../../../types/facility.js';
import type { WhatIfParams } from '../../../engine/economics.js';
import type { SpectralAnalysisResult } from '../../../engine/spectral_analyzer.js';
import {
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  DollarSign,
  Zap,
  Layers,
  ChevronDown,
  ChevronUp,
  Percent,
  Calendar,
} from 'lucide-react';

interface ScenariosViewProps {
  evaluation: EconomicEvaluation;
  robot: Robot;
  facility: FacilityRequirements;
  whatIf: WhatIfParams;
  spectralResult?: SpectralAnalysisResult;
}

export const ScenariosView: React.FC<ScenariosViewProps> = ({
  evaluation,
  robot,
  facility,
  whatIf,
}) => {
  const [showDcfTable, setShowDcfTable] = useState(true);
  const [showStressTest, setShowStressTest] = useState(false);

  const {
    asIs,
    capexPurchase,
    raas,
    conservativeScenario,
    optimisticScenario,
    recommendedScenario,
    fleetSize,
    chargersCount,
    annualEnergyKwh,
    annualEnergyCostRub,
    integrationCapexRub,
  } = evaluation;

  const formatMillions = (val: number): string => {
    return `${(val / 1000000).toFixed(2)} млн ₽`;
  };

  const formatThousands = (val: number): string => {
    return `${Math.round(val).toLocaleString('ru-RU')} ₽`;
  };

  const getVerdictBadge = (scenario: ScenarioMetrics) => {
    if (scenario.verdict === 'green') {
      return (
        <span className="px-2 py-0.5 bg-emerald-100 border border-emerald-400 text-emerald-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
          <span>ЭФФЕКТИВНО</span>
        </span>
      );
    }
    if (scenario.verdict === 'yellow') {
      return (
        <span className="px-2 py-0.5 bg-amber-100 border border-amber-400 text-amber-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-amber-700" />
          <span>УМЕРЕННО</span>
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-red-100 border border-red-400 text-red-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
        <XCircle className="w-3 h-3 text-red-700" />
        <span>НЕ РЕКОМЕНДУЕТСЯ</span>
      </span>
    );
  };

  return (
    <div className="space-y-4 font-mono text-xs text-[#1A1A1A]">
      {/* 1. БЛОК РЕКОМЕНДАЦИИ СППР / РЕЗЮМЕ ДИРЕКЦИИ */}
      <div className="bg-[#FFFFFF] border-2 border-[#D4AF37] p-3.5 space-y-2.5 rounded-none shadow-xs">
        <div className="flex items-center justify-between border-b border-[#D4AF37]/30 pb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#8A6826]" />
            <span className="font-bold uppercase tracking-wider text-[11px] text-[#1A1A1A]">
              [ ИТОГОВОЕ РЕШЕНИЕ СППР ]
            </span>
          </div>
          {getVerdictBadge(
            recommendedScenario === 'capexPurchase'
              ? capexPurchase
              : recommendedScenario === 'raas'
              ? raas
              : asIs
          )}
        </div>

        <div className="text-[11px] leading-relaxed text-[#4F4F47]">
          {recommendedScenario === 'capexPurchase' && (
            <p>
              Рекомендуется <strong className="text-[#1A1A1A]">покупка парка роботов (CAPEX)</strong>.
              Инвестиционный проект окупается за{' '}
              <strong className="text-[#8A6826]">{capexPurchase.discountedPaybackYears ?? capexPurchase.paybackYears} года</strong>{' '}
              с учётом дисконтирования WACC (18%) и формирует положительный NPV в размере{' '}
              <strong className="text-emerald-700">{formatMillions(capexPurchase.npvRub)}</strong> за 5 лет.
            </p>
          )}
          {recommendedScenario === 'raas' && (
            <p>
              Рекомендуется <strong className="text-[#1A1A1A]">сервисная модель (RaaS-подписка)</strong>.
              Позволяет автоматизировать склад без капитальных вложений (CAPEX = 0) с положительным эффектом{' '}
              <strong className="text-emerald-700">{formatMillions(raas.netAnnualSavings)} / год</strong> с первого месяца.
            </p>
          )}
          {recommendedScenario === 'asIs' && (
            <p>
              Рекомендуется <strong className="text-[#1A1A1A]">сохранить текущий ручной процесс (As-Is)</strong>.
              При действующих нормативах квоты и ставках ФОТ капитальные затраты на роботов имеют недостаточную
              инвестиционную доходность.
            </p>
          )}
        </div>

        {/* 4 ключевые KPI-плашки */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-[#D4AF37]/20">
          <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 p-2">
            <span className="text-[9px] text-[#8C8C85] block uppercase">NPV (5 лет)</span>
            <span className={`text-sm font-bold tabular-nums ${capexPurchase.npvRub > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatMillions(capexPurchase.npvRub)}
            </span>
          </div>

          <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 p-2">
            <span className="text-[9px] text-[#8C8C85] block uppercase">Окупаемость (DPP)</span>
            <span className="text-sm font-bold text-[#8A6826] tabular-nums">
              {capexPurchase.discountedPaybackYears ? `${capexPurchase.discountedPaybackYears} г.` : '—'}
            </span>
          </div>

          <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 p-2">
            <span className="text-[9px] text-[#8C8C85] block uppercase">IRR (Доходность)</span>
            <span className="text-sm font-bold text-[#1A1A1A] tabular-nums">
              {capexPurchase.irrPercent ? `${capexPurchase.irrPercent}%` : '—'}
            </span>
          </div>

          <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 p-2">
            <span className="text-[9px] text-[#8C8C85] block uppercase">ROI (5 лет)</span>
            <span className="text-sm font-bold text-emerald-700 tabular-nums">
              {capexPurchase.fiveYearRoi ? `+${capexPurchase.fiveYearRoi}%` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. СРАВНИТЕЛЬНАЯ МАТРИЦА 3 СЦЕНАРИЕВ */}
      <div className="space-y-2">
        <div className="text-[11px] font-bold text-[#8A6826] uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          <span>[ 1. МАТРИЦА 3 СЦЕНАРИЕВ АВТОМАТИЗАЦИИ ]</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Сценарий 1: Как есть */}
          <div className="bg-[#FFFFFF] border border-[#D4AF37]/40 p-3 space-y-2.5 rounded-none shadow-2xs">
            <div className="border-b border-[#D4AF37]/30 pb-1.5 flex items-center justify-between">
              <span className="font-bold text-[11px] uppercase">Ручной труд (As-Is)</span>
              <span className="text-[9px] text-[#8C8C85]">Базис</span>
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[#4F4F47]">CAPEX проекта:</span>
                <strong className="tabular-nums">0 ₽</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4F4F47]">Годовой OPEX:</span>
                <strong className="tabular-nums">{formatMillions(asIs.annualOpex)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4F4F47]">Персонал склада:</span>
                <strong className="tabular-nums">{evaluation.manualStaffCount} чел.</strong>
              </div>
              <div className="flex justify-between border-t border-[#D4AF37]/20 pt-1">
                <span className="text-[#4F4F47]">TCO (5 лет):</span>
                <strong className="tabular-nums text-[#1A1A1A]">{formatMillions(asIs.fiveYearTco)}</strong>
              </div>
            </div>
          </div>

          {/* Сценарий 2: Покупка парка (CAPEX) */}
          <div className={`bg-[#FFFFFF] border-2 p-3 space-y-2.5 rounded-none shadow-2xs ${
            recommendedScenario === 'capexPurchase' ? 'border-[#D4AF37] bg-[#F9F9F6]' : 'border-[#D4AF37]/40'
          }`}>
            <div className="border-b border-[#D4AF37]/30 pb-1.5 flex items-center justify-between">
              <span className="font-bold text-[11px] uppercase text-[#8A6826]">Покупка (CAPEX)</span>
              {recommendedScenario === 'capexPurchase' && (
                <span className="px-1.5 py-0.2 bg-[#D4AF37] text-[#1A1A1A] text-[8px] font-bold uppercase">
                  ЛУЧШИЙ
                </span>
              )}
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[#4F4F47]">Чистый CAPEX:</span>
                <strong className="tabular-nums text-[#8A6826]">{formatMillions(capexPurchase.capex)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4F4F47]">Годовой OPEX:</span>
                <strong className="tabular-nums">{formatMillions(capexPurchase.annualOpex)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4F4F47]">Экономия / год:</span>
                <strong className="tabular-nums text-emerald-700">+{formatMillions(capexPurchase.netAnnualSavings)}</strong>
              </div>
              <div className="flex justify-between border-t border-[#D4AF37]/20 pt-1">
                <span className="text-[#4F4F47]">TCO (5 лет):</span>
                <strong className="tabular-nums text-[#1A1A1A]">{formatMillions(capexPurchase.fiveYearTco)}</strong>
              </div>
            </div>
          </div>

          {/* Сценарий 3: RaaS-подписка */}
          <div className={`bg-[#FFFFFF] border p-3 space-y-2.5 rounded-none shadow-2xs ${
            recommendedScenario === 'raas' ? 'border-[#D4AF37] bg-[#F9F9F6]' : 'border-[#D4AF37]/40'
          }`}>
            <div className="border-b border-[#D4AF37]/30 pb-1.5 flex items-center justify-between">
              <span className="font-bold text-[11px] uppercase">RaaS-подписка</span>
              {recommendedScenario === 'raas' && (
                <span className="px-1.5 py-0.2 bg-[#D4AF37] text-[#1A1A1A] text-[8px] font-bold uppercase">
                  ЛУЧШИЙ
                </span>
              )}
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[#4F4F47]">Входной CAPEX:</span>
                <strong className="tabular-nums text-emerald-700">0 ₽</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4F4F47]">Годовой OPEX:</span>
                <strong className="tabular-nums">{formatMillions(raas.annualOpex)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4F4F47]">Экономия / год:</span>
                <strong className="tabular-nums text-emerald-700">+{formatMillions(raas.netAnnualSavings)}</strong>
              </div>
              <div className="flex justify-between border-t border-[#D4AF37]/20 pt-1">
                <span className="text-[#4F4F47]">TCO (5 лет):</span>
                <strong className="tabular-nums text-[#1A1A1A]">{formatMillions(raas.fiveYearTco)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. СТРУКТУРА CAPEX И ИНФРАСТРУКТУРЫ */}
      <div className="bg-[#FFFFFF] border border-[#D4AF37]/40 p-3 space-y-2 rounded-none shadow-2xs">
        <div className="text-[11px] font-bold text-[#8A6826] uppercase tracking-wider flex items-center justify-between">
          <span>[ 2. СТРУКТУРА ИНВЕСТИЦИЙ CAPEX ]</span>
          <span className="text-[10px] text-[#4F4F47] font-normal">
            Парк: <strong>{fleetSize} роб.</strong> • Зарядных постов: <strong>{chargersCount} шт.</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          <div className="bg-[#F9F9F6] p-2 border border-[#D4AF37]/20">
            <span className="text-[#8C8C85] block">Роботы (оборудование)</span>
            <strong className="text-[11px] text-[#1A1A1A]">{formatMillions(fleetSize * robot.capexCostRub)}</strong>
          </div>
          <div className="bg-[#F9F9F6] p-2 border border-[#D4AF37]/20">
            <span className="text-[#8C8C85] block">Зарядки + RMS-сервер</span>
            <strong className="text-[11px] text-[#1A1A1A]">{formatMillions(evaluation.infrastructureCapexRub)}</strong>
          </div>
          <div className="bg-[#F9F9F6] p-2 border border-[#D4AF37]/20">
            <span className="text-[#8C8C85] block">Интеграция WMS (k_integ)</span>
            <strong className="text-[11px] text-[#1A1A1A]">{formatMillions(integrationCapexRub)}</strong>
          </div>
          <div className="bg-[#F9F9F6] p-2 border border-[#D4AF37]/20">
            <span className="text-[#8C8C85] block">Субсидия / Грант</span>
            <strong className="text-[11px] text-emerald-700">
              {capexPurchase.subsidyDeductionRub > 0 ? `-${formatMillions(capexPurchase.subsidyDeductionRub)}` : '0 ₽'}
            </strong>
          </div>
        </div>
      </div>

      {/* 4. ТАБЛИЦА ДЕНЕЖНЫХ ПОТОКОВ DCF (5 ЛЕТ) */}
      <div className="border border-[#D4AF37]/40 bg-[#FFFFFF] rounded-none shadow-2xs">
        <button
          type="button"
          onClick={() => setShowDcfTable((prev) => !prev)}
          className="w-full p-2.5 px-3 bg-[#F9F9F6] flex items-center justify-between text-left text-[11px] font-bold text-[#8A6826] hover:bg-[#F4F4F0] transition rounded-none"
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" />
            <span>[ 3. МОДЕЛЬ ДЕНЕЖНЫХ ПОТОКОВ DCF (5 ЛЕТ) ]</span>
          </div>
          {showDcfTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showDcfTable && capexPurchase.cashFlows.length > 0 && (
          <div className="overflow-x-auto p-2">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="bg-[#F4F4F0] border-b border-[#D4AF37]/40 text-[#4F4F47]">
                  <th className="p-1.5 font-bold">Год</th>
                  <th className="p-1.5 font-bold">ФОТ As-Is</th>
                  <th className="p-1.5 font-bold">OPEX роботов</th>
                  <th className="p-1.5 font-bold text-emerald-800">Экономия (ΔOPEX)</th>
                  <th className="p-1.5 font-bold">Налог. щит</th>
                  <th className="p-1.5 font-bold">Чистый CF</th>
                  <th className="p-1.5 font-bold">Дисконт (WACC)</th>
                  <th className="p-1.5 font-bold text-right">Накопл. DCF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4AF37]/20">
                {capexPurchase.cashFlows.map((flow) => (
                  <tr key={flow.year} className="hover:bg-[#F9F9F6] transition">
                    <td className="p-1.5 font-bold">{flow.year} год</td>
                    <td className="p-1.5 tabular-nums">{formatMillions(flow.manualOpexRub)}</td>
                    <td className="p-1.5 tabular-nums">{formatMillions(flow.robotOpexRub)}</td>
                    <td className="p-1.5 tabular-nums font-semibold text-emerald-700">
                      +{formatMillions(flow.grossSavingsRub)}
                    </td>
                    <td className="p-1.5 tabular-nums text-[#8C8C85]">+{formatMillions(flow.taxShieldRub)}</td>
                    <td className="p-1.5 tabular-nums font-bold">{formatMillions(flow.netCashFlowRub)}</td>
                    <td className="p-1.5 tabular-nums">{flow.discountFactor}</td>
                    <td
                      className={`p-1.5 tabular-nums font-bold text-right ${
                        flow.cumulativeDcfRub >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {formatMillions(flow.cumulativeDcfRub)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. СТРЕСС-ТЕСТ ЧУВСТВИТЕЛЬНОСТИ (SENSITIVITY ANALYSIS) */}
      <div className="border border-[#D4AF37]/30 bg-[#FFFFFF] rounded-none">
        <button
          type="button"
          onClick={() => setShowStressTest((prev) => !prev)}
          className="w-full p-2.5 px-3 bg-[#F9F9F6] flex items-center justify-between text-left text-[11px] font-bold text-[#4F4F47] hover:text-[#1A1A1A] transition rounded-none"
        >
          <div className="flex items-center gap-2">
            <Percent className="w-3.5 h-3.5 text-[#8A6826]" />
            <span>[ 4. АНАЛИЗ ЧУВСТВИТЕЛЬНОСТИ И СТРЕСС-ТЕСТ ]</span>
          </div>
          {showStressTest ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showStressTest && (
          <div className="p-3 space-y-2.5 text-[11px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Консервативный сценарий */}
              <div className="p-2.5 border border-red-200 bg-red-50/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-red-800 uppercase text-[10px]">
                    Консервативный (Stress-тест)
                  </span>
                  <span className="text-[9px] text-[#8C8C85]">WACC +3%, CAPEX +12%</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span>NPV:</span>
                  <strong className={conservativeScenario.npvRub >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                    {formatMillions(conservativeScenario.npvRub)}
                  </strong>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span>Окупаемость:</span>
                  <strong>{conservativeScenario.discountedPaybackYears ? `${conservativeScenario.discountedPaybackYears} г.` : 'Не окупаем'}</strong>
                </div>
              </div>

              {/* Оптимистичный сценарий */}
              <div className="p-2.5 border border-emerald-200 bg-emerald-50/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-800 uppercase text-[10px]">
                    Оптимистичный
                  </span>
                  <span className="text-[9px] text-[#8C8C85]">WACC -3%, субсидии</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span>NPV:</span>
                  <strong className="text-emerald-700">{formatMillions(optimisticScenario.npvRub)}</strong>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span>Окупаемость:</span>
                  <strong className="text-emerald-700">{optimisticScenario.discountedPaybackYears} г.</strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
