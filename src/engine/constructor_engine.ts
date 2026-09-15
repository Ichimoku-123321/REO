import type { FacilityRequirements } from '../types/facility.js';
import type { FacilityTopology, FacilityZone, GraphEdge, GraphNode, NodeType } from '../types/topology.js';
import { findShortestPath } from './simulation_engine.js';

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

  // Verify at least one path to every outbound dock
  for (const outDock of outbound) {
    const path = findShortestPath(topology, startNode.id, outDock.id);
    if (path.length === 0) return true; // Isolated!
  }

  // Verify at least one path to chargers if present
  for (const charger of chargers) {
    const path = findShortestPath(topology, startNode.id, charger.id);
    if (path.length === 0) return true; // Isolated!
  }

  return false;
}
