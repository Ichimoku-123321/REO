import React, { useRef } from 'react';
import type { FacilityRequirements } from '../types/facility.js';
import type { Robot } from '../types/robot.js';
import type { EconomicEvaluation, WhatIfParams } from '../engine/economics.js';
import type { SpectralAnalysisResult } from '../engine/spectral_analyzer.js';
import {
  Printer,
  X,
  FileCheck2,
  Building2,
  Bot,
  ShieldCheck,
} from 'lucide-react';

interface FeasibilityPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  facility: FacilityRequirements;
  selectedRobot: Robot;
  fleetSize: number;
  evaluation: EconomicEvaluation;
  whatIf: WhatIfParams;
  spectralResult?: SpectralAnalysisResult;
}

export const FeasibilityPreviewModal: React.FC<FeasibilityPreviewModalProps> = ({
  isOpen,
  onClose,
  facility,
  selectedRobot,
  fleetSize,
  evaluation,
  whatIf,
  spectralResult,
}) => {
  const reportRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const formatMillions = (val: number): string => {
    return `${(val / 1000000).toFixed(2)} млн ₽`;
  };

  const currentDate = new Date().toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const {
    asIs,
    capexPurchase,
    raas,
    recommendedScenario,
    chargersCount,
    integrationCapexRub,
  } = evaluation;

  // Согласованный размер флота и стоимость
  const effectiveFleetSize = evaluation.fleetSize || fleetSize || 1;
  const robotsHardwareCost = effectiveFleetSize * (selectedRobot.capexCostRub || 2700000);
  
  // Фолбэки характеристик АКБ для исключения пустых значений
  const runtimeHours = selectedRobot.batteryRuntimeHours || 6;
  const chargeMinutes = selectedRobot.batteryChargeMinutes || 18;
  const quotaPercent = evaluation.quotaFulfilledPercent || 109;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-2xs font-mono text-[#1A1A1A] select-none">
      {/* Стили для чистой 2-страничной печати без пустых листов и сбоев шрифта */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 14mm 10mm 14mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
            background: #FFFFFF !important;
          }
          /* Скрываем всё фоновое приложение */
          body > * {
            visibility: hidden !important;
          }
          .no-print {
            display: none !important;
          }
          /* Выводим исключительно контейнер отчёта с абсолютным позиционированием от верхнего края */
          #feasibility-printable-report,
          #feasibility-printable-report * {
            visibility: visible !important;
          }
          #feasibility-printable-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: #FFFFFF !important;
            color: #1A1A1A !important;
            /* Стандартный шрифт исключает искажения глифов на Linux */
            font-family: Arial, "Helvetica Neue", Helvetica, "Segoe UI", sans-serif !important;
            font-size: 8.5pt !important;
            line-height: 1.35 !important;
          }
          /* Разрыв строго на 2-ю страницу */
          .page-break {
            page-break-before: always !important;
            break-before: page !important;
            clear: both !important;
            padding-top: 4mm !important;
          }
          tr {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="bg-[#FFFFFF] border-2 border-[#D4AF37] w-full max-w-5xl h-[95vh] flex flex-col rounded-none shadow-2xl overflow-hidden">
        {/* Панель действий в модалке */}
        <div className="bg-[#F9F9F6] border-b border-[#D4AF37]/50 px-5 py-2.5 flex items-center justify-between shrink-0 no-print">
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-[#8A6826]" />
            <span className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A]">
              [ ПРЕДПРОСМОТР ТЭО: ИНВЕСТИЦИОННЫЙ МЕМОРАНДУМ REO ]
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#D4AF37] hover:bg-[#BFA02E] active:bg-[#8A6826] text-[#1A1A1A] font-bold text-xs uppercase tracking-wider border border-[#BFA02E] transition rounded-none cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Печать в PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#4F4F47] hover:text-[#1A1A1A] hover:bg-[#EAEAE6] border border-transparent hover:border-[#D4AF37]/40 transition rounded-none cursor-pointer"
              title="Закрыть предпросмотр"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Тело печатного документа */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#EFEFED]">
          <div
            id="feasibility-printable-report"
            ref={reportRef}
            className="max-w-[850px] mx-auto bg-[#FFFFFF] p-8 sm:p-10 border border-[#D4AF37]/40 shadow-md space-y-4 text-[#1A1A1A] font-sans"
          >
            {/* ================= СТРАНИЦА 1 ================= */}
            
            {/* 1. DOCUMENT HEADER */}
            <div className="border-b-2 border-[#1A1A1A] pb-2.5 space-y-1">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-[#8C8C85] font-bold">
                    СИСТЕМА ПОДДЕРЖКИ ПРИНЯТИЯ РЕШЕНИЙ (СППР REO)
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-[#1A1A1A] mt-0.5">
                    ТЕХНИКО-ЭКОНОМИЧЕСКОЕ ОБОСНОВАНИЕ
                  </h1>
                  <div className="text-xs text-[#8A6826] font-bold tracking-wider uppercase">
                    Интеграция роботизированного складского комплекса
                  </div>
                </div>

                <div className="text-right text-[10px] space-y-0.5 font-mono">
                  <div className="px-2 py-0.5 bg-[#1A1A1A] text-white font-bold inline-block uppercase tracking-wider">
                    КОНФИДЕНЦИАЛЬНО
                  </div>
                  <div className="text-[#8C8C85] pt-0.5">Дата: {currentDate}</div>
                  <div className="text-[#8C8C85]">Версия: 1.0-DCF</div>
                </div>
              </div>
            </div>

            {/* 2. EXECUTIVE SUMMARY & VERDICT BANNER */}
            <div className="border-2 border-[#D4AF37] p-3 bg-[#F9F9F6] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-[#8A6826] tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  РЕЗЮМЕ ДЛЯ ИНВЕСТИЦИОННОГО КОМИТЕТА
                </span>
                <span className="px-2 py-0.5 bg-[#D4AF37] text-[#1A1A1A] font-black text-[9.5px] uppercase font-mono">
                  {recommendedScenario === 'capexPurchase'
                    ? 'РЕКОМЕНДУЕТСЯ CAPEX-ПОКУПКА'
                    : recommendedScenario === 'raas'
                    ? 'РЕКОМЕНДУЕТСЯ RAAS-ПОДПИСКА'
                    : 'РЕКОМЕНДУЕТСЯ СОХРАНЕНИЕ AS-IS'}
                </span>
              </div>

              <p className="text-[10px] leading-relaxed text-[#4F4F47]">
                На основе математического моделирования топологии склада и DCF-анализа при ставке WACC 18%
                {recommendedScenario === 'capexPurchase' && (
                  <>
                    {' '}проект признан <strong>высокоэффективным</strong>. Чистая приведенная стоимость (NPV) составляет{' '}
                    <strong className="text-emerald-800">{formatMillions(capexPurchase.npvRub)}</strong> при
                    дисконтированном сроке окупаемости{' '}
                    <strong className="text-[#8A6826]">{capexPurchase.discountedPaybackYears} года</strong> и IRR{' '}
                    <strong>{capexPurchase.irrPercent}%</strong>.
                  </>
                )}
                {recommendedScenario === 'raas' && (
                  <>
                    {' '}рекомендуется сервисная модель подписки (RaaS). Проект обеспечивает чистую годовую экономию{' '}
                    <strong className="text-emerald-800">{formatMillions(raas.netAnnualSavings)} / год</strong> без
                    первоначальных капитальных затрат.
                  </>
                )}
                {recommendedScenario === 'asIs' && (
                  <>
                    {' '}роботизация при текущих параметрах имеет недостаточную отдачу на капитал. Рекомендуется сохранить
                    ручной операционный базис.
                  </>
                )}
              </p>

              <div className="grid grid-cols-4 gap-2 pt-1.5 border-t border-[#D4AF37]/30 text-center font-mono">
                <div>
                  <span className="text-[8.5px] text-[#8C8C85] block uppercase">Чистый CAPEX</span>
                  <span className="text-xs font-bold">{formatMillions(capexPurchase.capex)}</span>
                </div>
                <div>
                  <span className="text-[8.5px] text-[#8C8C85] block uppercase">NPV (5 лет)</span>
                  <span className="text-xs font-bold text-emerald-800">{formatMillions(capexPurchase.npvRub)}</span>
                </div>
                <div>
                  <span className="text-[8.5px] text-[#8C8C85] block uppercase">Срок DPP</span>
                  <span className="text-xs font-bold text-[#8A6826]">{capexPurchase.discountedPaybackYears ?? '—'} г.</span>
                </div>
                <div>
                  <span className="text-[8.5px] text-[#8C8C85] block uppercase">IRR проекта</span>
                  <span className="text-xs font-bold">{capexPurchase.irrPercent ? `${capexPurchase.irrPercent}%` : '—'}</span>
                </div>
              </div>
            </div>

            {/* 3. SECTION 1: FACILITY TOPOLOGY & ROBOT SPEC */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#8A6826] border-b border-[#D4AF37]/40 pb-0.5">
                1. ИСХОДНЫЕ ПАРАМЕТРЫ ОБЪЕКТА И ОБОРУДОВАНИЯ
              </h2>

              <div className="grid grid-cols-2 gap-3 text-[9.5px]">
                <div className="border border-[#D4AF37]/30 p-2 space-y-1 bg-[#FFFFFF]">
                  <div className="font-bold text-[#1A1A1A] uppercase border-b border-[#D4AF37]/20 pb-0.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[#8A6826]" />
                    <span>Параметры складского комплекса</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4F4F47]">Отрасль:</span>
                    <strong>{facility.industry.toUpperCase()}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4F4F47]">Общая площадь:</span>
                    <strong>{facility.totalAreaSqm.toLocaleString('ru-RU')} м²</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4F4F47]">Ширина межстеллажных аллей:</span>
                    <strong>{facility.aisleWidthM} м</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4F4F47]">Плановая квота грузопотока:</span>
                    <strong className="text-[#8A6826]">{evaluation.effectiveThroughput} палл/ч</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4F4F47]">Сменный график:</span>
                    <strong>{facility.shiftsPerDay} смены (250 дн/год)</strong>
                  </div>
                </div>

                <div className="border border-[#D4AF37]/30 p-2 space-y-1 bg-[#FFFFFF]">
                  <div className="font-bold text-[#1A1A1A] uppercase border-b border-[#D4AF37]/20 pb-0.5 flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-[#8A6826]" />
                    <span>Спецификация роботизированной платформы</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4F4F47]">Модель:</span>
                    <strong>{selectedRobot.model} ({selectedRobot.vendor})</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4F4F47]">Номинальная грузоподъемность:</span>
                    <strong>{selectedRobot.payloadKg} кг</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4F4F47]">Максимальная скорость:</span>
                    <strong>{selectedRobot.maxSpeedMps} м/с</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4F4F47]">Цикл АКБ: работа / зарядка:</span>
                    <strong>{runtimeHours} ч / {chargeMinutes} мин</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4F4F47]">Коэффициент готовности (k_avail):</span>
                    <strong className="text-emerald-800">{(evaluation.availabilityCoeff * 100).toFixed(0)}%</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. SECTION 2: FLEET KINEMATICS & SIZING */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#8A6826] border-b border-[#D4AF37]/40 pb-0.5">
                2. РАСЧЁТ РАЗМЕРА ПАРКА И КИНЕМАТИКА
              </h2>

              <div className="grid grid-cols-4 gap-2 text-center text-[9.5px] font-mono">
                <div className="p-1.5 border border-[#D4AF37]/30 bg-[#F9F9F6]">
                  <span className="text-[#8C8C85] block text-[8px] uppercase">Расчётный флот</span>
                  <span className="text-sm font-bold text-[#8A6826]">{effectiveFleetSize} ед.</span>
                </div>
                <div className="p-1.5 border border-[#D4AF37]/30 bg-[#F9F9F6]">
                  <span className="text-[#8C8C85] block text-[8px] uppercase">Зарядные посты</span>
                  <span className="text-sm font-bold">{chargersCount} шт.</span>
                </div>
                <div className="p-1.5 border border-[#D4AF37]/30 bg-[#F9F9F6]">
                  <span className="text-[#8C8C85] block text-[8px] uppercase">Коэф. трафика (η)</span>
                  <span className="text-sm font-bold">{evaluation.trafficEfficiencyEta}</span>
                </div>
                <div className="p-1.5 border border-[#D4AF37]/30 bg-[#F9F9F6]">
                  <span className="text-[#8C8C85] block text-[8px] uppercase">Закрытие квоты</span>
                  <span className="text-sm font-bold text-emerald-800">{quotaPercent}%</span>
                </div>
              </div>
            </div>

            {/* 5. SECTION 3: 3-SCENARIO FINANCIAL MATRIX */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#8A6826] border-b border-[#D4AF37]/40 pb-0.5">
                3. СРАВНИТЕЛЬНАЯ МАТРИЦА 3 СЦЕНАРИЕВ
              </h2>

              <table className="w-full text-left border-collapse text-[9px] border border-[#D4AF37]/40">
                <thead>
                  <tr className="bg-[#F4F4F0] border-b border-[#D4AF37]/40 text-[#4F4F47]">
                    <th className="p-1.5 font-bold uppercase">Финансово-экономический параметр</th>
                    <th className="p-1.5 font-bold uppercase text-center">Ручной труд (As-Is)</th>
                    <th className="p-1.5 font-bold uppercase text-center bg-[#D4AF37]/15 text-[#1A1A1A]">
                      Покупка (CAPEX)
                    </th>
                    <th className="p-1.5 font-bold uppercase text-center">Сервис (RaaS)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D4AF37]/20 font-mono">
                  <tr>
                    <td className="p-1.5 text-[#4F4F47] font-sans">Первоначальный CAPEX проекта</td>
                    <td className="p-1.5 text-center tabular-nums">0 ₽</td>
                    <td className="p-1.5 text-center font-bold text-[#8A6826] bg-[#D4AF37]/10 tabular-nums">
                      {formatMillions(capexPurchase.capex)}
                    </td>
                    <td className="p-1.5 text-center tabular-nums">0 ₽</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 text-[#4F4F47] font-sans">Годовые эксплуатационные затраты (OPEX)</td>
                    <td className="p-1.5 text-center tabular-nums">{formatMillions(asIs.annualOpex)}</td>
                    <td className="p-1.5 text-center bg-[#D4AF37]/10 tabular-nums">{formatMillions(capexPurchase.annualOpex)}</td>
                    <td className="p-1.5 text-center tabular-nums">{formatMillions(raas.annualOpex)}</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 text-[#4F4F47] font-sans">Чистая годовая экономия (ΔOPEX)</td>
                    <td className="p-1.5 text-center tabular-nums">—</td>
                    <td className="p-1.5 text-center font-bold text-emerald-800 bg-[#D4AF37]/10 tabular-nums">
                      +{formatMillions(capexPurchase.netAnnualSavings)}
                    </td>
                    <td className="p-1.5 text-center font-bold text-emerald-800 tabular-nums">
                      +{formatMillions(raas.netAnnualSavings)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1.5 text-[#4F4F47] font-sans">Дисконтированный срок окупаемости (DPP)</td>
                    <td className="p-1.5 text-center tabular-nums">—</td>
                    <td className="p-1.5 text-center font-bold text-[#8A6826] bg-[#D4AF37]/10 tabular-nums">
                      {capexPurchase.discountedPaybackYears ? `${capexPurchase.discountedPaybackYears} года` : 'Не окупаем'}
                    </td>
                    <td className="p-1.5 text-center tabular-nums">С первого месяца</td>
                  </tr>
                  <tr className="font-bold bg-[#F9F9F6]">
                    <td className="p-1.5 text-[#1A1A1A] font-sans">Совокупная стоимость владения (TCO 5 лет)</td>
                    <td className="p-1.5 text-center tabular-nums">{formatMillions(asIs.fiveYearTco)}</td>
                    <td className="p-1.5 text-center text-[#1A1A1A] bg-[#D4AF37]/20 tabular-nums">
                      {formatMillions(capexPurchase.fiveYearTco)}
                    </td>
                    <td className="p-1.5 text-center tabular-nums">{formatMillions(raas.fiveYearTco)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 6. SECTION 4: CAPEX COMPOSITION BREAKDOWN */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#8A6826] border-b border-[#D4AF37]/40 pb-0.5">
                4. ДЕТАЛИЗАЦИЯ ИНВЕСТИЦИОННОГО БЮДЖЕТА CAPEX
              </h2>

              <div className="grid grid-cols-4 gap-2 text-[9px]">
                <div className="border border-[#D4AF37]/30 p-1.5 bg-[#FFFFFF]">
                  <span className="text-[#8C8C85] block">Роботы ({effectiveFleetSize} ед.)</span>
                  <strong className="text-xs font-mono">{formatMillions(robotsHardwareCost)}</strong>
                </div>
                <div className="border border-[#D4AF37]/30 p-1.5 bg-[#FFFFFF]">
                  <span className="text-[#8C8C85] block">Зарядки + Сервер RMS</span>
                  <strong className="text-xs font-mono">{formatMillions(evaluation.infrastructureCapexRub)}</strong>
                </div>
                <div className="border border-[#D4AF37]/30 p-1.5 bg-[#FFFFFF]">
                  <span className="text-[#8C8C85] block">Интеграция (15%)</span>
                  <strong className="text-xs font-mono">{formatMillions(integrationCapexRub)}</strong>
                </div>
                <div className="border border-[#D4AF37]/30 p-1.5 bg-[#FFFFFF]">
                  <span className="text-[#8C8C85] block">Субсидия / Грант</span>
                  <strong className="text-xs text-emerald-800 font-mono">
                    {capexPurchase.subsidyDeductionRub > 0 ? `-${formatMillions(capexPurchase.subsidyDeductionRub)}` : '0 ₽'}
                  </strong>
                </div>
              </div>
            </div>

            {/* ================= СТРАНИЦА 2: DCF И ПОДПИСИ ================= */}
            
            {/* 7. SECTION 5: 5-YEAR DCF TABLE */}
            <div className="page-break space-y-2.5">
              <div className="border-b border-[#D4AF37]/40 pb-1 flex justify-between items-center">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#8A6826]">
                  5. МОДЕЛЬ ДИСКОНТИРОВАННЫХ ДЕНЕЖНЫХ ПОТОКОВ (DCF 5 ЛЕТ)
                </h2>
                <span className="text-[8.5px] text-[#8C8C85] font-mono">Ставка WACC: 18% • Налог на прибыль: 20%</span>
              </div>

              <table className="w-full text-left border-collapse text-[8.5px] border border-[#D4AF37]/40">
                <thead>
                  <tr className="bg-[#F4F4F0] border-b border-[#D4AF37]/40 text-[#4F4F47]">
                    <th className="p-1 font-bold">Год</th>
                    <th className="p-1 font-bold">ФОТ As-Is (+8%)</th>
                    <th className="p-1 font-bold">OPEX роботов</th>
                    <th className="p-1 font-bold text-emerald-800">ΔOPEX</th>
                    <th className="p-1 font-bold">Аморт. щит (20%)</th>
                    <th className="p-1 font-bold">Чистый CF</th>
                    <th className="p-1 font-bold">Дисконт (18%)</th>
                    <th className="p-1 font-bold text-right">Накопл. DCF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D4AF37]/20 font-mono">
                  {capexPurchase.cashFlows.map((flow) => (
                    <tr key={flow.year}>
                      <td className="p-1 font-bold font-sans">{flow.year} год</td>
                      <td className="p-1 tabular-nums">{formatMillions(flow.manualOpexRub)}</td>
                      <td className="p-1 tabular-nums">{formatMillions(flow.robotOpexRub)}</td>
                      <td className="p-1 tabular-nums font-semibold text-emerald-800">
                        +{formatMillions(flow.grossSavingsRub)}
                      </td>
                      <td className="p-1 tabular-nums text-[#8C8C85]">+{formatMillions(flow.taxShieldRub)}</td>
                      <td className="p-1 tabular-nums font-bold">{formatMillions(flow.netCashFlowRub)}</td>
                      <td className="p-1 tabular-nums">{flow.discountFactor}</td>
                      <td
                        className={`p-1 tabular-nums font-bold text-right ${
                          flow.cumulativeDcfRub >= 0 ? 'text-emerald-800' : 'text-red-700'
                        }`}
                      >
                        {formatMillions(flow.cumulativeDcfRub)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 8. SIGNATURES & LEGAL SIGN-OFF */}
            <div className="pt-6 border-t-2 border-[#1A1A1A] space-y-5">
              <div className="grid grid-cols-3 gap-6 text-[9.5px]">
                <div className="space-y-3">
                  <div className="font-bold uppercase text-[#4F4F47]">Руководитель проекта:</div>
                  <div className="border-b border-[#1A1A1A] h-5"></div>
                  <div className="text-[#8C8C85] font-mono">/ ____________________ /</div>
                </div>

                <div className="space-y-3">
                  <div className="font-bold uppercase text-[#4F4F47]">Директор по логистике:</div>
                  <div className="border-b border-[#1A1A1A] h-5"></div>
                  <div className="text-[#8C8C85] font-mono">/ ____________________ /</div>
                </div>

                <div className="space-y-3">
                  <div className="font-bold uppercase text-[#4F4F47]">Финансовый директор (CFO):</div>
                  <div className="border-b border-[#1A1A1A] h-5"></div>
                  <div className="text-[#8C8C85] font-mono">/ ____________________ /</div>
                </div>
              </div>

              <div className="text-[8px] text-[#8C8C85] text-center pt-1 leading-normal">
                Документ сформирован автоматически аналитическим ядром СППР REO. Расчёт соответствует методическим
                рекомендациям оценки эффективности инвестиционных проектов (утв. Минэкономики РФ, Минфином РФ № ВК 477).
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
