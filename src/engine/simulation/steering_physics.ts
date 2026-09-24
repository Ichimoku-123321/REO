import type { AgentState, ObstacleBox } from './types.js';
import type { FastMarchingSolver } from '../fast_marching.js';
import type { FacilityRequirements } from '../../types/facility.js';

export interface SteeringPhysicsContext {
  dtSim: number;
  facility?: FacilityRequirements;
  fastMarchingSolvers: Map<string, FastMarchingSolver>;
  obstacleBoxes: ObstacleBox[];
  agents: AgentState[];
  hasLineOfSight: (x1: number, y1: number, x2: number, y2: number, radius: number) => boolean;
  targetNode: { x: number; y: number } | null;
}

export function computeSteeringStep(
  agentIdx: number,
  ctx: SteeringPhysicsContext
): { vx: number; vy: number; currentSpeed: number; totalNegotiationDelaySec: number } {
  const { dtSim, facility, fastMarchingSolvers, obstacleBoxes, agents, hasLineOfSight, targetNode } = ctx;
  const agent = agents[agentIdx];

  let totalNegotiationDelaySec = 0;

  if (!targetNode) {
    return { vx: 0, vy: 0, currentSpeed: 0, totalNegotiationDelaySec: 0 };
  }

  // 1. Fast Marching Eikonal Gradient Guidance (F_att)
  const dx = targetNode.x - agent.x;
  const dy = targetNode.y - agent.y;
  const distToTarget = Math.hypot(dx, dy);

  let currentMaxSpeed = agent.maxSpeed;
  if (facility?.floorSurfaceQuality === 'uneven') {
    currentMaxSpeed *= 0.8;
  } else if (facility?.floorSurfaceQuality === 'superflat') {
    currentMaxSpeed *= 1.1;
  }
  if (agent.cargoPayload) {
    const payloadRatio = Math.min(1.0, (facility?.requiredPayloadKg ?? 100) / agent.robotSpec.payloadKg);
    currentMaxSpeed *= (1.0 - 0.15 * payloadRatio);
  }

  let fAttX = distToTarget > 0.001 ? dx / distToTarget : 0;
  let fAttY = distToTarget > 0.001 ? dy / distToTarget : 0;

  if (!hasLineOfSight(agent.x, agent.y, targetNode.x, targetNode.y, agent.robotRadius)) {
    const solver = fastMarchingSolvers.get('default');
    if (solver) {
      const eikonalField = solver.solveEikonalField(targetNode.x, targetNode.y);
      const grad = solver.getGradientVelocity(agent.x, agent.y, eikonalField, currentMaxSpeed);
      if (!grad.arrived && Math.hypot(grad.vx, grad.vy) > 0.001) {
        const gradSpeed = Math.hypot(grad.vx, grad.vy);
        fAttX = grad.vx / gradSpeed;
        fAttY = grad.vy / gradSpeed;
      }
    }
  }

  // 2. Static Obstacle Repulsion & Tangential Wall Sliding
  let fObsX = 0;
  let fObsY = 0;
  const dSafe = 1.2;

  for (const box of obstacleBoxes) {
    let cx = Math.max(box.minX, Math.min(agent.x, box.maxX));
    let cy = Math.max(box.minY, Math.min(agent.y, box.maxY));
    const dxObs = agent.x - cx;
    const dyObs = agent.y - cy;
    const dObsSq = dxObs * dxObs + dyObs * dyObs;

    if (dObsSq >= 1.44) continue;

    let dObs = Math.sqrt(dObsSq);

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

      cx = Math.max(box.minX, Math.min(agent.x, box.maxX));
      cy = Math.max(box.minY, Math.min(agent.y, box.maxY));
      dObs = Math.hypot(agent.x - cx, agent.y - cy);
    }

    if (dObs < dSafe) {
      const nx = dObs > 0.001 ? (agent.x - cx) / dObs : 1;
      const ny = dObs > 0.001 ? (agent.y - cy) / dObs : 0;
      const fMag = Math.min(8.0, Math.pow(1 / Math.max(0.2, dObs) - 1 / dSafe, 2));

      const dot = fAttX * nx + fAttY * ny;
      if (dot < 0) {
        fAttX -= dot * nx;
        fAttY -= dot * ny;
      }

      fObsX += fMag * nx;
      fObsY += fMag * ny;
    }
  }

  // 3. Dynamic Inter-Robot Avoidance
  let fAvoidX = 0;
  let fAvoidY = 0;
  let nearbyRobotCount = 0;

  const headCos = Math.cos(agent.headingRad);
  const headSin = Math.sin(agent.headingRad);
  const vRightX = headSin;
  const vRightY = -headCos;

  for (let j = 0; j < agents.length; j++) {
    if (agentIdx === j) continue;
    const other = agents[j];
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

      totalNegotiationDelaySec += dtSim * 0.1;
    }
  }

  agent.isQueued = nearbyRobotCount >= 2;

  // 4. Combine Forces
  const fTotalX = 1.0 * fAttX + 1.6 * fObsX + 1.3 * fAvoidX;
  const fTotalY = 1.0 * fAttY + 1.6 * fObsY + 1.3 * fAvoidY;
  const fTotalLen = Math.hypot(fTotalX, fTotalY);

  let vx = 0;
  let vy = 0;

  if (fTotalLen > 0.001) {
    vx = currentMaxSpeed * (fTotalX / fTotalLen);
    vy = currentMaxSpeed * (fTotalY / fTotalLen);
  }

  for (const box of obstacleBoxes) {
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

  // Update position & orientation
  agent.x += vx * dtSim;
  agent.y += vy * dtSim;

  const currentSpeed = Math.hypot(vx, vy);
  if (currentSpeed > 0.01) {
    const targetHeading = Math.atan2(vy, vx);
    const diff = Math.atan2(Math.sin(targetHeading - agent.headingRad), Math.cos(targetHeading - agent.headingRad));
    const alpha = Math.min(1.0, 0.15 * 60 * dtSim);
    agent.headingRad += alpha * diff;
  }

  return { vx, vy, currentSpeed, totalNegotiationDelaySec };
}
