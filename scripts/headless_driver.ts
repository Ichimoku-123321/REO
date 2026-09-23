import fs from 'node:fs';
import path from 'node:path';
import {
  calculateWarehouseCapacity,
  rebuildTopologyFromGrid,
  type ConstructorGrid,
  type ConstructorTileType,
  type SupplySchedule,
} from '../src/engine/constructor_engine.js';
import { SimulationEngine } from '../src/engine/simulation_engine.js';
import type { Robot } from '../src/types/robot.js';
import { SEED_ROBOTS } from '../src/data/robots.seed.js';

export type DriverTool =
  | 'SELECT'
  | 'RACK'
  | 'OBSTACLE'
  | 'CHARGER'
  | 'DOCK_INBOUND'
  | 'DOCK_OUTBOUND'
  | 'ERASE'
  | 'ERASE_FLOOR';

export interface HeadlessDriverOptions {
  cellSizeM?: number;
}

export interface RawAuditSummary {
  tilesCount: number;
  floorTilesCount: number;
  placedElementsCount: number;
  floatingElementsCount: number;
  reportedCapacity: { totalRacks: number; totalPalletCapacity: number };
  deliveriesCompleted: number;
  simulatedTicks: number;
}

export class HeadlessWarehouseDriver {
  private grid: ConstructorGrid;
  private floorTiles: Set<string> = new Set();
  private currentTool: DriverTool = 'SELECT';
  private activeSkuId: string | null = null;
  private supplySchedule: SupplySchedule = {
    inboundIntervalValue: 24,
    inboundIntervalUnit: 'hours',
    inboundBatchVolume: 0,
    outboundIntervalValue: 24,
    outboundIntervalUnit: 'hours',
    outboundBatchVolume: 0,
  };
  private lastSimulationEngine: SimulationEngine | null = null;
  private lastSimTicks: number = 0;

  constructor(options?: HeadlessDriverOptions) {
    const cellSizeM = options?.cellSizeM ?? 2.0;
    this.grid = {
      cols: 0,
      rows: 0,
      cellSizeM,
      tiles: new Map<string, ConstructorTileType>(),
      elementDetails: new Map(),
      floor: {
        type: 'RECTANGLE',
        bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
        areaSqm: 0,
      },
    };
  }

  public selectTool(tool: DriverTool): this {
    this.currentTool = tool;
    return this;
  }

  public pickSkuChip(skuId: string | null): this {
    this.activeSkuId = skuId;
    return this;
  }

