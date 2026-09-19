import { useState, useMemo, useEffect, useCallback } from 'react';
import { SEED_ROBOTS } from './data/robots.seed.js';
import { FACILITY_PRESETS } from './data/presets.js';
import { evaluateEligibility, isRobotEligible } from './engine/dss.js';
import {
  calculateEconomics,
  calculateCompositionEconomics,
  DEFAULT_WHAT_IF_PARAMS,
  type WhatIfParams,
  type EconomicEvaluation,
} from './engine/economics.js';
import { generateFacilityTopology } from './engine/topology_generator.js';
import { analyzeTopologyBottlenecks } from './engine/spectral_analyzer.js';
import {
  optimizeFleetComposition,
  type FleetCompositionItem,
  type HeterogeneousOptimizationResult,
} from './engine/fleet_optimizer.js';
import { SimulationEngine, type SimulationReplayFrame } from './engine/simulation_engine.js';
import type { FacilityRequirements } from './types/facility.js';
import { generateFeasibilityPdf } from './engine/export_pdf.js';
import { exportFeasibilityToExcel } from './engine/export_excel.js';

import { SimulationParamsPanel, type SimulationParams } from './components/SimulationParamsPanel.js';
import { FleetConfigPanel, type FleetConfigMode } from './components/FleetConfigPanel.js';
import { SimulationViewport } from './components/SimulationViewport.js';
import { RobotComparisonTable } from './components/RobotComparisonTable.js';
import { ScenarioMatrix } from './components/ScenarioMatrix.js';
import { WhatIfPanel } from './components/WhatIfPanel.js';
import { FormulaModal } from './components/FormulaModal.js';
import { ExcludedRobotsAccordion } from './components/ExcludedRobotsAccordion.js';
import { CalculationProgressModal } from './components/CalculationProgressModal.js';

import {
  Bot,
  SlidersHorizontal,
  FileSpreadsheet,
  FileText,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Cpu,
  Layers,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Info,
  DollarSign,
  PieChart,
} from 'lucide-react';

