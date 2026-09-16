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
  blockedTimeSec?: number;

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

/**
 * Shortest path algorithm (A*) over FacilityTopology graph.
 */
export function findShortestPath(
  topology: FacilityTopology,
  startNodeId: string,
  targetNodeId: string,
  blockedNodeIds: Set<string> = new Set()
): string[] {
  if (startNodeId === targetNodeId) return [startNodeId];

  const nodeMap = new Map<string, GraphNode>(topology.nodes.map((n) => [n.id, n]));
  const targetNode = nodeMap.get(targetNodeId);
  const startNode = nodeMap.get(startNodeId);
  if (!startNode || !targetNode) return [];

  // Build adjacency list
  const adj = new Map<string, Array<{ target: string; distance: number }>>();
  topology.nodes.forEach((n) => adj.set(n.id, []));

  topology.edges.forEach((e) => {
    adj.get(e.source)?.push({ target: e.target, distance: e.distanceM });
    if (e.bidirectional) {
      adj.get(e.target)?.push({ target: e.source, distance: e.distanceM });
    }
  });

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const openSet = new Set<string>();

  topology.nodes.forEach((n) => {
    gScore.set(n.id, Infinity);
    fScore.set(n.id, Infinity);
    previous.set(n.id, null);
  });

  gScore.set(startNodeId, 0);
  fScore.set(startNodeId, Math.hypot(targetNode.x - startNode.x, targetNode.y - startNode.y));
  openSet.add(startNodeId);

  while (openSet.size > 0) {
    let current: string | null = null;
    let minF = Infinity;

    openSet.forEach((id) => {
      const f = fScore.get(id)!;
      if (f < minF) {
        minF = f;
        current = id;
      }
    });

    if (current === null || current === targetNodeId) break;

    openSet.delete(current);
    const currG = gScore.get(current)!;

    const neighbors = adj.get(current) || [];
    for (const edge of neighbors) {
      if (blockedNodeIds.has(edge.target) && edge.target !== targetNodeId) {
        continue; // Skip dynamically blocked nodes
      }

      const neighborNode = nodeMap.get(edge.target);
      if (!neighborNode) continue;

      const tentativeG = currG + edge.distance;
      if (tentativeG < (gScore.get(edge.target) ?? Infinity)) {
        previous.set(edge.target, current);
        gScore.set(edge.target, tentativeG);
        const h = Math.hypot(targetNode.x - neighborNode.x, targetNode.y - neighborNode.y);
        fScore.set(edge.target, tentativeG + h);
        openSet.add(edge.target);
      }
    }
  }

  // Reconstruct path
  const path: string[] = [];
  let curr: string | null = targetNodeId;

  if (gScore.get(targetNodeId) === Infinity) return [];

  while (curr !== null) {
    path.unshift(curr);
    curr = previous.get(curr) || null;
  }

  return path;
}

/**
 * Path smoothing / string-pulling algorithm over open passable floor.
 */
export function smoothPath(topology: FacilityTopology, pathNodeIds: string[]): string[] {
  if (pathNodeIds.length <= 2) return pathNodeIds;

  const nodeMap = new Map<string, GraphNode>(topology.nodes.map((n) => [n.id, n]));
  const passableCells = new Set<string>();
  topology.nodes.forEach((n) => {
    passableCells.add(`${Math.floor(n.x)}_${Math.floor(n.y)}`);
  });

  const hasLineOfSight = (p1Id: string, p2Id: string): boolean => {
    const n1 = nodeMap.get(p1Id);
    const n2 = nodeMap.get(p2Id);
    if (!n1 || !n2) return false;

    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.1) return true;

    const steps = Math.ceil(dist / 0.5);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const sx = n1.x + dx * t;
      const sy = n1.y + dy * t;
      if (!passableCells.has(`${Math.floor(sx)}_${Math.floor(sy)}`)) {
        return false;
      }
    }
    return true;
  };

  const smoothed: string[] = [pathNodeIds[0]];
  let currIdx = 0;

  while (currIdx < pathNodeIds.length - 1) {
    let furthestIdx = currIdx + 1;
    for (let checkIdx = pathNodeIds.length - 1; checkIdx > currIdx + 1; checkIdx--) {
      if (hasLineOfSight(pathNodeIds[currIdx], pathNodeIds[checkIdx])) {
        furthestIdx = checkIdx;
        break;
      }
    }
    smoothed.push(pathNodeIds[furthestIdx]);
    currIdx = furthestIdx;
  }

  return smoothed;
}

