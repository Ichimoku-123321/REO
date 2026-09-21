import re

with open('src/components/ConstructorToolbar.tsx', 'r') as f:
    content = f.read()

# Add ERASE to CtorInteractionMode
content = re.sub(
    r"export type CtorInteractionMode = 'SELECT' \| 'DRAW_RECT' \| 'DRAW_POLY' \| 'PLACE_ELEMENT';",
    "export type CtorInteractionMode = 'SELECT' | 'DRAW_RECT' | 'DRAW_POLY' | 'PLACE_ELEMENT' | 'ERASE';",
    content
)

# Add Eraser icon
content = re.sub(
    r"import \{.*?\} from 'lucide-react';",
    "import { MousePointer, Square, Pentagon, Settings, ChevronDown, Package, Truck, Layers, Magnet, Grid, RotateCcw, BoxSelect, Delete, Database, Maximize2, Zap, RotateCw, Trash2, Eraser } from 'lucide-react';",
    content
)

# Update the toggle logic for DRAW_RECT
content = re.sub(
    r"onChangeInteractionMode\('DRAW_RECT'\);",
    "if (interactionMode === 'DRAW_RECT') {\n                      onChangeInteractionMode('SELECT');\n                    } else {\n                      onChangeInteractionMode('DRAW_RECT');\n                    }",
    content
)

# Update the toggle logic for DRAW_POLY
content = re.sub(
    r"onChangeInteractionMode\('DRAW_POLY'\);",
    "if (interactionMode === 'DRAW_POLY') {\n                      onChangeInteractionMode('SELECT');\n                    } else {\n                      onChangeInteractionMode('DRAW_POLY');\n                    }",
    content
)

# Update the toggle logic for PLACE_ELEMENT
content = re.sub(
    r"onSelectTileType\(tool\.type\);\n\s*onChangeInteractionMode\('PLACE_ELEMENT'\);",
    "if (interactionMode === 'PLACE_ELEMENT' && selectedTileType === tool.type) {\n                  onChangeInteractionMode('SELECT');\n                } else {\n                  onSelectTileType(tool.type);\n                  onChangeInteractionMode('PLACE_ELEMENT');\n                }",
    content
)

# Insert the Eraser button after Palette Elements
eraser_button = """
          <div className="h-4 w-px bg-[#D4AF37]/30 mx-0.5" />

          {/* 4. Eraser Tool */}
          <button
            type="button"
            onClick={() => {
              setIsFloorDropdownOpen(false);
              if (interactionMode === 'ERASE') {
                onChangeInteractionMode('SELECT');
              } else {
                onChangeInteractionMode('ERASE');
              }
            }}
            className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold uppercase transition rounded-none cursor-pointer border ${
              interactionMode === 'ERASE'
                ? 'bg-[#1A1A1A] text-[#F9F9F6] border-[#1A1A1A]'
                : 'bg-[#F9F9F6] text-[#1A1A1A] border-[#D4AF37]/30 hover:bg-[#EAEAE6]'
            }`}
            title="Стереть элемент [Ластик]"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>[ 🧹 Ластик ]</span>
          </button>
"""

content = re.sub(
    r"(\s*\{/\* Right Section: Toggles, Hotkeys & Modals \*/\})",
    eraser_button + r"\n\1",
    content
)

with open('src/components/ConstructorToolbar.tsx', 'w') as f:
    f.write(content)
