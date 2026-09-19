import React from 'react';
import type { EconomicEvaluation } from '../engine/economics.js';
import type { Robot } from '../types/robot.js';
import type { FacilityRequirements } from '../types/facility.js';
import type { WhatIfParams } from '../engine/economics.js';
import type { SpectralAnalysisResult } from '../engine/spectral_analyzer.js';
import { generateFeasibilityPdf } from '../engine/export_pdf.js';
import { Award, CheckCircle2, TrendingUp, FileText } from 'lucide-react';

interface ScenarioMatrixProps {
  evaluation: EconomicEvaluation;
  robot: Robot;
  facility: FacilityRequirements;
  whatIf: WhatIfParams;
  spectralResult?: SpectralAnalysisResult;
}

export const ScenarioMatrix: React.FC<ScenarioMatrixProps> = ({
  evaluation,
  robot,
  facility,
  whatIf,
  spectralResult,
}) => {
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const { asIs, capexPurchase, raas, recommendedScenario } = evaluation;

  const handleDownloadPdf = () => {
    generateFeasibilityPdf({
      projectTitle: `ТЭО Роботизации - ${facility.industry.toUpperCase()}`,
      facility,
      selectedRobot: robot,
      fleetSize: evaluation.fleetSize,
      economicEvaluation: evaluation,
      spectralResult,
      whatIf,
      generatedAt: new Date(),
      version: 'СППР v1.0',
    });
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 shadow-md mb-4 space-y-4">
      <div className="flex flex-col gap-2 border-b border-slate-700/80 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            3-Сценарная финансовая матрица
          </h2>
          <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold px-2 py-0.5 rounded">
            {recommendedScenario === 'capexPurchase' ? 'Покупка (CAPEX)' : recommendedScenario === 'raas' ? 'RaaS Подписка' : 'As-Is'}
          </span>
        </div>
        <p className="text-[11px] text-slate-400">
          Выбранный модель: <strong className="text-slate-200">{robot.model}</strong> — Флот: <strong className="text-amber-400">{evaluation.fleetSize} ед.</strong>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3.5">
        {/* Scenario 1: As-Is */}
        <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
          recommendedScenario === 'asIs'
            ? 'bg-blue-950/30 border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500'
            : 'bg-slate-900/60 border-slate-700/80'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                Базовый (Как есть)
              </h3>
              {recommendedScenario === 'asIs' && (
                <span className="text-[10px] bg-blue-500 text-white font-bold px-2 py-0.5 rounded uppercase">
                  Оптимально
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Полностью ручной труд операторов ({evaluation.manualStaffCount} человек на смену/объект).
            </p>

            <div className="space-y-3 border-t border-slate-800 pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">CAPEX (Разово):</span>
                <span className="font-semibold text-slate-200">0 ₽</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Ежегодный OPEX:</span>
                <span className="font-semibold text-rose-400">{formatMoney(asIs.annualOpex)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Годовая экономия:</span>
                <span className="font-semibold text-slate-400">—</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Срок окупаемости:</span>
                <span className="font-semibold text-slate-400">—</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Итоговый ROI:</span>
                <span className="font-semibold text-slate-400">—</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 mt-4">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-400">5-летний TCO:</span>
              <span className="text-lg font-bold text-slate-100">{formatMoney(asIs.fiveYearTco)}</span>
            </div>
          </div>
        </div>

        {/* Scenario 2: CAPEX Purchase */}
        <div className={`p-5 rounded-xl border flex flex-col justify-between ${
          recommendedScenario === 'capexPurchase'
            ? 'bg-emerald-950/30 border-emerald-500 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500'
            : 'bg-slate-900/60 border-slate-700/80'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                Покупка парка (CAPEX)
              </h3>
              {recommendedScenario === 'capexPurchase' && (
                <span className="text-[10px] bg-emerald-500 text-slate-950 font-bold px-2 py-0.5 rounded uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Оптимально
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Прямая покупка {evaluation.fleetSize} роботов + интеграция (15%) + сохранение {evaluation.retainedSupervisorsCount} супервайзера.
            </p>

            <div className="space-y-3 border-t border-slate-800 pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">CAPEX (Разово):</span>
                <span className="font-semibold text-purple-400">{formatMoney(capexPurchase.capex)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Ежегодный OPEX:</span>
                <span className="font-semibold text-slate-200">{formatMoney(capexPurchase.annualOpex)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Годовая экономия:</span>
                <span className="font-semibold text-emerald-400">{formatMoney(capexPurchase.netAnnualSavings)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Срок окупаемости:</span>
                <span className="font-semibold text-emerald-400">
                  {capexPurchase.paybackYears !== null ? `${capexPurchase.paybackYears.toFixed(1)} лет` : 'Не окупается'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Итоговый ROI (5 лет):</span>
                <span className="font-semibold text-emerald-400">
                  {capexPurchase.fiveYearRoi !== null ? `${capexPurchase.fiveYearRoi.toFixed(0)}%` : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 mt-4">
            <div className="mb-2">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded inline-block ${
                capexPurchase.verdict === 'green'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : capexPurchase.verdict === 'yellow'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}>
                {capexPurchase.verdictText}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-400">5-летний TCO:</span>
              <span className="text-lg font-bold text-slate-100">{formatMoney(capexPurchase.fiveYearTco)}</span>
            </div>
          </div>
        </div>

        {/* Scenario 3: RaaS */}
        <div className={`p-5 rounded-xl border flex flex-col justify-between ${
          recommendedScenario === 'raas'
            ? 'bg-purple-950/30 border-purple-500 shadow-lg shadow-purple-500/10 ring-1 ring-purple-500'
            : 'bg-slate-900/60 border-slate-700/80'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                Сервисная модель (RaaS)
              </h3>
              {recommendedScenario === 'raas' && (
                <span className="text-[10px] bg-purple-500 text-white font-bold px-2 py-0.5 rounded uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Оптимально
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Подписка на роботов ({formatMoney(robot.monthlyRaasCostRub)}/мес за шт) без первоначального CAPEX.
            </p>

            <div className="space-y-3 border-t border-slate-800 pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">CAPEX (Разово):</span>
                <span className="font-semibold text-slate-200">0 ₽</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Ежегодный OPEX:</span>
                <span className="font-semibold text-slate-200">{formatMoney(raas.annualOpex)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Годовая экономия:</span>
                <span className="font-semibold text-emerald-400">{formatMoney(raas.netAnnualSavings)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Срок окупаемости:</span>
                <span className="font-semibold text-slate-300">Мгновенно (0 CAPEX)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Итоговый ROI:</span>
                <span className="font-semibold text-slate-300">—</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 mt-4">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-400">5-летний TCO:</span>
              <span className="text-lg font-bold text-slate-100">{formatMoney(raas.fiveYearTco)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
