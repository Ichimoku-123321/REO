import type { FacilityRequirements } from '../types/facility.js';
import type { FacilityTopology, FacilityZone, GraphEdge, GraphNode, NodeType } from '../types/topology.js';
import { buildElementsMap, StorageElement } from './cad_entities.js';

export type ConstructorTileType =
  | 'EMPTY_FLOOR'
  | 'RACK'
  | 'OBSTACLE'
  | 'CHARGER'
  | 'DOCK_INBOUND'
  | 'DOCK_OUTBOUND';

export interface Point2D {
  x: number;
  z: number;
}

export interface SkuItem {
  id: string;
  name: string;
  weightPerUnitKg: number;
}

export interface PlacedElement {
  id: string;
  type: ConstructorTileType;
  x: number;
  z: number;
  rotationDeg: number; // 0, 90, 180, 270
  skuId?: string;
  slotsPerRack?: number; // Default 12 for RACK
}

export interface SupplySchedule {
  inboundIntervalValue: number;
  inboundIntervalUnit: 'hours' | 'days' | 'minutes';
  inboundBatchVolume: number; // Q_in (pallets)
  outboundIntervalValue: number;
  outboundIntervalUnit: 'hours' | 'days' | 'minutes';
  outboundBatchVolume: number; // Q_out (pallets)
}

export const DEFAULT_SUPPLY_SCHEDULE: SupplySchedule = {
  inboundIntervalValue: 24,
  inboundIntervalUnit: 'hours',
  inboundBatchVolume: 0,
  outboundIntervalValue: 24,
  outboundIntervalUnit: 'hours',
  outboundBatchVolume: 0,
};

export const DEFAULT_SKU_LIST: SkuItem[] = [
  { id: 'sku-1', name: 'Стандартный груз', weightPerUnitKg: 500 },
];

/**
 * Calculates floor surface area using Gauss's Shoelace formula for polygon vertices.
 */
export function calculateShoelaceArea(points: Point2D[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const nextIndex = (i + 1) % n;
    sum += points[i].x * points[nextIndex].z - points[nextIndex].x * points[i].z;
  }
  return Math.round((Math.abs(sum) / 2) * 100) / 100;
}

/**
 * Finds magnetic snap coordinates along X or Z axis if distance to neighbor center/edge is < thresholdM (default 0.35m).
 */
export function findMagneticSnapPosition(
  target: Point2D,
  existingPoints: Point2D[],
  thresholdM: number = 0.35
): { snapped: Point2D; guideX: number | null; guideZ: number | null } {
  let snappedX = target.x;
  let snappedZ = target.z;
  let guideX: number | null = null;
  let guideZ: number | null = null;

  let minDiffX = thresholdM;
  let minDiffZ = thresholdM;

  for (const pt of existingPoints) {
    const diffX = Math.abs(target.x - pt.x);
    if (diffX < minDiffX) {
      minDiffX = diffX;
      snappedX = pt.x;
      guideX = pt.x;
    }

    const diffZ = Math.abs(target.z - pt.z);
    if (diffZ < minDiffZ) {
      minDiffZ = diffZ;
      snappedZ = pt.z;
      guideZ = pt.z;
    }
  }

  return {
    snapped: { x: snappedX, z: snappedZ },
    guideX,
    guideZ,
  };
}

/**
 * Calculates live total rack count and total warehouse pallet slot capacity.
 * Dynamically sums slotsPerRack (defaulting to 12 if undefined) across all racks.
 */
export function calculateWarehouseCapacity(grid: ConstructorGrid): {
  totalRacks: number;
  totalPalletCapacity: number;
} {
  let totalRacks = 0;
  let totalPalletCapacity = 0;

  const elementsMap = buildElementsMap(grid);
  elementsMap.forEach((el) => {
    if (el instanceof StorageElement) {
      totalRacks++;
      totalPalletCapacity += el.slotsPerRack;
    }
  });

  return { totalRacks, totalPalletCapacity };
}

export interface GridTileState {
  gridX: number;
  gridY: number;
  type: ConstructorTileType;
}

export interface ConstructorGrid {
  cols: number;
  rows: number;
  cellSizeM: number;
  tiles: Map<string, ConstructorTileType>; // key: `${gridX}_${gridY}`
  elementDetails?: Map<string, { skuId?: string; slotsPerRack?: number; rotationDeg?: number }>;
}

/**
 * Creates key for grid tile coordinate map.
 */
export function getTileKey(gridX: number, gridY: number): string {
  return `${gridX}_${gridY}`;
}

/**
 * Initializes constructor grid based on facility dimensions and chosen tile cell size.
 */
export function createInitialConstructorGrid(
  widthM: number,
  lengthM: number,
  cellSizeM: number = 2.0
): ConstructorGrid {
  const cols = Math.max(2, Math.floor(widthM / cellSizeM));
  const rows = Math.max(2, Math.floor(lengthM / cellSizeM));
  const tiles = new Map<string, ConstructorTileType>();

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const key = getTileKey(x, y);
      tiles.set(key, 'EMPTY_FLOOR');
    }
  }

  return { cols, rows, cellSizeM, tiles };
}

/**
 * Rebuilds FacilityTopology (nodes, passable edges, and functional zones) dynamically from tile grid.
 */
