import re

with open('src/components/SimulationViewport.tsx', 'r') as f:
    content = f.read()

# Update the Escape key logic to also hide ghostGroupRef if needed, though it might not be defined there.
# It seems the `Escape` key is already implemented! Let's just fix the stale comment about SELECT mode.

new_select_logic = """        if (gx >= 0 && gx < st.grid.cols && gy >= 0 && gy < st.grid.rows) {
          const key = getTileKey(gx, gy);
          if (st.interactionMode === 'SELECT') {
            const tileType = st.grid.tiles.get(key);
            // Select RACK, DOCK, CHARGER, OBSTACLE, never place
            if (tileType && tileType !== 'EMPTY_FLOOR') {
              setSelectedTileKey(key);
              setPopoverPos({ x: event.clientX, y: event.clientY });
            } else {
              setSelectedTileKey(null);
              setPopoverPos(null);
            }
          }
        }"""

content = re.sub(
    r"        if \(gx >= 0 && gx < st\.grid\.cols && gy >= 0 && gy < st\.grid\.rows\) \{\n          const key = getTileKey\(gx, gy\);\n          if \(st\.interactionMode === 'SELECT'\) \{\n            // ONLY select if RACK, DOCK, CHARGER, OBSTACLE, never place\n            if \(st\.grid\.tiles\.get\(key\) === 'RACK'\) \{\n              setSelectedTileKey\(key\);\n              setPopoverPos\(\{ x: event\.clientX, y: event\.clientY \}\);\n            \} else \{\n              setSelectedTileKey\(null\);\n              setPopoverPos\(null\);\n            \}\n          \}\n        \}",
    new_select_logic,
    content
)

# And let's make sure the escape key hides the ghostGroupRef. We will just use `ghostGroupRef.current?.visible = false;` but ghostGroup is in another scope... Actually, we can use `ghostGroupRef.current.visible = false` inside handleKeyDown but it might be null.
# Let's see: `ghostGroupRef.current` is accessible in the `useEffect` for keys? Yes, `ghostGroupRef` is a ref at the component level.

escape_key_replacement = """      if (e.key === 'Escape') {
        setSelectedTileKey(null);
        setPopoverPos(null);
        if (st.interactionMode !== 'SELECT') {
          setInteractionMode('SELECT');
          setIsDrawingActive(false);
          setDrawingPoints([]);
          if (ghostGroupRef.current) {
            ghostGroupRef.current.visible = false;
          }
        }
      }"""

content = re.sub(
    r"      if \(e\.key === 'Escape'\) \{\n        setSelectedTileKey\(null\);\n        setPopoverPos\(null\);\n        if \(st\.interactionMode !== 'SELECT'\) \{\n          setInteractionMode\('SELECT'\);\n          setIsDrawingActive\(false\);\n          setDrawingPoints\(\[\]\);\n        \}\n      \}",
    escape_key_replacement,
    content
)

with open('src/components/SimulationViewport.tsx', 'w') as f:
    f.write(content)
