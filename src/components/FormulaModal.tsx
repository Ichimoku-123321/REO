import React from 'react';
import { X, Calculator, Zap, DollarSign, Scale, ShieldCheck } from 'lucide-react';

interface FormulaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FormulaModal: React.FC<FormulaModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl text-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                Исходные предпосылки и методология расчетов СППР
              </h2>
              <p className="text-xs text-slate-400">
                Прозрачные формулы финансовой модели, коэффициенты и налоговые взносы
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Section 1: Fleet Sizing */}
          <section className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5">
            <h3 className="text-base font-bold text-blue-400 flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-blue-400" />
              1. Расчет размера парка роботов (N_fleet) и микро-имитационная калибровка
            </h3>
            <div className="space-y-3 text-sm text-slate-300">
              <p className="font-semibold text-slate-200">
                1. Номинальная потребность парка (по нормативу ТЗ):
              </p>
              <div className="bg-slate-950 p-3 rounded-lg font-mono text-xs text-blue-300 border border-slate-800 space-y-1">
                <div>k_avail = batteryRuntimeHours / (batteryRuntimeHours + (batteryChargeMinutes / 60))</div>
                <div>N_nominal = ceil( targetThroughputPerHour / (robot.throughputPerHour * k_avail) )</div>
              </div>
              <p className="font-semibold text-slate-200 pt-1">
                2. Верификация цифровым двойником (Headless Fast-Forward Pass):
              </p>
              <div className="bg-slate-950 p-3 rounded-lg font-mono text-xs text-blue-300 border border-slate-800 space-y-1">
                <div>eta_traffic = Q_real / Q_theor  (коэффициент топологических потерь)</div>
                <div>N_fleet = max( N_nominal, ceil( N_nominal / eta_traffic ) )</div>
              </div>
            </div>
          </section>

          {/* Section 2: Labor Cost Baseline */}
          <section className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5">
            <h3 className="text-base font-bold text-rose-400 flex items-center gap-2 mb-3">
              <Scale className="w-5 h-5 text-rose-400" />
              2. Базовые расходы на персонал (Сценарий «Как есть»)
            </h3>
            <div className="space-y-3 text-sm text-slate-300">
              <p>
                Эквивалентное число ручных операторов:
              </p>
              <div className="bg-slate-950 p-3 rounded-lg font-mono text-xs text-rose-300 border border-slate-800">
                Staff_manual = max(1, ceil( targetThroughputPerHour / 12 ) * shiftsPerDay)
              </div>
              <p className="text-xs text-slate-400 italic">
                * 12 шт/ч — нормативная выработка одного ручного оператора в смену (согласно ТЗ/отраслевым стандартам).
              </p>
              <p>
                Ежегодный ФОТ с учетом страх. взносов и налогов (+30%):
              </p>
              <div className="bg-slate-950 p-3 rounded-lg font-mono text-xs text-rose-300 border border-slate-800">
                OPEX_labor = Staff_manual * salary * 1.30 * 12
              </div>
            </div>
          </section>

          {/* Section 3: Scenario 2 - Purchase */}
          <section className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5">
            <h3 className="text-base font-bold text-emerald-400 flex items-center gap-2 mb-3">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              3. Модель покупки парка (CAPEX)
            </h3>
            <div className="space-y-3 text-sm text-slate-300">
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li><strong className="text-slate-100">Инфраструктура и интеграция:</strong> +15% к стоимости роботов (зарядные станции, WMS интеграция, пусконаладка).</li>
                <li><strong className="text-slate-100">Удерживаемый персонал:</strong> 1 супервайзер на смену для управления роботизированным комплексом.</li>
              </ul>
              <div className="bg-slate-950 p-3 rounded-lg font-mono text-xs text-emerald-300 border border-slate-800 space-y-2">
                <div>Total_CAPEX = N_fleet * robot.capexCostRub * 1.15 * (1 - discount)</div>
                <div>Annual_OPEX = (N_fleet * robot.annualOpex) + (supervisors * salary * 1.30 * 12)</div>
                <div>Net_Annual_Savings = OPEX_labor - Annual_OPEX</div>
                <div>Payback_Years = Total_CAPEX / Net_Annual_Savings</div>
                <div>5_Year_ROI = ((Net_Annual_Savings * 5) - Total_CAPEX) / Total_CAPEX * 100%</div>
                <div>5_Year_TCO = Total_CAPEX + (Annual_OPEX * 5)</div>
              </div>
            </div>
          </section>

          {/* Section 4: Scenario 3 - RaaS */}
          <section className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5">
            <h3 className="text-base font-bold text-purple-400 flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-purple-400" />
              4. Модель подписки (RaaS / Robotics as a Service)
            </h3>
            <div className="space-y-3 text-sm text-slate-300">
              <p>
                CAPEX равен 0. Все затраты переведены в операционные ежемесячные платежи:
              </p>
              <div className="bg-slate-950 p-3 rounded-lg font-mono text-xs text-purple-300 border border-slate-800 space-y-2">
                <div>CAPEX = 0</div>
                <div>Annual_RaaS_OPEX = (N_fleet * robot.monthlyRaasCost * 12) + (supervisors * salary * 1.30 * 12)</div>
                <div>5_Year_TCO = Annual_RaaS_OPEX * 5</div>
              </div>
            </div>
          </section>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/95 sticky bottom-0 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
};