export default function App() {
  // 1. Facility & Preset State
  const [activePresetId, setActivePresetId] = useState<string>('warehouse');
  const [facility, setFacility] = useState<FacilityRequirements>(
    FACILITY_PRESETS[0].requirements
  );

  // 2. What-If & Selected Robot State
  const [whatIf, setWhatIf] = useState<WhatIfParams>(DEFAULT_WHAT_IF_PARAMS);
  const [selectedRobotId, setSelectedRobotId] = useState<string>('ronavi-h1500');

  // 3. Simulation Parameters (Quota, Duration T, Frame Buffer Size)
  const [simulationParams, setSimulationParams] = useState<SimulationParams>({
    targetHourlyQuota: FACILITY_PRESETS[0].requirements.targetThroughputPerHour,
    durationHours: 1,
    targetReplayFramesCount: 7200,
  });

  // Sync simulationParams.targetHourlyQuota when facility quota changes
  useEffect(() => {
    setSimulationParams((prev) => ({
      ...prev,
      targetHourlyQuota: facility.targetThroughputPerHour,
    }));
  }, [facility.targetThroughputPerHour]);

  // 4. Fleet Configuration Mode (AI vs Manual 9 Sandbox)
  const [fleetMode, setFleetMode] = useState<FleetConfigMode>('ai');
  const [manualFleetCounts, setManualFleetCounts] = useState<Record<string, number>>({
    'ronavi-h1500': 2,
  });

  // 5. Layout Toggles & Analytics Tab Switcher
  const [isLeftOpen, setIsLeftOpen] = useState<boolean>(true);
  const [isRightOpen, setIsRightOpen] = useState<boolean>(true);
  const [rightTab, setRightTab] = useState<'economics' | 'xai' | 'whatif'>('economics');

  // 6. Simulation & Calculation Progress State
  const [replayFrames, setReplayFrames] = useState<SimulationReplayFrame[]>([]);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [calculationStep, setCalculationStep] = useState<number>(0);
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handlePresetSelect = (presetId: string) => {
    const preset = FACILITY_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setActivePresetId(preset.id);
      setFacility(preset.requirements);
      showToast(`Применен пресет объекта «${preset.name}»`);
    }
  };

  // Eligibility Evaluation
  const evaluatedRobots = useMemo(() => {
    return evaluateEligibility(facility, SEED_ROBOTS);
  }, [facility]);

  const eligibleRobots = useMemo(() => {
    return evaluatedRobots.filter((r) => r.result.isEligible);
  }, [evaluatedRobots]);

  const ineligibleRobots = useMemo(() => {
    return evaluatedRobots.filter((r) => !r.result.isEligible);
  }, [evaluatedRobots]);

  useEffect(() => {
    if (eligibleRobots.length > 0) {
      if (!eligibleRobots.some((r) => r.robot.id === selectedRobotId)) {
        setSelectedRobotId(eligibleRobots[0].robot.id);
      }
    }
  }, [eligibleRobots, selectedRobotId]);

  const selectedRobot = useMemo(() => {
    return (
      eligibleRobots.find((r) => r.robot.id === selectedRobotId)?.robot ??
      SEED_ROBOTS.find((r) => r.id === selectedRobotId) ??
      SEED_ROBOTS[0]
    );
  }, [eligibleRobots, selectedRobotId]);

  // AI Fleet Optimization Result
  const aiOptimizationResult: HeterogeneousOptimizationResult = useMemo(() => {
    const eligibleRobotSpecs = eligibleRobots.map((e) => e.robot);
    return optimizeFleetComposition(facility, eligibleRobotSpecs, whatIf);
  }, [facility, eligibleRobots, whatIf]);

  // Active Fleet Composition (AI vs Manual)
  const activeComposition: FleetCompositionItem[] = useMemo(() => {
    if (fleetMode === 'ai') {
      return aiOptimizationResult.composition;
    }

    const items: FleetCompositionItem[] = [];
    const capexDiscountPercent = whatIf?.capexDiscountPercent ?? 0;
    const capexDiscountFactor = Math.max(0, 1 - capexDiscountPercent / 100);

    SEED_ROBOTS.forEach((robot) => {
      const count = manualFleetCounts[robot.id] || 0;
      if (count > 0) {
        const runtime = robot.batteryRuntimeHours || 8;
        const chargeHours = (robot.batteryChargeMinutes || 60) / 60;
        const kAvail = runtime / (runtime + chargeHours);

        const totalThroughputPerHour = count * robot.throughputPerHour * kAvail;
        const totalCapexRub = count * robot.capexCostRub * 1.15 * capexDiscountFactor;
        const totalAnnualOpexRub = count * robot.annualOpexCostRub;
        const fiveYearTcoRub = totalCapexRub + 5 * totalAnnualOpexRub;

        items.push({
          robot,
          count,
          totalThroughputPerHour,
          totalCapexRub,
          totalAnnualOpexRub,
          fiveYearTcoRub,
        });
      }
    });

    return items;
  }, [fleetMode, aiOptimizationResult, manualFleetCounts, whatIf]);

  const activeFleetSize = useMemo(() => {
    return activeComposition.reduce((sum, item) => sum + item.count, 0);
  }, [activeComposition]);

  // Economic Evaluation
  const activeEconomics: EconomicEvaluation | null = useMemo(() => {
    if (activeComposition.length > 0) {
      return calculateCompositionEconomics(facility, activeComposition, whatIf);
    }
    if (selectedRobot) {
      return calculateEconomics(facility, selectedRobot, whatIf);
    }
    return null;
  }, [facility, activeComposition, selectedRobot, whatIf]);

  const spectralResult = useMemo(() => {
    const topology = generateFacilityTopology(facility);
    return analyzeTopologyBottlenecks(topology);
  }, [facility]);

  const handleManualCountChange = (robotId: string, count: number) => {
    setManualFleetCounts((prev) => ({
      ...prev,
      [robotId]: Math.max(0, count),
    }));
  };

  // Run Simulation & Calculation Handler
  const handleRunSimulation = useCallback(() => {
    setIsCalculating(true);
    setCalculationStep(1);

    setTimeout(() => {
      setCalculationStep(2);

      setTimeout(() => {
        const topology = generateFacilityTopology(facility);
        const engine = new SimulationEngine(
          topology,
          activeComposition.length > 0
            ? activeComposition
            : selectedRobot
            ? [{ robot: selectedRobot, count: 1, totalThroughputPerHour: 10, totalCapexRub: 1000, totalAnnualOpexRub: 100, fiveYearTcoRub: 1500 }]
            : SEED_ROBOTS[0],
          activeFleetSize || 1
        );

        engine.runSimulation({
          targetHourlyQuota: simulationParams.targetHourlyQuota,
          durationHours: simulationParams.durationHours,
          recordReplay: true,
          targetReplayFramesCount: simulationParams.targetReplayFramesCount,
        });

        setCalculationStep(3);

        setTimeout(() => {
          setReplayFrames([...engine.replayFrames]);
          setCalculationStep(4);
          setIsCalculating(false);
          setCalculationStep(0);
          showToast('Моделирование завершено. Кадры загружены во вьюпорт.');
        }, 150);
      }, 200);
    }, 200);
  }, [facility, activeComposition, selectedRobot, activeFleetSize, simulationParams]);

  // Export Handlers
  const handleExportPdf = () => {
    if (!selectedRobot || !activeEconomics) return;
    generateFeasibilityPdf({
      projectTitle: `ТЭО Роботизации - ${facility.industry.toUpperCase()}`,
      facility,
      selectedRobot,
      fleetSize: activeFleetSize || activeEconomics.fleetSize,
      economicEvaluation: activeEconomics,
      spectralResult,
      whatIf,
      generatedAt: new Date(),
      version: 'СППР v1.0',
    });
    showToast('ТЭО сгенерировано и выгружено в PDF');
  };

  const handleExportExcel = () => {
    if (!activeEconomics) return;
    exportFeasibilityToExcel(
      facility,
      activeComposition.length > 0 ? activeComposition : selectedRobot,
      activeEconomics,
      whatIf
    );
    showToast('Финансовая модель выгружена в Excel (.xlsx)');
  };

  return (
    <div className="h-screen w-screen overflow-hidden text-slate-100 bg-slate-950 font-sans select-none flex flex-col">
      {/* ================= HEADER BAR ================= */}
      <header className="h-13 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between z-30 shrink-0 shadow-md">
        {/* REO Logo & СППР v1.0 Badge */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-400 text-slate-950 font-extrabold flex items-center justify-center border border-amber-500 rounded text-xs tracking-tighter">
            REO
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-xs uppercase tracking-tight text-white">
                REO Platform
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-amber-400/15 text-amber-300 border border-amber-400/30 uppercase font-semibold rounded">
                СППР v1.0
              </span>
            </div>
            <p className="text-[10px] text-slate-400 -mt-0.5">
              Robotic Economic Optimizer • Предынвестиционный аудит ФЦ БАС
            </p>
          </div>
        </div>

        {/* 1-Click Industry Presets */}
        <div className="hidden md:flex items-center border border-slate-700 bg-slate-950 rounded-lg overflow-hidden">
          {FACILITY_PRESETS.map((p) => {
            const isActive = activePresetId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handlePresetSelect(p.id)}
                className={`px-3 py-1.5 text-xs font-semibold transition cursor-pointer border-r last:border-r-0 border-slate-800 ${
                  isActive
                    ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>

        {/* Column Toggles & Export Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-slate-700 bg-slate-900 p-0.5 rounded text-xs font-mono">
            <button
              onClick={() => setIsLeftOpen(!isLeftOpen)}
              title="Показать / скрыть панель ввода условий"
              className={`px-2 py-1 text-[11px] font-bold rounded transition ${
                isLeftOpen ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isLeftOpen ? '◀ Ввод' : '▶ Ввод'}
            </button>
            <div className="w-px h-3 bg-slate-700 mx-0.5"></div>
            <button
              onClick={() => setIsRightOpen(!isRightOpen)}
              title="Показать / скрыть панель аналитики"
              className={`px-2 py-1 text-[11px] font-bold rounded transition ${
                isRightOpen ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isRightOpen ? 'Вывод ▶' : '◀ Вывод'}
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 text-xs font-semibold uppercase tracking-tight rounded transition flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white border border-blue-500 text-xs font-semibold uppercase tracking-tight rounded transition flex items-center gap-1.5 cursor-pointer shadow-blue-600/20"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>ТЭО (PDF)</span>
          </button>
        </div>
      </header>

      {/* ================= MAIN 3-ZONE DASHBOARD WORKSPACE ================= */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ================= ZONE 1: LEFT COLUMN (INPUT & CONDITIONS) ================= */}
        <aside
          className={`transition-all duration-300 shrink-0 z-20 flex flex-col bg-slate-900/95 border-r border-slate-800 overflow-hidden ${
            isLeftOpen ? 'w-80 sm:w-96' : 'w-0 border-r-0'
          }`}
        >
          <div className="p-3 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-amber-400" />
              Входные параметры и флот
            </span>
            <span className="text-[10px] font-mono font-bold text-amber-400">ZONE 1</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-slate-200">
            {/* Facility Geometry & Requirements Card */}
            <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
              <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-200 border-b border-slate-800 pb-1.5">
                Параметры объекта
              </h4>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Площадь (м²)</span>
                  <input
                    type="number"
                    value={facility.totalAreaSqm}
                    onChange={(e) =>
                      setFacility({ ...facility, totalAreaSqm: Number(e.target.value) || 100 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-white focus:border-amber-400"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Проезд (м)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={facility.aisleWidthM}
                    onChange={(e) =>
                      setFacility({ ...facility, aisleWidthM: Number(e.target.value) || 1 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-white focus:border-amber-400"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Груз (кг)</span>
                  <input
                    type="number"
                    value={facility.requiredPayloadKg}
                    onChange={(e) =>
                      setFacility({ ...facility, requiredPayloadKg: Number(e.target.value) || 1 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-white focus:border-amber-400"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Сменность</span>
                  <select
                    value={facility.shiftsPerDay}
                    onChange={(e) =>
                      setFacility({ ...facility, shiftsPerDay: Number(e.target.value) })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs text-white focus:border-amber-400"
                  >
                    <option value={1}>1 смена (8ч)</option>
                    <option value={2}>2 смены (16ч)</option>
                    <option value={3}>3 смены (24ч)</option>
                  </select>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block font-semibold">ФОТ оператора (руб/мес)</span>
                <input
                  type="number"
                  step="5000"
                  value={facility.averageWorkerSalaryRub}
                  onChange={(e) =>
                    setFacility({
                      ...facility,
                      averageWorkerSalaryRub: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-white focus:border-amber-400"
                />
              </div>
            </div>

            {/* Simulation Calculation Parameters Panel */}
            <SimulationParamsPanel
              params={simulationParams}
              onChange={setSimulationParams}
              fleetSize={activeFleetSize}
            />

            {/* Fleet Configurator Panel (Sandbox for all 9 robots) */}
            <FleetConfigPanel
              mode={fleetMode}
              onModeChange={setFleetMode}
              aiOptimizationResult={aiOptimizationResult}
              manualFleetCounts={manualFleetCounts}
              onManualCountChange={handleManualCountChange}
              facility={facility}
              allRobots={SEED_ROBOTS}
              onRunSimulation={handleRunSimulation}
              isCalculating={isCalculating}
            />
          </div>
        </aside>

        {/* ================= ZONE 2: CENTER COLUMN (DIGITAL TWIN VIEWPORT) ================= */}
        <section className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">

          {/* Telemetry Header Strip */}
          <div className="h-10 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between text-xs font-mono shrink-0 shadow-sm">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-semibold text-white">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                ФАКТ КВОТЫ: <span className="text-amber-400 font-bold">{activeEconomics?.effectiveThroughput ?? facility.targetThroughputPerHour} шт/ч</span>
              </span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-300">
                ПАРК: <strong className="text-white font-bold">{activeFleetSize} ед.</strong>
              </span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-300">
                СВЯЗНОСТЬ (λ₂):{' '}
                <strong
                  className={`font-bold ${
                    spectralResult.algebraicConnectivity < 0.15
                      ? 'text-red-400'
                      : spectralResult.algebraicConnectivity < 0.35
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {spectralResult.algebraicConnectivity.toFixed(3)}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-semibold text-slate-300 uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                ЦВЕТНОЙ CAD 2.5D
              </span>
            </div>
          </div>

          {/* Interactive Simulation Viewport Stage */}
          <div className="flex-1 overflow-hidden relative">
            <SimulationViewport
              facility={facility}
              fleetConfig={activeComposition.length > 0 ? activeComposition : selectedRobot}
              fleetSize={activeFleetSize || (activeEconomics?.fleetSize ?? 0)}
              targetThroughputPerHour={
                activeEconomics?.effectiveThroughput ?? facility.targetThroughputPerHour
              }
              replayFrames={replayFrames}
            />
          </div>
        </section>

        {/* ================= ZONE 3: RIGHT COLUMN (ANALYTICS & FEASIBILITY) ================= */}
        <aside
          className={`transition-all duration-300 shrink-0 z-20 flex flex-col bg-slate-900/95 border-l border-slate-800 overflow-hidden ${
            isRightOpen ? 'w-96 sm:w-[440px]' : 'w-0 border-l-0'
          }`}
        >
          {/* Tab Switcher Header */}
          <div className="border-b border-slate-800 bg-slate-900 p-1 flex items-center text-xs font-mono">
            <button
              onClick={() => setRightTab('economics')}
              className={`flex-1 py-1.5 font-bold uppercase text-[11px] rounded transition ${
                rightTab === 'economics'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              3 Сценария
            </button>
            <button
              onClick={() => setRightTab('xai')}
              className={`flex-1 py-1.5 font-bold uppercase text-[11px] rounded transition ${
                rightTab === 'xai'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Side-by-Side и XAI
            </button>
            <button
              onClick={() => setRightTab('whatif')}
              className={`flex-1 py-1.5 font-bold uppercase text-[11px] rounded transition ${
                rightTab === 'whatif'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              What-If
            </button>
          </div>

          {/* Tab Contents */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-slate-200">
            {rightTab === 'economics' && selectedRobot && activeEconomics && (
              <div className="space-y-4">
                {/* 3-Scenario Financial Matrix */}
                <ScenarioMatrix
                  evaluation={activeEconomics}
                  robot={selectedRobot}
                  facility={facility}
                  whatIf={whatIf}
                  spectralResult={spectralResult}
                />
              </div>
            )}

            {rightTab === 'xai' && (
              <div className="space-y-4">
                {eligibleRobots.length > 0 && (
                  <RobotComparisonTable
                    robots={eligibleRobots.map((e) => e.robot)}
                    facility={facility}
                    whatIf={whatIf}
                    selectedRobotId={selectedRobotId}
                    onSelectRobot={setSelectedRobotId}
                  />
                )}

                <ExcludedRobotsAccordion excludedRobots={ineligibleRobots} />
              </div>
            )}

            {rightTab === 'whatif' && (
              <div className="space-y-4">
                <WhatIfPanel
                  whatIf={whatIf}
                  onChange={setWhatIf}
                  onOpenFormulaModal={() => setIsFormulaModalOpen(true)}
                />
              </div>
            )}
          </div>

          {/* Legal Disclaimer Footer */}
          <div className="p-3 border-t border-slate-800 bg-slate-950 text-[10px] text-slate-500 font-mono text-center">
            Расчет носит предварительный индикативный характер и не является публичной офертой (п. 3.7.5 ТЗ).
          </div>
        </aside>
      </div>

      {/* Progress & Formula Modals */}
      <CalculationProgressModal isOpen={isCalculating} currentStep={calculationStep} />
      <FormulaModal isOpen={isFormulaModalOpen} onClose={() => setIsFormulaModalOpen(false)} />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-900 border-2 border-amber-400 text-white px-4 py-2.5 text-xs font-mono rounded-lg shadow-2xl flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span className="font-bold">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
