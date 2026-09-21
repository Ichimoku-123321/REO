import re

with open('src/components/SimulationViewport.tsx', 'r') as f:
    content = f.read()

# Pointer down
content = re.sub(
    r"    const handleCanvasPointerDown = \(event: MouseEvent\) => \{[\s\S]*?mouseDownPosRef\.current = \{ x: event\.clientX, y: event\.clientY \};\n    \};",
    """    const handleCanvasPointerDown = (event: MouseEvent) => {
      const st = stateRef.current;
      if (!st.isConstructorMode) return;

      // If right clicking while holding a tool, intercept it to cancel the tool
      if (event.button === 2 && st.interactionMode !== 'SELECT') {
        event.preventDefault();
        event.stopPropagation();
        setInteractionMode('SELECT');
        setIsDrawingActive(false);
        setDrawingPoints([]);
        if (ghostGroupRef.current) {
          ghostGroupRef.current.visible = false;
        }
        return;
      }

      mouseDownPosRef.current = { x: event.clientX, y: event.clientY };
    };""",
    content
)

with open('src/components/SimulationViewport.tsx', 'w') as f:
    f.write(content)
