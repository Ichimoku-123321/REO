import re

# 1. ConstructorToolbar.tsx
with open('src/components/ConstructorToolbar.tsx', 'r') as f:
    text = f.read()

text = text.replace('selectedElementId: string | null;', 'selectedTileKeys: Set<string>;')
text = text.replace('selectedElementId,', 'selectedTileKeys,')
text = text.replace('{selectedElementId && (', '{selectedTileKeys.size > 0 && (')

eraser_pattern = r'\s*\{\/\* 4\. Eraser Tool \*\/\}.*?<\/button>'
text = re.sub(eraser_pattern, '', text, flags=re.DOTALL)

with open('src/components/ConstructorToolbar.tsx', 'w') as f:
    f.write(text)

# 2. constructor_engine.ts
with open('src/engine/constructor_engine.ts', 'r') as f:
    text = f.read()

capacity_pattern = r'''export function calculateWarehouseCapacity\(grid: ConstructorGrid\): \{\n\s*totalRacks: number;\n\s*totalPalletCapacity: number;\n\} \{\n\s*let totalRacks = 0;\n\s*grid\.tiles\.forEach\(\(type\) => \{\n\s*if \(type === 'RACK'\) \{\n\s*totalRacks\+\+;\n\s*\}\n\s*\}\);\n\n\s*const totalPalletCapacity = totalRacks \* 12;\n\s*return \{ totalRacks, totalPalletCapacity \};\n\}'''
new_capacity = r'''export function calculateWarehouseCapacity(grid: ConstructorGrid): {
  totalRacks: number;
  totalPalletCapacity: number;
} {
  let totalRacks = 0;
  let totalPalletCapacity = 0;

  grid.tiles.forEach((type, key) => {
    if (type === 'RACK') {
      totalRacks++;
      const details = grid.elementDetails?.get(key);
      const slots = details?.slotsPerRack ?? 12;
      totalPalletCapacity += slots;
    }
  });

  return { totalRacks, totalPalletCapacity };
}'''

text = re.sub(capacity_pattern, new_capacity, text)
with open('src/engine/constructor_engine.ts', 'w') as f:
    f.write(text)

# 3. RackInspectionPopover.tsx
with open('src/components/RackInspectionPopover.tsx', 'r') as f:
    text = f.read()

text = re.sub(
    r'onAssignSku: \(rackKey: string, skuId: string \| undefined\) => void;',
    r'onAssignSku: (rackKey: string, skuId: string | undefined) => void;\n  onChangeCapacity: (rackKey: string, capacity: number) => void;',
    text
)

text = re.sub(
    r'onAssignSku,\n\s*onDeleteRack,',
    r'onAssignSku,\n  onChangeCapacity,\n  onDeleteRack,',
    text
)

old_metric = r'''<div className="flex justify-between font-bold text-\[11px\]">\n\s*<span className="text-\[\#4F4F47\]">Вместимость:</span>\n\s*<span className="text-\[\#8A6826\] tabular-nums">\{slotsPerRack\} паллет</span>\n\s*</div>'''
new_metric = r'''<div className="flex justify-between items-center font-bold text-[11px]">
          <span className="text-[#4F4F47]">Вместимость:</span>
          <div className="flex items-center gap-1 text-[#8A6826] tabular-nums">
            <input
              type="number"
              min="1"
              max="200"
              value={slotsPerRack}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val > 0) {
                  onChangeCapacity(rackKey, val);
                }
              }}
              className="w-14 bg-[#FFFFFF] border border-[#D4AF37]/50 px-1 py-0.5 text-right outline-none"
            />
            <span>паллет</span>
          </div>
        </div>'''
text = re.sub(old_metric, new_metric, text)

with open('src/components/RackInspectionPopover.tsx', 'w') as f:
    f.write(text)

# 4. SimulationViewport.tsx
with open('src/components/SimulationViewport.tsx', 'r') as f:
    text = f.read()

