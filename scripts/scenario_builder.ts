import fs from 'node:fs';
import path from 'node:path';
import {
  rebuildTopologyFromGrid,
  type ConstructorGrid,
  type ConstructorTileType,
  type FloorDefinition,
} from '../src/engine/constructor_engine.js';
import { SimulationEngine } from '../src/engine/simulation_engine.js';
import type { Robot } from '../src/types/robot.js';
import { SEED_ROBOTS } from '../src/data/robots.seed.js';

export interface SimulationReport {
  completedDeliveries: number;
  simulatedSeconds: number;
  collisionCount: number;
  deadlockCount: number;
  status: 'SUCCESS' | 'FAILED';
  logFilePath: string;
}

export class WarehouseBuilder {
  private cols: number = 20;
  private rows: number = 20;
  private cellSizeM: number = 2.0;
  private tiles: Map<string, ConstructorTileType> = new Map();
  private elementDetails: Map<string, { skuId?: string; slotsPerRack?: number; rotationDeg?: number }> = new Map();
  private floor: FloorDefinition = {
    type: 'RECTANGLE',
    bounds: { minX: 0, maxX: 19, minZ: 0, maxZ: 19 },
    areaSqm: 1600,
  };

  constructor(cellSizeM: number = 2.0) {
    this.cellSizeM = cellSizeM;
  }

  setFloor(width: number, length: number): this {
    this.cols = Math.max(2, Math.ceil(width / this.cellSizeM));
    this.rows = Math.max(2, Math.ceil(length / this.cellSizeM));
    this.tiles = new Map();
    this.elementDetails = new Map();

    for (let x = 0; x < this.cols; x++) {
      for (let z = 0; z < this.rows; z++) {
        this.tiles.set(`${x}_${z}`, 'EMPTY_FLOOR');
      }
    }

    this.floor = {
      type: 'RECTANGLE',
      bounds: { minX: 0, maxX: this.cols - 1, minZ: 0, maxZ: this.rows - 1 },
      areaSqm: Math.round(width * length),
    };

    return this;
  }

  addRack(x: number, z: number, slots = 12, skuId?: string): this {
    const key = `${x}_${z}`;
    this.tiles.set(key, 'RACK');
    this.elementDetails.set(key, { slotsPerRack: slots, skuId });
    return this;
  }

  addWall(x: number, z: number): this {
    const key = `${x}_${z}`;
    this.tiles.set(key, 'OBSTACLE');
    return this;
  }

  addDock(x: number, z: number, type: 'INBOUND' | 'OUTBOUND'): this {
    const key = `${x}_${z}`;
    this.tiles.set(key, type === 'INBOUND' ? 'DOCK_INBOUND' : 'DOCK_OUTBOUND');
    return this;
  }

  addCharger(x: number, z: number): this {
    const key = `${x}_${z}`;
    this.tiles.set(key, 'CHARGER');
    return this;
  }

  build(): ConstructorGrid {
    return {
      cols: this.cols,
      rows: this.rows,
      cellSizeM: this.cellSizeM,
      tiles: new Map(this.tiles),
      elementDetails: new Map(this.elementDetails),
      floor: { ...this.floor },
    };
  }

  saveSnapshot(filename: string): void {
    const filePath = path.resolve(process.cwd(), filename);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const grid = this.build();
    const elements: any[] = [];
    let inboundDocks = 0;
    let outboundDocks = 0;

    grid.tiles.forEach((type, key) => {
      const [xStr, zStr] = key.split('_');
      const gx = parseInt(xStr, 10);
      const gz = parseInt(zStr, 10);
      if (type === 'DOCK_INBOUND') inboundDocks++;
      if (type === 'DOCK_OUTBOUND') outboundDocks++;

      const details = grid.elementDetails?.get(key);
      elements.push({
        key,
        type,
        x: gx,
        z: gz,
        skuId: details?.skuId,
        slots: details?.slotsPerRack ?? (type === 'RACK' ? 12 : undefined),
        rotationDeg: details?.rotationDeg ?? 0,
        inFloor: true,
      });
    });

    const snapshotData = {
      action: 'SAVE_SNAPSHOT_SCENARIO',
      timestamp: Date.now(),
      grid: {
        cols: grid.cols,
        rows: grid.rows,
        cellSizeM: grid.cellSizeM,
      },
      floor: grid.floor,
      tilesCount: grid.tiles.size,
      elements,
      docks: { inbound: inboundDocks, outbound: outboundDocks },
      healthCheck: 'HEALTHY',
    };

    fs.writeFileSync(
      filePath,
      JSON.stringify(snapshotData, null, 2),
      'utf-8'
    );
  }

