import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Zone3Container } from './components/zone3/Zone3Container.js';
import { FeasibilityPreviewModal } from './components/FeasibilityPreviewModal.js';
import { SEED_ROBOTS } from './data/robots.seed.js';
import { FACILITY_PRESETS } from './data/presets.js';
import { evaluateEligibility } from './engine/dss.js';
import {
  calculateEconomics,
  calculateCompositionEconomics,
  DEFAULT_WHAT_IF_PARAMS,
  type WhatIfParams,
  type EconomicEvaluation,
} from './engine/economics.js';
import { validateWarehousePreflight } from './engine/validators/warehouse_preflight.js';
import { generateFacilityTopology } from './engine/topology_generator.js';
import { analyzeTopologyBottlenecks } from './engine/spectral_analyzer.js';
import {
  optimizeFleetComposition,
  type FleetCompositionItem,
  type HeterogeneousOptimizationResult,
} from './engine/fleet_optimizer.js';
import { SimulationEngine, type SimulationReplayFrame } from './engine/simulation_engine.js';
import type { SupplySchedule } from './engine/constructor_engine.js';
import type { FacilityRequirements } from './types/facility.js';
import type { FacilityTopology } from './types/topology.js';
import { generateFeasibilityPdf } from './engine/export_pdf.js';
import { exportFeasibilityToExcel } from './engine/export_excel.js';

import { Zone1Sidebar } from './components/Zone1Sidebar.js';
import { SimulationParams } from './components/SimulationParamsPanel.js';
import { FleetConfigMode } from './components/FleetConfigPanel.js';
import { SimulationViewport } from './components/SimulationViewport.js';
import { RobotComparisonTable } from './components/RobotComparisonTable.js';
import { ScenarioMatrix } from './components/ScenarioMatrix.js';
import { WhatIfPanel } from './components/WhatIfPanel.js';
import { FormulaModal } from './components/FormulaModal.js';
import { ExcludedRobotsAccordion } from './components/ExcludedRobotsAccordion.js';
import { CalculationProgressModal } from './components/CalculationProgressModal.js';

import { FileSpreadsheet } from 'lucide-react';

