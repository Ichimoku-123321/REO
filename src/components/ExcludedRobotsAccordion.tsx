import React, { useState } from 'react';
import type { EvaluatedRobot } from '../types/robot.js';
import { ChevronDown, AlertTriangle } from 'lucide-react';

interface ExcludedRobotsAccordionProps {
  excludedRobots: EvaluatedRobot[];
}

export const ExcludedRobotsAccordion: React.FC<ExcludedRobotsAccordionProps> = ({
  excludedRobots,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (excludedRobots.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#FFFFFF] border border-[#D4AF37]/30 rounded-none overflow-hidden text-xs text-[#1A1A1A]">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2.5 bg-[#F4F4F0] hover:bg-[#EAEAE5] transition text-left cursor-pointer rounded-none border-b border-[#D4AF37]/20"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700" />
          <h3 className="font-bold text-[#1A1A1A] flex items-center gap-1.5 text-xs">
            Исключенные решения (XAI)
            <span className="bg-amber-100 text-amber-900 text-[10px] font-mono font-bold px-1.5 py-0.5 border border-amber-300 rounded-none">
              {excludedRobots.length}
            </span>
          </h3>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[#8A6826] transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="p-2.5 bg-[#F9F9F6] space-y-2 rounded-none">
          {excludedRobots.map(({ robot, result }) => (
            <div
              key={robot.id}
              className="bg-[#FFFFFF] border border-amber-200 p-2.5 rounded-none space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#1A1A1A]">{robot.vendor} {robot.model}</span>
                <span className="text-[10px] font-mono bg-rose-100 text-rose-800 border border-rose-300 px-1 font-bold rounded-none">
                  Отклонен
                </span>
              </div>

              <div className="text-[10px] text-[#4F4F47] font-mono">
                Нагрузка: {robot.payloadKg} кг • Проезд: {robot.minAisleWidthMm} мм
              </div>

              <ul className="mt-1 space-y-0.5 text-[10px] text-rose-800 border-t border-rose-100 pt-1">
                {result.exclusionReasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-1">
                    <span>•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
