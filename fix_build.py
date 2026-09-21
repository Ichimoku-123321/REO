import re
with open('src/components/SimulationViewport.tsx', 'r') as f:
    text = f.read()

# Fix types in detailsMap.get / set / delete (381, 384) where key is a Set
text = text.replace("const existing = detailsMap.get(selectedTileKeys) || {};", "const existing = detailsMap.get(key) || {};")
text = text.replace("detailsMap.set(selectedTileKeys, { ...existing, rotationDeg: nextRot });", "detailsMap.set(key, { ...existing, rotationDeg: nextRot });")
text = text.replace("updatedTiles.set(selectedTileKeys, 'EMPTY_FLOOR');", "updatedTiles.set(key, 'EMPTY_FLOOR');")
text = text.replace("detailsMap.delete(selectedTileKeys);", "detailsMap.delete(key);")
text = text.replace("const isSelected = st.selectedTileKeyss.has(key);", "const isSelected = st.selectedTileKeys.has(key);")
text = text.replace("const isSelected = selectedTileKeys === key;", "const isSelected = st.selectedTileKeys.has(key);")


# Update stateRef typings
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

# null type fixes for skuId
text = text.replace("skuId: val", "skuId: val || undefined")
text = text.replace("skuId: st.selectedSkuChip", "skuId: st.selectedSkuChip || undefined")
text = text.replace("skuId: st.selectedSkuChip || undefined || undefined", "skuId: st.selectedSkuChip || undefined")

# any types
text = text.replace('.map((s) =>', '.map((s: any) =>')
text = text.replace('tiles.forEach((type) =>', 'tiles.forEach((type: any) =>')
text = text.replace('tiles.forEach((type, key) =>', 'tiles.forEach((type: any, key: any) =>')
text = text.replace('grid.tiles.forEach((type)', 'grid.tiles.forEach((type: any)')

text = text.replace(
    '(evt) => {',
    '(evt: any) => {'
)

# Replace 'st' occurrences on 1192, 1350, etc that might have generic error
text = text.replace("st.selectedTileKeys", "stateRef.current.selectedTileKeys")
text = text.replace("st.grid", "stateRef.current.grid")
text = text.replace("st.selectedSkuChip", "stateRef.current.selectedSkuChip")

with open('src/components/SimulationViewport.tsx', 'w') as f:
    f.write(text)
