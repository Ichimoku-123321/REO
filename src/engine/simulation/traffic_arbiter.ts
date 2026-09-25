import type { FacilityTopology, GraphNode } from '../../types/topology.js';
import type { AgentState, ObstacleBox } from './types.js';

export class TrafficArbiter {
  private corridorNodeIds: Set<string> = new Set();
  private activeCorridorAgentId: string | null = null;
  private activeDirection: 'EAST' | 'WEST' | null = null;
  private currentCorridorUsers: Set<string> = new Set();
  private waitingAgentQueueTimestamps: Map<string, number> = new Map();

  constructor(topology: FacilityTopology, obstacleBoxes: ObstacleBox[]) {
    this.identifyCorridorNodes(topology, obstacleBoxes);
  }

  /**
   * Identifies narrow single-lane corridor nodes bounded strictly by obstacles on both sides,
   * plus transit throat entrance nodes (`c_node_1_1` and `c_node_10_1`) to keep exit throats completely clear.
   */
  private identifyCorridorNodes(topology: FacilityTopology, obstacleBoxes: ObstacleBox[]): void {
    this.corridorNodeIds.clear();

    const singleLaneNodes = new Set<string>();

    for (const node of topology.nodes) {
      let northWallDist = Infinity;
      let southWallDist = Infinity;

      for (const box of obstacleBoxes) {
        if (node.x >= box.minX - 0.2 && node.x <= box.maxX + 0.2) {
          if (box.minY >= node.y) {
            northWallDist = Math.min(northWallDist, box.minY - node.y);
          }
          if (box.maxY <= node.y) {
            southWallDist = Math.min(southWallDist, node.y - box.maxY);
          }
        }
      }

      // Single lane if bounded by solid obstacles on both north & south within 1.2m
      if (northWallDist < 1.2 && southWallDist < 1.2) {
        singleLaneNodes.add(node.id);
        this.corridorNodeIds.add(node.id);
      }
    }

    // Include exit/entrance throat nodes connected to single-lane corridor nodes into the reservation zone
    for (const edge of topology.edges) {
      if (singleLaneNodes.has(edge.source)) {
        this.corridorNodeIds.add(edge.target);
      }
      if (singleLaneNodes.has(edge.target)) {
        this.corridorNodeIds.add(edge.source);
      }
    }
  }

  public isCorridorNode(nodeId: string): boolean {
    return this.corridorNodeIds.has(nodeId);
  }

  /**
   * Requests access to enter or traverse a narrow corridor segment.
   * Implements FIFO / Fair Queuing priority to prevent Starvation.
   */
  public requestCorridorAccess(
    agent: AgentState,
    nodeMap: Map<string, GraphNode>,
    currentTimeSec: number = 0
  ): boolean {
    const currentIsCorridor = this.corridorNodeIds.has(agent.currentNodeId);
    const targetIsCorridor = agent.targetNodeId ? this.corridorNodeIds.has(agent.targetNodeId) : false;
    const nextIsCorridor = agent.pathNodeIds.length > 0 && this.corridorNodeIds.has(agent.pathNodeIds[0]);

    const needsCorridor = currentIsCorridor || targetIsCorridor || nextIsCorridor;

    if (!needsCorridor) {
      this.waitingAgentQueueTimestamps.delete(agent.id);
      if (this.currentCorridorUsers.has(agent.id)) {
        this.releaseCorridor(agent.id);
      }
      return true;
    }

    // If agent is ALREADY inside the corridor nodes, allow it to proceed and exit
    if (currentIsCorridor) {
      this.waitingAgentQueueTimestamps.delete(agent.id);
      this.currentCorridorUsers.add(agent.id);
      this.activeCorridorAgentId = agent.id;
      return true;
    }

    // Agent is in the entrance pocket attempting to enter the corridor
    if (!this.waitingAgentQueueTimestamps.has(agent.id)) {
      this.waitingAgentQueueTimestamps.set(agent.id, currentTimeSec);
    }

    // Check FIFO priority: if another agent has been waiting in the queue longer, yield priority!
    const myWaitTime = this.waitingAgentQueueTimestamps.get(agent.id) ?? currentTimeSec;
    let hasOlderWaitingAgent = false;

    this.waitingAgentQueueTimestamps.forEach((waitTs, otherId) => {
      if (otherId !== agent.id && waitTs < myWaitTime - 0.1) {
        hasOlderWaitingAgent = true;
      }
    });

    if (hasOlderWaitingAgent && this.activeCorridorAgentId !== agent.id) {
      if (this.currentCorridorUsers.size === 0) {
        // Find the oldest waiting agent and grant them corridor lock
        let oldestAgentId: string | null = null;
        let oldestTs = Infinity;
        this.waitingAgentQueueTimestamps.forEach((waitTs, otherId) => {
          if (waitTs < oldestTs) {
            oldestTs = waitTs;
            oldestAgentId = otherId;
          }
        });
        if (oldestAgentId && oldestAgentId !== agent.id) {
          this.activeCorridorAgentId = oldestAgentId;
          return false;
        }
      } else {
        return false;
      }
    }

    // Check if corridor is currently occupied or reserved by another agent
    if (this.activeCorridorAgentId !== null && this.activeCorridorAgentId !== agent.id) {
      if (this.currentCorridorUsers.size > 0) {
        return false;
      }
    }

    let direction: 'EAST' | 'WEST' = 'EAST';
    const targetNode = agent.targetNodeId ? nodeMap.get(agent.targetNodeId) : null;
    if (targetNode && targetNode.x < agent.x) {
      direction = 'WEST';
    }

    // Lock corridor for this agent and direction
    this.activeCorridorAgentId = agent.id;
    this.activeDirection = direction;
    this.currentCorridorUsers.add(agent.id);
    this.waitingAgentQueueTimestamps.delete(agent.id);
    return true;
  }

  /**
   * Releases corridor lock when agent exits the narrow corridor.
   */
  public releaseCorridor(agentId: string): void {
    this.currentCorridorUsers.delete(agentId);
    if (this.activeCorridorAgentId === agentId) {
      if (this.currentCorridorUsers.size === 0) {
        this.activeCorridorAgentId = null;
        this.activeDirection = null;
      } else {
        this.activeCorridorAgentId = Array.from(this.currentCorridorUsers)[0];
      }
    }
  }
}
