import type { FacilityTopology, GraphEdge, GraphNode } from '../types/topology.js';
import type { Robot } from '../types/robot.js';

export type AgentFSMState =
  | 'IDLE'
  | 'MOVING_TO_PICKUP'
  | 'LOADING'
  | 'TRANSPORTING'
  | 'UNLOADING'
  | 'MOVING_TO_CHARGE'
  | 'CHARGING';

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

export class SimulationEngine {
  private topology: FacilityTopology;
  private robotSpec: Robot;
  private fleetSize: number;

  public agents: AgentState[] = [];
  public elapsedSimSeconds: number = 0;
  public completedDeliveries: number = 0;
  public robotRadius: number;

  // Key node caches and O(1) map
  private nodeMap: Map<string, GraphNode> = new Map();
  private inboundNodes: GraphNode[] = [];
  private outboundNodes: GraphNode[] = [];
  private storageNodes: GraphNode[] = [];
  private chargingNodes: GraphNode[] = [];
  private waypointNodes: GraphNode[] = [];
  public obstacleBoxes: ObstacleBox[] = [];

  constructor(topology: FacilityTopology, robotSpec: Robot, fleetSize: number) {
    this.topology = topology;
    this.robotSpec = robotSpec;
    this.fleetSize = Math.max(0, fleetSize);

    const robotWidth = (this.robotSpec.dimensionsMm?.width ?? 800) / 1000;
    const robotLength = (this.robotSpec.dimensionsMm?.length ?? 1000) / 1000;
    this.robotRadius = Math.max(0.4, Math.hypot(robotWidth, robotLength) / 2 + 0.1);

    this.classifyNodes();
    this.extractObstacleBoxes();
    this.initializeFleet();
  }

