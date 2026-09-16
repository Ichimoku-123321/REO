import type { FacilityRequirements } from '../types/facility.js';
import type {
  FacilityTopology,
  FacilityZone,
  GraphEdge,
  GraphNode,
  NodeType,
} from '../types/topology.js';

/**
 * Calculates facility dimensions (length & width in meters) based on total area
 * and industry aspect ratio.
 */
export function calculateFacilityDimensions(facility: FacilityRequirements): {
  widthM: number;
  lengthM: number;
} {
  const S = facility.totalAreaSqm;
  let ratio = 1.5;

  switch (facility.industry) {
    case 'warehouse':
      ratio = 2.0;
      break;
    case 'airport':
      ratio = 2.5;
      break;
    case 'hospital':
      ratio = 1.5;
      break;
    default:
      ratio = 1.5;
      break;
  }

  const lengthM = Math.max(10, Math.round(Math.sqrt(S * ratio)));
  const widthM = Math.max(10, Math.round(S / lengthM));

  return { widthM, lengthM };
}

/**
 * Helper to compute Euclidean distance between two nodes.
 */
function dist(n1: { x: number; y: number }, n2: { x: number; y: number }): number {
  const dx = n1.x - n2.x;
  const dy = n1.y - n2.y;
  return Math.round(Math.sqrt(dx * dx + dy * dy) * 100) / 100;
}

/**
 * Procedurally generates facility topology graph and functional zones.
 */
export function generateFacilityTopology(
  facility: FacilityRequirements
): FacilityTopology {
  const { widthM, lengthM } = calculateFacilityDimensions(facility);

  switch (facility.industry) {
    case 'warehouse':
      return generateWarehouseTopology(widthM, lengthM, facility.aisleWidthM);
    case 'airport':
      return generateAirportTopology(widthM, lengthM);
    case 'hospital':
      return generateHospitalTopology(widthM, lengthM);
    default:
      return generateWarehouseTopology(widthM, lengthM, facility.aisleWidthM);
  }
}

/**
 * Helper function to generate an 8-way grid graph given cell types and facility dimensions.
 */
function build8WayGridTopology(
  widthM: number,
  lengthM: number,
  cellTypes: Map<string, { type: NodeType; label?: string; isPassable: boolean }>,
  zones: FacilityZone[]
): FacilityTopology {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeGrid = new Map<string, GraphNode>();

  const cols = widthM;
  const rows = lengthM;

  // 1. Create nodes for all passable cells
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const key = `${x}_${y}`;
      const info = cellTypes.get(key) || { type: 'WAYPOINT', isPassable: true };

      if (!info.isPassable) continue;

      const nodeId = `node_${x}_${y}`;
      const node: GraphNode = {
        id: nodeId,
        type: info.type,
        x: x + 0.5,
        y: y + 0.5,
        zLevel: 0,
        label: info.label,
      };

      nodes.push(node);
      nodeGrid.set(key, node);
    }
  }

  // 2. Build 8-way edges between adjacent passable cells
  let edgeIdSeq = 1;
  const isPassableCell = (gx: number, gy: number) => {
    if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) return false;
    return nodeGrid.has(`${gx}_${gy}`);
  };

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const currKey = `${x}_${y}`;
      const currNode = nodeGrid.get(currKey);
      if (!currNode) continue;

      // Directions: 4 orthogonal + 4 diagonal
      const dirs = [
        { dx: 1, dy: 0, dist: 1.0, isDiag: false },
        { dx: 0, dy: 1, dist: 1.0, isDiag: false },
        { dx: 1, dy: 1, dist: 1.414, isDiag: true, orth1: [1, 0], orth2: [0, 1] },
        { dx: 1, dy: -1, dist: 1.414, isDiag: true, orth1: [1, 0], orth2: [0, -1] },
      ];

      for (const dir of dirs) {
        const nx = x + dir.dx;
        const ny = y + dir.dy;
        if (!isPassableCell(nx, ny)) continue;

        // For diagonal movements, prevent corner cutting through impassable obstacles
        if (dir.isDiag && dir.orth1 && dir.orth2) {
          const o1Pass = isPassableCell(x + dir.orth1[0], y + dir.orth1[1]);
          const o2Pass = isPassableCell(x + dir.orth2[0], y + dir.orth2[1]);
          if (!o1Pass || !o2Pass) continue;
        }

        const neighborNode = nodeGrid.get(`${nx}_${ny}`)!;
        edges.push({
          id: `e_${edgeIdSeq++}`,
          source: currNode.id,
          target: neighborNode.id,
          distanceM: dir.dist,
          bidirectional: true,
        });
      }
    }
  }

  return { widthM, lengthM, nodes, edges, zones };
}

/**
 * Generator for Warehouse topology:
 * - Left side: Inbound docks
 * - Right side: Outbound docks
 * - Center: Storage rack blocks with parallel aisles
 * - Bottom perimeter: Charging hubs
 * - Interconnected 8-way grid mesh
 */
