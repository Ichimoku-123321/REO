import type { FacilityTopology, GraphEdge, GraphNode } from '../types/topology.js';
import type { Robot } from '../types/robot.js';
import type { FacilityRequirements } from '../types/facility.js';
import type { FleetCompositionItem } from './fleet_optimizer.js';
import { FastMarchingSolver } from './fast_marching.js';

import type {
  AgentFSMState,
  AgentSnapshot,
  AgentState,
  ExtendedSimulationResult,
  OneHourSimulationResult,
  RunSimulationOptions,
  SimulationReplayFrame,
  SimulationTelemetry,
  ObstacleBox,
} from './simulation/types.js';
import { lineIntersectsAABB, calculateRobotRadius } from './simulation/math_geometry.js';
import { findShortestPath } from './simulation/pathfinding.js';
import { computeSteeringStep } from './simulation/steering_physics.js';
import { updateAgentBatteryAndWear } from './simulation/agent_lifecycle.js';
import { ReplayRecorder } from './simulation/replay_recorder.js';
import { TrafficArbiter } from './simulation/traffic_arbiter.js';

// Re-export all types & standalone functions to maintain full backward compatibility
export type {
  AgentFSMState,
  AgentSnapshot,
  RunSimulationOptions,
  ExtendedSimulationResult,
  SimulationReplayFrame,
  AgentState,
  OneHourSimulationResult,
  SimulationTelemetry,
  ObstacleBox,
};
export { lineIntersectsAABB, findShortestPath };

export class SimulationEngine {
  private topology: FacilityTopology;
  private fleetConfig: Robot | FleetCompositionItem[];
  private legacyFleetSize: number;
  private facility?: FacilityRequirements;

  public agents: AgentState[] = [];
  public replayFrames: SimulationReplayFrame[] = [];
  public elapsedSimSeconds: number = 0;
  public completedDeliveries: number = 0;
  public deliveriesByRobotType: Record<string, number> = {};
  public robotRadius: number;
  public totalBreakdowns: number = 0;
  public totalNegotiationDelaySeconds: number = 0;

  // Supply Schedule & Pallet Buffer Tracking
  public inboundPalletsAvailable: number = 0;
  private supplySchedule?: RunSimulationOptions['supplySchedule'];
  private lastInboundSpawnTimeSec: number = -Infinity;

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
  // WMS
  private rackOccupancy: Map<string, { current: number; capacity: number; skuId?: string }> = new Map();
  private chargingNodes: GraphNode[] = [];
  private waypointNodes: GraphNode[] = [];
  public obstacleBoxes: ObstacleBox[] = [];

  private fastMarchingSolvers: Map<string, FastMarchingSolver> = new Map();
  private trafficArbiter: TrafficArbiter;

  constructor(
    topology: FacilityTopology,
    fleetConfig: Robot | FleetCompositionItem[],
    legacyFleetSize?: number,
    facility?: FacilityRequirements
  ) {
    this.topology = topology;
    this.fleetConfig = fleetConfig;
    this.legacyFleetSize = legacyFleetSize ?? 0;
    this.facility = facility;

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
    this.trafficArbiter = new TrafficArbiter(this.topology, this.obstacleBoxes);
    this.initializeFleet();

    // Initialize Fast Marching solvers for static grid map
    const { widthM, lengthM } = topology;
    if (widthM > 0 && lengthM > 0) {
      const solver = new FastMarchingSolver({
        widthM,
        lengthM,
        resolutionM: 0.5,
        obstacleBoxes: this.obstacleBoxes,
        facility: this.facility,
        robot: primaryRobot ?? undefined,
      });
      this.fastMarchingSolvers.set('default', solver);
    }
  }

