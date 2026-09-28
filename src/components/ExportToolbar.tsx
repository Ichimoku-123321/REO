import React, { useRef, useState } from 'react';
import { exportFinancialModelToCsv } from '../utils/exportCsv.js';
import { FileText, FileSpreadsheet, Upload, Download, AlertCircle, X, Check } from 'lucide-react';
import type { FacilityRequirements } from '../types/facility.js';
import type { Robot } from '../types/robot.js';
import type { EconomicEvaluation, WhatIfParams } from '../engine/economics.js';
import type { SpectralAnalysisResult } from '../engine/spectral_analyzer.js';
import { generateFeasibilityPdf } from '../engine/export_pdf.js';
import { parseFacilityImport, downloadCsvTemplate } from '../engine/import_facility.js';

interface ExportToolbarProps {
  facility: FacilityRequirements;
  selectedRobot: Robot | null;
  fleetSize: number;
  economicEvaluation: EconomicEvaluation | null;
  spectralResult?: SpectralAnalysisResult;
  whatIf: WhatIfParams;
  onFacilityImport: (importedFacility: FacilityRequirements) => void;
}

export const ExportToolbar: React.FC<ExportToolbarProps> = ({
  facility,
  selectedRobot,
  fleetSize,
  economicEvaluation,
  spectralResult,
  whatIf,
  onFacilityImport,
}) => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isExportDisabled = !selectedRobot || !economicEvaluation || fleetSize <= 0;
  const disabledTooltip = isExportDisabled
    ? 'Выберите подходящее роботизированное решение для выгрузки ТЭО'
    : 'Скачать отчет';

  const handleExportPdf = () => {
    if (isExportDisabled || !selectedRobot || !economicEvaluation) return;
    generateFeasibilityPdf({
      projectTitle: `ТЭО Роботизации - ${facility.industry.toUpperCase()}`,
      facility,
      selectedRobot,
      fleetSize,
      economicEvaluation,
      spectralResult,
      whatIf,
      generatedAt: new Date(),
      version: 'СППР v1.0',
    });
  };

  const handleExportCsv = () => {
    if (isExportDisabled || !selectedRobot || !economicEvaluation) return;
    exportFinancialModelToCsv(facility, selectedRobot, economicEvaluation);
  };

  const handleFileProcess = (file: File) => {
    setImportErrors([]);
    setImportSuccessMsg('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;
      const res = parseFacilityImport(content, file.name);
      if (res.success && res.data) {
        onFacilityImport(res.data);
        setImportSuccessMsg(`Объект "${file.name}" успешно загружен и применен.`);
        setTimeout(() => {
          setIsImportModalOpen(false);
          setImportSuccessMsg('');
        }, 1200);
      } else {
        setImportErrors(res.errors);
      }
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* CSV Import Button */}
        <button
          type="button"
          onClick={() => setIsImportModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition shadow-sm cursor-pointer"
          title="Загрузить параметры объекта из файла CSV/JSON"
        >
          <Upload className="w-3.5 h-3.5 text-blue-400" />
          <span>📂 Загрузить (CSV)</span>
        </button>

        {/* CSV Table Export Button */}
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={isExportDisabled}
          title={disabledTooltip}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition shadow-sm ${
            isExportDisabled
              ? 'bg-slate-800/50 text-slate-500 border-slate-800 cursor-not-allowed opacity-60'
              : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-700/60 cursor-pointer'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
          <span>📊 Таблица (CSV)</span>
        </button>

        {/* PDF Export Button */}
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={isExportDisabled}
          title={disabledTooltip}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition shadow-sm ${
            isExportDisabled
              ? 'bg-slate-800/50 text-slate-500 border-slate-800 cursor-not-allowed opacity-60'
              : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-blue-500/20 cursor-pointer'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>📄 Скачать ТЭО (PDF)</span>
        </button>
      </div>

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-400" />
              Импорт параметров объекта
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Выберите или перетащите `.csv` или `.json` файл с конфигурацией объекта.
            </p>

            {/* Drag and Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
                isDragging
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-800/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <Upload className="w-8 h-8 text-blue-400/80" />
              <div>
                <p className="text-sm font-medium text-slate-200">
                  Нажмите или перетащите файл сюда
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Поддерживаются форматы .csv и .json
                </p>
              </div>
            </div>

            {/* Success message */}
            {importSuccessMsg && (
              <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-xs text-emerald-400">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>{importSuccessMsg}</span>
              </div>
            )}

            {/* Errors display */}
            {importErrors.length > 0 && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                <div className="flex items-center gap-1.5 font-semibold mb-1">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Ошибки валидации:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 pl-1">
                  {importErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Footer / Template download */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={downloadCsvTemplate}
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>📥 Скачать шаблон CSV</span>
              </button>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
