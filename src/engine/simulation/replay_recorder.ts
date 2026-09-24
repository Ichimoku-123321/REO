import type {
  AgentFSMState,
  AgentSnapshot,
  AgentState,
  ExtendedSimulationResult,
  OneHourSimulationResult,
  SimulationReplayFrame,
  SimulationTelemetry,
} from './types.js';

export interface ReplayRecorderConfig {
  recordReplay: boolean;
  recordStride: number;
  totalTicks: number;
  dtSim: number;
}

export class ReplayRecorder {
  public replayFrames: SimulationReplayFrame[] = [];
  public totalIdleTicks: number = 0;
  public deadlocksDetected: number = 0;

  private stuckTicksPerAgent: Uint16Array;
  private prevX: Float64Array;
  private prevY: Float64Array;
  private prevStates: AgentFSMState[];
  private prevSpeeds: Float64Array;

  constructor(agentsCount: number) {
    this.stuckTicksPerAgent = new Uint16Array(agentsCount);
    this.prevX = new Float64Array(agentsCount);
    this.prevY = new Float64Array(agentsCount);
    this.prevStates = new Array(agentsCount);
    this.prevSpeeds = new Float64Array(agentsCount);
  }

  public initAgentState(i: number, agent: AgentState): void {
    this.prevX[i] = agent.x;
    this.prevY[i] = agent.y;
    this.prevStates[i] = agent.state;
    this.prevSpeeds[i] = 0;
  }

  public recordTick(
    tick: number,
    agents: AgentState[],
    config: ReplayRecorderConfig
  ): void {
    const { recordReplay, recordStride, dtSim } = config;
    const isRecordTick = recordReplay && tick % recordStride === 0;
    const N = agents.length;

    let frameEvents: Array<'PICKUP' | 'DROPOFF' | 'CHARGE_START' | 'CHARGE_END' | 'BRAKE'> | undefined = undefined;
    const agentSnapshots: AgentSnapshot[] = isRecordTick ? new Array(N) : [];

    for (let i = 0; i < N; i++) {
      const agent = agents[i];
      const distMoved = Math.hypot(agent.x - this.prevX[i], agent.y - this.prevY[i]);
      const speedMps = distMoved / dtSim;

      if (recordReplay) {
        const prevState = this.prevStates[i];
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
          this.prevSpeeds[i] > 0.4 &&
          speedMps < 0.1
        ) {
          if (!frameEvents) frameEvents = [];
          if (!frameEvents.includes('BRAKE')) frameEvents.push('BRAKE');
        }

        this.prevStates[i] = currState;
        this.prevSpeeds[i] = speedMps;
      }

      this.prevX[i] = agent.x;
      this.prevY[i] = agent.y;

      const hasActiveTask = agent.state !== 'IDLE' && agent.state !== 'CHARGING';
      const isQueuedSnapshot = agent.isQueued || (speedMps < 0.05 && hasActiveTask);

      if (hasActiveTask) {
        if (isQueuedSnapshot) {
          this.totalIdleTicks++;
        }

        if (speedMps < 0.05) {
          this.stuckTicksPerAgent[i]++;
          if (this.stuckTicksPerAgent[i] === 60) {
            this.deadlocksDetected++;
          }
        } else {
          this.stuckTicksPerAgent[i] = 0;
        }
      } else {
        this.stuckTicksPerAgent[i] = 0;
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
          isDeadlocked: this.stuckTicksPerAgent[i] >= 60,
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
}
