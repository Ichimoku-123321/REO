import re

with open('src/components/SimulationViewport.tsx', 'r') as f:
    content = f.read()

# Remove the initial camera setup positioning hack if we want.
# We will intercept placement of DOCK_INBOUND and DOCK_OUTBOUND
# Add drag to draw for walls & eraser

# Update the floor plane - remove it!
content = re.sub(
    r"    // 6\. CAD Floor Plane[\s\S]*?floorMeshRef\.current = floorMesh;",
    r"    // 6. CAD Floor Plane (Removed as requested)",
    content
)

# Update PointerDown
new_pointer_down = """    const handleCanvasPointerDown = (event: MouseEvent) => {
      const st = stateRef.current;
      if (!st.isConstructorMode) return;

      // If right clicking while holding a tool, intercept it to cancel the tool
      if (event.button === 2 && st.interactionMode !== 'SELECT') {
        event.preventDefault();
        event.stopPropagation();
        setInteractionMode('SELECT');
        setIsDrawingActive(false);
        setDrawingPoints([]);
        ghostGroup.visible = false;
        return;
      }

      mouseDownPosRef.current = { x: event.clientX, y: event.clientY };
"""
content = re.sub(
    r"    const handleCanvasPointerDown = \(event: MouseEvent\) => \{[\s\S]*?mouseDownPosRef\.current = \{ x: event\.clientX, y: event\.clientY \};\n    \};",
    new_pointer_down + "    };",
    content
)

with open('src/components/SimulationViewport.tsx', 'w') as f:
    f.write(content)