  public drawRectFloor(x1: number, z1: number, x2: number, z2: number): this {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const key = `${x}_${z}`;
        this.floorTiles.add(key);
        if (!this.grid.tiles.has(key)) {
          this.grid.tiles.set(key, 'EMPTY_FLOOR');
        }
      }
    }

    this.recalculateFloorDefinition();
    return this;
  }

  public eraseFloorRect(x1: number, z1: number, x2: number, z2: number): this {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const key = `${x}_${z}`;
        this.floorTiles.delete(key);
        if (this.grid.tiles.get(key) === 'EMPTY_FLOOR') {
          this.grid.tiles.delete(key);
        }
      }
    }

    this.recalculateFloorDefinition();
    return this;
  }

  public clickCell(x: number, z: number, options?: { force?: boolean }): this {
    const key = `${x}_${z}`;
    const inFloor = this.floorTiles.has(key);

    if (this.currentTool === 'ERASE_FLOOR') {
      this.floorTiles.delete(key);
      if (this.grid.tiles.get(key) === 'EMPTY_FLOOR') {
        this.grid.tiles.delete(key);
      }
      this.recalculateFloorDefinition();
      return this;
    }

    if (!inFloor && !options?.force) {
      console.warn(`[HeadlessDriver] Click at (${x}, ${z}) ignored: Outside floor bounds (use force: true to override).`);
      return this;
    }

    if (this.currentTool === 'SELECT') {
      return this;
    }

    if (this.currentTool === 'ERASE') {
      if (inFloor) {
        this.grid.tiles.set(key, 'EMPTY_FLOOR');
        this.grid.elementDetails?.delete(key);
      } else {
        this.grid.tiles.delete(key);
        this.grid.elementDetails?.delete(key);
      }
      return this;
    }

    let tileType: ConstructorTileType = 'EMPTY_FLOOR';
    switch (this.currentTool) {
      case 'RACK':
        tileType = 'RACK';
        break;
      case 'OBSTACLE':
        tileType = 'OBSTACLE';
        break;
      case 'CHARGER':
        tileType = 'CHARGER';
        break;
      case 'DOCK_INBOUND':
        tileType = 'DOCK_INBOUND';
        break;
      case 'DOCK_OUTBOUND':
        tileType = 'DOCK_OUTBOUND';
        break;
    }

    this.grid.tiles.set(key, tileType);

    if (!this.grid.elementDetails) {
      this.grid.elementDetails = new Map();
    }

    if (tileType === 'RACK') {
      const currentDetail = this.grid.elementDetails.get(key);
      this.grid.elementDetails.set(key, {
        slotsPerRack: currentDetail?.slotsPerRack ?? 12,
        skuId: this.activeSkuId ?? undefined,
        rotationDeg: currentDetail?.rotationDeg ?? 0,
      });
    } else {
      this.grid.elementDetails.delete(key);
    }

    this.updateGridDimensions();
    return this;
  }

  public dragCells(cells: Array<{ x: number; z: number }>, options?: { force?: boolean }): this {
    for (const cell of cells) {
      this.clickCell(cell.x, cell.z, options);
    }
    return this;
  }

  public setRackCapacity(x: number, z: number, capacity: number): this {
    const key = `${x}_${z}`;
    if (!this.grid.elementDetails) {
      this.grid.elementDetails = new Map();
    }
    const currentDetail = this.grid.elementDetails.get(key) || {};
    this.grid.elementDetails.set(key, {
      ...currentDetail,
      slotsPerRack: capacity,
    });
    return this;
  }

  public setSupplySchedule(params: {
    qIn: number;
    tInHours: number;
    qOut: number;
    tOutHours: number;
  }): this {
    this.supplySchedule = {
      inboundBatchVolume: params.qIn,
      inboundIntervalValue: params.tInHours,
      inboundIntervalUnit: 'hours',
      outboundBatchVolume: params.qOut,
      outboundIntervalValue: params.tOutHours,
      outboundIntervalUnit: 'hours',
    };
    return this;
  }

  public runSimulation(
    ticks: number,
    dt?: number,
    fleetOptions?: { fleetSize?: number; robots?: Robot[] }
  ): this {
    const dtSim = dt ?? 0.5;
    const widthM = this.grid.cols * this.grid.cellSizeM;
    const lengthM = this.grid.rows * this.grid.cellSizeM;

    const topology = rebuildTopologyFromGrid(this.grid, widthM, lengthM);

    const rackCount = Array.from(this.grid.tiles.values()).filter((t) => t === 'RACK').length;
    const robotSpec = fleetOptions?.robots?.[0] ?? SEED_ROBOTS[0];
    const fleetSize =
      fleetOptions?.fleetSize ?? Math.max(2, Math.min(6, Math.floor(rackCount / 8) || 2));

    const engine = new SimulationEngine(topology, robotSpec, fleetSize);
    this.lastSimulationEngine = engine;
    this.lastSimTicks = ticks;

    const logDir = path.resolve(process.cwd(), '.debug_logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const telemetryLogPath = path.join(logDir, 'oracle_telemetry.log');
    fs.writeFileSync(
      telemetryLogPath,
      `=======================================================\n` +
        `🔮 ORACLE RAW TELEMETRY SNIFFER LOG\n` +
        `Timestamp: ${new Date().toISOString()}\n` +
        `Fleet: ${fleetSize}x ${robotSpec.vendor} ${robotSpec.model} | Ticks: ${ticks} (dt=${dtSim}s)\n` +
        `=======================================================\n`,
      'utf-8'
    );

    const prevPositionsMap = new Map<string, { x: number; y: number }>();
    const stationaryTicksMap = new Map<string, number>();

    for (let tick = 1; tick <= ticks; tick++) {
      engine.update(dtSim);
      const simTime = tick * dtSim;

      const tickLogLines: string[] = [];

      for (const agent of engine.agents) {
        const prevPos = prevPositionsMap.get(agent.id);
        const distMoved = prevPos ? Math.hypot(agent.x - prevPos.x, agent.y - prevPos.y) : 0;
        const speedMps = distMoved / dtSim;
        prevPositionsMap.set(agent.id, { x: agent.x, y: agent.y });

        const isMovingState =
          agent.state === 'TRANSPORTING' ||
          agent.state === 'MOVING_TO_PICKUP' ||
          agent.state === 'MOVING_TO_CHARGE';

        if (isMovingState && distMoved < 0.01) {
          stationaryTicksMap.set(agent.id, (stationaryTicksMap.get(agent.id) || 0) + 1);
        } else {
          stationaryTicksMap.set(agent.id, 0);
        }

        const isDeadlocked = (stationaryTicksMap.get(agent.id) || 0) >= 60;
        const angleDeg = (agent.headingRad * 180) / Math.PI;
        const targetId = agent.targetNodeId ?? 'NONE';
        const pathLeft = agent.pathNodeIds?.length ?? 0;

        const line = `[Tick ${tick} | t=${simTime.toFixed(1)}s] Agent ${agent.id}: pos=(${agent.x.toFixed(2)}, ${agent.y.toFixed(2)}), angle=${angleDeg.toFixed(1)}°, v=${speedMps.toFixed(2)}m/s, load=${agent.cargoPayload}, deadlocked=${isDeadlocked}, pathLeft=${pathLeft}, battery=${agent.batterySoc.toFixed(1)}%, state=${agent.state}, targetNode=${targetId}`;
        tickLogLines.push(line);
      }

      fs.appendFileSync(telemetryLogPath, tickLogLines.join('\n') + '\n', 'utf-8');
    }

    return this;
  }

  public getAuditSummary(): RawAuditSummary {
    let floatingElementsCount = 0;
    let placedElementsCount = 0;

    this.grid.tiles.forEach((type, key) => {
      if (type === 'EMPTY_FLOOR') return;
      placedElementsCount++;
      if (!this.floorTiles.has(key)) {
        floatingElementsCount++;
      }
    });

    const reportedCapacity = calculateWarehouseCapacity(this.grid);

    return {
      tilesCount: this.grid.tiles.size,
      floorTilesCount: this.floorTiles.size,
      placedElementsCount,
      floatingElementsCount,
      reportedCapacity,
      deliveriesCompleted: this.lastSimulationEngine?.completedDeliveries ?? 0,
      simulatedTicks: this.lastSimTicks,
    };
  }

  public dumpRawTruth(): string {
    let output = '';

    output += `================================================================================\n`;
    output += `🔮 HEADLESS WAREHOUSE ORACLE: RAW STATE DUMP\n`;
    output += `Generated: ${new Date().toISOString()}\n`;
    output += `================================================================================\n\n`;

    // 1. ASCII Map Rendering
    output += `--- 1. ASCII WAREHOUSE MAP ---\n`;
    const asciiMap = this.generateAsciiMap();
    output += asciiMap + `\n\n`;

    // 2. Raw Grid & Geometry Dump
    output += `--- 2. RAW GRID & GEOMETRY DUMP ---\n`;
    const bounds = this.grid.floor?.bounds || { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    const floorAreaSqm = this.grid.floor?.areaSqm ?? 0;
    output += `Floor Contour Bounds: [minX: ${bounds.minX}, maxX: ${bounds.maxX}, minZ: ${bounds.minZ}, maxZ: ${bounds.maxZ}]\n`;
    output += `Floor Surface Area: ${floorAreaSqm} m² (${this.floorTiles.size} floor tiles, cell size: ${this.grid.cellSizeM}m)\n\n`;

    output += `Placed Elements Dump:\n`;
    let elementCount = 0;

    this.grid.tiles.forEach((type, key) => {
      const [xStr, zStr] = key.split('_');
      const x = parseInt(xStr, 10);
      const z = parseInt(zStr, 10);
      if (type === 'EMPTY_FLOOR') return;

      elementCount++;
      const inFloor = this.floorTiles.has(key);
      const details = this.grid.elementDetails?.get(key);
      const sku = details?.skuId || 'NONE';
      const slots = details?.slotsPerRack ?? (type === 'RACK' ? 12 : 'N/A');
      const rotation = details?.rotationDeg ?? 0;

      output += ` [${x}, ${z}] | Entity: ${type} | Floor: ${inFloor ? 'YES' : 'NO'} | SKU: ${sku} | Slots: ${slots} | Rot: ${rotation}°\n`;
    });

    if (elementCount === 0) {
      output += ` (No warehouse elements placed)\n`;
    }
    output += `\n`;

    // 3. Direct REO Engine Output
    output += `--- 3. DIRECT REO ENGINE OUTPUT ---\n`;
    const capacityReport = calculateWarehouseCapacity(this.grid);
    output += `REO Capacity Engine Output: ${JSON.stringify(capacityReport)}\n`;

    const qIn = this.supplySchedule.inboundBatchVolume;
    const tIn = this.supplySchedule.inboundIntervalValue || 24;
    const qOut = this.supplySchedule.outboundBatchVolume;
    const tOut = this.supplySchedule.outboundIntervalValue || 24;

    output += `REO Supply Schedule Raw Params: Inbound(${qIn} pallets / ${tIn}h), Outbound(${qOut} pallets / ${tOut}h)\n\n`;

    // 4. Simulation Engine Raw Telemetry Summary
    if (this.lastSimulationEngine) {
      output += `--- 4. SIMULATION ENGINE RAW TELEMETRY SUMMARY ---\n`;
      output += ` Simulated Ticks: ${this.lastSimTicks}\n`;
      output += ` Total Deliveries Completed: ${this.lastSimulationEngine.completedDeliveries}\n`;
      output += ` Total Breakdowns: ${this.lastSimulationEngine.totalBreakdowns}\n`;
      output += ` Telemetry Log saved to: .debug_logs/oracle_telemetry.log\n`;
    }

    output += `================================================================================\n`;

    return output;
  }

  private recalculateFloorDefinition(): void {
    if (this.floorTiles.size === 0) {
      this.grid.floor = {
        type: 'RECTANGLE',
        bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
        areaSqm: 0,
      };
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    this.floorTiles.forEach((key) => {
      const [xStr, zStr] = key.split('_');
      const x = parseInt(xStr, 10);
      const z = parseInt(zStr, 10);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    });

    const widthM = (maxX - minX + 1) * this.grid.cellSizeM;
    const lengthM = (maxZ - minZ + 1) * this.grid.cellSizeM;

    this.grid.floor = {
      type: 'RECTANGLE',
      bounds: { minX, maxX, minZ, maxZ },
      areaSqm: Math.round(widthM * lengthM),
    };

    this.updateGridDimensions();
  }

  private updateGridDimensions(): void {
    let maxCols = 0;
    let maxRows = 0;

    this.grid.tiles.forEach((_, key) => {
      const [xStr, zStr] = key.split('_');
      const x = parseInt(xStr, 10);
      const z = parseInt(zStr, 10);
      if (x + 1 > maxCols) maxCols = x + 1;
      if (z + 1 > maxRows) maxRows = z + 1;
    });

    this.grid.cols = maxCols;
    this.grid.rows = maxRows;
  }

  private generateAsciiMap(): string {
    if (this.grid.tiles.size === 0 && this.floorTiles.size === 0) {
      return '(Empty warehouse grid)';
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    const allKeys = new Set([...this.grid.tiles.keys(), ...this.floorTiles]);
    allKeys.forEach((key) => {
      const [xStr, zStr] = key.split('_');
      const x = parseInt(xStr, 10);
      const z = parseInt(zStr, 10);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    });

    let mapStr = '   ';
    for (let x = minX; x <= maxX; x++) {
      mapStr += (x % 10).toString();
    }
    mapStr += '\n';

    for (let z = minZ; z <= maxZ; z++) {
      const rowLabel = z.toString().padStart(2, ' ') + ' ';
      let rowStr = '';
      for (let x = minX; x <= maxX; x++) {
        const key = `${x}_${z}`;
        const type = this.grid.tiles.get(key);
        const inFloor = this.floorTiles.has(key);

        if (type === 'RACK') {
          rowStr += 'R';
        } else if (type === 'OBSTACLE') {
          rowStr += '#';
        } else if (type === 'DOCK_INBOUND') {
          rowStr += 'I';
        } else if (type === 'DOCK_OUTBOUND') {
          rowStr += 'O';
        } else if (type === 'CHARGER') {
          rowStr += 'C';
        } else if (inFloor || type === 'EMPTY_FLOOR') {
          rowStr += '.';
        } else {
          rowStr += ' ';
        }
      }
      mapStr += rowLabel + rowStr + '\n';
    }

    mapStr += `Legend: . = Floor, # = Wall, R = Rack, I = Inbound Dock, O = Outbound Dock, C = Charger`;

    return mapStr;
  }
}
