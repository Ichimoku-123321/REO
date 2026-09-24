import fs from 'node:fs';
import path from 'node:path';
import { rebuildTopologyFromGrid, type ConstructorGrid } from '../../src/engine/constructor_engine.js';
import { SimulationEngine } from '../../src/engine/simulation_engine.js';
import type { FacilityRequirements } from '../../src/types/facility.js';
import { SEED_ROBOTS } from '../../src/data/robots.seed.js';

console.log('🚀 [STRESS_TEST_BATTERY_10H]: Starting 10-Hour Battery Stress Test with Decimation...');

const cellSizeM = 2.0;
const widthM = 24.0;
const lengthM = 16.0;

const grid: ConstructorGrid = {
  cols: 12,
  rows: 8,
  cellSizeM,
  tiles: new Map(),
  elementDetails: new Map(),
  floor: {
    type: 'RECTANGLE',
    bounds: { minX: 0, maxX: 11, minZ: 0, maxZ: 7 },
    areaSqm: Math.round(widthM * lengthM),
  },
};

// Build floor
for (let x = 0; x < 12; x++) {
  for (let z = 0; z < 8; z++) {
    grid.tiles.set(`${x}_${z}`, 'EMPTY_FLOOR');
  }
}

// Infrastructure
grid.tiles.set('0_0', 'CHARGER');
grid.tiles.set('0_2', 'DOCK_INBOUND');
grid.tiles.set('11_2', 'DOCK_OUTBOUND');

// Racks
for (let x = 4; x <= 8; x += 2) {
  for (let z = 1; z <= 6; z++) {
    grid.tiles.set(`${x}_${z}`, 'RACK');
    grid.elementDetails!.set(`${x}_${z}`, { slotsPerRack: 12 });
  }
}

const topology = rebuildTopologyFromGrid(grid, widthM, lengthM);
const robotSpec = SEED_ROBOTS.find((r) => r.id === 'ronavi-h1500') ?? SEED_ROBOTS[0];

const facilityReqs: FacilityRequirements = {
  facilityWidthM: widthM,
  facilityLengthM: lengthM,
  ceilingHeightM: 8.0,
  aisleWidthM: 2.5,
  industry: 'custom',
  targetThroughputPerHour: 20,
  operatingShiftsPerDay: 1,
  hoursPerShift: 10,
  operatingTempRange: { min: -10, max: 40 },
};

const supplySchedule = {
  inboundIntervalValue: 2,
  inboundIntervalUnit: 'hours' as const,
  inboundBatchVolume: 15,
  outboundIntervalValue: 2,
  outboundIntervalUnit: 'hours' as const,
  outboundBatchVolume: 15,
};

const engine = new SimulationEngine(topology, robotSpec, 2, facilityReqs);
engine.initializeFleet(supplySchedule);

// Ensure starting battery SoC is strictly 100% for both robots
for (const agent of engine.agents) {
  agent.batterySoc = 100.0;
}

const totalHours = 10;
const dtSim = 0.5;
const totalSimulatedSeconds = Math.round(totalHours * 3600);
const totalTicks = Math.round(totalSimulatedSeconds / dtSim); // 72,000 ticks

const recordStride = Math.max(1, Math.floor(totalTicks / 500)); // 144

