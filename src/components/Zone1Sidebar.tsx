import React, { useState } from 'react';
import type { FacilityRequirements, FacilityType, FloorSurfaceQuality, CleanlinessClass } from '../types/facility.js';
import type { FleetCompositionItem, HeterogeneousOptimizationResult } from '../engine/fleet_optimizer.js';
import { SEED_ROBOTS } from '../data/robots.seed.js';
import { isRobotEligible } from '../engine/dss.js';
import type { SimulationParams } from './SimulationParamsPanel.js';
import {
  Building2,
  Boxes,
  Users,
  Zap,
  Clock,
  Bot,
  ChevronDown,
  ChevronRight,
  Sparkles,
  HardDrive,
  AlertTriangle,
  Check,
} from 'lucide-react';

interface Zone1SidebarProps {
  facility: FacilityRequirements;
  onChangeFacility: (updated: FacilityRequirements) => void;
  simulationParams: SimulationParams;
  onChangeSimulationParams: (params: SimulationParams) => void;
  fleetMode: 'ai' | 'manual';
  onChangeFleetMode: (mode: 'ai' | 'manual') => void;
  aiOptimizationResult: HeterogeneousOptimizationResult;
  manualFleetCounts: Record<string, number>;
  onManualCountChange: (robotId: string, count: number) => void;
  activeFleetSize: number;
}

