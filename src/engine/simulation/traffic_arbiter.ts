import type { FacilityTopology, GraphNode } from '../../types/topology.js';
import type { AgentState, ObstacleBox } from './types.js';

export class TrafficArbiter {
  private corridorNodeIds: Set<string> = new Set();
  private activeCorridorAgentId: string | null = null;
  private activeDirection: 'EAST' | 'WEST' | null = null;
  private currentCorridorUsers: Set<string> = new Set();

  constructor(topology: FacilityTopology, obstacleBoxes: ObstacleBox[]) {
    this.identifyCorridorNodes(topology, obstacleBoxes);
  }

  /**
   * Identifies narrow single-lane corridor nodes bounded strictly by obstacles on both sides.
   */
  private identifyCorridorNodes(topology: FacilityTopology, obstacleBoxes: ObstacleBox[]): void {
    this.corridorNodeIds.clear();

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
        this.corridorNodeIds.add(node.id);
      }
    }
  }

  public isCorridorNode(nodeId: string): boolean {
    return this.corridorNodeIds.has(nodeId);
  }

  /**
   * Requests access to enter or traverse a narrow corridor segment.
   */
  public requestCorridorAccess(agent: AgentState, nodeMap: Map<string, GraphNode>): boolean {
    const currentIsCorridor = this.corridorNodeIds.has(agent.currentNodeId);
    const targetIsCorridor = agent.targetNodeId ? this.corridorNodeIds.has(agent.targetNodeId) : false;
    const nextIsCorridor = agent.pathNodeIds.length > 0 && this.corridorNodeIds.has(agent.pathNodeIds[0]);

    const needsCorridor = currentIsCorridor || targetIsCorridor || nextIsCorridor;

    if (!needsCorridor) {
      if (this.currentCorridorUsers.has(agent.id)) {
        this.releaseCorridor(agent.id);
      }
      return true;
    }

    // If agent is ALREADY inside the corridor nodes, allow it to proceed and exit
    if (currentIsCorridor) {
      this.currentCorridorUsers.add(agent.id);
      this.activeCorridorAgentId = agent.id;
      return true;
    }

    // Agent is in the pocket attempting to enter the corridor
    let direction: 'EAST' | 'WEST' = 'EAST';
    const targetNode = agent.targetNodeId ? nodeMap.get(agent.targetNodeId) : null;
    if (targetNode && targetNode.x < agent.x) {
      direction = 'WEST';
    }

    // Check if corridor is currently occupied or reserved by another agent
    if (this.activeCorridorAgentId !== null && this.activeCorridorAgentId !== agent.id) {
      // If another agent is in the corridor or moving in opposite direction -> deny
      if (this.currentCorridorUsers.size > 0) {
        return false;
      }
    }

    // Lock corridor for this agent and direction
    this.activeCorridorAgentId = agent.id;
    this.activeDirection = direction;
    this.currentCorridorUsers.add(agent.id);
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
