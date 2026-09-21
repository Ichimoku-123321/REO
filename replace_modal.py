import re

with open('src/components/SupplyScheduleModal.tsx', 'r') as f:
    content = f.read()

# Add the warning logic
content = re.sub(
    r"  const isOverflow = schedule\.inboundBatchVolume > totalPalletCapacity;",
    r"  const isOverflow = schedule.inboundBatchVolume > totalPalletCapacity;\n  const isAccumulating = schedule.inboundBatchVolume > 0 && schedule.outboundBatchVolume === 0;",
    content
)

# Update the conditional rendering to check isAccumulating
replacement = """
        {/* Overflow Alert Banner */}
        {isAccumulating ? (
          <div className="p-3 bg-red-100 border border-red-400 text-red-900 font-bold mb-4 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="uppercase text-xs tracking-tight">⚠️ Внимание: отсутствует исходящий поток (Q_out = 0). Склад будет непрерывно заполняться.</div>
            </div>
          </div>
        ) : isOverflow ? (
"""

content = re.sub(
    r"        \{\/\* Overflow Alert Banner \*\/\}\n        \{isOverflow \? \(",
    replacement,
    content
)

with open('src/components/SupplyScheduleModal.tsx', 'w') as f:
    f.write(content)