  public get fleetSize(): number {
    if (Array.isArray(this.fleetConfig)) {
      return Math.max(1, this.fleetConfig.reduce((sum, item) => sum + item.count, 0));
    }
    return Math.max(1, this.legacyFleetSize || 1);
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

  private extractObstacleBoxes(): void {
    this.obstacleBoxes = [];

    if (this.topology.obstacles) {
      for (const obs of this.topology.obstacles) {
        this.obstacleBoxes.push({ ...obs });
      }
    }

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

  public initializeFleet(supplySchedule?: RunSimulationOptions['supplySchedule']): void {
    // Инициализация емкости адресного хранения стеллажей
    this.rackOccupancy.clear();
    for (const node of this.storageNodes) {
      this.rackOccupancy.set(node.id, {
        current: 0,
        capacity: node.capacity ?? 50,
        skuId: node.skuId,
      });
    }

    this.agents = [];
    this.replayFrames = [];
    this.elapsedSimSeconds = 0;
    this.completedDeliveries = 0;
    this.deliveriesByRobotType = {};
    this.totalBreakdowns = 0;
    this.totalNegotiationDelaySeconds = 0;
    this.supplySchedule = supplySchedule;
    this.lastInboundSpawnTimeSec = -Infinity;

    if (supplySchedule && supplySchedule.inboundBatchVolume > 0) {
      this.inboundPalletsAvailable = 0; // Will spawn on tick 0 or during update
    } else {
      this.inboundPalletsAvailable = Infinity; // Default infinite mode when schedule is not specified
    }

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
      const count = Math.max(1, this.legacyFleetSize || 1);
      for (let k = 0; k < count; k++) {
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

        corridorWaitTimeSec: 0,
        scheduleLagSec: 0,

        robotSpec,
        robotRadius,
        maxSpeed,
        payloadKg,
        batteryCapacityHours,
        chargeRatePerSec,
        dischargeRatePerSec,

        accumulatedOperatingHours: 0,
        breakdownCount: 0,

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

  public update(dtSim: number): void {
    if (this.agents.length === 0) return;

    this.elapsedSimSeconds += dtSim;

    // Check discrete pallet batch spawning at DOCK_INBOUND
    if (this.supplySchedule && this.supplySchedule.inboundBatchVolume > 0) {
      let intervalHours = this.supplySchedule.inboundIntervalValue || 24;
      if (this.supplySchedule.inboundIntervalUnit === 'minutes') intervalHours /= 60;
      if (this.supplySchedule.inboundIntervalUnit === 'days') intervalHours *= 24;
      const intervalSec = Math.max(1, intervalHours * 3600);

      if (this.lastInboundSpawnTimeSec < 0 || this.elapsedSimSeconds - this.lastInboundSpawnTimeSec >= intervalSec) {
        this.inboundPalletsAvailable += this.supplySchedule.inboundBatchVolume;
        this.lastInboundSpawnTimeSec = this.elapsedSimSeconds;
      }
    }

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];

      switch (agent.state) {
        case 'IDLE': {
          const currNode = this.nodeMap.get(agent.currentNodeId);
          const isOnChargerNode = currNode?.type === 'CHARGING_HUB';

          // If robot is IDLE on a charger pad, it MUST vacate the charger pad immediately to unblock others!
          if (isOnChargerNode) {
            agent.assignedChargerNodeId = null;
            const nonChargerCandidates = [...this.waypointNodes, ...this.inboundNodes, ...this.storageNodes];
            const vacateTarget = this.findClosestNode(agent.currentNodeId, nonChargerCandidates);
            if (vacateTarget && vacateTarget.id !== agent.currentNodeId) {
              agent.pathNodeIds = this.getShortestPath(agent.currentNodeId, vacateTarget.id);
              if (agent.pathNodeIds.length > 1) {
                agent.pathNodeIds.shift();
                agent.targetNodeId = agent.pathNodeIds[0];
                agent.state = 'MOVING_TO_PICKUP'; // Repositioning
                agent.isQueued = false;
                break;
              }
            }
          }

          const freeCharger = this.findUnoccupiedChargerNode(agent.currentNodeId);

          // 1. Mandatory Charge Check (battery < 20%)
          if (agent.batterySoc < 20 && this.chargingNodes.length > 0) {
            if (freeCharger) {
              agent.assignedChargerNodeId = freeCharger.id;
              agent.pathNodeIds = this.getShortestPath(agent.currentNodeId, freeCharger.id);
              if (agent.pathNodeIds.length > 1) {
                agent.pathNodeIds.shift();
                agent.targetNodeId = agent.pathNodeIds[0];
                agent.state = 'MOVING_TO_CHARGE';
                agent.isQueued = false;
              } else {
                agent.state = 'CHARGING';
                agent.isQueued = false;
              }
            } else {
              // Queue for charger: do NOT accept transport tasks, zero out traction discharge, wait safely!
              agent.isQueued = true;
              agent.corridorWaitTimeSec += dtSim;
            }
            break;
          }

          // 2. Normal Task Assignment
          if (this.inboundNodes.length > 0 && this.inboundPalletsAvailable > 0 && agent.batterySoc >= 20) {
            this.inboundPalletsAvailable -= 1;
            const pickupNode = this.inboundNodes[i % this.inboundNodes.length];
            agent.assignedInboundNodeId = pickupNode.id;
            agent.pathNodeIds = this.getShortestPath(agent.currentNodeId, pickupNode.id);

            if (agent.pathNodeIds.length > 1) {
              agent.pathNodeIds.shift();
              agent.targetNodeId = agent.pathNodeIds[0];
              agent.state = 'MOVING_TO_PICKUP';
              agent.isQueued = false;
            } else {
              agent.state = 'LOADING';
              agent.timerSeconds = 2.5;
              agent.isQueued = false;
            }
            break;
          }

          // 3. Opportunity Charging (when IDLE, no work available, SoC < 95%)
          if (this.inboundPalletsAvailable === 0 && agent.batterySoc < 95 && freeCharger) {
            agent.assignedChargerNodeId = freeCharger.id;
            agent.pathNodeIds = this.getShortestPath(agent.currentNodeId, freeCharger.id);
            if (agent.pathNodeIds.length > 1) {
              agent.pathNodeIds.shift();
              agent.targetNodeId = agent.pathNodeIds[0];
              agent.state = 'MOVING_TO_CHARGE';
              agent.isQueued = false;
            } else {
              agent.state = 'CHARGING';
              agent.isQueued = false;
            }
          }
          break;
        }

        case 'MOVING_TO_PICKUP':
        case 'TRANSPORTING':
        case 'MOVING_TO_CHARGE': {
          const wearRes = updateAgentBatteryAndWear(agent, { dtSim, facility: this.facility });
          if (wearRes.breakdownOccurred) {
            this.totalBreakdowns += 1;
          }

          // Traffic Arbiter corridor reservation check
          const hasAccess = this.trafficArbiter.requestCorridorAccess(agent, this.nodeMap, this.elapsedSimSeconds);

          if (!hasAccess) {
            // Access denied by TrafficArbiter: agent must hold at entrance pocket
            agent.isQueued = true;
            agent.corridorWaitTimeSec += dtSim;
            agent.scheduleLagSec += dtSim;
            this.totalNegotiationDelaySeconds += dtSim;

            // Orient towards target without moving forward
            let targetNode = agent.targetNodeId ? this.nodeMap.get(agent.targetNodeId) || null : null;
            if (targetNode) {
              const targetHeading = Math.atan2(targetNode.y - agent.y, targetNode.x - agent.x);
              const diff = Math.atan2(Math.sin(targetHeading - agent.headingRad), Math.cos(targetHeading - agent.headingRad));
              const alpha = Math.min(1.0, 0.15 * 60 * dtSim);
              agent.headingRad += alpha * diff;
            }
            break;
          }

          let targetNode = agent.targetNodeId ? this.nodeMap.get(agent.targetNodeId) || null : null;
          if (!targetNode || agent.pathNodeIds.length === 0) {
            targetNode = this.selectLookaheadTarget(agent);
            if (!targetNode) {
              this.handleArrival(agent);
              break;
            }
            agent.targetNodeId = targetNode.id;
          }

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

          const physicsRes = computeSteeringStep(i, {
            dtSim,
            facility: this.facility,
            fastMarchingSolvers: this.fastMarchingSolvers,
            obstacleBoxes: this.obstacleBoxes,
            agents: this.agents,
            hasLineOfSight: this.hasLineOfSight.bind(this),
            targetNode,
          });

          this.totalNegotiationDelaySeconds += physicsRes.totalNegotiationDelaySec;
          break;
        }

        case 'LOADING': {
          agent.batterySoc = Math.max(0, agent.batterySoc - agent.dischargeRatePerSec * 0.2 * dtSim);
          agent.timerSeconds -= dtSim;

          if (agent.timerSeconds <= 0) {
            agent.cargoPayload = true;

            // WMS Адресное хранение: отбираем стеллажи, где есть свободные места
            const freeStorageNodes = this.storageNodes.filter((node) => {
              const rack = this.rackOccupancy.get(node.id);
              return rack ? rack.current < rack.capacity : true;
            });

            // Находим ближайший свободный стеллаж (или резервный узел, если все забито)
            const target = freeStorageNodes.length > 0
              ? (this.findClosestNode(agent.currentNodeId, freeStorageNodes) || freeStorageNodes[0])
              : (this.storageNodes[0] || this.outboundNodes[0]);

            if (target) {
              agent.assignedDeliveryNodeId = target.id;
              
              // Бронируем ячейку на стеллаже под привозимую паллету
              const rack = this.rackOccupancy.get(target.id);
              if (rack) {
                rack.current += 1;
              }

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
              const charger = this.findUnoccupiedChargerNode(agent.currentNodeId);
              if (charger) {
                agent.assignedChargerNodeId = charger.id;
                agent.pathNodeIds = this.getShortestPath(agent.currentNodeId, charger.id);

                if (agent.pathNodeIds.length > 1) {
                  agent.pathNodeIds.shift();
                  agent.targetNodeId = agent.pathNodeIds[0];
                  agent.state = 'MOVING_TO_CHARGE';
                  agent.isQueued = false;
                } else {
                  agent.state = 'CHARGING';
                  agent.isQueued = false;
                }
              } else {
                agent.state = 'IDLE';
                agent.isQueued = true;
              }
            } else {
              agent.state = 'IDLE';
            }
          }
          break;
        }

        case 'CHARGING': {
          agent.batterySoc = Math.min(100, agent.batterySoc + agent.chargeRatePerSec * dtSim);

          // Preemption: if new pallets arrived at DOCK_INBOUND
          if (this.inboundPalletsAvailable > 0) {
            const chargingRobots = this.agents.filter((a) => a.state === 'CHARGING');
            const highestSocRobot = chargingRobots.reduce((max, curr) => (curr.batterySoc > max.batterySoc ? curr : max), chargingRobots[0]);

            if (highestSocRobot && highestSocRobot.id === agent.id && agent.batterySoc >= 30) {
              agent.assignedChargerNodeId = null;
              agent.state = 'IDLE';
              break;
            }
          }

          if (agent.batterySoc >= 98) {
            agent.assignedChargerNodeId = null;
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

  private findUnoccupiedChargerNode(fromNodeId: string): GraphNode | null {
    const fromNode = this.nodeMap.get(fromNodeId);
    if (!fromNode || this.chargingNodes.length === 0) return null;

    const claimedChargerIds = new Set(
      this.agents
        .filter((a) => a.state === 'CHARGING' || a.state === 'MOVING_TO_CHARGE')
        .map((a) => a.assignedChargerNodeId)
        .filter((id): id is string => id !== null)
    );

    const freeChargers = this.chargingNodes.filter((c) => !claimedChargerIds.has(c.id));
    if (freeChargers.length === 0) return null;

    let closest: GraphNode | null = null;
    let minD = Infinity;

    freeChargers.forEach((cand) => {
      const d = Math.hypot(cand.x - fromNode.x, cand.y - fromNode.y);
      if (d < minD) {
        minD = d;
        closest = cand;
      }
    });

    return closest;
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

  public runSimulation(options: RunSimulationOptions): ExtendedSimulationResult {
    this.initializeFleet(options.supplySchedule);

    const durationHours = Math.max(1, options.durationHours ?? 1.0);
    const dtSim = 0.5;
    const totalSimulatedSeconds = Math.round(durationHours * 3600);
    const totalTicks = Math.round(totalSimulatedSeconds / dtSim);
    const targetReplayFramesCount = options.targetReplayFramesCount ?? 7200;
    const recordReplay = options.recordReplay ?? false;

    const recordStride = Math.max(1, Math.floor(totalTicks / targetReplayFramesCount));
    const recorder = new ReplayRecorder(this.agents.length);

    for (let i = 0; i < this.agents.length; i++) {
      recorder.initAgentState(i, this.agents[i]);
    }

    this.replayFrames = [];

    for (let tick = 0; tick < totalTicks; tick++) {
      this.update(dtSim);
      recorder.recordTick(tick, this.agents, {
        recordReplay,
        recordStride,
        totalTicks,
        dtSim,
      });
    }

    this.replayFrames = recorder.replayFrames;

    const totalDelivered = this.completedDeliveries;
    const elapsedHours = this.elapsedSimSeconds / 3600;
    const realizedThroughputPerHour =
      elapsedHours > 0 ? Math.round((totalDelivered / elapsedHours) * 10) / 10 : 0;

    const totalTargetQuota = options.targetHourlyQuota * durationHours;
    const quotaFulfillmentPercent =
      totalTargetQuota > 0 ? Math.round((totalDelivered / totalTargetQuota) * 1000) / 10 : 0;

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

    const N = this.agents.length;
    const averageIdleTimePercent =
      N > 0 && totalTicks > 0
        ? Math.round((recorder.totalIdleTicks / (N * totalTicks)) * 10000) / 100
        : 0;

    const totalCorridorWaitSeconds = this.agents.reduce((sum, a) => sum + a.corridorWaitTimeSec, 0);
    const bottleneckDetected = this.agents.some((a) => a.corridorWaitTimeSec >= 5.0);

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
      deadlocksDetected: recorder.deadlocksDetected,
      deliveriesByRobotType: { ...this.deliveriesByRobotType },
      totalBreakdowns: this.totalBreakdowns,
      totalNegotiationDelaySeconds: Math.round(this.totalNegotiationDelaySeconds * 10) / 10,
      totalCorridorWaitSeconds: Math.round(totalCorridorWaitSeconds * 10) / 10,
      bottleneckDetected,
    };
  }

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

    const totalCorridorWaitSeconds = this.agents.reduce((sum, a) => sum + a.corridorWaitTimeSec, 0);
    const bottleneckDetected = this.agents.some((a) => a.corridorWaitTimeSec >= 5.0);

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
      totalCorridorWaitSeconds: Math.round(totalCorridorWaitSeconds * 10) / 10,
      bottleneckDetected,
    };
  }
}