# Replace selectedTileKey
text = text.replace(
    'const [selectedTileKey, setSelectedTileKey] = useState<string | null>(null);',
    'const [selectedTileKeys, setSelectedTileKeys] = useState<Set<string>>(new Set());\n  const [selectedSkuChip, setSelectedSkuChip] = useState<string | null>(null);\n  const SKU_PALETTE = [\'#3b82f6\', \'#10b981\', \'#f59e0b\', \'#8b5cf6\', \'#ec4899\', \'#06b6d4\', \'#84cc16\'];'
)
text = text.replace('setSelectedTileKey(null);', 'setSelectedTileKeys(new Set());')

# Reset Grid confirmation
text = text.replace(
    'const handleResetGrid = useCallback(() => {',
    'const handleResetGrid = useCallback(() => {\n    if (!window.confirm("Очистить весь чертеж склада?")) return;'
)

# Rotate
rotate_pattern = r'''const handleRotateSelected = useCallback\(\(\) => \{\n\s*if \(!selectedTileKey\) return;\n\s*setGrid\(\(prev\) => \{\n\s*const detailsMap = new Map\(prev\.elementDetails \|\| \[\]\);\n\s*const existing = detailsMap\.get\(selectedTileKey\) \|\| \{\};\n\s*const currentRot = existing\.rotationDeg \?\? 0;\n\s*const nextRot = \(currentRot \+ 90\) % 360;\n\s*detailsMap\.set\(selectedTileKey, \{ \.\.\.existing, rotationDeg: nextRot \}\);\n\s*return \{ \.\.\.prev, elementDetails: detailsMap \};\n\s*\}\);\n\s*\}\, \[selectedTileKey\]\);'''
new_rotate = r'''const handleRotateSelected = useCallback(() => {
    if (selectedTileKeys.size === 0) return;
    setGrid((prev) => {
      const detailsMap = new Map(prev.elementDetails || []);
      for (const key of selectedTileKeys) {
        const existing = detailsMap.get(key) || {};
        const currentRot = existing.rotationDeg ?? 0;
        const nextRot = (currentRot + 90) % 360;
        detailsMap.set(key, { ...existing, rotationDeg: nextRot });
      }
      return { ...prev, elementDetails: detailsMap };
    });
  }, [selectedTileKeys]);'''
text = re.sub(rotate_pattern, new_rotate, text)

# Delete
delete_pattern = r'''const handleDeleteSelected = useCallback\(\(\) => \{\n\s*if \(!selectedTileKey\) return;\n\s*setGrid\(\(prev\) => \{\n\s*const updatedTiles = new Map\(prev\.tiles\);\n\s*updatedTiles\.set\(selectedTileKey, 'EMPTY_FLOOR'\);\n\s*const detailsMap = new Map\(prev\.elementDetails \|\| \[\]\);\n\s*detailsMap\.delete\(selectedTileKey\);\n\s*return \{ \.\.\.prev, tiles: updatedTiles, elementDetails: detailsMap \};\n\s*\}\);\n\s*setSelectedTileKeys\(new Set\(\)\);\n\s*setPopoverPos\(null\);\n\s*\}\, \[selectedTileKey\]\);'''
new_delete = r'''const handleDeleteSelected = useCallback(() => {
    if (selectedTileKeys.size === 0) return;
    setGrid((prev) => {
      const updatedTiles = new Map(prev.tiles);
      const detailsMap = new Map(prev.elementDetails || []);
      for (const key of selectedTileKeys) {
        updatedTiles.set(key, 'EMPTY_FLOOR');
        detailsMap.delete(key);
      }
      return { ...prev, tiles: updatedTiles, elementDetails: detailsMap };
    });
    setSelectedTileKeys(new Set());
    setPopoverPos(null);
  }, [selectedTileKeys]);'''
text = re.sub(delete_pattern, new_delete, text)

# Escape
text = text.replace(
    "if (e.key === 'Escape') {",
    "if (e.key === 'Escape') {\n        setSelectedSkuChip(null);"
)