export default function App() {
  // 0. App Mode State: 'CONSTRUCTOR' | 'SIMULATION'
  const [appMode, setAppMode] = useState<'CONSTRUCTOR' | 'SIMULATION'>('CONSTRUCTOR');

  // 1. Facility Requirements State
  const [facility, setFacility] = useState<FacilityRequirements>(
    FACILITY_PRESETS[0].requirements
  );

  // 2. What-If & Selected Robot State
  const [whatIf, setWhatIf] = useState<WhatIfParams>(DEFAULT_WHAT_IF_PARAMS);
  const [selectedRobotId, setSelectedRobotId] = useState<string>('ronavi-h1500');

  // 3. Simulation Parameters
  const [simulationParams, setSimulationParams] = useState<SimulationParams>({
    targetHourlyQuota: FACILITY_PRESETS[0].requirements.targetThroughputPerHour,
    durationHours: 1,
    targetReplayFramesCount: 7200,
  });

  const handleSimulationParamsChange = useCallback((updated: SimulationParams) => {
    setSimulationParams(updated);
    setFacility((prev) => {
      if (prev.targetThroughputPerHour !== updated.targetHourlyQuota) {
        return { ...prev, targetThroughputPerHour: updated.targetHourlyQuota };
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    setSimulationParams((prev) => ({
      ...prev,
      targetHourlyQuota: facility.targetThroughputPerHour,
    }));
  }, [facility.targetThroughputPerHour]);

  // 4. Fleet Configuration Mode & AI Calculation State
  const [fleetMode, setFleetMode] = useState<FleetConfigMode>('ai');
  const [manualFleetCounts, setManualFleetCounts] = useState<Record<string, number>>({
    'ronavi-h1500': 2,
  });
  const [currentTopology, setCurrentTopology] = useState<FacilityTopology | null>(null);
  const [hasCalculatedAiFleet, setHasCalculatedAiFleet] = useState<boolean>(false);
  // Флаг актуальности аналитики Зоны 3
const [hasCalculatedAnalytics, setHasCalculatedAnalytics] = useState<boolean>(false);
  // REO: Реактивный сброс статуса расчета при любом изменении склада или требований
const isFirstMountRef = useRef(true);
useEffect(() => {
  if (isFirstMountRef.current) {
    isFirstMountRef.current = false;
    return;
  }
  setHasCalculatedAiFleet(false);
  setHasCalculatedAnalytics(false); // <-- СБРАСЫВАЕМ ЗОНУ 3
}, [
  facility.targetThroughputPerHour,
  facility.requiredPayloadKg,
  facility.shiftsPerDay,
  facility.industry,
  facility.aisleWidthM,
  facility.operatingTempRange.min,
  facility.operatingTempRange.max,
  facility.floorSurfaceQuality,
  facility.cleanlinessClass,
  manualFleetCounts,
  fleetMode,
]);

  const handleCalculateAiFleet = useCallback(() => {
    setHasCalculatedAiFleet(true);
    showToast('REO: Аналитический расчет оптимального флота выполнен');
  }, []);

  // 5. Layout Toggles & Analytics Tab Switcher
  const [isLeftOpen, setIsLeftOpen] = useState<boolean>(true);
  const [isRightOpen, setIsRightOpen] = useState<boolean>(true);
  const [rightTab, setRightTab] = useState<'economics' | 'xai' | 'whatif'>('economics');

  // 6. Simulation & Calculation Progress State
  const [replayFrames, setReplayFrames] = useState<SimulationReplayFrame[]>([]);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  export type AppMode = 'DESIGN' | 'ANALYTICS';
  const [appMode, setAppMode] = useState<AppMode>('DESIGN');
  const [calculationStep, setCalculationStep] = useState<number>(0);
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState<boolean>(false);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
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
    if (!hasCalculatedAiFleet) {
      return {
        isHeterogeneous: false,
        composition: [],
        totalFleetSize: 0,
        totalThroughputPerHour: 0,
        fiveYearTcoRub: 0,
        tcoSavingsPercentVsBestMono: 0,
        bestMonoRobotId: '',
        bestMonoTcoRub: 0,
      };
    }
    const eligibleRobotSpecs = eligibleRobots.map((e) => e.robot);
    return optimizeFleetComposition(facility, eligibleRobotSpecs, whatIf, currentTopology);
  }, [facility, eligibleRobots, whatIf, currentTopology, hasCalculatedAiFleet]);

  // Active Fleet Composition
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

  // Run Simulation Handler
  // Run Simulation Handler
  const handleRunSimulation = useCallback((supplySchedule?: SupplySchedule) => {
    // 1. Подсчёт установленных в CAD элементов склада
    let inboundDocksCount = 0;
    let outboundDocksCount = 0;
    let racksCount = 0;

    if (grid?.tiles) {
      grid.tiles.forEach((type: any) => {
        if (type === 'DOCK_INBOUND') inboundDocksCount++;
        if (type === 'DOCK_OUTBOUND') outboundDocksCount++;
        if (type === 'RACK') racksCount++;
      });
    }

    // 2. Pre-flight ZOD-проверка перед запуском симуляции
    const validation = validateWarehousePreflight({
      targetThroughputPerHour: simulationParams.targetHourlyQuota || facility.targetThroughputPerHour,
      averageWorkerSalaryRub: facility.averageWorkerSalaryRub,
      totalAreaSqm: facility.totalAreaSqm,
      shiftsPerDay: facility.shiftsPerDay,
      inboundDocksCount,
      outboundDocksCount,
      racksCount,
      fleetSize: activeFleetSize || activeComposition.reduce((sum, item) => sum + item.count, 0),
      hasSelectedRobot: Boolean(selectedRobot || activeComposition.length > 0),
    });

    if (!validation.success) {
      showToast(`⚠️ ${validation.error}`);
      return; // Стоп: симуляция не запустится, пока склад не готов
    }

    // 3. Запуск пошагового моделирования
    setHasCalculatedAnalytics(true);
    setIsCalculating(true);
    setCalculationStep(1);

    setTimeout(() => {
      setCalculationStep(2);

      setTimeout(() => {
        // CAD
        const topology = currentTopology && currentTopology.nodes.length > 0
          ? currentTopology
          : generateFacilityTopology(facility);
        const engine = new SimulationEngine(
          topology,
          activeComposition.length > 0
            ? activeComposition
            : selectedRobot
            ? [{ robot: selectedRobot, count: 1, totalThroughputPerHour: 10, totalCapexRub: 1000, totalAnnualOpexRub: 100, fiveYearTcoRub: 1500 }]
            : SEED_ROBOTS[0],
          activeFleetSize || 1,
          facility
        );

        engine.runSimulation({
          targetHourlyQuota: simulationParams.targetHourlyQuota,
          durationHours: simulationParams.durationHours,
          recordReplay: true,
          targetReplayFramesCount: simulationParams.targetReplayFramesCount,
          supplySchedule,
        });

        setCalculationStep(3);

        setTimeout(() => {
          setReplayFrames([...engine.replayFrames]);
          setCalculationStep(4);
          setIsCalculating(false);
          setCalculationStep(0);
          setAppMode('ANALYTICS');
          showToast('REO: Моделирование завершено. Экспресс-ТЭО обновлено.');
        }, 150);
      }, 200);
    }, 200);
  }, [facility, grid, currentTopology, activeComposition, selectedRobot, activeFleetSize, simulationParams, showToast]);

  // Return to CAD Design Mode Handler
  const handleReturnToCad = useCallback(() => {
    setAppMode('DESIGN');
    showToast('REO: Возврат в режим проектирования CAD.');
  }, [showToast]);

  // =========================================================================
  // НЕУБИВАЕМЫЙ ДЕТЕКТОР 3000: ОПТИМУМ vs ПЕСОЧНИЦА + ТОПОЛОГИЯ CAD. СМЕРТЬ ВСЕМ ЯЩЕРАМ!!!
  // =========================================================================
  const { isFleetReady, isCadReady, isReadyToLaunch, readinessHint } = useMemo(() => {
    const sandboxCount = activeComposition?.reduce((sum, item) => sum + (item.count || 0), 0) ?? 0;

    const hasOptimalFleet = Boolean(selectedRobot) && (activeFleetSize ?? 0) > 0;

    const fleetOk = sandboxCount > 0 || hasOptimalFleet;

    let hasInbound = false;
    let hasOutbound = false;
    let hasRack = false;

    if (grid?.tiles && grid.tiles.size > 0) {
      grid.tiles.forEach((type: any) => {
        if (type === 'DOCK_INBOUND') hasInbound = true;
        if (type === 'DOCK_OUTBOUND') hasOutbound = true;
        if (type === 'RACK') hasRack = true;
      });
    }

    const cadOk = hasInbound && hasOutbound && hasRack;

    let hint = '';
    if (!cadOk) {
      if (!hasInbound) hint = 'Установите ворота приёмки в CAD';
      else if (!hasOutbound) hint = 'Установите ворота отгрузки в CAD';
      else if (!hasRack) hint = 'Разместите хотя бы один стеллаж в CAD';
    } else if (!fleetOk) {
      hint = 'Укомплектуйте парк в Блоке 6 (Оптимум или Песочница)';
    }

    return {
      isFleetReady: fleetOk,
      isCadReady: cadOk,
      isReadyToLaunch: fleetOk && cadOk,
      readinessHint: hint,
    };
  }, [grid, activeComposition, selectedRobot, activeFleetSize]);

  // Export Handlers
  const handleExportPdf = () => {
    if (!selectedRobot || !activeEconomics) {
      showToast('Сначала сформируйте склад и запустите расчёт');
      return;
    }
    setIsPdfPreviewOpen(true);
  };

  const handleExportExcel = () => {
    if (!activeEconomics) return;
    exportFeasibilityToExcel(
      facility,
      activeComposition.length > 0 ? activeComposition : selectedRobot,
      activeEconomics,
      whatIf
    );
    showToast('REO: Финансовая модель выгружена в Excel (.xlsx)');
  };

  return (
    <div className="h-screen w-screen overflow-hidden text-[#1A1A1A] bg-[#F9F9F6] font-sans flex flex-col rounded-none">
      {/* ================= HEADER BAR (docs/reo.html style) ================= */}
      <header className="h-12 bg-[#FFFFFF] border-b border-[#D4AF37]/40 px-4 flex items-center justify-between z-30 shrink-0 shadow-xs rounded-none">

        {/* REO Logo & СППР v1.0 Badge */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] font-extrabold flex items-center justify-center border border-[#BFA02E] text-xs tracking-tighter rounded-none">
            REO
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-xs uppercase tracking-tight text-[#1A1A1A]">
                REO Platform
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#D4AF37]/15 text-[#8A6826] border border-[#D4AF37]/40 uppercase font-semibold rounded-none">
                СППР v1.0
              </span>
            </div>
            <p className="text-[10px] text-[#4F4F47] -mt-0.5">
              Robotic Economic Optimizer • Предынвестиционный аудит ФЦ БАС
            </p>
          </div>
        </div>

        {/* Dynamic Project Header */}
        <div className="hidden md:flex items-center gap-2 border border-[#D4AF37]/40 bg-[#FFFFFF] px-3 py-1 text-xs font-mono rounded-none">
          {appMode === 'CONSTRUCTOR' ? (
            <span className="font-bold text-[#8A6826]">
              [ REO CAD CONSTRUCTOR ] • [ Проект склада #1 ] • [ Режим: Чертеж ]
            </span>
          ) : (
            <>
              <span className="font-bold text-[#8A6826]">[ REO CAD PLATFORM ]</span>
              <span className="text-[#DFDFD8]">•</span>
              <span className="text-[#1A1A1A] font-semibold">[ Проект склада #1 ]</span>
              <span className="text-[#DFDFD8]">•</span>
              <span className="font-bold text-emerald-700">
                [ Статус: Моделирование / Симуляция ]
              </span>
            </>
          )}
        </div>

        {/* Column Toggles & Export Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-[#D4AF37]/40 bg-[#FFFFFF] p-0.5 text-xs font-mono rounded-none">
            <button
              onClick={() => setIsLeftOpen(!isLeftOpen)}
              title="Показать / скрыть панель ввода условий"
              className={`px-2 py-1 text-[11px] font-bold transition rounded-none ${
                isLeftOpen ? 'bg-[#D4AF37] text-[#1A1A1A]' : 'text-[#4F4F47] hover:text-[#1A1A1A]'
              }`}
            >
              {isLeftOpen ? '◀ Ввод' : '▶ Ввод'}
            </button>
            <div className="w-px h-3 bg-[#D4AF37]/40 mx-0.5"></div>
            <button
              onClick={() => setIsRightOpen(!isRightOpen)}
              title="Показать / скрыть панель аналитики"
              className={`px-2 py-1 text-[11px] font-bold transition rounded-none ${
                isRightOpen ? 'bg-[#D4AF37] text-[#1A1A1A]' : 'text-[#4F4F47] hover:text-[#1A1A1A]'
              }`}
            >
              {isRightOpen ? 'Вывод ▶' : '◀ Вывод'}
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#F4F4F0] text-[#8A6826] border border-[#D4AF37]/50 text-xs font-semibold uppercase tracking-tight rounded-none transition flex items-center gap-1.5 cursor-pointer font-mono"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#8A6826]" />
            <span>Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            className="px-3.5 py-1.5 bg-[#58111A] hover:bg-[#4A0E17] text-[#F9F9F6] border border-[#4A0E17] text-xs font-semibold uppercase tracking-tight rounded-none transition flex items-center gap-1.5 cursor-pointer"
          >
            <span className="w-1.5 h-1.5 bg-[#D4AF37]"></span>
            <span>Экспорт ТЭО (PDF)</span>
          </button>
        </div>
      </header>

      {/* ================= MAIN 3-ZONE DASHBOARD WORKSPACE ================= */}
      <div className="flex-1 flex overflow-hidden relative rounded-none">

        {/* ================= ZONE 1: LEFT COLUMN (EXHAUSTIVE INPUTS & CONDITIONS) ================= */}
        {isLeftOpen && (
          <div className="relative shrink-0 flex flex-col h-full">
            <Zone1Sidebar
              facility={facility}
              onChangeFacility={setFacility}
              simulationParams={simulationParams}
              onChangeSimulationParams={handleSimulationParamsChange}
              fleetMode={fleetMode}
              onChangeFleetMode={setFleetMode}
              aiOptimizationResult={aiOptimizationResult}
              manualFleetCounts={manualFleetCounts}
              onManualCountChange={handleManualCountChange}
              activeFleetSize={activeFleetSize}
              topology={currentTopology}
              onCalculateAiFleet={handleCalculateAiFleet}
              hasCalculatedAiFleet={hasCalculatedAiFleet}
            />

            {/* Белая матовая пелена Зоны 1 в режиме ANALYTICS */}
            {appMode === 'ANALYTICS' && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center p-6 text-center select-none cursor-default animate-in fade-in duration-200">
                <div className="bg-[#FFFFFF] border border-[#D4AF37]/60 p-4 max-w-[280px] shadow-sm space-y-3 rounded-none">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#8A6826]">
                    [ РАСЧЕТ ЗАФИКСИРОВАН ]
                  </div>
                  <p className="text-[10.5px] text-[#4F4F47] leading-relaxed">
                    Параметры ТЗ заблокированы для защиты от рассинхронизации ТЭО.
                  </p>
                  <button
                    type="button"
                    onClick={handleReturnToCad}
                    className="w-full py-2 px-3 bg-[#D4AF37] hover:bg-[#BFA02E] active:bg-[#8A6826] text-[#1A1A1A] font-bold text-[10px] uppercase tracking-wider border border-[#BFA02E] transition rounded-none cursor-pointer shadow-xs"
                  >
                    [ ← ВЕРНУТЬСЯ В РЕДАКТОР CAD ]
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= ZONE 2: CENTER COLUMN (DIGITAL TWIN VIEWPORT) ================= */}
        <section className="flex-1 flex flex-col bg-[#EAEAE6] overflow-hidden relative border-r border-[#D4AF37]/40 rounded-none">

          {/* Telemetry Header Strip (Only in SIMULATION mode) */}
          {appMode === 'SIMULATION' && (
            <div className="h-10 bg-[#FFFFFF] border-b border-[#D4AF37]/40 px-4 flex items-center justify-between text-xs font-mono shrink-0 shadow-xs rounded-none">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 font-semibold text-[#1A1A1A]">
                  <span className="w-2 h-2 bg-[#D4AF37]"></span>
                  ФАКТ КВОТЫ: <span className="text-[#8A6826] font-bold tabular-nums">{activeEconomics?.effectiveThroughput ?? facility.targetThroughputPerHour} шт/ч</span>
                </span>
                <span className="text-[#DFDFD8]">|</span>
                <span className="text-[#4F4F47]">
                  ПАРК: <strong className="text-[#1A1A1A] font-bold tabular-nums">{activeFleetSize} ед.</strong>
                </span>
                <span className="text-[#DFDFD8]">|</span>
                <span className="text-[#4F4F47]">
                  СВЯЗНОСТЬ (λ₂):{' '}
                  <strong
                    className={`font-bold tabular-nums ${
                      spectralResult.algebraicConnectivity < 0.15
                        ? 'text-rose-800'
                        : spectralResult.algebraicConnectivity < 0.35
                        ? 'text-[#8A6826]'
                        : 'text-emerald-800'
                    }`}
                  >
                    {spectralResult.algebraicConnectivity.toFixed(3)}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#F4F4F0] border border-[#D4AF37]/30 text-[10px] font-semibold text-[#4F4F47] uppercase rounded-none">
                  <span className="w-1.5 h-1.5 bg-emerald-600"></span>
                  СИМУЛЯЦИЯ АКТИВНА
                </span>
              </div>
            </div>
          )}

          {/* Interactive Simulation Viewport Stage */}
          <div className="flex-1 overflow-hidden relative rounded-none">
            <SimulationViewport
              appMode={appMode}
              onReturnToCad={handleReturnToCad}
              onAppModeChange={setAppMode}
              facility={facility}
              onChangeFacility={setFacility}
              fleetConfig={activeComposition.length > 0 ? activeComposition : selectedRobot}
              fleetSize={
                activeComposition && activeComposition.length > 0
                  ? activeComposition.reduce((sum, item) => sum + (item.count || 0), 0)
                  : activeFleetSize || 0
              }
              targetThroughputPerHour={
                activeEconomics?.effectiveThroughput ?? facility.targetThroughputPerHour
              }
              replayFrames={replayFrames}
              onTriggerSimulationRun={handleRunSimulation}
              showToast={showToast}
              onTopologyChange={setCurrentTopology}
            />
          </div>
        </section>

        {/* ================= ZONE 3: RIGHT COLUMN (ANALYTICS & FEASIBILITY) ================= */}
        <aside
          className={`transition-all duration-300 relative shrink-0 z-20 flex flex-col bg-[#F9F9F6] border-l border-[#D4AF37]/40 overflow-hidden rounded-none ${
            isRightOpen ? 'w-96 sm:w-[480px] lg:w-[540px]' : 'w-0 border-l-0'
          }`}
        >
          {isRightOpen && (
            <Zone3Container
              hasCalculatedAnalytics={hasCalculatedAnalytics}
              activeEconomics={activeEconomics}
              selectedRobot={selectedRobot}
              robots={SEED_ROBOTS}
              facility={facility}
              whatIf={whatIf}
              onChangeWhatIf={setWhatIf}
              selectedRobotId={selectedRobotId}
              onSelectRobotId={setSelectedRobotId}
              spectralResult={spectralResult}
              onOpenFormulaModal={() => setIsFormulaModalOpen(true)}
            />
            {/* Белая матовая пелена Зоны 3 в режиме DESIGN */}
            {appMode === 'DESIGN' && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center p-6 text-center select-none cursor-default animate-in fade-in duration-200">
                <div className="bg-[#FFFFFF] border border-[#D4AF37]/60 p-4 max-w-[280px] shadow-sm space-y-2 rounded-none">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#8A6826]">
                    [ РЕЖИМ ПРОЕКТИРОВАНИЯ ]
                  </div>
                  <p className="text-[10.5px] text-[#4F4F47] leading-relaxed">
                    Раздел ТЭО и What-If станет доступен после расстановки объектов и нажатия кнопки «Склад готов».
                  </p>
                </div>
              </div>
            )}
          )}
        </aside>
      </div>

      {/* Progress & Formula Modals */}
      <CalculationProgressModal isOpen={isCalculating} currentStep={calculationStep} />
      <FormulaModal isOpen={isFormulaModalOpen} onClose={() => setIsFormulaModalOpen(false)} />
      {selectedRobot && activeEconomics && (
        <FeasibilityPreviewModal
          isOpen={isPdfPreviewOpen}
          onClose={() => setIsPdfPreviewOpen(false)}
          facility={facility}
          selectedRobot={selectedRobot}
          fleetSize={activeFleetSize || activeEconomics.fleetSize}
          evaluation={activeEconomics}
          whatIf={whatIf}
          spectralResult={spectralResult}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#FFFFFF] border-2 border-[#D4AF37] text-[#1A1A1A] px-4 py-2.5 text-xs font-mono shadow-lg flex items-center gap-2 rounded-none">
          <span className="w-2 h-2 bg-[#D4AF37]"></span>
          <span className="font-bold">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
