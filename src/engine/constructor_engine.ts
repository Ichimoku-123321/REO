import type { FacilityRequirements } from '../types/facility.js';
import type { FacilityTopology, FacilityZone, GraphEdge, GraphNode, NodeType } from '../types/topology.js';

export type ConstructorTileType =
  | 'EMPTY_FLOOR'
  | 'RACK'
  | 'OBSTACLE'
  | 'CHARGER'
  | 'DOCK_INBOUND'
  | 'DOCK_OUTBOUND';

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

      // Default layout assignment
      if (x === 0) {
        tiles.set(key, 'DOCK_INBOUND');
      } else if (x === cols - 1) {
        tiles.set(key, 'DOCK_OUTBOUND');
      } else if (y === 0 && x > 1 && x < cols - 2) {
        tiles.set(key, 'CHARGER');
      } else if (x >= 2 && x <= cols - 3 && y >= 2 && y <= rows - 3 && (x % 3 === 0)) {
        tiles.set(key, 'RACK');
      } else {
        tiles.set(key, 'EMPTY_FLOOR');
      }
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

  // 1. Map tiles to Graph Nodes (RACK and OBSTACLE are impassable)
  const nodeGrid = new Map<string, GraphNode>();

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const key = getTileKey(x, y);
      const tileType = tiles.get(key) || 'EMPTY_FLOOR';

      if (tileType === 'OBSTACLE' || tileType === 'RACK') {
        // Unpassable obstacle / rack cell
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

  // 2. Generate 8-way edges between passable grid tiles
  let edgeSeq = 1;
  const isPassable = (gx: number, gy: number) => nodeGrid.has(getTileKey(gx, gy));

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const currKey = getTileKey(x, y);
      const currNode = nodeGrid.get(currKey);
      if (!currNode) continue;

      const dirs = [
        { dx: 1, dy: 0, distFactor: 1.0, isDiag: false },
        { dx: 0, dy: 1, distFactor: 1.0, isDiag: false },
        { dx: 1, dy: 1, distFactor: 1.414, isDiag: true, orth1: [1, 0], orth2: [0, 1] },
        { dx: 1, dy: -1, distFactor: 1.414, isDiag: true, orth1: [1, 0], orth2: [0, -1] },
      ];

      for (const dir of dirs) {
        const nx = x + dir.dx;
        const ny = y + dir.dy;
        if (!isPassable(nx, ny)) continue;

        if (dir.isDiag && dir.orth1 && dir.orth2) {
          if (!isPassable(x + dir.orth1[0], y + dir.orth1[1]) || !isPassable(x + dir.orth2[0], y + dir.orth2[1])) {
            continue;
          }
        }

        const targetNode = nodeGrid.get(getTileKey(nx, ny))!;
        edges.push({
          id: `c_edge_${edgeSeq++}`,
          source: currNode.id,
          target: targetNode.id,
          distanceM: Math.round(cellSizeM * dir.distFactor * 100) / 100,
          bidirectional: true,
        });
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
