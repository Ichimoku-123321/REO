import re

with open('src/components/ConstructorToolbar.tsx', 'r') as f:
    content = f.read()

# Add ERASE to CtorInteractionMode which is multiline
content = re.sub(
    r"export type CtorInteractionMode =\n\s*\| 'SELECT'\n\s*\| 'DRAW_RECT'\n\s*\| 'DRAW_POLY'\n\s*\| 'PLACE_ELEMENT';",
    "export type CtorInteractionMode =\n  | 'SELECT'\n  | 'DRAW_RECT'\n  | 'DRAW_POLY'\n  | 'PLACE_ELEMENT'\n  | 'ERASE';",
    content
)

with open('src/components/ConstructorToolbar.tsx', 'w') as f:
    f.write(content)
