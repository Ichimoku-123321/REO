import type { Robot } from '../../types/robot.js';

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
  totalBreakdowns: number;
  totalNegotiationDelaySeconds: number;
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

  // Resource Wear & Breakdown
  accumulatedOperatingHours: number;
  breakdownCount: number;

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
