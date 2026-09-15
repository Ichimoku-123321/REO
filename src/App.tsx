import { useState, useMemo, useEffect } from 'react';
import { SEED_ROBOTS } from './data/robots.seed.js';
import { FACILITY_PRESETS } from './data/presets.js';
import { evaluateEligibility } from './engine/dss.js';
import { calculateEconomics, DEFAULT_WHAT_IF_PARAMS } from './engine/economics.js';
import { generateFacilityTopology } from './engine/topology_generator.js';
import { analyzeTopologyBottlenecks } from './engine/spectral_analyzer.js';
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

  // Set default selected robot when eligibleRobots change
  useEffect(() => {
    if (eligibleRobots.length > 0) {
      const isCurrentValid = eligibleRobots.some((r) => r.robot.id === selectedRobotId);
      if (!isCurrentValid) {
        setSelectedRobotId(eligibleRobots[0].robot.id);
      }
    } else {
      setSelectedRobotId('');
    }
  }, [eligibleRobots, selectedRobotId]);

  const selectedRobot = useMemo(() => {
    return eligibleRobots.find((r) => r.robot.id === selectedRobotId)?.robot ?? null;
  }, [eligibleRobots, selectedRobotId]);

  const selectedRobotEconomics = useMemo(() => {
    if (!selectedRobot) return null;
    return calculateEconomics(facility, selectedRobot, whatIf);
  }, [facility, selectedRobot, whatIf]);

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
            fleetSize={selectedRobotEconomics?.fleetSize ?? 0}
            economicEvaluation={selectedRobotEconomics}
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
        {selectedRobot && selectedRobotEconomics && (
          <ScenarioMatrix
            evaluation={selectedRobotEconomics}
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

        {/* Step 7: 2.5D Topology Viewport & Fleet Simulation */}
        <SimulationViewport
          facility={facility}
          selectedRobot={selectedRobot}
          fleetSize={selectedRobotEconomics?.fleetSize ?? 0}
          targetThroughputPerHour={
            selectedRobotEconomics?.effectiveThroughput ?? facility.targetThroughputPerHour
          }
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