const logDir = path.resolve(process.cwd(), '.debug_logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const telemetryLogPath = path.join(logDir, 'oracle_telemetry.log');
fs.writeFileSync(
  telemetryLogPath,
  `=======================================================\n` +
    `🔮 ORACLE RAW TELEMETRY SNIFFER LOG (10H BATTERY STRESS TEST)\n` +
    `Timestamp: ${new Date().toISOString()}\n` +
    `Fleet: 2x ${robotSpec.vendor} ${robotSpec.model} | Ticks: ${totalTicks} (${totalHours}h, dt=${dtSim}s, stride=${recordStride})\n` +
    `=======================================================\n`,
  'utf-8'
);

const prevPositionsMap = new Map<string, { x: number; y: number }>();
const prevAgentStatesMap = new Map<string, string>();

let minBatterySoc = 100.0;
const agentChargingTicksMap = new Map<string, number>();
for (const agent of engine.agents) {
  agentChargingTicksMap.set(agent.id, 0);
}

console.log(`⏳ Running 10-hour simulation (${totalTicks} ticks, stride=${recordStride})...`);

for (let tick = 1; tick <= totalTicks; tick++) {
  engine.update(dtSim);
  const simTime = tick * dtSim;

  let shouldLogTick = tick % recordStride === 0 || tick === totalTicks;
  const tickLogLines: string[] = [];

  for (const agent of engine.agents) {
    if (agent.batterySoc < minBatterySoc) {
      minBatterySoc = agent.batterySoc;
    }

    if (agent.state === 'CHARGING') {
      agentChargingTicksMap.set(agent.id, (agentChargingTicksMap.get(agent.id) || 0) + 1);
    }

    const prevState = prevAgentStatesMap.get(agent.id);
    if (prevState !== undefined && prevState !== agent.state) {
      if (['CHARGING', 'MOVING_TO_CHARGE', 'LOADING'].includes(agent.state)) {
        shouldLogTick = true;
      }
    }
    prevAgentStatesMap.set(agent.id, agent.state);

    const prevPos = prevPositionsMap.get(agent.id);
    const distMoved = prevPos ? Math.hypot(agent.x - prevPos.x, agent.y - prevPos.y) : 0;
    const speedMps = distMoved / dtSim;
    prevPositionsMap.set(agent.id, { x: agent.x, y: agent.y });

    const angleDeg = (agent.headingRad * 180) / Math.PI;

    const rawAgentSnapshot = {
      id: agent.id,
      pos: { x: Number(agent.x.toFixed(2)), y: Number(agent.y.toFixed(2)), z: agent.z },
      distMoved: Number(distMoved.toFixed(3)),
      angleDeg: Number(angleDeg.toFixed(1)),
      speedMps: Number(speedMps.toFixed(2)),
      state: agent.state,
      batterySoc: Number(agent.batterySoc.toFixed(1)),
      cargoPayload: agent.cargoPayload,
      isQueued: agent.isQueued,
      pathNodeIds: agent.pathNodeIds,
      pathLeft: agent.pathNodeIds.length,
      currentNodeId: agent.currentNodeId,
      targetNodeId: agent.targetNodeId,
      assignedInboundNodeId: agent.assignedInboundNodeId,
      assignedDeliveryNodeId: agent.assignedDeliveryNodeId,
      assignedChargerNodeId: agent.assignedChargerNodeId,
      accumulatedOperatingHours: Number(agent.accumulatedOperatingHours.toFixed(4)),
      breakdownCount: agent.breakdownCount,
      robotRadius: agent.robotRadius,
      maxSpeed: agent.maxSpeed,
      robotModel: `${agent.robotSpec.vendor} ${agent.robotSpec.model}`,
    };

    tickLogLines.push(`[Tick ${tick} | t=${simTime.toFixed(1)}s] ` + JSON.stringify(rawAgentSnapshot));
  }

  if (shouldLogTick) {
    fs.appendFileSync(telemetryLogPath, tickLogLines.join('\n') + '\n', 'utf-8');
  }
}

const completedDeliveries = engine.completedDeliveries;
let totalChargingTimeSec = 0;
agentChargingTicksMap.forEach((ticks) => {
  totalChargingTimeSec += ticks * dtSim;
});

console.log('-------------------------------------------------------');
console.log(`📊 10-Hour Simulation Summary:`);
console.log(`- Completed Deliveries: ${completedDeliveries}`);
console.log(`- Minimum Battery SoC: ${minBatterySoc.toFixed(1)}%`);
console.log(`- Total Charging Time across fleet: ${totalChargingTimeSec.toFixed(1)}s`);
console.log('-------------------------------------------------------');

// Executioner Assertions

// Assertion 1: minBatterySoc > 10%
if (minBatterySoc <= 10.0) {
  console.error(`🚨 [TEST_FAILED]: Robot battery drained below 10% (minBatterySoc = ${minBatterySoc.toFixed(1)}%)!`);
  process.exit(1);
}

// Assertion 2: totalChargingTimeSec > 0
if (totalChargingTimeSec <= 0) {
  console.error(`🚨 [TEST_FAILED]: Robots never used charging stations during 10 hours (totalChargingTimeSec = 0)!`);
  process.exit(1);
}

// Assertion 3: completedDeliveries >= 45
if (completedDeliveries < 45) {
  console.error(`🚨 [TEST_FAILED]: Delivered ${completedDeliveries} pallets, expected >= 45!`);
  process.exit(1);
}

console.log('✅ [TEST_PASSED]: 10-hour battery stress test passed with opportunity charging!');
process.exit(0);