# Colors
color_pattern = r'''const rackMat = new THREE\.MeshStandardMaterial\(\{.*?\}\);'''
new_color = r'''
      let cellColor = 0x8a6826;
      if (tileType === 'RACK') {
        const skuId = st.grid.elementDetails?.get(key)?.skuId;
        if (skuId) {
          const skuIndex = skuList.findIndex((s: any) => s.id === skuId);
          if (skuIndex >= 0) {
            cellColor = parseInt(SKU_PALETTE[skuIndex % SKU_PALETTE.length].replace('#', '0x'), 16);
          }
        }
      }
      const meshColor = isSelected ? 0xd4af37 : cellColor;
      const rackMat = new THREE.MeshStandardMaterial({
        color: meshColor,
        roughness: 0.7,
        metalness: 0.1,
      });'''
text = re.sub(color_pattern, new_color, text)
text = text.replace("const isSelected = selectedTileKey === key;", "const isSelected = st.selectedTileKeys.has(key);")


# stateRef typing
state_ref_pattern = r'''const stateRef = useRef<\{\n\s*isConstructorMode: boolean;\n\s*interactionMode: CtorInteractionMode;\n\s*selectedTileType: ConstructorTileType;\n\s*showGrid: boolean;\n\s*snappingEnabled: boolean;\n\s*isDrawingActive: boolean;\n\s*drawingPoints: THREE\.Vector3\[\];\n\s*grid: ConstructorGrid;\n\s*currentTimeSec: number;\n\s*isPlaying: boolean;\n\s*replayFrames: SimulationReplayFrame\[\];\n\s*appMode: 'CONSTRUCTOR' \| 'SIMULATION';\n\s*targetThroughputPerHour: number;\n\s*\}\>\(\{[\s\S]*?\}\);'''
new_state_ref = r'''const stateRef = useRef<any>({
    isConstructorMode,
    interactionMode,
    selectedSkuChip,
    selectedTileKeys,
    selectedTileType,
    showGrid,
    snappingEnabled,
    isDrawingActive,
    drawingPoints,
    grid,
    currentTimeSec,
    isPlaying,
    replayFrames,
    appMode,
    targetThroughputPerHour,
  });'''
text = re.sub(state_ref_pattern, new_state_ref, text)

effect_pattern = r'''useEffect\(\(\) => \{\n\s*stateRef\.current = \{\n\s*isConstructorMode,\n\s*interactionMode,\n\s*selectedTileType,\n\s*showGrid,\n\s*snappingEnabled,\n\s*isDrawingActive,\n\s*drawingPoints,\n\s*grid,\n\s*currentTimeSec,\n\s*isPlaying,\n\s*replayFrames,\n\s*appMode,\n\s*targetThroughputPerHour,\n\s*\};\n\s*\}, \[[\s\S]*?\]\);'''
new_effect = r'''useEffect(() => {
    stateRef.current = {
      isConstructorMode,
      interactionMode,
      selectedSkuChip,
      selectedTileKeys,
      selectedTileType,
      showGrid,
      snappingEnabled,
      isDrawingActive,
      drawingPoints,
      grid,
      currentTimeSec,
      isPlaying,
      replayFrames,
      appMode,
      targetThroughputPerHour,
    };
  }, [
    isConstructorMode,
    interactionMode,
    selectedSkuChip,
    selectedTileKeys,
    selectedTileType,
    showGrid,
    snappingEnabled,
    isDrawingActive,
    drawingPoints,
    grid,
    currentTimeSec,
    isPlaying,
    replayFrames,
    appMode,
    targetThroughputPerHour,
  ]);'''
text = re.sub(effect_pattern, new_effect, text)