  private classifyNodes(): void {
    this.nodeMap = new Map<string, GraphNode>(this.topology.nodes.map((n) => [n.id, n]));
    this.inboundNodes = this.topology.nodes.filter((n) => n.type === 'INBOUND_DOCK');
    this.outboundNodes = this.topology.nodes.filter((n) => n.type === 'OUTBOUND_DOCK');
    this.storageNodes = this.topology.nodes.filter((n) => n.type === 'STORAGE_AISLE');
    this.chargingNodes = this.topology.nodes.filter((n) => n.type === 'CHARGING_HUB');
    this.waypointNodes = this.topology.nodes.filter((n) => n.type === 'WAYPOINT');
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
  public hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    for (const box of this.obstacleBoxes) {
      const inflatedBox: ObstacleBox = {
        minX: box.minX - this.robotRadius,
        maxX: box.maxX + this.robotRadius,
        minY: box.minY - this.robotRadius,
        maxY: box.maxY + this.robotRadius,
      };
      if (lineIntersectsAABB(x1, y1, x2, y2, inflatedBox)) {
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
    this.elapsedSimSeconds = 0;
    this.completedDeliveries = 0;

    if (this.fleetSize === 0 || this.topology.nodes.length === 0) return;

    const spawnCandidates = [
      ...this.inboundNodes,
      ...this.chargingNodes,
      ...this.waypointNodes,
      ...this.outboundNodes,
      ...this.storageNodes,
    ];

    for (let i = 0; i < this.fleetSize; i++) {
      const spawnNode = spawnCandidates[i % spawnCandidates.length] || this.topology.nodes[0];
      const initialSoc = 60 + ((i * 17) % 41);

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
    if (agent.pathNodeIds.length === 0) return null;

    for (let i = agent.pathNodeIds.length - 1; i >= 0; i--) {
      const nodeId = agent.pathNodeIds[i];
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;

      if (this.hasLineOfSight(agent.x, agent.y, node.x, node.y)) {
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
    if (this.fleetSize === 0 || this.agents.length === 0) return;

    this.elapsedSimSeconds += dtSim;

    const maxSpeed = Math.max(0.5, this.robotSpec.maxSpeedMps);
    const runtimeSec = Math.max(1, this.robotSpec.batteryRuntimeHours) * 3600;
    const chargeSec = Math.max(1, this.robotSpec.batteryChargeMinutes) * 60;

    const dischargeRatePerSec = 100 / runtimeSec;
    const chargeRatePerSec = 100 / chargeSec;

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];

      switch (agent.state) {
        case 'IDLE': {
          if (agent.batterySoc < 20 && this.chargingNodes.length > 0) {
            const charger = this.findClosestNode(agent.currentNodeId, this.chargingNodes);
            if (charger) {
              agent.assignedChargerNodeId = charger.id;
              agent.pathNodeIds = findShortestPath(this.topology, agent.currentNodeId, charger.id);
              if (agent.pathNodeIds.length > 1) {
                agent.pathNodeIds.shift();
                agent.targetNodeId = agent.pathNodeIds[0];
                agent.state = 'MOVING_TO_CHARGE';
              }
            }
          } else if (this.inboundNodes.length > 0) {
            const pickupNode = this.inboundNodes[i % this.inboundNodes.length];
            agent.assignedInboundNodeId = pickupNode.id;
            agent.pathNodeIds = findShortestPath(this.topology, agent.currentNodeId, pickupNode.id);

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
          agent.batterySoc = Math.max(0, agent.batterySoc - dischargeRatePerSec * dtSim);

          const targetNode = this.selectLookaheadTarget(agent);
          if (!targetNode) {
            this.handleArrival(agent);
            break;
          }
          agent.targetNodeId = targetNode.id;

          // 1. Attractive Goal Force (F_att, w_att = 1.0)
          const dx = targetNode.x - agent.x;
          const dy = targetNode.y - agent.y;
          const distToTarget = Math.hypot(dx, dy);

          const arrivalThreshold = Math.max(0.85, this.robotRadius + 0.15);
          if (distToTarget <= arrivalThreshold) {
            agent.currentNodeId = targetNode.id;
            agent.pathNodeIds.shift();

            if (agent.pathNodeIds.length === 0) {
              this.handleArrival(agent);
              break;
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
            let dObs = Math.hypot(agent.x - cx, agent.y - cy);

            // Hard Boundary Push-out if robot penetrated the physical collision buffer
            if (dObs < this.robotRadius) {
              let nx = 1;
              let ny = 0;
              if (dObs >= 0.001) {
                nx = (agent.x - cx) / dObs;
                ny = (agent.y - cy) / dObs;
              }
              const pushDist = this.robotRadius + 0.05;
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

          // 3. Dynamic Inter-Robot Avoidance (w_avoid = 1.3, detection d < 1.5m)
          let fAvoidX = 0;
          let fAvoidY = 0;
          let nearbyRobotCount = 0;

          const vForward = { x: Math.cos(agent.headingRad), y: Math.sin(agent.headingRad) };
          const vRight = { x: vForward.y, y: -vForward.x };

          for (let j = 0; j < this.agents.length; j++) {
            if (i === j) continue;
            const other = this.agents[j];
            const distOther = Math.hypot(other.x - agent.x, other.y - agent.y);

            if (distOther < 1.5 && distOther > 0.001) {
              nearbyRobotCount++;
              const uAwayX = (agent.x - other.x) / distOther;
              const uAwayY = (agent.y - other.y) / distOther;

              const vForwardOther = { x: Math.cos(other.headingRad), y: Math.sin(other.headingRad) };
              const dotHeadings = vForward.x * vForwardOther.x + vForward.y * vForwardOther.y;
              const approachSpeed = -(uAwayX * vForward.x + uAwayY * vForward.y);

              const factor = (1.5 - distOther) / 1.5;
              // Always apply radial separation
              fAvoidX += factor * uAwayX * 1.0;
              fAvoidY += factor * uAwayY * 1.0;

              // Add lateral rightward evasion strictly for oncoming head-on encounters
              if (dotHeadings < -0.2 && approachSpeed > 0) {
                fAvoidX += factor * vRight.x * 1.2;
                fAvoidY += factor * vRight.y * 1.2;
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
            vx = maxSpeed * (fTotalX / fTotalLen);
            vy = maxSpeed * (fTotalY / fTotalLen);
          }

          // Cancel inward velocity component directed toward obstacle interiors
          for (const box of this.obstacleBoxes) {
            const cx = Math.max(box.minX, Math.min(agent.x, box.maxX));
            const cy = Math.max(box.minY, Math.min(agent.y, box.maxY));
            const dObs = Math.hypot(agent.x - cx, agent.y - cy);
            if (dObs < this.robotRadius + 0.06) {
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
          agent.batterySoc = Math.max(0, agent.batterySoc - dischargeRatePerSec * 0.2 * dtSim);
          agent.timerSeconds -= dtSim;

          if (agent.timerSeconds <= 0) {
            agent.cargoPayload = true;

            const deliveryTargets = [...this.outboundNodes, ...this.storageNodes];
            if (deliveryTargets.length > 0) {
              const target = deliveryTargets[(i * 3 + Math.floor(this.completedDeliveries)) % deliveryTargets.length];
              agent.assignedDeliveryNodeId = target.id;
              agent.pathNodeIds = findShortestPath(this.topology, agent.currentNodeId, target.id);

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
          agent.batterySoc = Math.max(0, agent.batterySoc - dischargeRatePerSec * 0.2 * dtSim);
          agent.timerSeconds -= dtSim;

          if (agent.timerSeconds <= 0) {
            agent.cargoPayload = false;
            this.completedDeliveries += 1;

            if (agent.batterySoc < 20 && this.chargingNodes.length > 0) {
              const charger = this.findClosestNode(agent.currentNodeId, this.chargingNodes);
              if (charger) {
                agent.assignedChargerNodeId = charger.id;
                agent.pathNodeIds = findShortestPath(this.topology, agent.currentNodeId, charger.id);

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
          agent.batterySoc = Math.min(100, agent.batterySoc + chargeRatePerSec * dtSim);

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
    this.initializeFleet();
    const steps = Math.ceil(targetDurationSeconds / dtSim);

    for (let step = 0; step < steps; step++) {
      this.update(dtSim);
    }

    const elapsedHours = this.elapsedSimSeconds / 3600;
    const realizedThroughput =
      elapsedHours > 0 ? this.completedDeliveries / elapsedHours : 0;

    const kAvail = Math.max(
      0.01,
      (this.robotSpec.batteryRuntimeHours || 8) /
        ((this.robotSpec.batteryRuntimeHours || 8) +
          (this.robotSpec.batteryChargeMinutes || 60) / 60)
    );
    const theoreticalFleetCapacity =
      this.fleetSize * (this.robotSpec.throughputPerHour || 10) * kAvail;

    let eta = 1.0;
    if (theoreticalFleetCapacity > 0) {
      eta = Math.min(1.0, Math.max(0.1, realizedThroughput / theoreticalFleetCapacity));
    }

    return {
      realizedThroughputPerHour: Math.round(realizedThroughput * 10) / 10,
      trafficEfficiencyEta: Math.round(eta * 1000) / 1000,
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
