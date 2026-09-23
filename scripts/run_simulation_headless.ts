import fs from 'node:fs';
import path from 'node:path';
import { rebuildTopologyFromGrid, type ConstructorGrid } from '../src/engine/constructor_engine.js';
import { SimulationEngine } from '../src/engine/simulation_engine.js';
import type { Robot } from '../src/types/robot.js';
import { SEED_ROBOTS } from '../src/data/robots.seed.js';

interface CLIArgs {
  file: string;
  ticks: number;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  let file = '.debug_logs/latest_snapshot.json';
  let ticks = 600;

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--file=')) {
      file = args[i].split('=')[1];
    } else if (args[i] === '--file' && args[i + 1]) {
      file = args[++i];
    } else if (args[i].startsWith('--ticks=')) {
      ticks = parseInt(args[i].split('=')[1], 10);
    } else if (args[i] === '--ticks' && args[i + 1]) {
      ticks = parseInt(args[++i], 10);
    }
  }

  return { file, ticks };
}

function log(msg: string, logFilePath?: string) {
  console.log(msg);
  if (logFilePath) {
    fs.appendFileSync(logFilePath, msg + '\n', 'utf-8');
  }
}

export async function runHeadlessSimulationCLI() {
  const { file, ticks } = parseArgs();

  const logDir = path.resolve(process.cwd(), '.debug_logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFilePath = path.join(logDir, 'simulation_run.log');
  fs.writeFileSync(logFilePath, '', 'utf-8');

  log(`=======================================================`, logFilePath);
  log(`🤖 HEADLESS ROBOT SIMULATION CLI RUNNER`, logFilePath);
  log(`=======================================================`, logFilePath);
  log(`Timestamp: ${new Date().toISOString()}`, logFilePath);
  log(`Loading snapshot file: ${file}`, logFilePath);
  log(`Target sim ticks: ${ticks}`, logFilePath);

  const resolvedFilePath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolvedFilePath)) {
    log(`❌ ERROR: Snapshot file not found at ${resolvedFilePath}`, logFilePath);
    process.exit(1);
  }

  let snapshotData: any;
  try {
    const content = fs.readFileSync(resolvedFilePath, 'utf-8');
    snapshotData = JSON.parse(content);
  } catch (err: any) {
    log(`❌ ERROR: Failed to parse snapshot JSON: ${err.message}`, logFilePath);
    process.exit(1);
  }

  // Reconstruct ConstructorGrid from snapshot
  const tilesMap = new Map<string, any>();
  const elementDetailsMap = new Map<string, any>();

  if (Array.isArray(snapshotData.elements)) {
    for (const el of snapshotData.elements) {
      tilesMap.set(el.key, el.type);
      if (el.skuId || el.slots !== undefined || el.rotationDeg !== undefined) {
        elementDetailsMap.set(el.key, {
          skuId: el.skuId,
          slotsPerRack: el.slots,
          rotationDeg: el.rotationDeg,
        });
      }
    }
  }

  const cellSizeM = snapshotData.grid?.cellSizeM || 2.0;
  const cols = snapshotData.grid?.cols || 50;
  const rows = snapshotData.grid?.rows || 50;

  const grid: ConstructorGrid = {
    cols,
    rows,
    cellSizeM,
    tiles: tilesMap,
    elementDetails: elementDetailsMap,
    floor: snapshotData.floor,
  };

  const widthM = cols * cellSizeM;
  const lengthM = rows * cellSizeM;

  log(`Building navigation topology graph (${widthM}m x ${lengthM}m)...`, logFilePath);
  const topology = rebuildTopologyFromGrid(grid, widthM, lengthM);

  log(`Graph built: ${topology.nodes.length} nodes, ${topology.edges.length} edges.`, logFilePath);

  // Check for isolated nodes / unreachable docks
  const inboundCount = snapshotData.docks?.inbound ?? topology.nodes.filter(n => n.type === 'INBOUND_DOCK').length;
  const outboundCount = snapshotData.docks?.outbound ?? topology.nodes.filter(n => n.type === 'OUTBOUND_DOCK').length;
  const rackCount = topology.nodes.filter(n => n.type === 'STORAGE_AISLE').length;

  log(`Layout Summary: ${inboundCount} Inbound Docks, ${outboundCount} Outbound Docks, ${rackCount} Racks.`, logFilePath);

  let hasErrors = false;
  if (inboundCount === 0 || outboundCount === 0 || rackCount === 0) {
    log(`⚠️ WARNING: Unreachable destination or incomplete layout (requires at least 1 Inbound, 1 Outbound, and 1 Rack).`, logFilePath);
    hasErrors = true;
  }

  // Choose robot config
  let robotSpec: Robot = SEED_ROBOTS[0];
  if (snapshotData.robot) {
    robotSpec = snapshotData.robot;
  } else {
    // Standard AMR default spec
    robotSpec = {
      id: 'default_amr',
      vendor: 'Generic',
      model: 'AMR-1000',
      type: 'AMR',
      maxSpeedMps: 1.5,
      payloadKg: 1000,
      batteryRuntimeHours: 8,
      batteryChargeMinutes: 60,
      throughputPerHour: 30,
      capexCostRub: 2500000,
      opexAnnualRub: 150000,
      supportedIndustries: ['warehouse', 'custom'],
      aisleWidthRequiredM: 1.8,
      dimensionsMm: { length: 1000, width: 800, height: 350 },
    };
  }

  const fleetSize = Math.max(2, Math.min(10, Math.floor(rackCount / 2) || 2));
  log(`Spawning robot fleet: ${fleetSize}x ${robotSpec.vendor} ${robotSpec.model} (Max Speed: ${robotSpec.maxSpeedMps}m/s, Payload: ${robotSpec.payloadKg}kg)...`, logFilePath);

  const engine = new SimulationEngine(topology, robotSpec, fleetSize);

  let collisionCount = 0;
  let deadlockCount = 0;
  const stuckTicksMap = new Map<string, number>();

  const dtSim = 0.5;
  log(`Starting simulation loop for ${ticks} ticks (dt = ${dtSim}s)...`, logFilePath);

  for (let tick = 1; tick <= ticks; tick++) {
    engine.update(dtSim);

    // Telemetry & Collision Check
    const agents = engine.agents;
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a1 = agents[i];
        const a2 = agents[j];
        const dist = Math.hypot(a1.x - a2.x, a1.y - a2.y);
        const minDist = a1.robotRadius + a2.robotRadius;

        if (dist < minDist * 0.8) {
          collisionCount++;
          log(`⚠️ COLLISION WARNING [Tick ${tick}]: ${a1.id} and ${a2.id} overlapped at (${a1.x.toFixed(2)}, ${a1.y.toFixed(2)}) dist=${dist.toFixed(2)}m`, logFilePath);
          hasErrors = true;
        }
      }

      // Deadlock check
      const agent = agents[i];
      const hasActiveTask = agent.state !== 'IDLE' && agent.state !== 'CHARGING';
      if (hasActiveTask && agent.targetNodeId) {
        const currentStuck = (stuckTicksMap.get(agent.id) || 0) + 1;
        stuckTicksMap.set(agent.id, currentStuck);

        if (currentStuck > 10 && currentStuck % 20 === 0) {
          deadlockCount++;
          log(`🚨 DEADLOCK ALERT [Tick ${tick}]: ${agent.id} stuck for ${currentStuck} ticks at (${agent.x.toFixed(2)}, ${agent.y.toFixed(2)}) state=${agent.state}`, logFilePath);
          hasErrors = true;
        }
      } else {
        stuckTicksMap.set(agent.id, 0);
      }
    }
  }

  log(`-------------------------------------------------------`, logFilePath);
  log(`📊 FINAL SIMULATION METRICS:`, logFilePath);
  log(`• Total Pallets Delivered: ${engine.completedDeliveries}`, logFilePath);
  log(`• Simulated Time: ${(ticks * dtSim).toFixed(1)} seconds`, logFilePath);
  log(`• Collision Events: ${collisionCount}`, logFilePath);
  log(`• Deadlock Events (>10 ticks): ${deadlockCount}`, logFilePath);
  log(`• Total Breakdowns: ${engine.totalBreakdowns}`, logFilePath);
  log(`-------------------------------------------------------`, logFilePath);

  if (hasErrors || collisionCount > 0 || deadlockCount > 0) {
    log(`❌ STATUS: FAILED (Collisions or Deadlocks detected)`, logFilePath);
    process.exit(1);
  } else {
    log(`✅ STATUS: SUCCESS (All tasks executed without deadlocks)`, logFilePath);
    process.exit(0);
  }
}

runHeadlessSimulationCLI().catch((err) => {
  console.error('Fatal CLI exception:', err);
  process.exit(1);
});