function generateWarehouseTopology(
  widthM: number,
  lengthM: number,
  aisleWidthM: number
): FacilityTopology {
  const zones: FacilityZone[] = [];
  const dockWidth = Math.max(3, Math.round(widthM * 0.15));
  const storageWidth = widthM - dockWidth * 2 - 4;
  const mainHeight = lengthM - 6;

  zones.push({
    id: 'z_inbound',
    name: 'Зона приемки (Inbound Docks)',
    type: 'INBOUND_DOCK',
    x: 1,
    y: 3,
    width: dockWidth,
    height: mainHeight,
    color: '#3b82f6',
  });

  zones.push({
    id: 'z_storage',
    name: 'Складская зона (Storage Racks)',
    type: 'STORAGE_AISLE',
    x: dockWidth + 2,
    y: 3,
    width: Math.max(6, storageWidth),
    height: mainHeight,
    color: '#475569',
  });

  zones.push({
    id: 'z_outbound',
    name: 'Зона отгрузки (Outbound Docks)',
    type: 'OUTBOUND_DOCK',
    x: widthM - dockWidth - 1,
    y: 3,
    width: dockWidth,
    height: mainHeight,
    color: '#0284c7',
  });

  zones.push({
    id: 'z_charging',
    name: 'Зарядный хаб (Charging Hub)',
    type: 'CHARGING_HUB',
    x: Math.round(widthM / 2 - 8),
    y: 0.5,
    width: 16,
    height: 2,
    color: '#f59e0b',
  });

  const cellTypes = new Map<string, { type: NodeType; label?: string; isPassable: boolean }>();

  // Determine rack block layout in storage zone
  const rackStartX = dockWidth + 3;
  const rackEndX = widthM - dockWidth - 3;
  const rackStartY = 4;
  const rackEndY = lengthM - 5;
  const effectiveAisleWidth = Math.max(2, Math.round(aisleWidthM));

  for (let x = 0; x < widthM; x++) {
    for (let y = 0; y < lengthM; y++) {
      const key = `${x}_${y}`;

      // Inbound dock zone
      if (x >= 1 && x < 1 + dockWidth && y >= 3 && y < 3 + mainHeight) {
        const dockIdx = Math.floor((y - 3) / Math.max(1, mainHeight / 4)) + 1;
        cellTypes.set(key, {
          type: 'INBOUND_DOCK',
          label: `Ворота приемки №${dockIdx}`,
          isPassable: true,
        });
        continue;
      }

      // Outbound dock zone
      if (x >= widthM - dockWidth - 1 && x < widthM - 1 && y >= 3 && y < 3 + mainHeight) {
        const dockIdx = Math.floor((y - 3) / Math.max(1, mainHeight / 4)) + 1;
        cellTypes.set(key, {
          type: 'OUTBOUND_DOCK',
          label: `Ворота отгрузки №${dockIdx}`,
          isPassable: true,
        });
        continue;
      }

      // Charging hub zone
      if (x >= Math.round(widthM / 2 - 8) && x < Math.round(widthM / 2 + 8) && y >= 0 && y < 2) {
        const chargerIdx = Math.floor((x - Math.round(widthM / 2 - 8)) / 4) + 1;
        cellTypes.set(key, {
          type: 'CHARGING_HUB',
          label: `Зарядная станция №${chargerIdx}`,
          isPassable: true,
        });
        continue;
      }

      // Storage zone racks and aisles
      if (x >= rackStartX && x <= rackEndX && y >= rackStartY && y <= rackEndY) {
        // Create rack blocks spaced by aisles
        const relX = x - rackStartX;
        const period = effectiveAisleWidth + 1; // 1 cell rack, N cells aisle
        if (relX % period === 0) {
          // Cross-aisles at top, middle, bottom
          const midY = Math.round(lengthM / 2);
          if (y === rackStartY || y === midY || y === rackEndY) {
            cellTypes.set(key, { type: 'STORAGE_AISLE', label: `Аллея`, isPassable: true });
          } else {
            // RACK block - IMPASSABLE
            cellTypes.set(key, { type: 'STORAGE_AISLE', isPassable: false });
          }
        } else {
          cellTypes.set(key, { type: 'STORAGE_AISLE', label: `Аллея стеллажей`, isPassable: true });
        }
        continue;
      }

      // Open floor waypoint
      cellTypes.set(key, { type: 'WAYPOINT', isPassable: true });
    }
  }

  return build8WayGridTopology(widthM, lengthM, cellTypes, zones);
}

/**
 * Generator for Airport topology:
 * - Bottom: Luggage Intake Hub
 * - Middle: Linear terminal transit corridor
 * - Top/Sides: Apron parking docks
 * - Perimeter: Charging stations
 */
