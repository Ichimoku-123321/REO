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

  // Build adjacency list
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
    // Pick unvisited node with min distance
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

  // Reconstruct path
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

    // Node occupation map for safety distance queueing
    const nodeOccupancy = new Map<string, string[]>(); // nodeId -> agentIds
    this.agents.forEach((a) => {
      const currentLoc = a.pathNodeIds[0] || a.currentNodeId;
      if (!nodeOccupancy.has(currentLoc)) nodeOccupancy.set(currentLoc, []);
      nodeOccupancy.get(currentLoc)!.push(a.id);
    });

    const maxSpeed = Math.max(0.5, this.robotSpec.maxSpeedMps);
    const runtimeSec = Math.max(1, this.robotSpec.batteryRuntimeHours) * 3600;
    const chargeSec = Math.max(1, this.robotSpec.batteryChargeMinutes) * 60;

    // Discharge rate (% per second while operating)
    const dischargeRatePerSec = 100 / runtimeSec;
    // Charge rate (% per second while charging)
    const chargeRatePerSec = 100 / chargeSec;

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];

      switch (agent.state) {
        case 'IDLE': {
          // Check battery low SoC < 20%
          if (agent.batterySoc < 20 && this.chargingNodes.length > 0) {
            const charger = this.findClosestNode(agent.currentNodeId, this.chargingNodes);
            if (charger) {
              agent.assignedChargerNodeId = charger.id;
              agent.pathNodeIds = findShortestPath(this.topology, agent.currentNodeId, charger.id);
              if (agent.pathNodeIds.length > 1) {
                agent.pathNodeIds.shift(); // Remove current node
                agent.targetNodeId = agent.pathNodeIds[0];
                agent.state = 'MOVING_TO_CHARGE';
              }
            }
          } else if (this.inboundNodes.length > 0) {
            // Pick pickup dock
            const pickupNode = this.inboundNodes[i % this.inboundNodes.length];
            agent.assignedInboundNodeId = pickupNode.id;
            agent.pathNodeIds = findShortestPath(this.topology, agent.currentNodeId, pickupNode.id);

            if (agent.pathNodeIds.length > 1) {
              agent.pathNodeIds.shift();
              agent.targetNodeId = agent.pathNodeIds[0];
              agent.state = 'MOVING_TO_PICKUP';
            } else {
              // Already at pickup node
              agent.state = 'LOADING';
              agent.timerSeconds = 2.5; // 2.5 seconds loading time
            }
          }
          break;
        }

        case 'MOVING_TO_PICKUP':
        case 'TRANSPORTING':
        case 'MOVING_TO_CHARGE': {
          // Discharge battery during motion
          agent.batterySoc = Math.max(0, agent.batterySoc - dischargeRatePerSec * dtSim);

          if (!agent.targetNodeId && agent.pathNodeIds.length > 0) {
            agent.targetNodeId = agent.pathNodeIds[0];
          }

          if (!agent.targetNodeId) {
            // Reached path end
            this.handleArrival(agent);
            break;
          }

          // Safety Queue Check: Check if target node or edge ahead is blocked by another agent
          const aheadAgents = nodeOccupancy
            .get(agent.targetNodeId)
            ?.filter((id) => id !== agent.id);

          const isBlocked =
            aheadAgents &&
            aheadAgents.some((otherId) => {
              const other = this.agents.find((a) => a.id === otherId);
              if (!other) return false;
              const distToOther = Math.hypot(other.x - agent.x, other.y - agent.y);
              return distToOther < 2.0; // 2 meters safety distance
            });

          if (isBlocked && agent.edgeProgressM > 0.5) {
            agent.isQueued = true;
            break; // Stop movement for this frame
          }

          agent.isQueued = false;

          // Find edge details
          const edge = this.findEdge(agent.currentNodeId, agent.targetNodeId);
          const edgeLength = edge ? edge.distanceM : 1.0;
          agent.edgeDistanceM = edgeLength;

          // Target node coordinates
          const targetNode = this.nodeMap.get(agent.targetNodeId);
          if (!targetNode) break;

          const dx = targetNode.x - agent.x;
          const dy = targetNode.y - agent.y;
          const distToTarget = Math.hypot(dx, dy);

          // Heading
          if (distToTarget > 0.01) {
            agent.headingRad = Math.atan2(dy, dx);
          }

          const moveDist = maxSpeed * dtSim;

          if (distToTarget <= moveDist) {
            // Reached target node
            agent.x = targetNode.x;
            agent.y = targetNode.y;
            agent.currentNodeId = targetNode.id;
            agent.pathNodeIds.shift();
            agent.edgeProgressM = 0;

            if (agent.pathNodeIds.length > 0) {
              agent.targetNodeId = agent.pathNodeIds[0];
            } else {
              agent.targetNodeId = null;
              this.handleArrival(agent);
            }
          } else {
            // Advance along edge
            agent.x += (dx / distToTarget) * moveDist;
            agent.y += (dy / distToTarget) * moveDist;
            agent.edgeProgressM += moveDist;
          }

          break;
        }

        case 'LOADING': {
          agent.batterySoc = Math.max(0, agent.batterySoc - dischargeRatePerSec * 0.2 * dtSim);
          agent.timerSeconds -= dtSim;

          if (agent.timerSeconds <= 0) {
            agent.cargoPayload = true;

            // Select delivery target (Storage or Outbound dock)
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

            // Check battery condition
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
          // Recharge battery
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