  runHeadlessSimulation(ticks = 600, explicitFleetSize?: number): SimulationReport {
    const logDir = path.resolve(process.cwd(), '.debug_logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFilePath = path.join(logDir, 'simulation_run.log');
    const writeLog = (msg: string) => {
      console.log(msg);
      fs.appendFileSync(logFilePath, msg + '\n', 'utf-8');
    };

    fs.writeFileSync(logFilePath, '', 'utf-8');

    writeLog('=======================================================');
    writeLog('🤖 AUTONOMOUS HEADLESS WAREHOUSE SIMULATION RUNNER');
    writeLog('=======================================================');
    writeLog(`Timestamp: ${new Date().toISOString()}`);
    writeLog(`Simulating duration: ${ticks} ticks`);

    const grid = this.build();
    const widthM = grid.cols * grid.cellSizeM;
    const lengthM = grid.rows * grid.cellSizeM;

    writeLog(`Building navigation topology graph (${widthM}m x ${lengthM}m)...`);
    const topology = rebuildTopologyFromGrid(grid, widthM, lengthM);
    writeLog(`Graph built: ${topology.nodes.length} nodes, ${topology.edges.length} edges.`);

    const rackCount = Array.from(grid.tiles.values()).filter((t) => t === 'RACK').length;
    const robotSpec: Robot = SEED_ROBOTS[0];
    const fleetSize = explicitFleetSize ?? Math.max(2, Math.min(4, Math.floor(rackCount / 10) || 2));

    writeLog(`Spawning robot fleet: ${fleetSize}x ${robotSpec.vendor} ${robotSpec.model}...`);

    const engine = new SimulationEngine(topology, robotSpec, fleetSize);

    let collisionCount = 0;
    let deadlockCount = 0;
    const stuckTicksMap = new Map<string, number>();
    const prevPositionsMap = new Map<string, { x: number; y: number }>();
    const dtSim = 0.5;

    for (let tick = 1; tick <= ticks; tick++) {
      engine.update(dtSim);

      const agents = engine.agents;
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const a1 = agents[i];
          const a2 = agents[j];
          const dist = Math.hypot(a1.x - a2.x, a1.y - a2.y);
          const minDist = a1.robotRadius + a2.robotRadius;

          if (dist < minDist * 0.8) {
            collisionCount++;
            writeLog(`⚠️ COLLISION WARNING [Tick ${tick}]: ${a1.id} and ${a2.id} overlapped at (${a1.x.toFixed(2)}, ${a1.y.toFixed(2)})`);
          }
        }

        const agent = agents[i];
        const prevPos = prevPositionsMap.get(agent.id);
        const distMoved = prevPos ? Math.hypot(agent.x - prevPos.x, agent.y - prevPos.y) : 1.0;
        prevPositionsMap.set(agent.id, { x: agent.x, y: agent.y });

        const isMovingState = agent.state === 'TRANSPORTING' || agent.state === 'MOVING_TO_PICKUP' || agent.state === 'MOVING_TO_CHARGE';
        const isStationaryWhenMoving = isMovingState && distMoved < 0.01;

        if (isStationaryWhenMoving || agent.isDeadlocked) {
          const currentStuck = (stuckTicksMap.get(agent.id) || 0) + 1;
          stuckTicksMap.set(agent.id, currentStuck);

          if (currentStuck >= 60 && currentStuck % 60 === 0) {
            deadlockCount++;
            writeLog(`🚨 DEADLOCK ALERT [Tick ${tick}]: ${agent.id} stuck for ${currentStuck} ticks at (${agent.x.toFixed(2)}, ${agent.y.toFixed(2)}) state=${agent.state}`);
          }
        } else {
          stuckTicksMap.set(agent.id, 0);
        }
      }
    }

    const simulatedSeconds = ticks * dtSim;
    const isSuccess = collisionCount === 0 && deadlockCount === 0;
    const status: 'SUCCESS' | 'FAILED' = isSuccess ? 'SUCCESS' : 'FAILED';

    writeLog('-------------------------------------------------------');
    writeLog('📊 FINAL SIMULATION METRICS:');
    writeLog(`• Total Pallets Delivered: ${engine.completedDeliveries}`);
    writeLog(`• Simulated Time: ${simulatedSeconds.toFixed(1)} seconds`);
    writeLog(`• Collision Events: ${collisionCount}`);
    writeLog(`• Deadlock Events (>10 ticks): ${deadlockCount}`);
    writeLog(`• Status: ${status}`);
    writeLog('-------------------------------------------------------');

    return {
      completedDeliveries: engine.completedDeliveries,
      simulatedSeconds,
      collisionCount,
      deadlockCount,
      status,
      logFilePath,
    };
  }
}
