import type { FacilityTopology, GraphEdge, GraphNode } from '../types/topology.js';
import type { Robot } from '../types/robot.js';
import type { FleetCompositionItem } from './fleet_optimizer.js';

export type AgentFSMState =
  | 'IDLE'
  | 'MOVING_TO_PICKUP'
  | 'LOADING'
  | 'TRANSPORTING'
  | 'UNLOADING'
  | 'MOVING_TO_CHARGE'
  | 'CHARGING';

export interface AgentSnapshot {
  id: string;
  x: number;
  y: number;
  headingRad: number;
  state: AgentFSMState;
  batterySoc: number;
  cargoPayload: boolean;
  isQueued: boolean;
  isDeadlocked: boolean;
  speedMps: number;
}

export interface RunSimulationOptions {
  targetHourlyQuota: number;     // целевой грузопоток (шт/ч)
  durationHours?: number;         // время работы (от 1 до 72 часов, по дефолту 1.0)
  recordReplay?: boolean;         // сохранять ли кадры в память
  targetReplayFramesCount?: number; // желаемое кол-во кадров в буфере (по дефолту 7200)
}

export interface ExtendedSimulationResult {
  durationHours: number;
  simulatedSeconds: number;
  totalTicks: number;
  targetHourlyQuota: number;
  totalTargetQuota: number;        // targetHourlyQuota * durationHours
  totalDelivered: number;          // фактически доставлено
  realizedThroughputPerHour: number;
  quotaFulfillmentPercent: number; // (totalDelivered / totalTargetQuota) * 100
  trafficCongestionFactor: number; // eta_traffic = realized / theoretical
  averageIdleTimePercent: number;
  deadlocksDetected: number;
  deliveriesByRobotType: Record<string, number>;
}

export interface SimulationReplayFrame {
  timestampSec: number; // от 0 до 3600 с
  agents: AgentSnapshot[];
  events?: Array<'PICKUP' | 'DROPOFF' | 'CHARGE_START' | 'CHARGE_END' | 'BRAKE'>;
}

export interface AgentState {
  id: string;
  state: AgentFSMState;
  x: number;
  y: number;
  z: number;
  headingRad: number;
  batterySoc: number; // 0 to 100
  cargoPayload: boolean;
  isQueued: boolean;
  timerSeconds: number;

  // Physical & Battery TTX
  robotSpec: Robot;
  robotRadius: number;
  maxSpeed: number;
  payloadKg: number;
  batteryCapacityHours: number;
  chargeRatePerSec: number;
  dischargeRatePerSec: number;

  // Navigation
  currentNodeId: string;
  targetNodeId: string | null;
  pathNodeIds: string[];
  currentEdgeId: string | null;
  edgeProgressM: number;
  edgeDistanceM: number;

  // Assigned Destinations
  assignedInboundNodeId: string | null;
  assignedDeliveryNodeId: string | null;
  assignedChargerNodeId: string | null;
}

export interface OneHourSimulationResult {
  simulatedSeconds: number; // 3600
  totalTicks: number; // 7200
  targetThroughputPerHour: number;
  realizedThroughputPerHour: number;
  trafficCongestionFactor: number; // eta_traffic = realized / theoretical (<= 1.0)
  deliveriesByRobotType: Record<string, number>;
  averageIdleTimePercent: number; // средний % времени простоя в заторах/очередях
  deadlocksDetected: number;
}

export interface SimulationTelemetry {
  elapsedSimSeconds: number;
  completedDeliveries: number;
  realizedThroughputPerHour: number;
  fleetUtilizationPercent: number;
  activeInTransitCount: number;
  chargingCount: number;
  queuedCount: number;
  congestionDetected: boolean;
  congestionNodeLabel: string | null;
  isCalibrating: boolean;
}

export interface ObstacleBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Liang-Barsky algorithm for 2D line segment to AABB intersection check.
 */
export function lineIntersectsAABB(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: ObstacleBox
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;

  const p = [-dx, dx, -dy, dy];
  const q = [x1 - box.minX, box.maxX - x1, y1 - box.minY, box.maxY - y1];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}

/**
 * Shortest path algorithm (Dijkstra) over FacilityTopology graph.
 */
export function findShortestPath(
  topology: FacilityTopology,
  startNodeId: string,
  targetNodeId: string
): string[] {
  if (startNodeId === targetNodeId) return [startNodeId];

  const nodeMap = new Map<string, GraphNode>(topology.nodes.map((n) => [n.id, n]));
  if (!nodeMap.has(startNodeId) || !nodeMap.has(targetNodeId)) return [];

  const adj = new Map<string, Array<{ target: string; distance: number }>>();
  topology.nodes.forEach((n) => adj.set(n.id, []));

  topology.edges.forEach((e) => {
    adj.get(e.source)?.push({ target: e.target, distance: e.distanceM });
    if (e.bidirectional) {
      adj.get(e.target)?.push({ target: e.source, distance: e.distanceM });
    }
  });

  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const unvisited = new Set<string>();

  topology.nodes.forEach((n) => {
    distances.set(n.id, Infinity);
    previous.set(n.id, null);
    unvisited.add(n.id);
  });

  distances.set(startNodeId, 0);

  while (unvisited.size > 0) {
    let current: string | null = null;
    let minD = Infinity;

    unvisited.forEach((id) => {
      const d = distances.get(id)!;
      if (d < minD) {
        minD = d;
        current = id;
      }
    });

    if (current === null || minD === Infinity) break;
    if (current === targetNodeId) break;

    unvisited.delete(current);

    const neighbors = adj.get(current) || [];
    for (const edge of neighbors) {
      if (!unvisited.has(edge.target)) continue;
      const alt = minD + edge.distance;
      if (alt < distances.get(edge.target)!) {
        distances.set(edge.target, alt);
        previous.set(edge.target, current);
      }
    }
  }

  const path: string[] = [];
  let curr: string | null = targetNodeId;

  if (distances.get(targetNodeId) === Infinity) return [];

  while (curr !== null) {
    path.unshift(curr);
    curr = previous.get(curr) || null;
  }

  return path;
}