# click
single_click = r'''if \(tileType && tileType !== 'EMPTY_FLOOR'\) \{\s*setSelectedTileKey\(key\);\s*setPopoverPos\(\{ x: event\.clientX, y: event\.clientY \}\);\s*\} else \{\s*setSelectedTileKeys\(new Set\(\)\);\s*setPopoverPos\(null\);\s*\}'''
new_single_click = r'''if (tileType && tileType !== 'EMPTY_FLOOR') {
              if (st.selectedSkuChip) {
                setGrid((prev) => {
                  const detailsMap = new Map(prev.elementDetails || []);
                  const existing = detailsMap.get(key) || {};
                  detailsMap.set(key, { ...existing, skuId: st.selectedSkuChip });
                  return { ...prev, elementDetails: detailsMap };
                });
              }
              setSelectedTileKeys(new Set([key]));
              setPopoverPos({
                x: Math.min(Math.max(16, event.clientX), window.innerWidth - 320 - 16),
                y: Math.min(Math.max(16, event.clientY), window.innerHeight - 240 - 16)
              });
            } else {
              setSelectedTileKeys(new Set());
              setPopoverPos(null);
            }'''
text = re.sub(single_click, new_single_click, text)

# marquee
marquee_logic = r'''const screenX = \(vec\.x \* 0\.5 \+ 0\.5\) \* rect\.width;\s*const screenY = \(vec\.y \* -0\.5 \+ 0\.5\) \* rect\.height;\s*if \(screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY\) \{\s*setSelectedTileKey\(key\);\s*selectedFound = true; // For now just select the first one we find\s*\}\s*\}\s*\}\);\s*\}\s*\}\s*\};'''
new_marquee_logic = r'''const screenX = (vec.x * 0.5 + 0.5) * rect.width;
            const screenY = (vec.y * -0.5 + 0.5) * rect.height;

            if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
              const tileType = st.grid.tiles.get(key);
              if (tileType && tileType !== 'EMPTY_FLOOR') {
                newSelected.add(key);
                selectedFound = true;
              }
            }
          }
        });

        if (selectedFound) {
          if (st.selectedSkuChip && newSelected.size > 0) {
            setGrid((prev) => {
              const detailsMap = new Map(prev.elementDetails || []);
              for (const k of newSelected) {
                const existing = detailsMap.get(k) || {};
                detailsMap.set(k, { ...existing, skuId: st.selectedSkuChip });
              }
              return { ...prev, elementDetails: detailsMap };
            });
          }
          setSelectedTileKeys(newSelected);
          setPopoverPos(null);
        }
      }
    }
  };'''
text = re.sub(marquee_logic, new_marquee_logic, text)
text = text.replace('let selectedFound = false;', 'let selectedFound = false;\n          const newSelected = new Set<string>();')

