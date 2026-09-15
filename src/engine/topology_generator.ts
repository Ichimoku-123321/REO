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
 * Generator for Warehouse topology:
 * - Left side: Inbound docks
 * - Right side: Outbound docks
 * - Center: Storage rack blocks with parallel aisles
 * - Bottom perimeter: Charging hubs
 * - Interconnected main and cross aisles
 */
function generateWarehouseTopology(
  widthM: number,
  lengthM: number,
  aisleWidthM: number
): FacilityTopology {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const zones: FacilityZone[] = [];

  let edgeIdSeq = 1;
  const addEdge = (sourceId: string, targetId: string) => {
    const srcNode = nodes.find((n) => n.id === sourceId);
    const tgtNode = nodes.find((n) => n.id === targetId);
    if (!srcNode || !tgtNode) return;
    const distanceM = dist(srcNode, tgtNode);
    edges.push({
      id: `e_${edgeIdSeq++}`,
      source: sourceId,
      target: targetId,
      distanceM: distanceM || 1,
      bidirectional: true,
    });
  };

  // 1. Zones
  const dockWidth = Math.max(4, Math.round(widthM * 0.15));
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
    color: '#3b82f6', // blue
  });

  zones.push({
    id: 'z_storage',
    name: 'Складская зона (Storage Racks)',
    type: 'STORAGE_AISLE',
    x: dockWidth + 3,
    y: 3,
    width: Math.max(6, storageWidth),
    height: mainHeight,
    color: '#475569', // slate
  });

  zones.push({
    id: 'z_outbound',
    name: 'Зона отгрузки (Outbound Docks)',
    type: 'OUTBOUND_DOCK',
    x: widthM - dockWidth - 1,
    y: 3,
    width: dockWidth,
    height: mainHeight,
    color: '#0284c7', // sky blue
  });

  zones.push({
    id: 'z_charging',
    name: 'Зарядный хаб (Charging Hub)',
    type: 'CHARGING_HUB',
    x: Math.round(widthM / 2 - 8),
    y: 0.5,
    width: 16,
    height: 2,
    color: '#f59e0b', // amber
  });

  // 2. Inbound Docks Nodes
  const numDocks = Math.max(2, Math.min(6, Math.floor(lengthM / 15)));
  const inboundDockNodes: string[] = [];
  for (let i = 0; i < numDocks; i++) {
    const id = `inbound_dock_${i + 1}`;
    const y = Math.round(5 + (i * (lengthM - 10)) / (numDocks - 1 || 1));
    nodes.push({
      id,
      type: 'INBOUND_DOCK',
      x: Math.round(dockWidth / 2 + 1),
      y,
      zLevel: 0,
      label: `Ворота приемки №${i + 1}`,
    });
    inboundDockNodes.push(id);
  }

  // 3. Outbound Docks Nodes
  const outboundDockNodes: string[] = [];
  for (let i = 0; i < numDocks; i++) {
    const id = `outbound_dock_${i + 1}`;
    const y = Math.round(5 + (i * (lengthM - 10)) / (numDocks - 1 || 1));
    nodes.push({
      id,
      type: 'OUTBOUND_DOCK',
      x: Math.round(widthM - dockWidth / 2 - 1),
      y,
      zLevel: 0,
      label: `Ворота отгрузки №${i + 1}`,
    });
    outboundDockNodes.push(id);
  }

  // 4. Charging Hub Nodes
  const numChargers = Math.max(2, Math.min(4, Math.floor(widthM / 10)));
  const chargingNodes: string[] = [];
  for (let i = 0; i < numChargers; i++) {
    const id = `charging_${i + 1}`;
    const x = Math.round(widthM / 2 - 6 + i * 4);
    nodes.push({
      id,
      type: 'CHARGING_HUB',
      x,
      y: 1.5,
      zLevel: 0,
      label: `Зарядная станция №${i + 1}`,
    });
    chargingNodes.push(id);
  }

  // 5. Corridors & Storage Aisles Waypoints
  const leftCorridorX = dockWidth + 1.5;
  const rightCorridorX = widthM - dockWidth - 1.5;
  const effectiveAisleWidth = Math.max(2, aisleWidthM);
  const numAisles = Math.max(2, Math.floor((storageWidth - 2) / (effectiveAisleWidth + 1)));

  // Perimeter corridor nodes along left (inbound) and right (outbound)
  const leftCorridorNodes: string[] = [];
  const rightCorridorNodes: string[] = [];
  const topCrossNodes: string[] = [];
  const bottomCrossNodes: string[] = [];

  // Create grid of cross-aisle waypoints
  const numCrossAisles = 3; // Top, middle, bottom
  const yLevels = [
    4,
    Math.round(lengthM / 2),
    lengthM - 4,
  ];

  yLevels.forEach((y, yIdx) => {
    // Left corridor waypoint
    const wpLeftId = `wp_left_${yIdx}`;
    nodes.push({ id: wpLeftId, type: 'WAYPOINT', x: leftCorridorX, y, zLevel: 0 });
    leftCorridorNodes.push(wpLeftId);

    // Right corridor waypoint
    const wpRightId = `wp_right_${yIdx}`;
    nodes.push({ id: wpRightId, type: 'WAYPOINT', x: rightCorridorX, y, zLevel: 0 });
    rightCorridorNodes.push(wpRightId);

    // Connect left corridor waypoints vertically
    if (yIdx > 0) {
      addEdge(leftCorridorNodes[yIdx - 1], wpLeftId);
      addEdge(rightCorridorNodes[yIdx - 1], wpRightId);
    }
  });

  // Connect Inbound docks to nearest left corridor waypoints
  inboundDockNodes.forEach((dockId) => {
    const dockNode = nodes.find((n) => n.id === dockId)!;
    // Find closest left corridor waypoint
    let closestWp = leftCorridorNodes[0];
    let minD = Infinity;
    leftCorridorNodes.forEach((wpId) => {
      const wpNode = nodes.find((n) => n.id === wpId)!;
      const d = dist(dockNode, wpNode);
      if (d < minD) {
        minD = d;
        closestWp = wpId;
      }
    });
    addEdge(dockId, closestWp);
  });

  // Connect Outbound docks to nearest right corridor waypoints
  outboundDockNodes.forEach((dockId) => {
    const dockNode = nodes.find((n) => n.id === dockId)!;
    let closestWp = rightCorridorNodes[0];
    let minD = Infinity;
    rightCorridorNodes.forEach((wpId) => {
      const wpNode = nodes.find((n) => n.id === wpId)!;
      const d = dist(dockNode, wpNode);
      if (d < minD) {
        minD = d;
        closestWp = wpId;
      }
    });
    addEdge(dockId, closestWp);
  });

  // Storage Aisles & internal waypoints
  const aisleStartX = leftCorridorX + 2;
  const aisleSpacing = (rightCorridorX - leftCorridorX - 4) / Math.max(1, numAisles - 1);

  for (let a = 0; a < numAisles; a++) {
    const aisleX = Math.round(aisleStartX + a * aisleSpacing);

    // Top, middle, bottom storage aisle nodes
    yLevels.forEach((y, yIdx) => {
      const aisleNodeId = `storage_aisle_${a + 1}_${yIdx}`;
      nodes.push({
        id: aisleNodeId,
        type: 'STORAGE_AISLE',
        x: aisleX,
        y,
        zLevel: 0,
        label: `Аллея стеллажей А${a + 1}-${yIdx + 1}`,
      });

      // Connect along the aisle vertically
      if (yIdx > 0) {
        addEdge(`storage_aisle_${a + 1}_${yIdx - 1}`, aisleNodeId);
      }

      // Connect cross-aisle horizontally to adjacent aisles or perimeter corridors
      if (a === 0) {
        addEdge(leftCorridorNodes[yIdx], aisleNodeId);
      } else {
        addEdge(`storage_aisle_${a}_${yIdx}`, aisleNodeId);
      }

      if (a === numAisles - 1) {
        addEdge(aisleNodeId, rightCorridorNodes[yIdx]);
      }
    });
  }

  // Charging hub connections to bottom corridor
  const bottomChargingWpId = `wp_charging_main`;
  nodes.push({
    id: bottomChargingWpId,
    type: 'WAYPOINT',
    x: Math.round(widthM / 2),
    y: 3,
    zLevel: 0,
  });

  // Connect charging nodes to bottom charging waypoint
  chargingNodes.forEach((cId) => addEdge(cId, bottomChargingWpId));
  // Connect bottom charging waypoint to left & right bottom corridor nodes
  addEdge(bottomChargingWpId, leftCorridorNodes[0]);
  addEdge(bottomChargingWpId, rightCorridorNodes[0]);

  return { widthM, lengthM, nodes, edges, zones };
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
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const zones: FacilityZone[] = [];

  let edgeIdSeq = 1;
  const addEdge = (sourceId: string, targetId: string) => {
    const srcNode = nodes.find((n) => n.id === sourceId);
    const tgtNode = nodes.find((n) => n.id === targetId);
    if (!srcNode || !tgtNode) return;
    const distanceM = dist(srcNode, tgtNode);
    edges.push({
      id: `e_${edgeIdSeq++}`,
      source: sourceId,
      target: targetId,
      distanceM: distanceM || 1,
      bidirectional: true,
    });
  };

  // Zones
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
    height: lengthM - 18,
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
    height: Math.min(12, lengthM - 20),
    color: '#f59e0b',
  });

  // Nodes
  // Inbound docks (Luggage Intake)
  const intakeNode1 = 'airport_intake_1';
  const intakeNode2 = 'airport_intake_2';
  nodes.push(
    { id: intakeNode1, type: 'INBOUND_DOCK', x: Math.round(widthM * 0.3), y: 5, zLevel: 0, label: 'Терминал A' },
    { id: intakeNode2, type: 'INBOUND_DOCK', x: Math.round(widthM * 0.7), y: 5, zLevel: 0, label: 'Терминал B' }
  );

  // Outbound docks (Apron Docks)
  const apronNode1 = 'airport_apron_1';
  const apronNode2 = 'airport_apron_2';
  nodes.push(
    { id: apronNode1, type: 'OUTBOUND_DOCK', x: Math.round(widthM * 0.3), y: lengthM - 4, zLevel: 0, label: 'Стоянка Гейт 1' },
    { id: apronNode2, type: 'OUTBOUND_DOCK', x: Math.round(widthM * 0.7), y: lengthM - 4, zLevel: 0, label: 'Стоянка Гейт 2' }
  );

  // Charging hub
  const chargerNode1 = 'airport_charge_1';
  nodes.push({ id: chargerNode1, type: 'CHARGING_HUB', x: 5, y: 15, zLevel: 0, label: 'Зарядная станция Перрон' });

  // Terminal Transit Corridor Waypoints
  const transitStepCount = Math.max(3, Math.floor(lengthM / 15));
  const transitWaypoints: string[] = [];

  for (let i = 0; i < transitStepCount; i++) {
    const wpId = `wp_airport_transit_${i}`;
    const y = Math.round(8 + (i * (lengthM - 16)) / (transitStepCount - 1 || 1));
    nodes.push({
      id: wpId,
      type: 'WAYPOINT',
      x: Math.round(widthM / 2),
      y,
      zLevel: 0,
      label: `Транзитный узел T${i + 1}`,
    });
    transitWaypoints.push(wpId);

    if (i > 0) {
      addEdge(transitWaypoints[i - 1], wpId);
    }
  }

  // Connect Docks and Charger to Transit Spine
  addEdge(intakeNode1, transitWaypoints[0]);
  addEdge(intakeNode2, transitWaypoints[0]);

  const lastWp = transitWaypoints[transitWaypoints.length - 1];
  addEdge(apronNode1, lastWp);
  addEdge(apronNode2, lastWp);

  const midWp = transitWaypoints[Math.floor(transitWaypoints.length / 2)];
  addEdge(chargerNode1, midWp);

  return { widthM, lengthM, nodes, edges, zones };
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
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const zones: FacilityZone[] = [];

  let edgeIdSeq = 1;
  const addEdge = (sourceId: string, targetId: string) => {
    const srcNode = nodes.find((n) => n.id === sourceId);
    const tgtNode = nodes.find((n) => n.id === targetId);
    if (!srcNode || !tgtNode) return;
    const distanceM = dist(srcNode, tgtNode);
    edges.push({
      id: `e_${edgeIdSeq++}`,
      source: sourceId,
      target: targetId,
      distanceM: distanceM || 1,
      bidirectional: true,
    });
  };

  const centerX = Math.round(widthM / 2);
  const centerY = Math.round(lengthM / 2);

  // Zones
  zones.push({
    id: 'z_pharmacy',
    name: 'Центральный фармацевтический склад (Depot)',
    type: 'INBOUND_DOCK',
    x: centerX - 8,
    y: centerY - 4,
    width: 16,
    height: 8,
    color: '#3b82f6',
  });

  zones.push({
    id: 'z_wing_left',
    name: 'Отделение хирургии (Left Wing)',
    type: 'OUTBOUND_DOCK',
    x: 2,
    y: 4,
    width: Math.max(6, Math.round(widthM * 0.3)),
    height: lengthM - 8,
    color: '#0284c7',
  });

  zones.push({
    id: 'z_wing_right',
    name: 'Терапевтическое отделение (Right Wing)',
    type: 'OUTBOUND_DOCK',
    x: widthM - Math.max(6, Math.round(widthM * 0.3)) - 2,
    y: 4,
    width: Math.max(6, Math.round(widthM * 0.3)),
    height: lengthM - 8,
    color: '#0284c7',
  });

  zones.push({
    id: 'z_charging_hosp',
    name: 'Зарядный блок (Charging Hub)',
    type: 'CHARGING_HUB',
    x: centerX - 6,
    y: 1,
    width: 12,
    height: 3,
    color: '#f59e0b',
  });

  // Nodes
  // Central Depot (Inbound)
  const depotNode = 'hosp_depot_main';
  nodes.push({
    id: depotNode,
    type: 'INBOUND_DOCK',
    x: centerX,
    y: centerY,
    zLevel: 0,
    label: 'Главный фармсклад',
  });

  // Department Docks (Outbound Delivery Destinations)
  const wingLeftNode = 'hosp_wing_left';
  const wingRightNode = 'hosp_wing_right';
  nodes.push(
    {
      id: wingLeftNode,
      type: 'OUTBOUND_DOCK',
      x: Math.round(widthM * 0.15),
      y: centerY,
      zLevel: 0,
      label: 'Пост хирургии №1',
    },
    {
      id: wingRightNode,
      type: 'OUTBOUND_DOCK',
      x: Math.round(widthM * 0.85),
      y: centerY,
      zLevel: 0,
      label: 'Пост терапии №2',
    }
  );

  // Charging Station Node
  const hospCharger = 'hosp_charger_1';
  nodes.push({
    id: hospCharger,
    type: 'CHARGING_HUB',
    x: centerX,
    y: 2.5,
    zLevel: 0,
    label: 'Зарядный отсек',
  });

  // Central Corridor Waypoints
  const wpCenter = 'wp_hosp_center';
  const wpNorth = 'wp_hosp_north';
  const wpSouth = 'wp_hosp_south';
  const wpWest = 'wp_hosp_west';
  const wpEast = 'wp_hosp_east';

  nodes.push(
    { id: wpCenter, type: 'WAYPOINT', x: centerX, y: centerY - 5, zLevel: 0 },
    { id: wpNorth, type: 'WAYPOINT', x: centerX, y: 5, zLevel: 0 },
    { id: wpSouth, type: 'WAYPOINT', x: centerX, y: lengthM - 5, zLevel: 0 },
    { id: wpWest, type: 'WAYPOINT', x: Math.round(widthM * 0.25), y: centerY, zLevel: 0 },
    { id: wpEast, type: 'WAYPOINT', x: Math.round(widthM * 0.75), y: centerY, zLevel: 0 }
  );

  // Connect Spine
  addEdge(depotNode, wpCenter);
  addEdge(wpCenter, wpNorth);
  addEdge(wpCenter, wpSouth);

  addEdge(depotNode, wpWest);
  addEdge(wpWest, wingLeftNode);

  addEdge(depotNode, wpEast);
  addEdge(wpEast, wingRightNode);

  addEdge(hospCharger, wpNorth);

  return { widthM, lengthM, nodes, edges, zones };
}
