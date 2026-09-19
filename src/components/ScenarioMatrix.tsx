import React from 'react';
import type { EconomicEvaluation } from '../engine/economics.js';
import type { Robot } from '../types/robot.js';
import type { FacilityRequirements } from '../types/facility.js';
import type { WhatIfParams } from '../engine/economics.js';
import type { SpectralAnalysisResult } from '../engine/spectral_analyzer.js';

interface ScenarioMatrixProps {
  evaluation: EconomicEvaluation;
  robot: Robot;
  facility: FacilityRequirements;
  whatIf: WhatIfParams;
  spectralResult?: SpectralAnalysisResult;
}

export const ScenarioMatrix: React.FC<ScenarioMatrixProps> = ({
  evaluation,
}) => {
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const { asIs, capexPurchase, raas } = evaluation;

  return (
    <div className="space-y-3 text-xs text-[#1A1A1A] rounded-none">

      {/* Wine expert verdict card (bg-[#58111A] text-[#F9F9F6]) */}
      <div className="p-3 bg-[#58111A] text-[#F9F9F6] border border-[#4A0E17] shadow-xs rounded-none">
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#D4AF37] flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-[#D4AF37]"></span>
          Экспертное заключение REO:
        </div>
        <div className="font-semibold text-xs mt-1 leading-snug text-[#FFFFFF]">
          {capexPurchase.verdictText || 'Инвестиционно привлекательно'}
        </div>
      </div>

      {/* 3-Scenario Comparison Matrix */}
      <div className="bg-[#FFFFFF] border border-[#D4AF37]/30 overflow-hidden rounded-none">
        <div className="p-2.5 bg-[#F4F4F0] border-b border-[#D4AF37]/30 flex items-center justify-between rounded-none">
          <span className="font-semibold text-[11px] uppercase tracking-wider text-[#8A6826]">
            Сопоставление 3 моделей
          </span>
          <span className="text-[10px] font-mono text-[#4F4F47] font-bold">5 ЛЕТ ТСО</span>
        </div>

        <div className="divide-y divide-[#D4AF37]/20 font-mono text-xs rounded-none">

          {/* Table Header */}
          <div className="p-2 grid grid-cols-3 gap-1 bg-[#F9F9F6] font-bold border-b border-[#D4AF37]/30 text-[10px] uppercase">
            <span className="text-[#4F4F47] truncate">Показатель</span>
            <span className="text-[#1A1A1A] truncate text-center">As-Is (Люди)</span>
            <span className="text-[#8A6826] truncate text-right">CAPEX (Парк)</span>
          </div>

          <div className="p-2 grid grid-cols-3 gap-1 items-center">
            <span className="text-[#4F4F47] text-[10px] truncate">Штат / Парк</span>
            <span className="font-bold text-[#1A1A1A] text-center truncate">{evaluation.manualStaffCount} чел.</span>
            <span className="font-bold text-[#8A6826] text-right truncate">{evaluation.fleetSize} роб.</span>
          </div>

          <div className="p-2 grid grid-cols-3 gap-1 items-center bg-[#F9F9F6]">
            <span className="text-[#4F4F47] text-[10px] truncate">Инвестиции</span>
            <span className="text-[#4F4F47] text-center truncate">—</span>
            <span className="font-bold text-[#1A1A1A] text-right truncate">{formatMoney(capexPurchase.capex)}</span>
          </div>

          <div className="p-2 grid grid-cols-3 gap-1 items-center">
            <span className="text-[#4F4F47] text-[10px] truncate">Годовой OPEX</span>
            <span className="text-[#1A1A1A] text-center truncate">{formatMoney(asIs.annualOpex)}</span>
            <span className="text-[#1A1A1A] text-right truncate">{formatMoney(capexPurchase.annualOpex)}</span>
          </div>

          <div className="p-2 grid grid-cols-3 gap-1 items-center bg-[#F9F9F6]">
            <span className="text-[#4F4F47] text-[10px] truncate">Экономия/год</span>
            <span className="text-[#4F4F47] text-center truncate">—</span>
            <span className="font-bold text-emerald-800 text-right truncate">+{formatMoney(capexPurchase.netAnnualSavings)}</span>
          </div>

          <div className="p-2 grid grid-cols-3 gap-1 items-center bg-[#D4AF37]/10">
            <span className="text-[#1A1A1A] font-bold text-[10px] truncate">Окупаемость</span>
            <span className="text-[#4F4F47] text-center truncate">—</span>
            <span className={`font-bold text-right truncate ${evaluation.isQuotaDeficit ? 'text-rose-700 text-[10px]' : 'text-[#8A6826]'}`}>
              {evaluation.isQuotaDeficit
                ? 'План сорван'
                : capexPurchase.paybackYears !== null
                ? `${capexPurchase.paybackYears.toFixed(1)} г.`
                : '>5 лет'}
            </span>
          </div>

          <div className="p-2 grid grid-cols-3 gap-1 items-center">
            <span className="text-[#4F4F47] text-[10px] truncate">5-летний ROI</span>
            <span className="text-[#4F4F47] text-center truncate">—</span>
            <span className={`font-bold text-right truncate ${evaluation.isQuotaDeficit ? 'text-rose-700 text-[10px]' : 'text-emerald-800'}`}>
              {evaluation.isQuotaDeficit
                ? 'План сорван'
                : capexPurchase.fiveYearRoi !== null
                ? `${capexPurchase.fiveYearRoi.toFixed(0)}%`
                : '—'}
            </span>
          </div>

          <div className="p-2 grid grid-cols-3 gap-1 items-center bg-[#FFFFFF] font-bold">
            <span className="text-[#1A1A1A] text-[10px] truncate">TCO (5 лет)</span>
            <span className="text-[#4F4F47] text-center truncate">{formatMoney(asIs.fiveYearTco)}</span>
            <span className="text-[#58111A] text-right font-bold truncate">{formatMoney(capexPurchase.fiveYearTco)}</span>
          </div>
        </div>
      </div>

      {/* RaaS Scenario Card */}
      <div className="p-3 bg-[#FFFFFF] border border-[#D4AF37]/30 rounded-none space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[11px] uppercase tracking-wider text-[#8A6826]">
            Сценарий 3: Подписка (RaaS)
          </span>
          <span className="text-[10px] font-mono bg-[#D4AF37]/20 text-[#8A6826] px-1 font-bold rounded-none">0 ₽ CAPEX</span>
        </div>
        <p className="text-[11px] text-[#4F4F47]">
          Аренда без капитальных затрат. Ежегодный платеж: <strong className="font-mono text-[#1A1A1A]">{formatMoney(raas.annualOpex)}</strong>
        </p>
        <div className="font-mono text-xs flex justify-between pt-1 border-t border-[#D4AF37]/20">
          <span className="text-[#4F4F47]">TCO за 5 лет:</span>
          <strong className="text-[#8A6826]">{formatMoney(raas.fiveYearTco)}</strong>
        </div>
      </div>
    </div>
  );
};
