import re

with open('src/components/SimulationViewport.tsx', 'r') as f:
    content = f.read()

# Update DOCK_INBOUND appearance (Emerald 0x10b981)
content = re.sub(
    r"      \} else if \(type === 'DOCK_INBOUND'\) \{\n        const dGeo = new THREE\.BoxGeometry\(grid\.cellSizeM \* 0\.9, 0\.1, grid\.cellSizeM \* 0\.9\);\n        const dMat = new THREE\.MeshStandardMaterial\(\{\n          color: isSelected \? 0xd4af37 : 0x3b82f6,",
    r"      } else if (type === 'DOCK_INBOUND') {\n        const dGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.9, 0.1, grid.cellSizeM * 0.9);\n        const dMat = new THREE.MeshStandardMaterial({\n          color: isSelected ? 0xd4af37 : 0x10b981,",
    content
)

# Update DOCK_OUTBOUND appearance (Amber 0xf59e0b)
content = re.sub(
    r"      \} else if \(type === 'DOCK_OUTBOUND'\) \{\n        const dGeo = new THREE\.BoxGeometry\(grid\.cellSizeM \* 0\.9, 0\.1, grid\.cellSizeM \* 0\.9\);\n        const dMat = new THREE\.MeshStandardMaterial\(\{\n          color: isSelected \? 0xd4af37 : 0x0284c7,",
    r"      } else if (type === 'DOCK_OUTBOUND') {\n        const dGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.9, 0.1, grid.cellSizeM * 0.9);\n        const dMat = new THREE.MeshStandardMaterial({\n          color: isSelected ? 0xd4af37 : 0xf59e0b,",
    content
)

with open('src/components/SimulationViewport.tsx', 'w') as f:
    f.write(content)