function calculateRobotRadius(robotSpec: Robot): number {
  const robotWidth = (robotSpec.dimensionsMm?.width ?? 800) / 1000;
  const robotLength = (robotSpec.dimensionsMm?.length ?? 1000) / 1000;
  return Math.max(0.4, Math.hypot(robotWidth, robotLength) / 2 + 0.1);
}

export class SimulationEngine {
  private topology: FacilityTopology;
  private fleetConfig: Robot | FleetCompositionItem[];
  private legacyFleetSize: number;

  public agents: AgentState[] = [];
  public replayFrames: SimulationReplayFrame[] = [];
  public elapsedSimSeconds: number = 0;
  public completedDeliveries: number = 0;
  public deliveriesByRobotType: Record<string, number> = {};
  public robotRadius: number;

  // Key node caches and O(1) map
  private nodeMap: Map<string, GraphNode> = new Map();
  private nodeIndexMap: Map<string, number> = new Map();
  private adjMap: Map<string, Array<{ target: string; distance: number }>> = new Map();

  // Reusable Dijkstra arrays
  private dijkstraDist: Float64Array = new Float64Array(0);
  private dijkstraPrev: Int32Array = new Int32Array(0);
  private dijkstraVisited: Uint8Array = new Uint8Array(0);
  private inboundNodes: GraphNode[] = [];
  private outboundNodes: GraphNode[] = [];
  private storageNodes: GraphNode[] = [];
  private chargingNodes: GraphNode[] = [];
  private waypointNodes: GraphNode[] = [];
  public obstacleBoxes: ObstacleBox[] = [];

  constructor(
    topology: FacilityTopology,
    fleetConfig: Robot | FleetCompositionItem[],
    legacyFleetSize?: number
  ) {
    this.topology = topology;
    this.fleetConfig = fleetConfig;
    this.legacyFleetSize = legacyFleetSize ?? 0;

    const primaryRobot = Array.isArray(fleetConfig)
      ? (fleetConfig[0]?.robot ?? null)
      : fleetConfig;

    if (primaryRobot) {
      this.robotRadius = calculateRobotRadius(primaryRobot);
    } else {
      this.robotRadius = 0.5;
    }

    this.classifyNodes();
    this.extractObstacleBoxes();
    this.initializeFleet();
  }

  public get fleetSize(): number {
    if (Array.isArray(this.fleetConfig)) {
      return this.fleetConfig.reduce((sum, item) => sum + item.count, 0);
    }
    return Math.max(0, this.legacyFleetSize);
  }