export class SimulationEngine {
  private topology: FacilityTopology;
  private robotSpec: Robot;
  private fleetSize: number;

  public agents: AgentState[] = [];
  public elapsedSimSeconds: number = 0;
  public completedDeliveries: number = 0;

  // Key node caches and O(1) map
  private nodeMap: Map<string, GraphNode> = new Map();
  private inboundNodes: GraphNode[] = [];
  private outboundNodes: GraphNode[] = [];
  private storageNodes: GraphNode[] = [];
  private chargingNodes: GraphNode[] = [];
  private waypointNodes: GraphNode[] = [];

  constructor(topology: FacilityTopology, robotSpec: Robot, fleetSize: number) {
    this.topology = topology;
    this.robotSpec = robotSpec;
    this.fleetSize = Math.max(0, fleetSize);

    this.classifyNodes();
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
   * Initializes or resets fleet agents staggering spawn points.
   */
  public initializeFleet(): void {
    this.agents = [];
    this.elapsedSimSeconds = 0;
    this.completedDeliveries = 0;

    if (this.fleetSize === 0 || this.topology.nodes.length === 0) return;

    // Available initial spawn candidate nodes
    const spawnCandidates = [
      ...this.inboundNodes,
      ...this.chargingNodes,
      ...this.waypointNodes,
      ...this.outboundNodes,
      ...this.storageNodes,
    ];

    for (let i = 0; i < this.fleetSize; i++) {
      const spawnNode = spawnCandidates[i % spawnCandidates.length] || this.topology.nodes[0];

      // Stagger battery initial SoC between 60% and 100% so they don't all charge simultaneously
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
   * Finds edge between two adjacent node IDs.
   */
  private findEdge(n1Id: string, n2Id: string): GraphEdge | null {
    return (
      this.topology.edges.find(
        (e) =>
          (e.source === n1Id && e.target === n2Id) ||
          (e.bidirectional && e.source === n2Id && e.target === n1Id)
      ) || null
    );
  }

  /**
   * Advances simulation by dtSim seconds.
   */
  public update(dtSim: number): void {
    if (this.fleetSize === 0 || this.agents.length === 0) return;

    this.elapsedSimSeconds += dtSim;

    const maxSpeed = Math.max(0.5, this.robotSpec.maxSpeedMps);
    const runtimeSec = Math.max(1, this.robotSpec.batteryRuntimeHours) * 3600;
    const chargeSec = Math.max(1, this.robotSpec.batteryChargeMinutes) * 60;

    const dischargeRatePerSec = 100 / runtimeSec;
    const chargeRatePerSec = 100 / chargeSec;

    // Cache passable floor tiles set for quick continuous collision checks
    const passableCells = new Set<string>();
    this.topology.nodes.forEach((n) => {
      passableCells.add(`${Math.floor(n.x)}_${Math.floor(n.y)}`);
    });

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];

      switch (agent.state) {
        case 'IDLE': {
          if (agent.batterySoc < 20 && this.chargingNodes.length > 0) {
            const charger = this.findClosestNode(agent.currentNodeId, this.chargingNodes);
            if (charger) {
              agent.assignedChargerNodeId = charger.id;
              const rawPath = findShortestPath(this.topology, agent.currentNodeId, charger.id);
              agent.pathNodeIds = smoothPath(this.topology, rawPath);

              if (agent.pathNodeIds.length > 1) {
                agent.pathNodeIds.shift();
                agent.targetNodeId = agent.pathNodeIds[0];
                agent.state = 'MOVING_TO_CHARGE';
              }
            }
          } else if (this.inboundNodes.length > 0) {
            const pickupNode = this.inboundNodes[i % this.inboundNodes.length];
            agent.assignedInboundNodeId = pickupNode.id;
            const rawPath = findShortestPath(this.topology, agent.currentNodeId, pickupNode.id);
            agent.pathNodeIds = smoothPath(this.topology, rawPath);

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

          if (!agent.targetNodeId && agent.pathNodeIds.length > 0) {
            agent.targetNodeId = agent.pathNodeIds[0];
          }

          if (!agent.targetNodeId) {
            this.handleArrival(agent);
            break;
          }

          const targetNode = this.nodeMap.get(agent.targetNodeId);
          if (!targetNode) break;

          const dx = targetNode.x - agent.x;
          const dy = targetNode.y - agent.y;
          const distToTarget = Math.hypot(dx, dy);

          const moveStepDist = maxSpeed * dtSim;

          if (distToTarget <= Math.max(0.2, moveStepDist)) {
            // Reached waypoint target
            agent.x = targetNode.x;
            agent.y = targetNode.y;
            agent.currentNodeId = targetNode.id;
            agent.pathNodeIds.shift();

            if (agent.pathNodeIds.length > 0) {
              agent.targetNodeId = agent.pathNodeIds[0];
            } else {
              agent.targetNodeId = null;
              this.handleArrival(agent);
            }
            break;
          }

          // Goal velocity vector towards target waypoint
          const goalVx = (dx / distToTarget) * maxSpeed;
          const goalVy = (dy / distToTarget) * maxSpeed;

          // Artificial Repulsive Potential Field & Steering from nearby robots
          let fRepX = 0;
          let fRepY = 0;
          const safetyRadius = 1.0;

          for (let j = 0; j < this.agents.length; j++) {
            if (i === j) continue;
            const other = this.agents[j];
            const distToOther = Math.hypot(agent.x - other.x, agent.y - other.y);

            if (distToOther > 0.001 && distToOther < safetyRadius) {
              const repMag = 1.5 * (1.0 / distToOther - 1.0 / safetyRadius);
              const dirX = (agent.x - other.x) / distToOther;
              const dirY = (agent.y - other.y) / distToOther;

              fRepX += dirX * repMag;
              fRepY += dirY * repMag;

              // If other robot is directly ahead, add lateral side-stepping vector
              const dotProduct = (dirX * goalVx + dirY * goalVy) / maxSpeed;
              if (dotProduct < -0.2) {
                const sideX = -goalVy;
                const sideY = goalVx;
                fRepX += sideX * 0.8;
                fRepY += sideY * 0.8;
              }
            }
          }

          let desiredVx = goalVx + fRepX;
          let desiredVy = goalVy + fRepY;
          const desiredSpeed = Math.hypot(desiredVx, desiredVy);

          if (desiredSpeed > maxSpeed) {
            desiredVx = (desiredVx / desiredSpeed) * maxSpeed;
            desiredVy = (desiredVy / desiredSpeed) * maxSpeed;
          }

          const candidateX = agent.x + desiredVx * dtSim;
          const candidateY = agent.y + desiredVy * dtSim;

          const prevX = agent.x;
          const prevY = agent.y;

          if (passableCells.has(`${Math.floor(candidateX)}_${Math.floor(candidateY)}`)) {
            agent.x = candidateX;
            agent.y = candidateY;
          } else {
            // Fallback to goal vector if candidate hits static wall/rack
            agent.x += goalVx * dtSim;
            agent.y += goalVy * dtSim;
          }

          const actualMoved = Math.hypot(agent.x - prevX, agent.y - prevY);
          if (actualMoved > 0.01) {
            agent.headingRad = Math.atan2(desiredVy, desiredVx);
            agent.blockedTimeSec = 0;
            agent.isQueued = false;
          } else {
            agent.blockedTimeSec = (agent.blockedTimeSec || 0) + dtSim;
            agent.isQueued = (agent.blockedTimeSec || 0) > 0.5;

            // Recalculate path via A* fallback if hemmed in for > 3.0s
            if ((agent.blockedTimeSec || 0) > 3.0) {
              const blockedNodeIds = new Set(
                this.agents.filter((a) => a.id !== agent.id).map((a) => a.currentNodeId)
              );
              const destId =
                agent.assignedDeliveryNodeId ||
                agent.assignedInboundNodeId ||
                agent.assignedChargerNodeId ||
                agent.targetNodeId ||
                agent.currentNodeId;

              const rawPath = findShortestPath(this.topology, agent.currentNodeId, destId, blockedNodeIds);
              const newPath = smoothPath(this.topology, rawPath);
              if (newPath.length > 1) {
                newPath.shift();
                agent.pathNodeIds = newPath;
                agent.targetNodeId = agent.pathNodeIds[0];
              }
              agent.blockedTimeSec = 0;
            }
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
              const rawPath = findShortestPath(this.topology, agent.currentNodeId, target.id);
              agent.pathNodeIds = smoothPath(this.topology, rawPath);

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
                const rawPath = findShortestPath(this.topology, agent.currentNodeId, charger.id);
                agent.pathNodeIds = smoothPath(this.topology, rawPath);

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
