import fs from 'node:fs';
import path from 'node:path';
import {
  calculateWarehouseCapacity,
  rebuildTopologyFromGrid,
  type ConstructorGrid,
  type ConstructorTileType,
  type FloorDefinition,
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
  | 'ERASE';

export interface HeadlessDriverOptions {
  cellSizeM?: number;
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

  public clickCell(x: number, z: number, options?: { force?: boolean }): this {
    const key = `${x}_${z}`;
    const inFloor = this.floorTiles.has(key);

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
        `🔮 ORACLE DEEP TELEMETRY LOG\n` +
        `Timestamp: ${new Date().toISOString()}\n` +
        `Fleet: ${fleetSize}x ${robotSpec.vendor} ${robotSpec.model} | Ticks: ${ticks} (dt=${dtSim}s)\n` +
        `=======================================================\n`,
      'utf-8'
    );

    const prevPositionsMap = new Map<string, Array<{ x: number; y: number }>>();
    const stationaryTicksMap = new Map<string, number>();

    for (let tick = 1; tick <= ticks; tick++) {
      engine.update(dtSim);
      const simTime = tick * dtSim;

      const tickLogLines: string[] = [];

      for (const agent of engine.agents) {
        const posHistory = prevPositionsMap.get(agent.id) || [];
        posHistory.push({ x: agent.x, y: agent.y });
        if (posHistory.length > 3) {
          posHistory.shift();
        }
        prevPositionsMap.set(agent.id, posHistory);

        let dist3Ticks = 1.0;
        if (posHistory.length >= 3) {
          const pOld = posHistory[0];
          dist3Ticks = Math.hypot(agent.x - pOld.x, agent.y - pOld.y);
        }

        const isMovingState =
          agent.state === 'TRANSPORTING' ||
          agent.state === 'MOVING_TO_PICKUP' ||
          agent.state === 'MOVING_TO_CHARGE';

        let warningTag = '';

        if (isMovingState && dist3Ticks <= 0.02) {
          warningTag += ' ⚠️ [STALL]';
          const currentStuck = (stationaryTicksMap.get(agent.id) || 0) + 1;
          stationaryTicksMap.set(agent.id, currentStuck);

          if (currentStuck > 10) {
            warningTag += ' 🚨 [DEADLOCK_CONFIRMED]';
          }
        } else {
          stationaryTicksMap.set(agent.id, 0);
        }

        const targetNode = agent.targetNodeId
          ? topology.nodes.find((n) => n.id === agent.targetNodeId)
          : null;
        const targetX = targetNode ? targetNode.x.toFixed(2) : '-';
        const targetY = targetNode ? targetNode.y.toFixed(2) : '-';

        const speedMps = isMovingState && posHistory.length > 1
          ? Math.hypot(agent.x - posHistory[posHistory.length - 2].x, agent.y - posHistory[posHistory.length - 2].y) / dtSim
          : 0;

        const line = `[Tick ${tick} | t=${simTime.toFixed(1)}s] Robot ${agent.id}: pos=(${agent.x.toFixed(2)}, ${agent.y.toFixed(2)}), v=${speedMps.toFixed(2)}m/s, battery=${agent.batterySoc.toFixed(1)}%, state=${agent.state}, target=(${targetX}, ${targetY})${warningTag}`;
        tickLogLines.push(line);
      }

      fs.appendFileSync(telemetryLogPath, tickLogLines.join('\n') + '\n', 'utf-8');
    }

    return this;
  }

  public dumpRawTruth(): string {
    let output = '';

    output += `================================================================================\n`;
    output += `🔮 HEADLESS WAREHOUSE ORACLE: RAW TRUTH REPORT\n`;
    output += `Generated: ${new Date().toISOString()}\n`;
    output += `================================================================================\n\n`;

    // 1. ASCII Map Rendering
    output += `--- 1. ASCII WAREHOUSE MAP ---\n`;
    const asciiMap = this.generateAsciiMap();
    output += asciiMap + `\n\n`;

    // 2. Raw Geometry & Floor Audit
    output += `--- 2. RAW GEOMETRY & FLOOR AUDIT ---\n`;
    const bounds = this.grid.floor?.bounds || { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    const floorAreaSqm = this.grid.floor?.areaSqm ?? 0;
    output += `Floor Contour: [minX: ${bounds.minX}, maxX: ${bounds.maxX}, minZ: ${bounds.minZ}, maxZ: ${bounds.maxZ}]\n`;
    output += `Floor Surface Area: ${floorAreaSqm} m² (${this.floorTiles.size} floor tiles, cell size: ${this.grid.cellSizeM}m)\n\n`;

    output += `Placed Elements Inventory:\n`;
    let elementCount = 0;
    let anomalyCount = 0;

    this.grid.tiles.forEach((type, key) => {
      const [xStr, zStr] = key.split('_');
      const x = parseInt(xStr, 10);
      const z = parseInt(zStr, 10);
      if (type === 'EMPTY_FLOOR') return;

      elementCount++;
      const inFloor = this.floorTiles.has(key);
      const details = this.grid.elementDetails?.get(key);
      const sku = details?.skuId || 'NONE';
      const slots = details?.slotsPerRack ?? (type === 'RACK' ? 12 : undefined);
      const rotation = details?.rotationDeg ?? 0;

      if (!inFloor) {
        anomalyCount++;
        output += `🚨 [CRITICAL_ANOMALY: FLOATING_OBJECT]: ${type} at (${x}, ${z}) is SUSPENDED IN MID-AIR (Floor bounds violated)!\n`;
        output += `   └─ Object details: rot=${rotation}°, sku=${sku}, slots=${slots ?? 'N/A'}\n`;
      } else {
        output += ` • [${type}] at (${x}, ${z}): inFloor=true, rot=${rotation}°, sku=${sku}, slots=${slots ?? 'N/A'}\n`;
      }
    });

    if (elementCount === 0) {
      output += ` (No warehouse elements placed)\n`;
    }

    if (anomalyCount === 0) {
      output += `\n✅ [FLOOR_AUDIT_OK]: All ${elementCount} placed elements are strictly within floor boundaries.\n\n`;
    } else {
      output += `\n❌ [FLOOR_AUDIT_FAILED]: ${anomalyCount} floating element(s) detected outside floor boundaries!\n\n`;
    }

    // 3. Mathematical Integrity Audit
    output += `--- 3. MATHEMATICAL INTEGRITY AUDIT ---\n`;

    // 3a. Rack Capacity Audit
    let actualSumCapacity = 0;
    let totalRacks = 0;

    this.grid.tiles.forEach((type, key) => {
      if (type === 'RACK') {
        totalRacks++;
        const details = this.grid.elementDetails?.get(key);
        actualSumCapacity += details?.slotsPerRack ?? 12;
      }
    });

    const reportedCap = calculateWarehouseCapacity(this.grid);
    if (actualSumCapacity !== reportedCap.totalPalletCapacity) {
      output += `❌ [MATH_ERROR] Capacity mismatch: sum=${actualSumCapacity}, state=${reportedCap.totalPalletCapacity}\n`;
    } else {
      output += `[MATH_INTEGRITY_OK] Total capacity matches sum of slots (${actualSumCapacity} pallets across ${totalRacks} racks).\n`;
    }

    // 3b. Supply Schedule & Flow Audit
    const qIn = this.supplySchedule.inboundBatchVolume;
    const tIn = this.supplySchedule.inboundIntervalValue || 24;
    const qOut = this.supplySchedule.outboundBatchVolume;
    const tOut = this.supplySchedule.outboundIntervalValue || 24;

    const qInDay = qIn * (24 / tIn);
    const qOutDay = qOut * (24 / tOut);

    output += `Supply Flow Metrics:\n`;
    output += ` • Inbound Flow (Q_in_day): ${qInDay.toFixed(1)} pallets/day (${qIn} pallets / ${tIn}h)\n`;
    output += ` • Outbound Flow (Q_out_day): ${qOutDay.toFixed(1)} pallets/day (${qOut} pallets / ${tOut}h)\n`;

    if (qOutDay > qInDay) {
      const diff = qOutDay - qInDay;
      output += `[SUPPLY_AUDIT: IDLE_CAPACITY] Outbound exceeds Inbound by ${diff.toFixed(1)} pallets/day. System status: GREEN (Valid). Idle capacity: ${diff.toFixed(1)} pallets/day.\n`;
    } else if (qInDay > qOutDay) {
      const diff = qInDay - qOutDay;
      const cTotal = actualSumCapacity;
      let overflowMsg = '';
      if (cTotal > 0 && diff > 0) {
        const hours = (cTotal / diff) * 24;
        const days = hours / 24;
        overflowMsg = `Warehouse capacity ${cTotal} will be depleted in ${hours.toFixed(1)}h (${days.toFixed(1)}d).`;
      } else {
        overflowMsg = `Buffer accumulating ${diff.toFixed(1)} pallets/day indefinitely.`;
      }
      output += `[SUPPLY_AUDIT: OVERFLOW_RISK] Inbound exceeds Outbound by ${diff.toFixed(1)} pallets/day. ${overflowMsg} System status: AMBER (Warning).\n`;
    } else {
      output += `[SUPPLY_AUDIT: BALANCED] Inbound matches Outbound (${qInDay.toFixed(1)} pallets/day). System status: GREEN.\n`;
    }

    output += `\n`;

    // 4. Simulation Engine Telemetry Summary
    if (this.lastSimulationEngine) {
      output += `--- 4. SIMULATION TELEMETRY SUMMARY ---\n`;
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

        if (type && type !== 'EMPTY_FLOOR' && !inFloor) {
          rowStr += '!';
        } else if (type === 'RACK') {
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

    mapStr += `Legend: . = Floor, # = Wall, R = Rack, I = Inbound Dock, O = Outbound Dock, C = Charger, ! = Floating/Anomaly`;

    return mapStr;
  }
}
