import re

with open('src/components/SimulationViewport.tsx', 'r') as f:
    text = f.read()

# Fix stateRef.current direct access instead of `st.selectedSkuChip`
text = text.replace(
    'stateRef.current.selectedSkuChip',
    '(stateRef.current as any).selectedSkuChip'
)

# Fix 377, 380 key issues because of missing loop over selectedTileKeys
# They were in `handleRotateSelected` and `handleDeleteSelected`
rotate_pattern = r'''const handleRotateSelected = useCallback\(\(\) => \{\n\s*if \(!selectedTileKeys\) return;\n\s*setGrid\(\(prev\) => \{\n\s*const detailsMap = new Map\(prev\.elementDetails \|\| \[\]\);\n\s*const existing = detailsMap\.get\(key\) \|\| \{\};\n\s*const currentRot = existing\.rotationDeg \?\? 0;\n\s*const nextRot = \(currentRot \+ 90\) % 360;\n\s*detailsMap\.set\(key, \{ \.\.\.existing, rotationDeg: nextRot \}\);\n\s*return \{ \.\.\.prev, elementDetails: detailsMap \};\n\s*\}\);\n\s*\}\, \[selectedTileKeys\]\);'''
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

delete_pattern = r'''const handleDeleteSelected = useCallback\(\(\) => \{\n\s*if \(!selectedTileKeys\) return;\n\s*setGrid\(\(prev\) => \{\n\s*const updatedTiles = new Map\(prev\.tiles\);\n\s*updatedTiles\.set\(key, 'EMPTY_FLOOR'\);\n\s*const detailsMap = new Map\(prev\.elementDetails \|\| \[\]\);\n\s*detailsMap\.delete\(key\);\n\s*return \{ \.\.\.prev, tiles: updatedTiles, elementDetails: detailsMap \};\n\s*\}\);\n\s*setSelectedTileKeys\(new Set\(\)\);\n\s*setPopoverPos\(null\);\n\s*\}\, \[selectedTileKeys\]\);'''
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

with open('src/components/SimulationViewport.tsx', 'w') as f:
    f.write(text)
