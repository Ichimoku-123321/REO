import re

with open('src/components/SimulationViewport.tsx', 'r') as f:
    content = f.read()

# Add handling for dragging in pointer move.
# We need to add logic: if mouse is down (event.buttons === 1), and we are in 'PLACE_ELEMENT' + 'OBSTACLE', or 'ERASE'

pointer_move_logic = """        if (st.interactionMode === 'PLACE_ELEMENT') {
          // Snap ghost to grid cell center using integer grid coordinates
          const gx = Math.floor(point.x / st.grid.cellSizeM);
          const gy = Math.floor(point.z / st.grid.cellSizeM);
          const snappedX = (gx + 0.5) * st.grid.cellSizeM;
          const snappedZ = (gy + 0.5) * st.grid.cellSizeM;

          ghostGroup.position.set(snappedX, 1.0, snappedZ);
          ghostGroup.visible = true;

          if (event.buttons === 1 && st.selectedTileType === 'OBSTACLE' && gx >= 0 && gx < st.grid.cols && gy >= 0 && gy < st.grid.rows) {
            const key = getTileKey(gx, gy);
            setGrid((prev) => {
              if (prev.tiles.get(key) !== 'OBSTACLE') {
                const updatedTiles = new Map(prev.tiles);
                updatedTiles.set(key, 'OBSTACLE');
                return { ...prev, tiles: updatedTiles };
              }
              return prev;
            });
          }
        } else if (st.interactionMode === 'ERASE') {
          ghostGroup.visible = false;
          if (event.buttons === 1) {
            const gx = Math.floor(point.x / st.grid.cellSizeM);
            const gy = Math.floor(point.z / st.grid.cellSizeM);
            if (gx >= 0 && gx < st.grid.cols && gy >= 0 && gy < st.grid.rows) {
              const key = getTileKey(gx, gy);
              setGrid((prev) => {
                if (prev.tiles.has(key) && prev.tiles.get(key) !== 'EMPTY_FLOOR') {
                  const updatedTiles = new Map(prev.tiles);
                  updatedTiles.set(key, 'EMPTY_FLOOR');
                  const updatedDetails = new Map(prev.elementDetails || []);
                  updatedDetails.delete(key);
                  return { ...prev, tiles: updatedTiles, elementDetails: updatedDetails };
                }
                return prev;
              });
            }
          }
        } else {
          ghostGroup.visible = false;
        }"""

content = re.sub(
    r"        if \(st\.interactionMode === 'PLACE_ELEMENT'\) \{[\s\S]*?ghostGroup\.visible = false;\n        \}",
    pointer_move_logic,
    content
)


pointer_up_logic = """        if (event.button === 0 && st.interactionMode === 'ERASE' && gx >= 0 && gx < st.grid.cols && gy >= 0 && gy < st.grid.rows) {
          const key = getTileKey(gx, gy);
          setGrid((prev) => {
             const updatedTiles = new Map(prev.tiles);
             updatedTiles.set(key, 'EMPTY_FLOOR');
             const updatedDetails = new Map(prev.elementDetails || []);
             updatedDetails.delete(key);
             return { ...prev, tiles: updatedTiles, elementDetails: updatedDetails };
          });
          setSelectedTileKey(null);
          setPopoverPos(null);
          return;
        }

        if (event.button === 0 && st.interactionMode === 'PLACE_ELEMENT' && gx >= 0 && gx < st.grid.cols && gy >= 0 && gy < st.grid.rows) {
          const key = getTileKey(gx, gy);

          if (st.selectedTileType === 'DOCK_INBOUND' || st.selectedTileType === 'DOCK_OUTBOUND') {
            let inboundCount = 0;
            let outboundCount = 0;
            st.grid.tiles.forEach((type) => {
              if (type === 'DOCK_INBOUND') inboundCount++;
              if (type === 'DOCK_OUTBOUND') outboundCount++;
            });

            if (st.selectedTileType === 'DOCK_INBOUND' && inboundCount >= 1 && st.grid.tiles.get(key) !== 'DOCK_INBOUND') {
              showToast('⚠️ На складе уже размещены ворота приемки (максимум 1)');
              return;
            }
            if (st.selectedTileType === 'DOCK_OUTBOUND' && outboundCount >= 1 && st.grid.tiles.get(key) !== 'DOCK_OUTBOUND') {
              showToast('⚠️ На складе уже размещены ворота отгрузки (максимум 1)');
              return;
            }
          }

          setGrid((prev) => {
            const updatedTiles = new Map(prev.tiles);
            updatedTiles.set(key, st.selectedTileType);
            return { ...prev, tiles: updatedTiles };
          });

          setSelectedTileKey(null);
          setPopoverPos(null);
          return;
        }

        if (gx >= 0 && gx < st.grid.cols && gy >= 0 && gy < st.grid.rows) {
          const key = getTileKey(gx, gy);
          if (st.interactionMode === 'SELECT') {
            // ONLY select if RACK, DOCK, CHARGER, OBSTACLE, never place
            if (st.grid.tiles.get(key) === 'RACK') {
              setSelectedTileKey(key);
              setPopoverPos({ x: event.clientX, y: event.clientY });
            } else {
              setSelectedTileKey(null);
              setPopoverPos(null);
            }
          }
        }"""

content = re.sub(
    r"        if \(event\.button === 0 && st\.interactionMode === 'PLACE_ELEMENT' && gx >= 0 && gx < st\.grid\.cols && gy >= 0 && gy < st\.grid\.rows\) \{[\s\S]*?setPopoverPos\(null\);\n          \}\n        \}",
    pointer_up_logic,
    content
)

with open('src/components/SimulationViewport.tsx', 'w') as f:
    f.write(content)
