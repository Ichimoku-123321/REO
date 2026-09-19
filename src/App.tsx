import { useState, useMemo, useEffect, useCallback } from 'react';
import { SEED_ROBOTS } from './data/robots.seed.js';
import { FACILITY_PRESETS } from './data/presets.js';
import { evaluateEligibility } from './engine/dss.js';
import {
  calculateEconomics,
  calculateCompositionEconomics,
  calculateAvailabilityCoefficient,
  DEFAULT_WHAT_IF_PARAMS,
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
import type { WhatIfParams } from './engine/economics.js';
import { FacilityForm } from './components/FacilityForm.js';
import { RobotCard } from './components/RobotCard.js';
import { ExcludedRobotsAccordion } from './components/ExcludedRobotsAccordion.js';
import { RobotComparisonTable } from './components/RobotComparisonTable.js';
import { ScenarioMatrix } from './components/ScenarioMatrix.js';
import { WhatIfPanel } from './components/WhatIfPanel.js';
import { FormulaModal } from './components/FormulaModal.js';
import { SimulationViewport } from './components/SimulationViewport.js';
import { ExportToolbar } from './components/ExportToolbar.js';
import { FleetConfigPanel, type FleetConfigMode } from './components/FleetConfigPanel.js';
import { CalculationProgressModal } from './components/CalculationProgressModal.js';
import {
  Cpu,
  CheckCircle2,
  XCircle,
  Coins,
  Bot,
  SlidersHorizontal,
} from 'lucide-react';

export default function App() {
  const [activePresetId, setActivePresetId] = useState<string>('warehouse');
  const [facility, setFacility] = useState<FacilityRequirements>(
    FACILITY_PRESETS[0].requirements
  );
  const [selectedRobotId, setSelectedRobotId] = useState<string>('');
  const [whatIf, setWhatIf] = useState<WhatIfParams>(DEFAULT_WHAT_IF_PARAMS);
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState<boolean>(false);

  // Fleet Configuration State: Mode 1 (AI Optimum) vs Mode 2 (Manual Choice)
  const [fleetMode, setFleetMode] = useState<FleetConfigMode>('ai');
  const [manualFleetCounts, setManualFleetCounts] = useState<Record<string, number>>({});

  // Simulation Replay State & Calculation Progress
  const [replayFrames, setReplayFrames] = useState<SimulationReplayFrame[]>([]);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [calculationStep, setCalculationStep] = useState<number>(0);

  const handlePresetSelect = (presetId: string) => {
    const preset = FACILITY_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setActivePresetId(preset.id);
      setFacility(preset.requirements);
    }
  };

  const handleFacilityChange = (updated: FacilityRequirements) => {
    setActivePresetId('');
    setFacility(updated);
  };

  const evaluatedRobots = useMemo(() => {
    return evaluateEligibility(facility, SEED_ROBOTS);
  }, [facility]);

  const eligibleRobots = useMemo(() => {
    return evaluatedRobots.filter((r) => r.result.isEligible);
  }, [evaluatedRobots]);

  const ineligibleRobots = useMemo(() => {
    return evaluatedRobots.filter((r) => !r.result.isEligible);
  }, [evaluatedRobots]);

  // Set default selected robot and default manual counts when eligibleRobots change
  useEffect(() => {
    if (eligibleRobots.length > 0) {
      const isCurrentValid = eligibleRobots.some((r) => r.robot.id === selectedRobotId);
      if (!isCurrentValid) {
        setSelectedRobotId(eligibleRobots[0].robot.id);
      }

      setManualFleetCounts((prev) => {
        const next = { ...prev };
        eligibleRobots.forEach(({ robot }) => {
          if (!(robot.id in next)) {
            next[robot.id] = 0;
          }
        });
        // Default first eligible robot to 1 unit if all are 0
        const totalSelected = Object.values(next).reduce((sum, c) => sum + c, 0);
        if (totalSelected === 0 && eligibleRobots[0]) {
          next[eligibleRobots[0].robot.id] = 2;
        }
        return next;
      });
    } else {
      setSelectedRobotId('');
    }
  }, [eligibleRobots, selectedRobotId]);

  const selectedRobot = useMemo(() => {
    return eligibleRobots.find((r) => r.robot.id === selectedRobotId)?.robot ?? null;
  }, [eligibleRobots, selectedRobotId]);

  // AI Fleet Optimization Result
  const aiOptimizationResult: HeterogeneousOptimizationResult = useMemo(() => {
    const eligibleRobotSpecs = eligibleRobots.map((e) => e.robot);
    return optimizeFleetComposition(facility, eligibleRobotSpecs, whatIf);
  }, [facility, eligibleRobots, whatIf]);

  // Active Fleet Composition Items (Mode 1 vs Mode 2)
  const activeComposition: FleetCompositionItem[] = useMemo(() => {
    if (fleetMode === 'ai') {
      return aiOptimizationResult.composition;
    }

    // Mode 2: Manual Choice Composition Items
    const items: FleetCompositionItem[] = [];
    const capexDiscountPercent = whatIf?.capexDiscountPercent ?? 0;
    const capexDiscountFactor = Math.max(0, 1 - capexDiscountPercent / 100);

    eligibleRobots.forEach(({ robot }) => {
      const count = manualFleetCounts[robot.id] || 0;
      if (count > 0) {
        const kAvail = calculateAvailabilityCoefficient(
          robot.batteryRuntimeHours,
          robot.batteryChargeMinutes
        );
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
  }, [fleetMode, aiOptimizationResult, eligibleRobots, manualFleetCounts, whatIf]);

  // Economic Evaluation (updates dynamically for AI or Manual fleet selection)
  const activeEconomics = useMemo(() => {
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

  const lowestCapex = useMemo(() => {
    if (eligibleRobots.length === 0) return 0;
    return Math.min(...eligibleRobots.map((r) => r.robot.capexCostRub));
  }, [eligibleRobots]);

  const formattedLowestCapex = useMemo(() => {
    if (eligibleRobots.length === 0) return '—';
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0,
    }).format(lowestCapex);
  }, [eligibleRobots, lowestCapex]);

  const handleManualCountChange = (robotId: string, count: number) => {
    setManualFleetCounts((prev) => ({
      ...prev,
      [robotId]: Math.max(0, count),
    }));
  };

  // Button Action: "Запустить моделирование и расчет"
  const handleRunSimulationAndCalculation = useCallback(() => {
    setIsCalculating(true);
    setCalculationStep(1);

    setTimeout(() => {
      // Step 2: Simulation (7200 ticks)
      setCalculationStep(2);

      setTimeout(() => {
        const topology = generateFacilityTopology(facility);
        const engine = new SimulationEngine(topology, activeComposition);

        // Run 7200 ticks simulation and record replay frames
        engine.runOneHourSimulation(facility.targetThroughputPerHour, true);

        // Step 3: Timeline Replay Generation
        setCalculationStep(3);

        setTimeout(() => {
          setReplayFrames([...engine.replayFrames]);
          setCalculationStep(4);
          setIsCalculating(false);
          setCalculationStep(0);
        }, 150);
      }, 200);
    }, 200);
  }, [facility, activeComposition]);

  const activeFleetSize = activeComposition.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-16">
      {/* Top Navigation Header */}
      <header className="border-b border-slate-800 bg-slate-900/95 sticky top-0 z-50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white shadow-lg shadow-blue-500/20">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Платформа подбора роботизированных решений
                <span className="text-xs bg-blue-500/20 text-blue-400 font-semibold px-2 py-0.5 rounded border border-blue-500/30">
                  СППР v1.0
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Автоматизированная экспертиза и технико-экономическое обоснование
              </p>
            </div>
          </div>

          {/* Export & Import Header Controls */}
          <ExportToolbar
            facility={facility}
            selectedRobot={selectedRobot}
            fleetSize={activeFleetSize}
            economicEvaluation={activeEconomics}
            spectralResult={spectralResult}
            whatIf={whatIf}
            onFacilityImport={handleFacilityChange}
          />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Facility Form */}
        <FacilityForm
          facility={facility}
          onChange={handleFacilityChange}
          onPresetSelect={handlePresetSelect}
          activePresetId={activePresetId}
        />

        {/* Fleet Composition & Simulation Launch Panel */}
        <FleetConfigPanel
          mode={fleetMode}
          onModeChange={setFleetMode}
          aiOptimizationResult={aiOptimizationResult}
          manualFleetCounts={manualFleetCounts}
          onManualCountChange={handleManualCountChange}
          eligibleRobots={eligibleRobots.map((e) => e.robot)}
          onRunSimulation={handleRunSimulationAndCalculation}
          isCalculating={isCalculating}
        />

        {/* Calculation Progress Overlay Modal */}
        <CalculationProgressModal
          isOpen={isCalculating}
          currentStep={calculationStep}
        />

        {/* Live Summary Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex items-center gap-4 shadow-md">
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Всего решений в базе</p>
              <p className="text-2xl font-bold text-slate-100">{SEED_ROBOTS.length}</p>
            </div>
          </div>

          <div className="bg-slate-800/80 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-4 shadow-md">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Подходят под объект</p>
              <p className="text-2xl font-bold text-emerald-400">{eligibleRobots.length}</p>
            </div>
          </div>

          <div className="bg-slate-800/80 border border-amber-500/30 rounded-xl p-4 flex items-center gap-4 shadow-md">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
              <XCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Отклонено фильтрами</p>
              <p className="text-2xl font-bold text-amber-400">{ineligibleRobots.length}</p>
            </div>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex items-center gap-4 shadow-md">
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-lg border border-purple-500/20">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Мин. CAPEX единицы</p>
              <p className="text-lg font-bold text-slate-100">{formattedLowestCapex}</p>
            </div>
          </div>
        </div>

        {/* Step 4: Unified Robot Comparison Table */}
        {eligibleRobots.length > 0 && (
          <RobotComparisonTable
            robots={eligibleRobots.map((e) => e.robot)}
            facility={facility}
            whatIf={whatIf}
            selectedRobotId={selectedRobotId}
            onSelectRobot={setSelectedRobotId}
          />
        )}

        {/* Step 5: 3-Scenario Financial Table */}
        {selectedRobot && activeEconomics && (
          <ScenarioMatrix
            evaluation={activeEconomics}
            robot={selectedRobot}
            facility={facility}
            whatIf={whatIf}
            spectralResult={spectralResult}
          />
        )}

        {/* Step 6: Interactive What-If Control Panel */}
        {eligibleRobots.length > 0 && (
          <WhatIfPanel
            whatIf={whatIf}
            onChange={setWhatIf}
            onOpenFormulaModal={() => setIsFormulaModalOpen(true)}
          />
        )}

        {/* Step 7: 2.5D Topology Viewport & Fleet Simulation (Interactive Timeline Replay) */}
        <SimulationViewport
          facility={facility}
          fleetConfig={activeComposition.length > 0 ? activeComposition : selectedRobot}
          fleetSize={activeFleetSize || (activeEconomics?.fleetSize ?? 0)}
          targetThroughputPerHour={
            activeEconomics?.effectiveThroughput ?? facility.targetThroughputPerHour
          }
          replayFrames={replayFrames}
        />

        {/* Formula Assumptions Modal */}
        <FormulaModal
          isOpen={isFormulaModalOpen}
          onClose={() => setIsFormulaModalOpen(false)}
        />

        {/* Recommended Solutions Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
              Рекомендованные решения ({eligibleRobots.length})
            </h2>
            <span className="text-xs text-slate-400">
              Отсортированы по возрастанию CAPEX стоимости
            </span>
          </div>

          {eligibleRobots.length === 0 ? (
            <div className="bg-slate-800/40 border border-dashed border-slate-700 rounded-xl p-8 text-center text-slate-400">
              Ни один робот не удовлетворяет заданным параметрам объекта. Попробуйте скорректировать габариты или требуемую нагрузку.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {eligibleRobots.map(({ robot }) => (
                <RobotCard key={robot.id} robot={robot} />
              ))}
            </div>
          )}
        </section>

        {/* Excluded Solutions Section */}
        <section>
          <ExcludedRobotsAccordion excludedRobots={ineligibleRobots} />
        </section>
      </main>
    </div>
  );
}
