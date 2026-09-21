import re

with open('src/components/SimulationViewport.tsx', 'r') as f:
    text = f.read()

rotate_pattern = r'''const handleRotateSelected = useCallback\(\(\) => \{\n\s*if \(!selectedTileKeys\) return;\n\s*setGrid\(\(prev\) => \{\n\s*const detailsMap = new Map\(prev\.elementDetails \|\| \[\]\);\n\s*const existing = detailsMap\.get\(key\) \|\| \{\};\n\s*const currentRot = existing\.rotationDeg \|\| 0;\n\s*const nextRot = \(currentRot \+ 90\) % 360;\n\s*detailsMap\.set\(key, \{ \.\.\.existing, rotationDeg: nextRot \}\);\n\s*return \{ \.\.\.prev, elementDetails: detailsMap \};\n\s*\}\);\n\s*\}\, \[selectedTileKeys\]\);'''
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

with open('src/components/SimulationViewport.tsx', 'w') as f:
    f.write(text)