export const Zone1Sidebar: React.FC<Zone1SidebarProps> = ({
  facility,
  onChangeFacility,
  simulationParams,
  onChangeSimulationParams,
  fleetMode,
  onChangeFleetMode,
  aiOptimizationResult,
  manualFleetCounts,
  onManualCountChange,
  activeFleetSize,
}) => {
  // Accordion section open/close states (open by default)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    geometry: true,
    program: true,
    labor: true,
    macro: true,
    engine: true,
    fleet: true,
  });

  const toggleSection = (sectionKey: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  // Helper to update facility fields reactively
  const updateFacility = (updates: Partial<FacilityRequirements>) => {
    onChangeFacility({
      ...facility,
      ...updates,
    });
  };

  // Derived values for Baseline Manual Labor Model
  const targetQ = simulationParams.targetHourlyQuota || facility.targetThroughputPerHour;
  const peakK = facility.peakHourFactor ?? 1.0;
  const norm = facility.manualWorkerNorm ?? 12;
  const shifts = facility.shiftsPerDay || 2;
  const shiftHeadcount = Math.ceil((targetQ * peakK) / norm);
  const totalHeadcount = shiftHeadcount * shifts;

  // Derived RAM estimation
  const effectiveFleetSize = Math.max(1, activeFleetSize);
  const estimatedRamMb =
    (effectiveFleetSize * simulationParams.targetReplayFramesCount * 100) / (1024 * 1024);
  const isHighRamWarning = estimatedRamMb > 500;

  return (
    <aside className="w-80 sm:w-96 shrink-0 h-full flex flex-col bg-[#F4F4F0] border-r border-[#D4AF37]/40 overflow-hidden rounded-none select-none">
      {/* Top Sidebar Header Strip */}
      <div className="p-3 bg-[#EAEAE5] border-b border-[#D4AF37]/40 flex items-center justify-between shrink-0 rounded-none">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#1A1A1A] flex items-center gap-1.5">
          <span className="w-2 h-2 bg-[#D4AF37]"></span>
          Экономика и правила объекта
        </span>
        <span className="text-[10px] font-mono font-bold text-[#8A6826]">REO • ZONE 1</span>
      </div>

      {/* Scrollable Accordions List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs text-[#1A1A1A] rounded-none">

        {/* 1. Operational Rules & Environment Accordion (Geometry parameters live in Zone 2) */}
        <div className="bg-[#FFFFFF] border border-[#D4AF37]/30 rounded-none">
          <button
            type="button"
            onClick={() => toggleSection('geometry')}
            className="w-full p-2.5 bg-[#FFFFFF] hover:bg-[#F4F4F0] border-b border-[#D4AF37]/20 flex items-center justify-between text-left cursor-pointer transition rounded-none"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#D4AF37]"></span>
              <Building2 className="w-3.5 h-3.5 text-[#8A6826]" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A]">
                1. Профиль и условия среды
              </h4>
            </div>
            {openSections.geometry ? (
              <ChevronDown className="w-4 h-4 text-[#8A6826]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#8A6826]" />
            )}
          </button>

          {openSections.geometry && (
            <div className="p-3 space-y-2.5">
              {/* Industry Selection */}
              <div>
                <label className="text-[10px] text-[#4F4F47] font-semibold block mb-0.5">
                  Отраслевой профиль
                </label>
                <select
                  value={facility.industry}
                  onChange={(e) => {
                    const industry = e.target.value as FacilityType;
                    updateFacility({ industry });
                  }}
                  className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 font-mono text-xs text-[#1A1A1A] focus:outline-none focus:border-[#D4AF37] rounded-none"
                >
                  <option value="warehouse">📦 Склад (Class A Warehouse)</option>
                  <option value="airport">✈️ Аэропорт (Cargo Airport / Apron)</option>
                  <option value="hospital">🏥 Больница (Hospital / Healthcare)</option>
                  <option value="custom">⚙️ Пользовательский (Custom Industrial)</option>
                </select>
              </div>

              {/* Read-Only Geometry derived live from Zone 2 CAD */}
              <div className="p-2 bg-[#F4F4F0] border border-[#D4AF37]/30 font-mono text-[11px] space-y-1 rounded-none">
                <span className="text-[10px] text-[#8A6826] font-bold block uppercase mb-1">
                  Геометрия (авто-расчет из Зоны 2 CAD):
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-[#4F4F47]">Площадь S:</span>
                  <strong className="text-[#8A6826] font-bold tabular-nums">{facility.totalAreaSqm} м²</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#4F4F47]">Высота H:</span>
                  <strong className="text-[#8A6826] font-bold tabular-nums">{facility.ceilingHeightM ?? 8.0} м</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#4F4F47]">Проезд W_aisle:</span>
                  <strong className="text-[#8A6826] font-bold tabular-nums">{facility.aisleWidthM} м</strong>
                </div>
              </div>

              {/* Required Payload */}
              <div>
                <span className="text-[10px] text-[#4F4F47] font-semibold block mb-0.5">Груз P_req (кг)</span>
                <input
                  type="number"
                  min="1"
                  value={facility.requiredPayloadKg}
                  onChange={(e) =>
                    updateFacility({ requiredPayloadKg: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 font-mono text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] rounded-none"
                />
              </div>

              {/* Floor Surface Quality (DIN 18202) */}
              <div>
                <span className="text-[10px] text-[#4F4F47] font-semibold block mb-0.5">
                  Качество пола (DIN 18202 / Скорость)
                </span>
                <select
                  value={facility.floorSurfaceQuality ?? 'standard'}
                  onChange={(e) =>
                    updateFacility({ floorSurfaceQuality: e.target.value as FloorSurfaceQuality })
                  }
                  className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 font-mono text-xs text-[#1A1A1A] focus:outline-none focus:border-[#D4AF37] rounded-none"
                >
                  <option value="standard">Standard Industrial (DIN 18202 Gr.3, k=1.0)</option>
                  <option value="uneven">Uneven / Ramps & Joints (k=0.8, -20% speed)</option>
                  <option value="superflat">Superflat Jointless (DIN 18202 Gr.4, k=1.1, +10% speed)</option>
                </select>
              </div>

              {/* Temp Range T_min .. T_max */}
              <div className="grid grid-cols-2 gap-2 font-mono">
                <div>
                  <span className="text-[10px] text-[#4F4F47] font-semibold block">Тмин (°C)</span>
                  <input
                    type="number"
                    value={facility.operatingTempRange.min}
                    onChange={(e) =>
                      updateFacility({
                        operatingTempRange: {
                          ...facility.operatingTempRange,
                          min: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] rounded-none"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#4F4F47] font-semibold block">Тмакс (°C)</span>
                  <input
                    type="number"
                    value={facility.operatingTempRange.max}
                    onChange={(e) =>
                      updateFacility({
                        operatingTempRange: {
                          ...facility.operatingTempRange,
                          max: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] rounded-none"
                  />
                </div>
              </div>

              {/* Environmental Cleanliness Class */}
              <div>
                <span className="text-[10px] text-[#4F4F47] font-semibold block mb-0.5">
                  Класс чистоты и защиты среды
                </span>
                <select
                  value={facility.cleanlinessClass ?? 'standard_dry'}
                  onChange={(e) =>
                    updateFacility({ cleanlinessClass: e.target.value as CleanlinessClass })
                  }
                  className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 font-mono text-xs text-[#1A1A1A] focus:outline-none focus:border-[#D4AF37] rounded-none"
                >
                  <option value="standard_dry">Standard Dry (Стандартная сухая)</option>
                  <option value="dusty">Dusty / Harsh (Запыленная, IP54+)</option>
                  <option value="cleanroom">Cleanroom / Pharma (Чистая комната)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 2. Production Program & Target Throughput Accordion */}
        <div className="bg-[#FFFFFF] border border-[#D4AF37]/30 rounded-none">
          <button
            type="button"
            onClick={() => toggleSection('program')}
            className="w-full p-2.5 bg-[#FFFFFF] hover:bg-[#F4F4F0] border-b border-[#D4AF37]/20 flex items-center justify-between text-left cursor-pointer transition rounded-none"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#D4AF37]"></span>
              <Boxes className="w-3.5 h-3.5 text-[#8A6826]" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A]">
                2. Производственная программа (Квота)
              </h4>
            </div>
            {openSections.program ? (
              <ChevronDown className="w-4 h-4 text-[#8A6826]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#8A6826]" />
            )}
          </button>

          {openSections.program && (
            <div className="p-3 space-y-2.5">
              {/* Target Hourly Throughput Q_target */}
              <div>
                <label className="text-[11px] font-bold text-[#1A1A1A] flex items-center justify-between mb-0.5">
                  <span>Целевой грузопоток Q_target:</span>
                  <span className="text-[10px] text-[#8A6826] font-mono font-bold">шт/час</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={targetQ}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value) || 1);
                    updateFacility({ targetThroughputPerHour: val });
                    onChangeSimulationParams({ ...simulationParams, targetHourlyQuota: val });
                  }}
                  className="w-full bg-[#FFFFFF] border-2 border-[#D4AF37] px-2 py-1 font-mono text-sm text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#BFA02E] rounded-none"
                />
              </div>

              {/* Peak Hour Factor k_peak */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-[#4F4F47] font-semibold">Пиковый коэффициент k_peak:</span>
                  <span className="font-mono font-bold text-xs text-[#8A6826]">{peakK.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="2.0"
                  step="0.1"
                  value={peakK}
                  onChange={(e) => updateFacility({ peakHourFactor: Number(e.target.value) || 1.0 })}
                  className="w-full accent-[#D4AF37] cursor-pointer"
                />
              </div>

              {/* Shift Schedule */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-[#4F4F47] font-semibold block mb-0.5">Режим сменности</span>
                  <select
                    value={facility.shiftsPerDay}
                    onChange={(e) => updateFacility({ shiftsPerDay: Number(e.target.value) || 1 })}
                    className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 font-mono text-xs text-[#1A1A1A] focus:outline-none focus:border-[#D4AF37] rounded-none"
                  >
                    <option value={1}>1 смена (8 ч/сут)</option>
                    <option value={2}>2 смены (16 ч/сут)</option>
                    <option value={3}>3 смены (24 ч/сут)</option>
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-[#4F4F47] font-semibold block mb-0.5">Дней в году</span>
                  <select
                    value={facility.annualOperatingDays ?? 247}
                    onChange={(e) => updateFacility({ annualOperatingDays: Number(e.target.value) || 247 })}
                    className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 font-mono text-xs text-[#1A1A1A] focus:outline-none focus:border-[#D4AF37] rounded-none"
                  >
                    <option value={247}>247 дн (Пятидневка)</option>
                    <option value={365}>365 дн (24/7 Хаб)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. Baseline Manual Labor Model Accordion */}
        <div className="bg-[#FFFFFF] border border-[#D4AF37]/30 rounded-none">
          <button
            type="button"
            onClick={() => toggleSection('labor')}
            className="w-full p-2.5 bg-[#FFFFFF] hover:bg-[#F4F4F0] border-b border-[#D4AF37]/20 flex items-center justify-between text-left cursor-pointer transition rounded-none"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#D4AF37]"></span>
              <Users className="w-3.5 h-3.5 text-[#8A6826]" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A]">
                3. Модель ручного труда (As-Is)
              </h4>
            </div>
            {openSections.labor ? (
              <ChevronDown className="w-4 h-4 text-[#8A6826]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#8A6826]" />
            )}
          </button>

          {openSections.labor && (
            <div className="p-3 space-y-2.5">
              {/* Worker Norm */}
              <div>
                <label className="text-[10px] text-[#4F4F47] font-semibold block mb-0.5">
                  Норма выработки оператора (шт/ч)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={facility.manualWorkerNorm ?? 12}
                  onChange={(e) =>
                    updateFacility({ manualWorkerNorm: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 font-mono text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] rounded-none"
                />
              </div>

              {/* Live Formula Caption */}
              <div className="p-2 bg-[#F4F4F0] border border-[#D4AF37]/30 text-[10px] font-mono leading-tight rounded-none">
                <span className="text-[#8A6826] font-bold block mb-0.5">Формула расчета штата:</span>
                <span className="text-[#4F4F47]">
                  Смена = ⌈({targetQ} × {peakK.toFixed(1)}) / {norm}⌉ = <strong>{shiftHeadcount} чел.</strong>
                </span>
                <br />
                <span className="text-[#1A1A1A] font-bold">
                  Итого штат ({shifts} смен) = {shiftHeadcount} × {shifts} = {totalHeadcount} операторов
                </span>
              </div>

              {/* Worker Base Salary */}
              <div>
                <label className="text-[10px] text-[#4F4F47] font-semibold block mb-0.5">
                  Оклад оператора Gross (руб/мес)
                </label>
                <input
                  type="number"
                  step="5000"
                  value={facility.averageWorkerSalaryRub}
                  onChange={(e) =>
                    updateFacility({
                      averageWorkerSalaryRub: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 font-mono text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] rounded-none"
                />
              </div>

              {/* Taxes & HR Overhead */}
              <div className="grid grid-cols-2 gap-2 font-mono">
                <div>
                  <span className="text-[10px] text-[#4F4F47] font-semibold block">Страховые взносы (%)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={facility.payrollTaxesPercent ?? 30.2}
                    onChange={(e) =>
                      updateFacility({ payrollTaxesPercent: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] rounded-none"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#4F4F47] font-semibold block">HR Накладные (%)</span>
                  <input
                    type="number"
                    step="0.5"
                    value={facility.hrOverheadPercent ?? 10.0}
                    onChange={(e) =>
                      updateFacility({ hrOverheadPercent: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] rounded-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. Energy, Infrastructure & Macroeconomic Factors Accordion */}
        <div className="bg-[#FFFFFF] border border-[#D4AF37]/30 rounded-none">
          <button
            type="button"
            onClick={() => toggleSection('macro')}
            className="w-full p-2.5 bg-[#FFFFFF] hover:bg-[#F4F4F0] border-b border-[#D4AF37]/20 flex items-center justify-between text-left cursor-pointer transition rounded-none"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#D4AF37]"></span>
              <Zap className="w-3.5 h-3.5 text-[#8A6826]" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A]">
                4. Энергия, макро и инфраструктура
              </h4>
            </div>
            {openSections.macro ? (
              <ChevronDown className="w-4 h-4 text-[#8A6826]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#8A6826]" />
            )}
          </button>

          {openSections.macro && (
            <div className="p-3 space-y-2.5">
              {/* Tariff & Integration */}
              <div className="grid grid-cols-2 gap-2 font-mono">
                <div>
                  <span className="text-[10px] text-[#4F4F47] font-semibold block">Тариф Э/Э (руб/кВт·ч)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={facility.electricityTariffRubPerKwh ?? 7.5}
                    onChange={(e) =>
                      updateFacility({
                        electricityTariffRubPerKwh: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] rounded-none"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-[#4F4F47] font-semibold block">Интеграция k_integ (%)</span>
                  <input
                    type="number"
                    step="1"
                    value={facility.integrationMarkupPercent ?? 15.0}
                    onChange={(e) =>
                      updateFacility({
                        integrationMarkupPercent: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] rounded-none"
                  />
                </div>
              </div>

              {/* WACC & Inflation */}
              <div className="grid grid-cols-2 gap-2 font-mono">
                <div>
                  <span className="text-[10px] text-[#4F4F47] font-semibold block">Ставка WACC (%)</span>
                  <input
                    type="number"
                    step="0.5"
                    value={facility.waccDiscountRatePercent ?? 18.0}
                    onChange={(e) =>
                      updateFacility({
                        waccDiscountRatePercent: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] rounded-none"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-[#4F4F47] font-semibold block">Индексация ФОТ (%)</span>
                  <input
                    type="number"
                    step="0.5"
                    value={facility.wageInflationPercent ?? 8.0}
                    onChange={(e) =>
                      updateFacility({
                        wageInflationPercent: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] rounded-none"
                  />
                </div>
              </div>

              {/* Subsidy / Grant Slider */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-[#4F4F47] font-semibold">Госсубсидия / Грант (%):</span>
                  <span className="font-mono font-bold text-xs text-[#8A6826]">
                    {(facility.governmentSubsidyPercent ?? 0).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="1"
                  value={facility.governmentSubsidyPercent ?? 0}
                  onChange={(e) =>
                    updateFacility({ governmentSubsidyPercent: Number(e.target.value) || 0 })
                  }
                  className="w-full accent-[#D4AF37] cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* 5. Headless Simulation Engine & Buffer Settings Accordion */}
        <div className="bg-[#FFFFFF] border border-[#D4AF37]/30 rounded-none">
          <button
            type="button"
            onClick={() => toggleSection('engine')}
            className="w-full p-2.5 bg-[#FFFFFF] hover:bg-[#F4F4F0] border-b border-[#D4AF37]/20 flex items-center justify-between text-left cursor-pointer transition rounded-none"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#D4AF37]"></span>
              <Clock className="w-3.5 h-3.5 text-[#8A6826]" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A]">
                5. Симуляция и буфер реплея
              </h4>
            </div>
            {openSections.engine ? (
              <ChevronDown className="w-4 h-4 text-[#8A6826]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#8A6826]" />
            )}
          </button>

          {openSections.engine && (
            <div className="p-3 space-y-2.5">
              {/* Duration T */}
              <div>
                <span className="text-[10px] text-[#4F4F47] font-semibold block mb-1">
                  Длительность симуляции T (часов):
                </span>
                <div className="flex items-center gap-1 mb-1 font-mono">
                  {[1, 8, 24, 72].map((presetHours) => (
                    <button
                      key={presetHours}
                      type="button"
                      onClick={() =>
                        onChangeSimulationParams({ ...simulationParams, durationHours: presetHours })
                      }
                      className={`flex-1 py-1 text-[10px] font-mono font-bold border transition cursor-pointer rounded-none ${
                        simulationParams.durationHours === presetHours
                          ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#BFA02E]'
                          : 'bg-[#F4F4F0] text-[#4F4F47] border-[#D4AF37]/30 hover:bg-[#EAEAE5]'
                      }`}
                    >
                      {presetHours === 8 ? '8ч (Смена)' : `${presetHours}ч`}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  value={simulationParams.durationHours}
                  onChange={(e) =>
                    onChangeSimulationParams({
                      ...simulationParams,
                      durationHours: Math.max(1, parseInt(e.target.value, 10) || 1),
                    })
                  }
                  className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 font-mono text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] rounded-none"
                />
              </div>

              {/* Buffer Capacity K_frames */}
              <div>
                <span className="text-[10px] text-[#4F4F47] font-semibold block mb-1">
                  Размер буфера кадров K_frames:
                </span>
                <div className="flex items-center gap-1 mb-1 font-mono">
                  {[3600, 7200, 14400].map((presetFrames) => (
                    <button
                      key={presetFrames}
                      type="button"
                      onClick={() =>
                        onChangeSimulationParams({
                          ...simulationParams,
                          targetReplayFramesCount: presetFrames,
                        })
                      }
                      className={`flex-1 py-1 text-[10px] font-mono font-bold border transition cursor-pointer rounded-none ${
                        simulationParams.targetReplayFramesCount === presetFrames
                          ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#BFA02E]'
                          : 'bg-[#F4F4F0] text-[#4F4F47] border-[#D4AF37]/30 hover:bg-[#EAEAE5]'
                      }`}
                    >
                      {presetFrames === 7200 ? '7200 (Дефолт)' : presetFrames}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="2"
                  value={simulationParams.targetReplayFramesCount}
                  onChange={(e) =>
                    onChangeSimulationParams({
                      ...simulationParams,
                      targetReplayFramesCount: Math.max(2, parseInt(e.target.value, 10) || 2),
                    })
                  }
                  className="w-full bg-[#FFFFFF] border border-[#D4AF37]/40 px-2 py-1 font-mono text-xs text-[#1A1A1A] font-bold tabular-nums focus:outline-none focus:border-[#D4AF37] mb-2 rounded-none"
                />

                {/* RAM Indicator Badge */}
                <div className="p-2 bg-[#F4F4F0] border border-[#D4AF37]/30 flex flex-col gap-1 rounded-none">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-[#4F4F47] flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5 text-[#8A6826]" />
                      Расчетный буфер RAM:
                    </span>
                    <span
                      className={`font-bold tabular-nums ${
                        isHighRamWarning ? 'text-amber-800 font-extrabold' : 'text-[#8A6826]'
                      }`}
                    >
                      RAM ≈ {estimatedRamMb < 0.1 ? '<0.1' : estimatedRamMb.toFixed(2)} МБ
                    </span>
                  </div>

                  {isHighRamWarning && (
                    <div className="mt-1 p-1.5 bg-amber-100 border border-amber-400 rounded-none text-[10px] text-amber-900 font-bold flex items-start gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <span>⚠️ Высокий расход RAM браузера (&gt;500 МБ), вкладка может зависнуть</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 6. Fleet Strategy & 9-Robot Sandbox Accordion */}
        <div className="bg-[#FFFFFF] border border-[#D4AF37]/30 rounded-none">
          <button
            type="button"
            onClick={() => toggleSection('fleet')}
            className="w-full p-2.5 bg-[#FFFFFF] hover:bg-[#F4F4F0] border-b border-[#D4AF37]/20 flex items-center justify-between text-left cursor-pointer transition rounded-none"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#D4AF37]"></span>
              <Bot className="w-3.5 h-3.5 text-[#8A6826]" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A]">
                6. Стратегия флота и 9 роботов
              </h4>
            </div>
            {openSections.fleet ? (
              <ChevronDown className="w-4 h-4 text-[#8A6826]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#8A6826]" />
            )}
          </button>

          {openSections.fleet && (
            <div className="p-3 space-y-2.5">
              {/* Mode Segmented Toggle */}
              <div className="flex border border-[#D4AF37]/40 text-xs font-mono rounded-none">
                <button
                  type="button"
                  onClick={() => onChangeFleetMode('ai')}
                  className={`flex-1 py-1.5 font-bold uppercase transition cursor-pointer text-center rounded-none ${
                    fleetMode === 'ai'
                      ? 'bg-[#D4AF37] text-[#1A1A1A]'
                      : 'bg-[#FFFFFF] text-[#4F4F47] hover:text-[#1A1A1A]'
                  }`}
                >
                  ИИ Оптимум
                </button>
                <button
                  type="button"
                  onClick={() => onChangeFleetMode('manual')}
                  className={`flex-1 py-1.5 font-bold uppercase transition cursor-pointer text-center rounded-none ${
                    fleetMode === 'manual'
                      ? 'bg-[#D4AF37] text-[#1A1A1A]'
                      : 'bg-[#FFFFFF] text-[#4F4F47] hover:text-[#1A1A1A]'
                  }`}
                >
                  Песочница (Все 9)
                </button>
              </div>

              {/* Mode 1: AI Composition Display */}
              {fleetMode === 'ai' && (
                <div className="p-2.5 bg-[#FFFFFF] border border-[#D4AF37]/30 text-xs rounded-none space-y-2">
                  {aiOptimizationResult.composition.length === 0 ? (
                    <div className="p-2.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-none space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-800">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>⚠️ Склад не готов к расчету</span>
                      </div>
                      <p className="text-[10px] leading-tight text-amber-900">
                        Разместите ворота приемки, ворота отгрузки и хотя бы один стеллаж в CAD-конструкторе. Невозможно рассчитать флот при нулевой вместимости.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[#8A6826] font-semibold uppercase flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-[#8A6826]" />
                          Оптимальный состав REO:
                        </span>

                        {aiOptimizationResult.isHeterogeneous ? (
                          <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 border border-emerald-300 rounded-none">
                            Мульти-флот (-{aiOptimizationResult.tcoSavingsPercentVsBestMono}%)
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold bg-[#D4AF37]/20 text-[#8A6826] px-1.5 py-0.5 rounded-none">
                            Монофлот
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {aiOptimizationResult.composition.map((item: FleetCompositionItem) => (
                          <div
                            key={item.robot.id}
                            className="p-2 bg-[#F4F4F0] border border-[#D4AF37]/20 flex items-center justify-between rounded-none"
                          >
                            <div>
                              <p className="text-xs font-bold text-[#1A1A1A] leading-tight">
                                {item.robot.vendor} {item.robot.model}
                              </p>
                              <p className="text-[10px] text-[#4F4F47] font-mono">
                                до {item.robot.payloadKg} кг • {item.robot.throughputPerHour} шт/ч
                              </p>
                            </div>
                            <span className="bg-[#D4AF37] text-[#1A1A1A] text-xs font-bold font-mono px-2 py-0.5 rounded-none">
                              {item.count} ед.
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Mode 2: All 9 Robots Sandbox */}
              {fleetMode === 'manual' && (
                <div className="space-y-2">
                  <p className="text-[10px] text-[#8A6826] font-semibold uppercase">
                    Песочница моделей (все 9 роботов из SEED_ROBOTS):
                  </p>

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5 rounded-none">
                    {SEED_ROBOTS.map((robot) => {
                      const currentCount = manualFleetCounts[robot.id] || 0;
                      const isSelected = currentCount > 0;
                      const { isEligible, exclusionReasons } = isRobotEligible(facility, robot);

                      return (
                        <div
                          key={robot.id}
                          className={`p-2 border text-[11px] rounded-none transition-all ${
                            !isEligible
                              ? 'bg-amber-50/80 border-[#F59E0B] text-amber-950'
                              : isSelected
                              ? 'bg-[#D4AF37]/15 border-[#D4AF37]'
                              : 'bg-[#FFFFFF] border-[#D4AF37]/30'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5 mb-1">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <button
                                type="button"
                                onClick={() => onManualCountChange(robot.id, isSelected ? 0 : 1)}
                                className={`w-4 h-4 shrink-0 font-bold flex items-center justify-center border text-[10px] rounded-none transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#D4AF37] border-[#BFA02E] text-[#1A1A1A]'
                                    : 'border-[#D4AF37]/40 bg-[#FFFFFF] text-[#1A1A1A]'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </button>
                              <span className="font-bold truncate text-[#1A1A1A] block leading-tight">
                                {robot.vendor} {robot.model}
                              </span>
                            </div>

                            <span className="text-[9px] font-mono shrink-0 text-[#8A6826] font-semibold">
                              {robot.payloadKg} кг
                            </span>
                          </div>

                          {/* Warning Reason Badge if Ineligible */}
                          {!isEligible && (
                            <div className="mb-1.5 p-1 bg-amber-100 border border-[#F59E0B] text-[10px] text-amber-900 font-semibold leading-tight flex items-start gap-1 rounded-none">
                              <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B] shrink-0 mt-0.5" />
                              <span>⚠️ Ограничение: {exclusionReasons[0]}</span>
                            </div>
                          )}

                          {/* Counter Buttons [-] [ count ] [+] (Fully Unlocked & Active) */}
                          <div className="flex items-center justify-between pt-1 border-t border-[#D4AF37]/20 font-mono">
                            <span className="text-[10px] text-[#4F4F47]">Количество ед.:</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  onManualCountChange(robot.id, Math.max(0, currentCount - 1))
                                }
                                disabled={currentCount === 0}
                                className="w-5 h-5 bg-[#EAEAE5] hover:bg-[#D4AF37] hover:text-[#1A1A1A] font-bold flex items-center justify-center text-xs text-[#1A1A1A] rounded-none disabled:opacity-30 cursor-pointer"
                              >
                                -
                              </button>
                              <span className="w-6 text-center font-bold text-[#8A6826] text-xs">
                                {currentCount}
                              </span>
                              <button
                                type="button"
                                onClick={() => onManualCountChange(robot.id, currentCount + 1)}
                                className="w-5 h-5 bg-[#EAEAE5] hover:bg-[#D4AF37] hover:text-[#1A1A1A] font-bold flex items-center justify-center text-xs text-[#1A1A1A] rounded-none cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </aside>
  );
};