# overlays
overlays_pattern = r'''\{\/\* 2D Marquee Box Overlay for Bulk Selection \*\/\}.*?\/\>'''
new_overlays = r'''{/* 2D Marquee Box Overlay for Bulk Selection */}
        <div
          ref={marqueeRef}
          style={{ display: 'none', position: 'absolute' }}
          className="border-2 border-dashed border-[#D4AF37] bg-[#D4AF37]/20 pointer-events-none z-30"
        />

        {/* Quick SKU Palette on the right edge */}
        {isConstructorMode && skuList.length > 0 && (
          <div className="absolute top-16 right-3 flex flex-col gap-1.5 z-20">
            {skuList.map((sku, index) => {
              const color = SKU_PALETTE[index % SKU_PALETTE.length];
              const isActive = selectedSkuChip === sku.id;
              return (
                <button
                  key={sku.id}
                  onClick={() => setSelectedSkuChip(isActive ? null : sku.id)}
                  title={sku.name}
                  className={`w-8 h-8 rounded-none flex items-center justify-center font-bold text-white shadow-md cursor-pointer transition ${
                    isActive ? 'border-2 border-[#D4AF37] ring-2 ring-[#D4AF37]/30 scale-110' : 'border border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                >
                  {sku.name.charAt(0).toUpperCase()}
                </button>
              );
            })}
          </div>
        )}

        {/* Bulk Inspector Banner */}
        {isConstructorMode && selectedTileKeys.size > 1 && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-[#FFFFFF] border-2 border-[#D4AF37] p-2 shadow-2xl flex items-center gap-4 z-30 text-xs font-mono">
            <span className="font-bold text-[#8A6826]">Выбрано: {selectedTileKeys.size} стеллажей</span>

            <div className="flex items-center gap-2">
              <span className="text-[#4F4F47]">SKU:</span>
              <select
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  setGrid((prev) => {
                    const detailsMap = new Map(prev.elementDetails || []);
                    for (const key of selectedTileKeys) {
                      const existing = detailsMap.get(key) || {};
                      detailsMap.set(key, { ...existing, skuId: val });
                    }
                    return { ...prev, elementDetails: detailsMap };
                  });
                }}
                className="bg-[#F4F4F0] border border-[#D4AF37]/50 px-2 py-0.5 outline-none"
              >
                <option value="">-- Назначить товар --</option>
                {skuList.map((sku) => (
                  <option key={sku.id} value={sku.id}>{sku.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[#4F4F47]">Вместимость:</span>
              <input
                type="number"
                min="1"
                max="200"
                defaultValue={12}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val > 0) {
                    setGrid((prev) => {
                      const detailsMap = new Map(prev.elementDetails || []);
                      for (const key of selectedTileKeys) {
                        const existing = detailsMap.get(key) || {};
                        detailsMap.set(key, { ...existing, slotsPerRack: val });
                      }
                      return { ...prev, elementDetails: detailsMap };
                    });
                  }
                }}
                className="w-16 bg-[#F4F4F0] border border-[#D4AF37]/50 px-2 py-0.5 outline-none"
              />
              <span className="text-[#4F4F47]">паллет</span>
            </div>

            <button
              onClick={handleDeleteSelected}
              className="px-2 py-0.5 bg-red-100 hover:bg-red-200 text-red-900 border border-red-300 transition"
            >
              Удалить (Del)
            </button>
          </div>
        )}'''
text = re.sub(overlays_pattern, new_overlays, text, flags=re.DOTALL)

# onChangeCapacity prop
text = re.sub(
    r'onAssignSku=\{\(key, skuId\) => \{',
    r'''onChangeCapacity={(key, capacity) => {
              setGrid((prev) => {
                const detailsMap = new Map(prev.elementDetails || []);
                const existing = detailsMap.get(key) || {};
                detailsMap.set(key, { ...existing, slotsPerRack: capacity });
                return { ...prev, elementDetails: detailsMap };
              });
            }}
            onAssignSku={(key, skuId) => {''',
    text
)

# Single popover
text = text.replace(
    '{selectedTileKey && (',
    '{selectedTileKeys.size === 1 && ('
)
text = text.replace(
    'rackKey={selectedTileKey}',
    'rackKey={Array.from(selectedTileKeys)[0]}'
)
text = text.replace(
    "gridX={parseInt(selectedTileKey.split('_')[0], 10)}",
    "gridX={parseInt(Array.from(selectedTileKeys)[0].split('_')[0], 10)}"
)
text = text.replace(
    "gridY={parseInt(selectedTileKey.split('_')[1], 10)}",
    "gridY={parseInt(Array.from(selectedTileKeys)[0].split('_')[1], 10)}"
)
text = text.replace(
    'currentSkuId={grid.elementDetails?.get(selectedTileKey)?.skuId}',
    'currentSkuId={grid.elementDetails?.get(Array.from(selectedTileKeys)[0])?.skuId}'
)
text = text.replace(
    'slotsPerRack={grid.elementDetails?.get(selectedTileKey)?.slotsPerRack ?? 12}',
    'slotsPerRack={grid.elementDetails?.get(Array.from(selectedTileKeys)[0])?.slotsPerRack ?? 12}'
)
text = text.replace(
    'selectedElementId={selectedTileKey}',
    'selectedTileKeys={selectedTileKeys}'
)

# And replace lingering selectedTileKey references outside of these blocks (like dependency arrays)
text = re.sub(r'\bselectedTileKey\b', 'selectedTileKeys', text)

with open('src/components/SimulationViewport.tsx', 'w') as f:
    f.write(text)