export function rebuildTopologyFromGrid(
  grid: ConstructorGrid,
  widthM: number,
  lengthM: number
): FacilityTopology {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const zones: FacilityZone[] = [];

  const { cols, rows, cellSizeM, tiles } = grid;

  // 1. Map tiles to Graph Nodes (ignoring OBSTACLE and RACK for passage)
  const nodeGrid = new Map<string, GraphNode>();
  let nodeSeq = 1;

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const key = getTileKey(x, y);
      const tileType = tiles.get(key) || 'EMPTY_FLOOR';

      if (tileType === 'OBSTACLE') {
        // Unpassable structural column/wall, create no node
        continue;
      }

      const worldX = Math.round((x + 0.5) * cellSizeM * 10) / 10;
      const worldY = Math.round((y + 0.5) * cellSizeM * 10) / 10;

      let graphNodeType: NodeType = 'WAYPOINT';
      let label: string | undefined = undefined;

      if (tileType === 'DOCK_INBOUND') {
        graphNodeType = 'INBOUND_DOCK';
        label = `Док приемки (${x},${y})`;
      } else if (tileType === 'DOCK_OUTBOUND') {
        graphNodeType = 'OUTBOUND_DOCK';
        label = `Док отгрузки (${x},${y})`;
      } else if (tileType === 'CHARGER') {
        graphNodeType = 'CHARGING_HUB';
        label = `Зарядка (${x},${y})`;
      } else if (tileType === 'RACK') {
        graphNodeType = 'STORAGE_AISLE';
        label = `Стеллаж (${x},${y})`;
      }

      const nodeId = `c_node_${x}_${y}`;
      const node: GraphNode = {
        id: nodeId,
        type: graphNodeType,
        x: worldX,
        y: worldY,
        zLevel: 0,
        label,
      };

      nodes.push(node);
      nodeGrid.set(key, node);
    }
  }

  // 2. Generate edges between orthogonally adjacent passable grid tiles
  let edgeSeq = 1;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const currKey = getTileKey(x, y);
      const currNode = nodeGrid.get(currKey);
      if (!currNode) continue;

      // Right neighbor
      if (x + 1 < cols) {
        const rightKey = getTileKey(x + 1, y);
        const rightNode = nodeGrid.get(rightKey);
        if (rightNode) {
          edges.push({
            id: `c_edge_${edgeSeq++}`,
            source: currNode.id,
            target: rightNode.id,
            distanceM: cellSizeM,
            bidirectional: true,
          });
        }
      }

      // Top/Up neighbor
      if (y + 1 < rows) {
        const topKey = getTileKey(x, y + 1);
        const topNode = nodeGrid.get(topKey);
        if (topNode) {
          edges.push({
            id: `c_edge_${edgeSeq++}`,
            source: currNode.id,
            target: topNode.id,
            distanceM: cellSizeM,
            bidirectional: true,
          });
        }
      }
    }
  }

  // 3. Generate Functional Zones for visual grouping
  zones.push({
    id: 'z_ctor_inbound',
    name: 'Зона приемки (Конструктор)',
    type: 'INBOUND_DOCK',
    x: 0,
    y: 0,
    width: cellSizeM * 1.5,
    height: lengthM,
    color: '#3b82f6',
  });

  zones.push({
    id: 'z_ctor_outbound',
    name: 'Зона отгрузки (Конструктор)',
    type: 'OUTBOUND_DOCK',
    x: widthM - cellSizeM * 1.5,
    y: 0,
    width: cellSizeM * 1.5,
    height: lengthM,
    color: '#0284c7',
  });

  zones.push({
    id: 'z_ctor_charging',
    name: 'Зарядные слоты (Конструктор)',
    type: 'CHARGING_HUB',
    x: cellSizeM * 1.5,
    y: 0,
    width: widthM - cellSizeM * 3,
    height: cellSizeM,
    color: '#f59e0b',
  });

  return { widthM, lengthM, nodes, edges, zones };
}

/**
 * Checks connectivity between essential node types (Inbound, Outbound, Charger).
 * Returns true if any dock/charger is isolated from the rest of the network.
 */
export function checkGraphIsolation(topology: FacilityTopology): boolean {
  const inbound = topology.nodes.filter((n) => n.type === 'INBOUND_DOCK');
  const outbound = topology.nodes.filter((n) => n.type === 'OUTBOUND_DOCK');
  const chargers = topology.nodes.filter((n) => n.type === 'CHARGING_HUB');

  if (inbound.length === 0 || outbound.length === 0) return true;

  const startNode = inbound[0];

  // Build adjacency list for single-pass BFS reachability check
  const adj = new Map<string, string[]>();
  for (const node of topology.nodes) {
    adj.set(node.id, []);
  }

  for (const edge of topology.edges) {
    adj.get(edge.source)?.push(edge.target);
    if (edge.bidirectional) {
      adj.get(edge.target)?.push(edge.source);
    }
  }

  // Single-pass BFS traversal from start node to find all reachable nodes
  const reachable = new Set<string>();
  const queue: string[] = [startNode.id];
  reachable.add(startNode.id);

  let head = 0;
  while (head < queue.length) {
    const currId = queue[head++];
    const neighbors = adj.get(currId);
    if (neighbors) {
      for (const neighborId of neighbors) {
        if (!reachable.has(neighborId)) {
          reachable.add(neighborId);
          queue.push(neighborId);
        }
      }
    }
  }

  // Verify at least one path to every outbound dock
  for (const outDock of outbound) {
    if (!reachable.has(outDock.id)) return true; // Isolated!
  }

  // Verify at least one path to chargers if present
  for (const charger of chargers) {
    if (!reachable.has(charger.id)) return true; // Isolated!
  }

  return false;
}
