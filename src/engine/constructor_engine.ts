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
  inboundBatchVolume: 100,
  outboundIntervalValue: 24,
  outboundIntervalUnit: 'hours',
  outboundBatchVolume: 100,
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

export interface FloorDefinition {
  type: 'RECTANGLE' | 'POLYGON';
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  vertices?: Array<{ x: number; z: number }>;
  areaSqm: number;
}

export interface ConstructorGrid {
  cols: number;
  rows: number;
  cellSizeM: number;
  tiles: Map<string, ConstructorTileType>; // key: `${gridX}_${gridY}`
  elementDetails?: Map<string, { skuId?: string; slotsPerRack?: number; rotationDeg?: number }>;
  floor?: FloorDefinition;
}


export function isInsideFloor(
  gx: number,
  gy: number,
  floor?: FloorDefinition,
  gridTiles?: Map<string, ConstructorTileType>
): boolean {
  if (!gridTiles || gridTiles.size === 0) {
    // На складе нет ни одной плитки пола — монтаж запрещён
    return false;
  }

  const key = getTileKey(gx, gy);
  const tile = gridTiles.get(key);

  // Ячейка считается полом, если там лежит EMPTY_FLOOR или уже смонтирован объект (который стоит на полу)
  return tile !== undefined;
}

  if (!floor) return true;

  if (floor.type === 'RECTANGLE') {
    if (!floor.bounds) return true;
    return (
      gx >= floor.bounds.minX &&
      gx <= floor.bounds.maxX &&
      gy >= floor.bounds.minZ &&
      gy <= floor.bounds.maxZ
    );
  }

  if (floor.type === 'POLYGON') {
    if (!floor.vertices || floor.vertices.length < 3) return true;
    let inside = false;
    const n = floor.vertices.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = floor.vertices[i].x;
      const zi = floor.vertices[i].z;
      const xj = floor.vertices[j].x;
      const zj = floor.vertices[j].z;

      const intersect =
        zi > gy !== zj > gy && gx < ((xj - xi) * (gy - zi)) / (zj - zi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  return true;
}

export interface DebugSnapshotPayload {
  action: string;
  timestamp: number;
  cursor?: { x: number; y: number };
  floor: {
    type: string;
    areaSqm: number;
    bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
    vertices?: Array<{ x: number; z: number }>;
  };
  tilesCount: number;
  elements: Array<{
    key: string;
    type: ConstructorTileType;
    x: number;
    z: number;
    skuId?: string;
    slots?: number;
    rotationDeg?: number;
    inFloor: boolean;
  }>;
  docks: { inbound: number; outbound: number };
  validation: {
    hasOutOfBoundsElements: boolean;
    errors: string[];
  };
  healthCheck: 'HEALTHY' | 'INVALID_LAYOUT';
}

/**
 * Creates a detailed audit debug snapshot payload for layout state.
 */
export function createDebugSnapshotPayload(
  action: string,
  grid: ConstructorGrid,
  cursor?: { x: number; y: number }
): DebugSnapshotPayload {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let floorTileCount = 0;

  grid.tiles.forEach((type, key) => {
    const [xStr, zStr] = key.split('_');
    const gx = parseInt(xStr, 10);
    const gz = parseInt(zStr, 10);
    if (isNaN(gx) || isNaN(gz)) return;

    if (type === 'EMPTY_FLOOR') {
      floorTileCount++;
    }
    if (gx < minX) minX = gx;
    if (gx > maxX) maxX = gx;
    if (gz < minZ) minZ = gz;
    if (gz > maxZ) maxZ = gz;
  });

  const effectiveFloor: FloorDefinition = grid.floor || {
    type: 'RECTANGLE',
    bounds: minX !== Infinity ? { minX, maxX, minZ, maxZ } : { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    areaSqm: Math.round(grid.tiles.size * grid.cellSizeM * grid.cellSizeM),
  };

  const elements: DebugSnapshotPayload['elements'] = [];
  let inboundDocks = 0;
  let outboundDocks = 0;
  let hasOutOfBoundsElements = false;
  const errors: string[] = [];

  grid.tiles.forEach((type, key) => {
    const [xStr, zStr] = key.split('_');
    const gx = parseInt(xStr, 10);
    const gz = parseInt(zStr, 10);
    if (isNaN(gx) || isNaN(gz)) return;

    if (type === 'DOCK_INBOUND') inboundDocks++;
    if (type === 'DOCK_OUTBOUND') outboundDocks++;

    const details = grid.elementDetails?.get(key);
    const inFloor = isInsideFloor(gx, gz, effectiveFloor, grid.tiles);

    if (type !== 'EMPTY_FLOOR' && !inFloor) {
      hasOutOfBoundsElements = true;
      const errorMsg = `🚨 [CRITICAL_FLOOR_VIOLATION]: Element ${type} at (${gx}, ${gz}) is FLOATING IN THE AIR (outside floor bounds)!`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }

    elements.push({
      key,
      type,
      x: gx,
      z: gz,
      skuId: details?.skuId,
      slots: details?.slotsPerRack ?? (type === 'RACK' ? 12 : undefined),
      rotationDeg: details?.rotationDeg ?? 0,
      inFloor,
    });
  });

  const healthCheck = hasOutOfBoundsElements ? 'INVALID_LAYOUT' : 'HEALTHY';

  return {
    action,
    timestamp: Date.now(),
    cursor,
    floor: {
      type: effectiveFloor.type,
      areaSqm: effectiveFloor.areaSqm,
      bounds: effectiveFloor.bounds,
      vertices: effectiveFloor.vertices,
    },
    tilesCount: grid.tiles.size,
    elements,
    docks: { inbound: inboundDocks, outbound: outboundDocks },
    validation: {
      hasOutOfBoundsElements,
      errors,
    },
    healthCheck,
  };
}

/**
 * Fire-and-forget asynchronous emitter for debug snapshots.
 */
export function emitDebugSnapshot(
  action: string,
  grid: ConstructorGrid,
  cursor?: { x: number; y: number }
): void {
  const payload = createDebugSnapshotPayload(action, grid, cursor);
  fetch('/__debug_snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Ignore error silently to prevent UI lag
  });
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

  // Чистый старт: реальный пол равен 0 м², границ нет, пока пользователь не уложил плитки
  const floor: FloorDefinition = {
    type: 'RECTANGLE',
    bounds: undefined,
    areaSqm: 0,
  };

  return { cols, rows, cellSizeM, tiles, floor };
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

  const { cellSizeM, tiles } = grid;

  // 1. Map tiles to Graph Nodes (ignoring OBSTACLE for passage)
  const nodeGrid = new Map<string, GraphNode>();

  tiles.forEach((tileType, key) => {
    if (tileType === 'OBSTACLE') {
      // Unpassable structural column/wall, create no node
      return;
    }

    const [xStr, yStr] = key.split('_');
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    if (isNaN(x) || isNaN(y)) return;

    // В Three.js сетка и пол отцентрированы в начале координат (0, 0)
    const worldX = Math.round(((x + 0.5) * cellSizeM) * 10) / 10;
    const worldY = Math.round(((y + 0.5) * cellSizeM) * 10) / 10;

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
  });

  // 2. Generate edges between orthogonally adjacent passable grid tiles
  let edgeSeq = 1;
  const processedEdges = new Set<string>();

  nodeGrid.forEach((currNode, currKey) => {
    const [xStr, yStr] = currKey.split('_');
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);

    // Right neighbor
    const rightKey = getTileKey(x + 1, y);
    const rightNode = nodeGrid.get(rightKey);
    if (rightNode) {
      const edgeKey = x < x + 1 ? `${currKey}_${rightKey}` : `${rightKey}_${currKey}`;
      if (!processedEdges.has(edgeKey)) {
        processedEdges.add(edgeKey);
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
    const topKey = getTileKey(x, y + 1);
    const topNode = nodeGrid.get(topKey);
    if (topNode) {
      const edgeKey = y < y + 1 ? `${currKey}_${topKey}` : `${topKey}_${currKey}`;
      if (!processedEdges.has(edgeKey)) {
        processedEdges.add(edgeKey);
        edges.push({
          id: `c_edge_${edgeSeq++}`,
          source: currNode.id,
          target: topNode.id,
          distanceM: cellSizeM,
          bidirectional: true,
        });
      }
    }
  });

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

  const obstacles: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];

  // Extract explicit OBSTACLE boxes from grid tiles
  tiles.forEach((tileType, key) => {
    if (tileType === 'OBSTACLE') {
      const [xStr, yStr] = key.split('_');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);
      if (!isNaN(x) && !isNaN(y)) {
        obstacles.push({
          minX: x * cellSizeM,
          maxX: (x + 1) * cellSizeM,
          minY: y * cellSizeM,
          maxY: (y + 1) * cellSizeM,
        });
      }
    }
  });

  return { widthM, lengthM, nodes, edges, zones, obstacles };
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