  private classifyNodes(): void {
    const nodes = this.topology.nodes;
    this.nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]));
    this.nodeIndexMap = new Map<string, number>();
    for (let i = 0; i < nodes.length; i++) {
      this.nodeIndexMap.set(nodes[i].id, i);
    }

    this.adjMap = new Map();
    nodes.forEach((n) => this.adjMap.set(n.id, []));
    this.topology.edges.forEach((e) => {
      this.adjMap.get(e.source)?.push({ target: e.target, distance: e.distanceM });
      if (e.bidirectional) {
        this.adjMap.get(e.target)?.push({ target: e.source, distance: e.distanceM });
      }
    });

    const numNodes = nodes.length;
    this.dijkstraDist = new Float64Array(numNodes);
    this.dijkstraPrev = new Int32Array(numNodes);
    this.dijkstraVisited = new Uint8Array(numNodes);

    this.inboundNodes = nodes.filter((n) => n.type === 'INBOUND_DOCK');
    this.outboundNodes = nodes.filter((n) => n.type === 'OUTBOUND_DOCK');
    this.storageNodes = nodes.filter((n) => n.type === 'STORAGE_AISLE');
    this.chargingNodes = nodes.filter((n) => n.type === 'CHARGING_HUB');
    this.waypointNodes = nodes.filter((n) => n.type === 'WAYPOINT');
  }

  private getShortestPath(startNodeId: string, targetNodeId: string): string[] {
    if (startNodeId === targetNodeId) return [startNodeId];
    const startIdx = this.nodeIndexMap.get(startNodeId);
    const targetIdx = this.nodeIndexMap.get(targetNodeId);
    if (startIdx === undefined || targetIdx === undefined) return [];

    const nodes = this.topology.nodes;
    const numNodes = nodes.length;

    this.dijkstraDist.fill(Infinity);
    this.dijkstraPrev.fill(-1);
    this.dijkstraVisited.fill(0);

    this.dijkstraDist[startIdx] = 0;

    for (let step = 0; step < numNodes; step++) {
      let u = -1;
      let minD = Infinity;

      for (let i = 0; i < numNodes; i++) {
        if (!this.dijkstraVisited[i] && this.dijkstraDist[i] < minD) {
          minD = this.dijkstraDist[i];
          u = i;
        }
      }

      if (u === -1 || minD === Infinity) break;
      if (u === targetIdx) break;

      this.dijkstraVisited[u] = 1;

      const neighbors = this.adjMap.get(nodes[u].id) || [];
      for (let k = 0; k < neighbors.length; k++) {
        const edge = neighbors[k];
        const v = this.nodeIndexMap.get(edge.target);
        if (v !== undefined && !this.dijkstraVisited[v]) {
          const alt = minD + edge.distance;
          if (alt < this.dijkstraDist[v]) {
            this.dijkstraDist[v] = alt;
            this.dijkstraPrev[v] = u;
          }
        }
      }
    }

    if (this.dijkstraDist[targetIdx] === Infinity) return [];

    const path: string[] = [];
    let curr = targetIdx;
    while (curr !== -1) {
      path.push(nodes[curr].id);
      if (curr === startIdx) break;
      curr = this.dijkstraPrev[curr];
    }
    path.reverse();
    return path;
  }

  /**
   * Extracts static obstacle bounding boxes from facility topology,
   * matching 3D rack geometry dimensions from SimulationViewport.
   */
  private extractObstacleBoxes(): void {
    this.obstacleBoxes = [];

    this.topology.zones.forEach((zone) => {
      if (zone.type === 'STORAGE_AISLE') {
        const isVertical = zone.height > zone.width * 1.2;

        if (isVertical) {
          const rackCols = 4;
          const colWidth = Math.max(0.1, (zone.width - 2) / rackCols);
          for (let c = 0; c < rackCols; c++) {
            const minX = zone.x + 1 + c * colWidth;
            const maxX = minX + colWidth * 0.6;
            const minY = zone.y + 1;
            const maxY = zone.y + zone.height - 1;
            this.obstacleBoxes.push({ minX, maxX, minY, maxY });
          }
        } else {
          const rackRows = 4;
          const rowHeight = Math.max(0.1, (zone.height - 2) / rackRows);
          for (let r = 0; r < rackRows; r++) {
            const minX = zone.x + 1;
            const maxX = zone.x + zone.width - 1;
            const minY = zone.y + 1 + r * rowHeight;
            const maxY = minY + rowHeight * 0.6;
            this.obstacleBoxes.push({ minX, maxX, minY, maxY });
          }
        }
      }
    });
  }

  /**
   * Line-of-sight raycast check between two 2D points against static obstacles,
   * taking into account the robot's physical collision radius (Minkowski sum expansion).
   */
  public hasLineOfSight(x1: number, y1: number, x2: number, y2: number, radius: number = this.robotRadius): boolean {
    const numBoxes = this.obstacleBoxes.length;
    const dx = x2 - x1;
    const dy = y2 - y1;

    for (let k = 0; k < numBoxes; k++) {
      const box = this.obstacleBoxes[k];
      const minX = box.minX - radius;
      const maxX = box.maxX + radius;
      const minY = box.minY - radius;
      const maxY = box.maxY + radius;

      if ((x1 < minX && x2 < minX) || (x1 > maxX && x2 > maxX)) continue;
      if ((y1 < minY && y2 < minY) || (y1 > maxY && y2 > maxY)) continue;

      let t0 = 0;
      let t1 = 1;

      if (dx === 0) {
        if (x1 < minX || x1 > maxX) continue;
      } else {
        let r0 = (minX - x1) / dx;
        let r1 = (maxX - x1) / dx;
        if (r0 > r1) { const tmp = r0; r0 = r1; r1 = tmp; }
        if (r0 > t0) t0 = r0;
        if (r1 < t1) t1 = r1;
        if (t0 > t1) continue;
      }

      if (dy === 0) {
        if (y1 < minY || y1 > maxY) continue;
      } else {
        let r0 = (minY - y1) / dy;
        let r1 = (maxY - y1) / dy;
        if (r0 > r1) { const tmp = r0; r0 = r1; r1 = tmp; }
        if (r0 > t0) t0 = r0;
        if (r1 < t1) t1 = r1;
        if (t0 > t1) continue;
      }

      if (t0 <= t1 && t1 >= 0 && t0 <= 1) {
        return false;
      }
    }
    return true;
  }

  /**
   * Initializes or resets fleet agents staggering spawn points.
   */
  public initializeFleet(): void {
    this.agents = [];
    this.replayFrames = [];
    this.elapsedSimSeconds = 0;
    this.completedDeliveries = 0;
    this.deliveriesByRobotType = {};

    const totalFleetSize = this.fleetSize;
    if (totalFleetSize === 0 || this.topology.nodes.length === 0) return;

    const spawnCandidates = [
      ...this.inboundNodes,
      ...this.chargingNodes,
      ...this.waypointNodes,
      ...this.outboundNodes,
      ...this.storageNodes,
    ];

    const fleetItems: Array<{ robot: Robot }> = [];
    if (Array.isArray(this.fleetConfig)) {
      for (const item of this.fleetConfig) {
        if (item.robot && item.robot.id) {
          this.deliveriesByRobotType[item.robot.id] = 0;
        }
        for (let k = 0; k < item.count; k++) {
          fleetItems.push({ robot: item.robot });
        }
      }
    } else if (this.fleetConfig) {
      if (this.fleetConfig.id) {
        this.deliveriesByRobotType[this.fleetConfig.id] = 0;
      }
      for (let k = 0; k < this.legacyFleetSize; k++) {
        fleetItems.push({ robot: this.fleetConfig });
      }
    }

    for (let i = 0; i < fleetItems.length; i++) {
      const robotSpec = fleetItems[i].robot;
      const spawnNode = spawnCandidates[i % spawnCandidates.length] || this.topology.nodes[0];
      const initialSoc = 60 + ((i * 17) % 41);

      const robotRadius = calculateRobotRadius(robotSpec);
      const maxSpeed = Math.max(0.5, robotSpec.maxSpeedMps);
      const payloadKg = robotSpec.payloadKg ?? 0;
      const batteryCapacityHours = Math.max(1, robotSpec.batteryRuntimeHours);
      const runtimeSec = batteryCapacityHours * 3600;
      const chargeSec = Math.max(1, robotSpec.batteryChargeMinutes) * 60;
      const dischargeRatePerSec = 100 / runtimeSec;
      const chargeRatePerSec = 100 / chargeSec;

      const agent: AgentState = {
        id: `agent_${i + 1}`,
        state: 'IDLE',
        x: spawnNode.x,
        y: spawnNode.y,
        z: 0,
        headingRad: 0,
        batterySoc: initialSoc,
        cargoPayload: false,
        isQueued: false,
        timerSeconds: 0,

        robotSpec,
        robotRadius,
        maxSpeed,
        payloadKg,
        batteryCapacityHours,
        chargeRatePerSec,
        dischargeRatePerSec,

        currentNodeId: spawnNode.id,
        targetNodeId: null,
        pathNodeIds: [],
        currentEdgeId: null,
        edgeProgressM: 0,
        edgeDistanceM: 0,

        assignedInboundNodeId: null,
        assignedDeliveryNodeId: null,
        assignedChargerNodeId: null,
      };

      this.agents.push(agent);
    }
  }

  /**
   * Selects furthest node in agent's path with direct Line-of-Sight.
   */
  private selectLookaheadTarget(agent: AgentState): GraphNode | null {
    const pathLen = agent.pathNodeIds.length;
    if (pathLen === 0) return null;

    const maxLookahead = Math.min(pathLen, 3);
    for (let i = maxLookahead - 1; i >= 0; i--) {
      const nodeId = agent.pathNodeIds[i];
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;

      if (this.hasLineOfSight(agent.x, agent.y, node.x, node.y, agent.robotRadius)) {
        if (i > 0) {
          agent.pathNodeIds.splice(0, i);
        }
        return node;
      }
    }

    const firstId = agent.pathNodeIds[0];
    return this.nodeMap.get(firstId) || null;
  }

  /**
   * Advances simulation by dtSim seconds using Continuous 360 Vector Field Steering.
   */
  public update(dtSim: number): void {
    if (this.agents.length === 0) return;

    this.elapsedSimSeconds += dtSim;

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];

      switch (agent.state) {
        case 'IDLE': {
          if (agent.batterySoc < 20 && this.chargingNodes.length > 0) {
            const charger = this.findClosestNode(agent.currentNodeId, this.chargingNodes);
            if (charger) {
              agent.assignedChargerNodeId = charger.id;
              agent.pathNodeIds = this.getShortestPath(agent.currentNodeId, charger.id);
              if (agent.pathNodeIds.length > 1) {
                agent.pathNodeIds.shift();
                agent.targetNodeId = agent.pathNodeIds[0];
                agent.state = 'MOVING_TO_CHARGE';
              }
            }
          } else if (this.inboundNodes.length > 0) {
            const pickupNode = this.inboundNodes[i % this.inboundNodes.length];
            agent.assignedInboundNodeId = pickupNode.id;
            agent.pathNodeIds = this.getShortestPath(agent.currentNodeId, pickupNode.id);

            if (agent.pathNodeIds.length > 1) {
              agent.pathNodeIds.shift();
              agent.targetNodeId = agent.pathNodeIds[0];
              agent.state = 'MOVING_TO_PICKUP';
            } else {
              agent.state = 'LOADING';
              agent.timerSeconds = 2.5;
            }
          }
          break;
        }

        case 'MOVING_TO_PICKUP':
        case 'TRANSPORTING':
        case 'MOVING_TO_CHARGE': {
          agent.batterySoc = Math.max(0, agent.batterySoc - agent.dischargeRatePerSec * dtSim);

          let targetNode = agent.targetNodeId ? this.nodeMap.get(agent.targetNodeId) || null : null;
          if (!targetNode || agent.pathNodeIds.length === 0) {
            targetNode = this.selectLookaheadTarget(agent);
            if (!targetNode) {
              this.handleArrival(agent);
              break;
            }
            agent.targetNodeId = targetNode.id;
          }

          // 1. Attractive Goal Force (F_att, w_att = 1.0)
          const dx = targetNode.x - agent.x;
          const dy = targetNode.y - agent.y;
          const distToTarget = Math.hypot(dx, dy);

          const arrivalThreshold = Math.max(0.85, agent.robotRadius + 0.15);
          if (distToTarget <= arrivalThreshold) {
            agent.currentNodeId = targetNode.id;
            agent.pathNodeIds.shift();

            if (agent.pathNodeIds.length === 0) {
              agent.targetNodeId = null;
              this.handleArrival(agent);
              break;
            } else {
              targetNode = this.selectLookaheadTarget(agent);
              if (!targetNode) {
                this.handleArrival(agent);
                break;
              }
              agent.targetNodeId = targetNode.id;
            }
          }

          let fAttX = distToTarget > 0.001 ? dx / distToTarget : 0;
          let fAttY = distToTarget > 0.001 ? dy / distToTarget : 0;

          // 2. Static Obstacle Repulsion & Tangential Wall Sliding (w_obs = 1.6, d_safe = 1.2m)
          let fObsX = 0;
          let fObsY = 0;
          const dSafe = 1.2;

          for (const box of this.obstacleBoxes) {
            let cx = Math.max(box.minX, Math.min(agent.x, box.maxX));
            let cy = Math.max(box.minY, Math.min(agent.y, box.maxY));
            const dxObs = agent.x - cx;
            const dyObs = agent.y - cy;
            const dObsSq = dxObs * dxObs + dyObs * dyObs;

            if (dObsSq >= 1.44) { // dSafe = 1.2 => dSafeSq = 1.44
              continue;
            }

            let dObs = Math.sqrt(dObsSq);

            // Hard Boundary Push-out if robot penetrated physical collision buffer
            if (dObs < agent.robotRadius) {
              let nx = 1;
              let ny = 0;
              if (dObs >= 0.001) {
                nx = dxObs / dObs;
                ny = dyObs / dObs;
              }
              const pushDist = agent.robotRadius + 0.05;
              agent.x = cx + nx * pushDist;
              agent.y = cy + ny * pushDist;

              // Recalculate closest point and distance after push-out
              cx = Math.max(box.minX, Math.min(agent.x, box.maxX));
              cy = Math.max(box.minY, Math.min(agent.y, box.maxY));
              dObs = Math.hypot(agent.x - cx, agent.y - cy);
            }

            if (dObs < dSafe) {
              const nx = dObs > 0.001 ? (agent.x - cx) / dObs : 1;
              const ny = dObs > 0.001 ? (agent.y - cy) / dObs : 0;
              const fMag = Math.min(8.0, Math.pow(1 / Math.max(0.2, dObs) - 1 / dSafe, 2));

              // Tangential sliding: cancel inward goal force component
              const dot = fAttX * nx + fAttY * ny;
              if (dot < 0) {
                fAttX -= dot * nx;
                fAttY -= dot * ny;
              }

              fObsX += fMag * nx;
              fObsY += fMag * ny;
            }
          }

          // 3. Dynamic Inter-Robot Avoidance & Minkowski Sum Repulsion
          let fAvoidX = 0;
          let fAvoidY = 0;
          let nearbyRobotCount = 0;

          const headCos = Math.cos(agent.headingRad);
          const headSin = Math.sin(agent.headingRad);
          const vRightX = headSin;
          const vRightY = -headCos;

          for (let j = 0; j < this.agents.length; j++) {
            if (i === j) continue;
            const other = this.agents[j];
            const rSum = agent.robotRadius + other.robotRadius;
            const dDetect = rSum + 0.5;
            const dxOther = agent.x - other.x;
            const dyOther = agent.y - other.y;
            const distOtherSq = dxOther * dxOther + dyOther * dyOther;

            if (distOtherSq < dDetect * dDetect && distOtherSq > 0.000001) {
              const distOther = Math.sqrt(distOtherSq);
              nearbyRobotCount++;
              const uAwayX = dxOther / distOther;
              const uAwayY = dyOther / distOther;

              const otherCos = Math.cos(other.headingRad);
              const otherSin = Math.sin(other.headingRad);
              const dotHeadings = headCos * otherCos + headSin * otherSin;
              const approachSpeed = -(uAwayX * headCos + uAwayY * headSin);

              const factor = (dDetect - distOther) / 0.5;
              fAvoidX += factor * uAwayX * 1.0;
              fAvoidY += factor * uAwayY * 1.0;

              if (dotHeadings < -0.2 && approachSpeed > 0) {
                fAvoidX += factor * vRightX * 1.2;
                fAvoidY += factor * vRightY * 1.2;
              }
            }
          }

          agent.isQueued = nearbyRobotCount >= 2;

          // 4. Combine Forces with Weighting Factors
          const fTotalX = 1.0 * fAttX + 1.6 * fObsX + 1.3 * fAvoidX;
          const fTotalY = 1.0 * fAttY + 1.6 * fObsY + 1.3 * fAvoidY;
          const fTotalLen = Math.hypot(fTotalX, fTotalY);

          let vx = 0;
          let vy = 0;

          if (fTotalLen > 0.001) {
            vx = agent.maxSpeed * (fTotalX / fTotalLen);
            vy = agent.maxSpeed * (fTotalY / fTotalLen);
          }

          // Cancel inward velocity component directed toward obstacle interiors
          for (const box of this.obstacleBoxes) {
            const cx = Math.max(box.minX, Math.min(agent.x, box.maxX));
            const cy = Math.max(box.minY, Math.min(agent.y, box.maxY));
            const dObs = Math.hypot(agent.x - cx, agent.y - cy);
            if (dObs < agent.robotRadius + 0.06) {
              const nx = dObs >= 0.001 ? (agent.x - cx) / dObs : 1;
              const ny = dObs >= 0.001 ? (agent.y - cy) / dObs : 0;
              const vDotN = vx * nx + vy * ny;
              if (vDotN < 0) {
                vx -= vDotN * nx;
                vy -= vDotN * ny;
              }
            }
          }

          // Position update via Continuous Euler Integration
          agent.x += vx * dtSim;
          agent.y += vy * dtSim;

          // Continuous Orientation update via Angular LERP (Freeze heading when stopped)
          const currentSpeed = Math.hypot(vx, vy);
          if (currentSpeed > 0.01) {
            const targetHeading = Math.atan2(vy, vx);
            const diff = Math.atan2(Math.sin(targetHeading - agent.headingRad), Math.cos(targetHeading - agent.headingRad));
            const alpha = Math.min(1.0, 0.15 * 60 * dtSim);
            agent.headingRad += alpha * diff;
          }

          break;
        }

        case 'LOADING': {
          agent.batterySoc = Math.max(0, agent.batterySoc - agent.dischargeRatePerSec * 0.2 * dtSim);
          agent.timerSeconds -= dtSim;

          if (agent.timerSeconds <= 0) {
            agent.cargoPayload = true;

            const deliveryTargets = [...this.outboundNodes, ...this.storageNodes];
            if (deliveryTargets.length > 0) {
              const target = deliveryTargets[(i * 3 + Math.floor(this.completedDeliveries)) % deliveryTargets.length];
              agent.assignedDeliveryNodeId = target.id;
              agent.pathNodeIds = this.getShortestPath(agent.currentNodeId, target.id);

              if (agent.pathNodeIds.length > 1) {
                agent.pathNodeIds.shift();
                agent.targetNodeId = agent.pathNodeIds[0];
                agent.state = 'TRANSPORTING';
              } else {
                agent.state = 'UNLOADING';
                agent.timerSeconds = 2.5;
              }
            } else {
              agent.state = 'IDLE';
            }
          }
          break;
        }

        case 'UNLOADING': {
          agent.batterySoc = Math.max(0, agent.batterySoc - agent.dischargeRatePerSec * 0.2 * dtSim);
          agent.timerSeconds -= dtSim;

          if (agent.timerSeconds <= 0) {
            agent.cargoPayload = false;
            this.completedDeliveries += 1;
            if (agent.robotSpec && agent.robotSpec.id) {
              this.deliveriesByRobotType[agent.robotSpec.id] =
                (this.deliveriesByRobotType[agent.robotSpec.id] || 0) + 1;
            }

            if (agent.batterySoc < 20 && this.chargingNodes.length > 0) {
              const charger = this.findClosestNode(agent.currentNodeId, this.chargingNodes);
              if (charger) {
                agent.assignedChargerNodeId = charger.id;
                agent.pathNodeIds = this.getShortestPath(agent.currentNodeId, charger.id);

                if (agent.pathNodeIds.length > 1) {
                  agent.pathNodeIds.shift();
                  agent.targetNodeId = agent.pathNodeIds[0];
                  agent.state = 'MOVING_TO_CHARGE';
                } else {
                  agent.state = 'CHARGING';
                }
              } else {
                agent.state = 'IDLE';
              }
            } else {
              agent.state = 'IDLE';
            }
          }
          break;
        }

        case 'CHARGING': {
          agent.batterySoc = Math.min(100, agent.batterySoc + agent.chargeRatePerSec * dtSim);

          if (agent.batterySoc >= 98) {
            agent.state = 'IDLE';
          }
          break;
        }
      }
    }

  }

  private handleArrival(agent: AgentState): void {
    if (agent.state === 'MOVING_TO_PICKUP') {
      agent.state = 'LOADING';
      agent.timerSeconds = 2.5;
    } else if (agent.state === 'TRANSPORTING') {
      agent.state = 'UNLOADING';
      agent.timerSeconds = 2.5;
    } else if (agent.state === 'MOVING_TO_CHARGE') {
      agent.state = 'CHARGING';
    } else {
      agent.state = 'IDLE';
    }
  }

  private findClosestNode(fromNodeId: string, candidates: GraphNode[]): GraphNode | null {
    const fromNode = this.nodeMap.get(fromNodeId);
    if (!fromNode || candidates.length === 0) return null;

    let closest: GraphNode | null = null;
    let minD = Infinity;

    candidates.forEach((cand) => {
      const d = Math.hypot(cand.x - fromNode.x, cand.y - fromNode.y);
      if (d < minD) {
        minD = d;
        closest = cand;
      }
    });

    return closest;
  }

  /**
   * Universal simulation runner with customizable duration, quota, and decimation replay buffer.
   */
  public runSimulation(options: RunSimulationOptions): ExtendedSimulationResult {
    this.initializeFleet();

    const durationHours = Math.max(1, options.durationHours ?? 1.0);
    const dtSim = 0.5;
    const totalSimulatedSeconds = Math.round(durationHours * 3600);
    const totalTicks = Math.round(totalSimulatedSeconds / dtSim);
    const targetReplayFramesCount = options.targetReplayFramesCount ?? 7200;
    const recordReplay = options.recordReplay ?? false;

    const recordStride = Math.max(1, Math.floor(totalTicks / targetReplayFramesCount));
    const N = this.agents.length;

    let totalIdleTicks = 0;
    let deadlocksDetected = 0;

    const stuckTicksPerAgent = new Uint16Array(N);
    const prevX = new Float64Array(N);
    const prevY = new Float64Array(N);
    const prevStates: AgentFSMState[] = new Array(N);
    const prevSpeeds = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      prevX[i] = this.agents[i].x;
      prevY[i] = this.agents[i].y;
      prevStates[i] = this.agents[i].state;
      prevSpeeds[i] = 0;
    }

    this.replayFrames = [];

    for (let tick = 0; tick < totalTicks; tick++) {
      this.update(dtSim);

      let frameEvents: Array<'PICKUP' | 'DROPOFF' | 'CHARGE_START' | 'CHARGE_END' | 'BRAKE'> | undefined = undefined;
      const isRecordTick = recordReplay && tick % recordStride === 0;

      const agentSnapshots: AgentSnapshot[] = isRecordTick ? new Array(N) : [];

      for (let i = 0; i < N; i++) {
        const agent = this.agents[i];
        const distMoved = Math.hypot(agent.x - prevX[i], agent.y - prevY[i]);
        const speedMps = distMoved / dtSim;

        if (recordReplay) {
          const prevState = prevStates[i];
          const currState = agent.state;

          if (prevState === 'LOADING' && (currState === 'TRANSPORTING' || currState === 'UNLOADING')) {
            if (!frameEvents) frameEvents = [];
            if (!frameEvents.includes('PICKUP')) frameEvents.push('PICKUP');
          } else if (prevState === 'UNLOADING' && currState !== 'UNLOADING') {
            if (!frameEvents) frameEvents = [];
            if (!frameEvents.includes('DROPOFF')) frameEvents.push('DROPOFF');
          } else if (prevState !== 'CHARGING' && currState === 'CHARGING') {
            if (!frameEvents) frameEvents = [];
            if (!frameEvents.includes('CHARGE_START')) frameEvents.push('CHARGE_START');
          } else if (prevState === 'CHARGING' && currState === 'IDLE') {
            if (!frameEvents) frameEvents = [];
            if (!frameEvents.includes('CHARGE_END')) frameEvents.push('CHARGE_END');
          }

          if (
            (prevState === 'MOVING_TO_PICKUP' || prevState === 'TRANSPORTING' || prevState === 'MOVING_TO_CHARGE') &&
            prevSpeeds[i] > 0.4 &&
            speedMps < 0.1
          ) {
            if (!frameEvents) frameEvents = [];
            if (!frameEvents.includes('BRAKE')) frameEvents.push('BRAKE');
          }

          prevStates[i] = currState;
          prevSpeeds[i] = speedMps;
        }

        prevX[i] = agent.x;
        prevY[i] = agent.y;

        const hasActiveTask = agent.state !== 'IDLE' && agent.state !== 'CHARGING';
        const isQueuedSnapshot = agent.isQueued || (speedMps < 0.05 && hasActiveTask);

        if (hasActiveTask) {
          if (isQueuedSnapshot) {
            totalIdleTicks++;
          }

          if (speedMps < 0.05) {
            stuckTicksPerAgent[i]++;
            if (stuckTicksPerAgent[i] === 60) {
              // 60 continuous ticks * 0.5s = 30s stuck
              deadlocksDetected++;
            }
          } else {
            stuckTicksPerAgent[i] = 0;
          }
        } else {
          stuckTicksPerAgent[i] = 0;
        }

        if (isRecordTick) {
          agentSnapshots[i] = {
            id: agent.id,
            x: agent.x,
            y: agent.y,
            headingRad: agent.headingRad,
            state: agent.state,
            batterySoc: agent.batterySoc,
            cargoPayload: agent.cargoPayload,
            isQueued: isQueuedSnapshot,
            isDeadlocked: stuckTicksPerAgent[i] >= 60,
            speedMps,
          };
        }
      }

      if (isRecordTick) {
        const frame: SimulationReplayFrame = {
          timestampSec: tick * dtSim,
          agents: agentSnapshots,
        };
        if (frameEvents) {
          frame.events = frameEvents;
        }
        this.replayFrames.push(frame);
      }
    }

    const totalDelivered = this.completedDeliveries;
    const elapsedHours = this.elapsedSimSeconds / 3600;
    const realizedThroughputPerHour =
      elapsedHours > 0 ? Math.round((totalDelivered / elapsedHours) * 10) / 10 : 0;

    const totalTargetQuota = options.targetHourlyQuota * durationHours;
    const quotaFulfillmentPercent =
      totalTargetQuota > 0 ? Math.round((totalDelivered / totalTargetQuota) * 1000) / 10 : 0;

    // Theoretical throughput Q_theoretical = sum(N_m * q_m * k_avail,m)
    let theoreticalThroughput = 0;

    if (Array.isArray(this.fleetConfig)) {
      for (const item of this.fleetConfig) {
        const robot = item.robot;
        const runtime = robot.batteryRuntimeHours || 8;
        const chargeHours = (robot.batteryChargeMinutes || 60) / 60;
        const kAvail = runtime / (runtime + chargeHours);
        theoreticalThroughput += item.count * (robot.throughputPerHour || 10) * kAvail;
      }
    } else if (this.fleetConfig) {
      const robot = this.fleetConfig;
      const runtime = robot.batteryRuntimeHours || 8;
      const chargeHours = (robot.batteryChargeMinutes || 60) / 60;
      const kAvail = runtime / (runtime + chargeHours);
      theoreticalThroughput = this.fleetSize * (robot.throughputPerHour || 10) * kAvail;
    }

    let trafficCongestionFactor = 1.0;
    if (theoreticalThroughput > 0) {
      trafficCongestionFactor = Math.min(
        1.0,
        Math.max(0.0, realizedThroughputPerHour / theoreticalThroughput)
      );
      trafficCongestionFactor = Math.round(trafficCongestionFactor * 1000) / 1000;
    }

    const averageIdleTimePercent =
      N > 0 && totalTicks > 0
        ? Math.round((totalIdleTicks / (N * totalTicks)) * 10000) / 100
        : 0;

    return {
      durationHours,
      simulatedSeconds: Math.round(this.elapsedSimSeconds),
      totalTicks,
      targetHourlyQuota: options.targetHourlyQuota,
      totalTargetQuota,
      totalDelivered,
      realizedThroughputPerHour,
      quotaFulfillmentPercent,
      trafficCongestionFactor,
      averageIdleTimePercent,
      deadlocksDetected,
      deliveriesByRobotType: { ...this.deliveriesByRobotType },
    };
  }

  /**
   * Headless high-speed 1-hour real-time stress test (3600s, dtSim = 0.5s, 7200 ticks).
   * Delegates to runSimulation for backward compatibility.
   */
  public runOneHourSimulation(
    targetHourlyQuota: number,
    recordReplay: boolean = false
  ): OneHourSimulationResult {
    const ext = this.runSimulation({
      targetHourlyQuota,
      durationHours: 1.0,
      recordReplay,
      targetReplayFramesCount: 7200,
    });

    return {
      simulatedSeconds: ext.simulatedSeconds,
      totalTicks: ext.totalTicks,
      targetThroughputPerHour: ext.targetHourlyQuota,
      realizedThroughputPerHour: ext.realizedThroughputPerHour,
      trafficCongestionFactor: ext.trafficCongestionFactor,
      deliveriesByRobotType: ext.deliveriesByRobotType,
      averageIdleTimePercent: ext.averageIdleTimePercent,
      deadlocksDetected: ext.deadlocksDetected,
    };
  }

  /**
   * Fast-forwards simulation without rendering for targetDurationSeconds (default 3600s = 1 hr).
   * Returns traffic efficiency factor eta = Q_real / Q_theor (capped at 1.0) and realized throughput.
   */
  public runHeadlessFastForward(
    targetDurationSeconds: number = 3600,
    dtSim: number = 0.5
  ): {
    realizedThroughputPerHour: number;
    trafficEfficiencyEta: number;
    completedDeliveries: number;
  } {
    const res = this.runOneHourSimulation(0);
    return {
      realizedThroughputPerHour: res.realizedThroughputPerHour,
      trafficEfficiencyEta: res.trafficCongestionFactor,
      completedDeliveries: this.completedDeliveries,
    };
  }

  /**
   * Calculates current telemetry KPIs for HUD.
   */
  public getTelemetry(targetThroughputPerHour: number): SimulationTelemetry {
    const elapsedHours = this.elapsedSimSeconds / 3600;
    const isCalibrating = this.elapsedSimSeconds < 3 || this.completedDeliveries === 0;

    let realizedThroughputPerHour = 0;
    if (elapsedHours > 0) {
      realizedThroughputPerHour = Math.round((this.completedDeliveries / elapsedHours) * 10) / 10;
    }

    const activeInTransitCount = this.agents.filter((a) =>
      ['MOVING_TO_PICKUP', 'TRANSPORTING', 'MOVING_TO_CHARGE'].includes(a.state)
    ).length;

    const chargingCount = this.agents.filter((a) => a.state === 'CHARGING').length;

    const queuedAgents = this.agents.filter((a) => a.isQueued);
    const queuedCount = queuedAgents.length;

    const activeOrWorkingCount = this.agents.filter((a) =>
      ['MOVING_TO_PICKUP', 'LOADING', 'TRANSPORTING', 'UNLOADING', 'MOVING_TO_CHARGE'].includes(a.state)
    ).length;

    const fleetUtilizationPercent =
      this.fleetSize > 0
        ? Math.min(100, Math.round((activeOrWorkingCount / this.fleetSize) * 100))
        : 0;

    const congestionDetected = queuedCount >= 2;
    let congestionNodeLabel: string | null = null;

    if (congestionDetected && queuedAgents.length > 0) {
      const targetId = queuedAgents[0].targetNodeId || queuedAgents[0].currentNodeId;
      const node = this.nodeMap.get(targetId);
      congestionNodeLabel = node?.label || node?.id || 'Узел трассы';
    }

    return {
      elapsedSimSeconds: Math.round(this.elapsedSimSeconds),
      completedDeliveries: this.completedDeliveries,
      realizedThroughputPerHour,
      fleetUtilizationPercent,
      activeInTransitCount,
      chargingCount,
      queuedCount,
      congestionDetected,
      congestionNodeLabel,
      isCalibrating,
    };
  }
}
