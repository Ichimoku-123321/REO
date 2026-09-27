import React, { useState } from 'react';
import type { EconomicEvaluation, WhatIfParams } from '../../engine/economics.js';
import type { Robot } from '../../types/robot.js';
import type { FacilityRequirements } from '../../types/facility.js';
import type { SpectralAnalysisResult } from '../../engine/spectral_analyzer.js';

import { WhatIfDock } from './WhatIfDock.js';
import { ScenariosView } from './views/ScenariosView.js';
import { SideBySideView } from './views/SideBySideView.js';

import { Layers, Table2, AlertCircle } from 'lucide-react';

export type Zone3Tab = 'scenarios' | 'sidebyside';

interface Zone3ContainerProps {
  hasCalculatedAnalytics: boolean;
  activeEconomics: EconomicEvaluation | null;
  selectedRobot: Robot | null;
  robots: Robot[];
  facility: FacilityRequirements;
  whatIf: WhatIfParams;
  onChangeWhatIf: (params: WhatIfParams) => void;
  selectedRobotId: string;
  onSelectRobotId: (id: string) => void;
  spectralResult?: SpectralAnalysisResult;
  onOpenFormulaModal?: () => void;
}

export const Zone3Container: React.FC<Zone3ContainerProps> = ({
  hasCalculatedAnalytics,
  activeEconomics,
  selectedRobot,
  robots,
  facility,
  whatIf,
  onChangeWhatIf,
  selectedRobotId,
  onSelectRobotId,
  spectralResult,
  onOpenFormulaModal,
}) => {
  const [activeTab, setActiveTab] = useState<Zone3Tab>('scenarios');

  return (
    <div className="h-full flex flex-col bg-[#F9F9F6] font-mono text-xs text-[#1A1A1A] overflow-hidden rounded-none select-none">
      {/* 1. Header Tab Switcher */}
      <div className="border-b border-[#D4AF37]/40 bg-[#FFFFFF] p-1 flex items-center shrink-0 rounded-none shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('scenarios')}
          className={`flex-1 py-1.5 px-2 font-bold uppercase text-[11px] tracking-wider transition rounded-none flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'scenarios'
              ? 'bg-[#D4AF37] text-[#1A1A1A] shadow-xs'
              : 'text-[#4F4F47] hover:text-[#1A1A1A] hover:bg-[#F4F4F0]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>3 Сценария ТЭО</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sidebyside')}
          className={`flex-1 py-1.5 px-2 font-bold uppercase text-[11px] tracking-wider transition rounded-none flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'sidebyside'
              ? 'bg-[#D4AF37] text-[#1A1A1A] shadow-xs'
              : 'text-[#4F4F47] hover:text-[#1A1A1A] hover:bg-[#F4F4F0]'
          }`}
        >
          <Table2 className="w-3.5 h-3.5" />
          <span>Side-by-Side и XAI</span>
        </button>
      </div>

      {/* 2. Scrollable Analytics Stage */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {!activeEconomics || !selectedRobot ? (
          /* Check-list Gatekeeper / Placeholder */
          <div className="h-full min-h-[380px] py-8 px-4 text-center space-y-4 flex flex-col items-center justify-center font-mono">
            <div className="w-12 h-12 border-2 border-[#D4AF37] bg-[#FFFFFF] flex items-center justify-center text-[#8A6826] font-bold text-sm shadow-xs">
              REO
            </div>

            <div className="space-y-1.5">
              <h3 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A]">
                ТРЕБУЕТСЯ РАСЧЕТ ТЭО
              </h3>
              <p className="text-[11px] text-[#4F4F47] leading-relaxed max-w-[280px]">
                Параметры склада, грузопотока или флота были изменены. Сформируйте склад и запустите
                моделирование для сквозного расчета.
              </p>
            </div>

            <div className="p-3 bg-[#FFFFFF] border border-[#D4AF37]/40 text-[10px] text-left text-[#4F4F47] space-y-1.5 w-full max-w-[300px] shadow-2xs">
              <span className="font-bold text-[#8A6826] block mb-1 uppercase text-[9px]">
                Чек-лист готовности к расчету:
              </span>
              <div className="flex items-center gap-1.5 text-emerald-800">
                <span>✓</span>
                <span>Заданы габариты и стены (Зона 2)</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-800">
                <span>✓</span>
                <span>Установлены ворота и стеллажи (Зона 2)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#8A6826]">
                <span>✓</span>
                <span>Рассчитан оптимальный флот (Блок 6)</span>
              </div>
            </div>

            <div className="text-[10px] text-[#8A6826] animate-pulse flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Нажмите «Запустить расчет и моделирование» внизу</span>
            </div>
          </div>
        ) : (
          /* Real Analytics Views */
          <>
            {activeTab === 'scenarios' && (
              <ScenariosView
                evaluation={activeEconomics}
                robot={selectedRobot}
                facility={facility}
                whatIf={whatIf}
                spectralResult={spectralResult}
              />
            )}

            {activeTab === 'sidebyside' && (
              <SideBySideView
                robots={robots}
                facility={facility}
                whatIf={whatIf}
                selectedRobotId={selectedRobotId}
                onSelectRobot={onSelectRobotId}
              />
            )}
          </>
        )}
      </div>

      {/* 3. Pinned Bottom What-If Sensitivity Dock */}
      <WhatIfDock
        whatIf={whatIf}
        onChange={onChangeWhatIf}
        onOpenFormulaModal={onOpenFormulaModal}
      />

      {/* 4. Strict Legal Disclaimer Footer */}
      <div className="p-2.5 border-t border-[#D4AF37]/30 bg-[#FFFFFF] text-[10px] text-[#4F4F47] font-mono text-center shrink-0">
        Расчет носит предварительный индикативный характер и не является публичной офертой.
      </div>
    </div>
  );
};
