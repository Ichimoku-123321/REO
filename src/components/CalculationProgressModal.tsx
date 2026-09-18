import React from 'react';
import { Cpu, Play, CheckCircle2, Loader2, Video } from 'lucide-react';

interface CalculationProgressModalProps {
  isOpen: boolean;
  currentStep: number; // 0: Idle/Closed, 1: Optimization, 2: Simulation (7200 ticks), 3: Replay Generation, 4: Done
}

export const CalculationProgressModal: React.FC<CalculationProgressModalProps> = ({
  isOpen,
  currentStep,
}) => {
  if (!isOpen) return null;

  const steps = [
    { title: 'Оптимизация состава флота', description: 'Расчет макроэкономики и подбор моделей', icon: Cpu },
    { title: 'Имитационное моделирование', description: 'Расчет 7200 тиков симуляции (3600 сек)', icon: Play },
    { title: 'Генерация таймлайна', description: 'Запись реплея кадров и событий FSM', icon: Video },
  ];

  const progressPercent = Math.min(100, Math.round((currentStep / 3) * 100));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">Моделирование и расчет</h3>
            <p className="text-xs text-slate-400">Выполняется комплексный прогон цифрового двойника</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs font-semibold mb-2">
            <span className="text-blue-400">Прогресс выполнения</span>
            <span className="text-slate-300">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700">
            <div
              className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Steps List */}
        <div className="space-y-4 mb-2">
          {steps.map((stepItem, index) => {
            const stepNum = index + 1;
            const isCompleted = currentStep > stepNum;
            const isCurrent = currentStep === stepNum;
            const Icon = stepItem.icon;

            return (
              <div
                key={stepItem.title}
                className={`flex items-start gap-3.5 p-3 rounded-xl border transition-all ${
                  isCompleted
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : isCurrent
                    ? 'bg-blue-600/15 border-blue-500/40 text-blue-200 shadow-md shadow-blue-500/5'
                    : 'bg-slate-800/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : isCurrent ? (
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  ) : (
                    <Icon className="w-5 h-5 opacity-40" />
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    {stepItem.title}
                  </h4>
                  <p className="text-[11px] opacity-75">{stepItem.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