function generateAirportTopology(
  widthM: number,
  lengthM: number
): FacilityTopology {
  const zones: FacilityZone[] = [];

  zones.push({
    id: 'z_intake',
    name: 'Зона приёма багажа (Intake Hub)',
    type: 'INBOUND_DOCK',
    x: 2,
    y: 2,
    width: widthM - 4,
    height: 6,
    color: '#3b82f6',
  });

  zones.push({
    id: 'z_terminal',
    name: 'Терминальный коридор (Terminal Transit)',
    type: 'WAYPOINT',
    x: Math.round(widthM * 0.25),
    y: 10,
    width: Math.round(widthM * 0.5),
    height: Math.max(4, lengthM - 18),
    color: '#334155',
  });

  zones.push({
    id: 'z_apron',
    name: 'Перронная зона вылета (Apron Docks)',
    type: 'OUTBOUND_DOCK',
    x: 2,
    y: lengthM - 7,
    width: widthM - 4,
    height: 5,
    color: '#0284c7',
  });

  zones.push({
    id: 'z_charging_airport',
    name: 'Зарядный депо (Charging Hub)',
    type: 'CHARGING_HUB',
    x: 2,
    y: 10,
    width: 6,
    height: Math.min(12, Math.max(2, lengthM - 20)),
    color: '#f59e0b',
  });

  const cellTypes = new Map<string, { type: NodeType; label?: string; isPassable: boolean }>();

  for (let x = 0; x < widthM; x++) {
    for (let y = 0; y < lengthM; y++) {
      const key = `${x}_${y}`;

      if (x >= 2 && x < widthM - 2 && y >= 2 && y < 8) {
        cellTypes.set(key, { type: 'INBOUND_DOCK', label: 'Терминал багажа', isPassable: true });
      } else if (x >= 2 && x < widthM - 2 && y >= lengthM - 7 && y < lengthM - 2) {
        cellTypes.set(key, { type: 'OUTBOUND_DOCK', label: 'Стоянка Гейт', isPassable: true });
      } else if (x >= 2 && x < 8 && y >= 10 && y < 10 + Math.min(12, Math.max(2, lengthM - 20))) {
        cellTypes.set(key, { type: 'CHARGING_HUB', label: 'Зарядная станция Перрон', isPassable: true });
      } else {
        cellTypes.set(key, { type: 'WAYPOINT', isPassable: true });
      }
    }
  }

  return build8WayGridTopology(widthM, lengthM, cellTypes, zones);
}

/**
 * Generator for Hospital topology:
 * - Central pharmacy / supply depot
 * - Department wings with parallel corridors
 * - Charging docks at perimeter
 */
function generateHospitalTopology(
  widthM: number,
  lengthM: number
): FacilityTopology {
  const zones: FacilityZone[] = [];
  const centerX = Math.round(widthM / 2);
  const centerY = Math.round(lengthM / 2);
  const wingWidth = Math.max(6, Math.round(widthM * 0.3));

  zones.push({
    id: 'z_pharmacy',
    name: 'Центральный фармацевтический склад (Depot)',
    type: 'INBOUND_DOCK',
    x: Math.max(1, centerX - 8),
    y: Math.max(1, centerY - 4),
    width: Math.min(16, widthM - 2),
    height: Math.min(8, lengthM - 2),
    color: '#3b82f6',
  });

  zones.push({
    id: 'z_wing_left',
    name: 'Отделение хирургии (Left Wing)',
    type: 'OUTBOUND_DOCK',
    x: 2,
    y: 4,
    width: wingWidth,
    height: Math.max(4, lengthM - 8),
    color: '#0284c7',
  });

  zones.push({
    id: 'z_wing_right',
    name: 'Терапевтическое отделение (Right Wing)',
    type: 'OUTBOUND_DOCK',
    x: Math.max(2, widthM - wingWidth - 2),
    y: 4,
    width: wingWidth,
    height: Math.max(4, lengthM - 8),
    color: '#0284c7',
  });

  zones.push({
    id: 'z_charging_hosp',
    name: 'Зарядный блок (Charging Hub)',
    type: 'CHARGING_HUB',
    x: Math.max(1, centerX - 6),
    y: 1,
    width: Math.min(12, widthM - 2),
    height: 3,
    color: '#f59e0b',
  });

  const cellTypes = new Map<string, { type: NodeType; label?: string; isPassable: boolean }>();

  for (let x = 0; x < widthM; x++) {
    for (let y = 0; y < lengthM; y++) {
      const key = `${x}_${y}`;

      if (x >= centerX - 4 && x < centerX + 4 && y >= centerY - 2 && y < centerY + 2) {
        cellTypes.set(key, { type: 'INBOUND_DOCK', label: 'Главный фармсклад', isPassable: true });
      } else if (x >= 2 && x < 2 + wingWidth && y >= 4 && y < lengthM - 4) {
        cellTypes.set(key, { type: 'OUTBOUND_DOCK', label: 'Пост хирургии №1', isPassable: true });
      } else if (x >= widthM - wingWidth - 2 && x < widthM - 2 && y >= 4 && y < lengthM - 4) {
        cellTypes.set(key, { type: 'OUTBOUND_DOCK', label: 'Пост терапии №2', isPassable: true });
      } else if (x >= centerX - 4 && x < centerX + 4 && y >= 1 && y < 4) {
        cellTypes.set(key, { type: 'CHARGING_HUB', label: 'Зарядный отсек', isPassable: true });
      } else {
        cellTypes.set(key, { type: 'WAYPOINT', isPassable: true });
      }
    }
  }

  return build8WayGridTopology(widthM, lengthM, cellTypes, zones);
}
