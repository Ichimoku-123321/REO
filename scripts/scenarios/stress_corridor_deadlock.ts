import fs from 'node:fs';
import path from 'node:path';
import { HeadlessWarehouseDriver } from '../headless_driver.js';

console.log('🚀 [STRESS_TEST]: Starting Narrow Corridor Bottleneck Stress Test...');

// 1. Setup HeadlessWarehouseDriver with 2.0m cell size
const driver = new HeadlessWarehouseDriver({ cellSizeM: 2.0, heightM: 8.0 });

// 2. Build Floor: 24m x 8m (12 x 4 cells: x = 0..11, z = 0..3)
driver.drawRectFloor(0, 0, 11, 3);

// 3. Left Zone (Pocket x = 0..1, z = 0..3): Chargers & Inbound Dock
driver.selectTool('CHARGER').clickCell(0, 0);
driver.selectTool('CHARGER').clickCell(0, 3);
driver.selectTool('DOCK_INBOUND').clickCell(0, 1);

// 4. Narrow Corridor (x = 2..9): Single lane at z = 1, Obstacles at z = 0, z = 2, z = 3
driver.selectTool('OBSTACLE');
for (let x = 2; x <= 9; x++) {
  driver.clickCell(x, 0);
  driver.clickCell(x, 2);
  driver.clickCell(x, 3);
}

// 5. Right Zone (x = 10..11, z = 0..3): Racks and Outbound Dock
driver.pickSkuChip('sku-test-corridor');
driver.selectTool('RACK');
driver.clickCell(10, 0);
driver.clickCell(10, 2);
driver.clickCell(11, 0);
driver.clickCell(11, 2);

driver.selectTool('DOCK_OUTBOUND').clickCell(11, 1);

// 6. Set supply schedule and run simulation for 400 ticks (200s, dt=0.5) with fleetSize=2
driver.setSupplySchedule({ qIn: 50, tInHours: 24, qOut: 50, tOutHours: 24 });

console.log('⏳ Running simulation for 400 ticks (200s, dt=0.5s, 2 robots)...');
driver.runSimulation(400, 0.5, { fleetSize: 2 });

const dumpTruth = driver.dumpRawTruth();
const dumpPath = path.resolve(process.cwd(), '.debug_logs/oracle_dump.txt');
fs.writeFileSync(dumpPath, dumpTruth, 'utf-8');

const summary = driver.getAuditSummary();
console.log(`📊 Audit Summary: Deliveries Completed = ${summary.deliveriesCompleted}`);

// 7. Executioner Assertions

// Assertion 1: Deliveries Completed > 0
if (summary.deliveriesCompleted === 0) {
  console.error(`🚨 [TEST_FAILED]: Deliveries completed is 0! Robots failed to perform any deliveries.`);
  process.exit(1);
}

// Read telemetry log
const telemetryPath = path.resolve(process.cwd(), '.debug_logs/oracle_telemetry.log');
if (!fs.existsSync(telemetryPath)) {
  console.error(`🚨 [TEST_FAILED]: Telemetry log file not found at ${telemetryPath}`);
  process.exit(1);
}

const logContent = fs.readFileSync(telemetryPath, 'utf-8');
const logLines = logContent.split('\n').filter((line) => line.startsWith('[Tick '));

// Group snapshots by tick
interface AgentSnapshotLog {
  id: string;
  pos: { x: number; y: number; z: number };
  distMoved: number;
  speedMps: number;
  state: string;
  robotRadius: number;
}

const snapshotsByTick = new Map<number, AgentSnapshotLog[]>();

for (const line of logLines) {
  const match = line.match(/^\[Tick (\d+) \| t=[\d\.]+s\] (\{.*\})$/);
  if (!match) continue;
  const tickNum = parseInt(match[1], 10);
  const snapData: AgentSnapshotLog = JSON.parse(match[2]);

  if (!snapshotsByTick.has(tickNum)) {
    snapshotsByTick.set(tickNum, []);
  }
  snapshotsByTick.get(tickNum)!.push(snapData);
}

// Track consecutive deadlocked ticks
let consecutiveDeadlockTicks = 0;

for (const [tick, agents] of snapshotsByTick.entries()) {
  // Assertion 3: Collision Check (distance < (r1 + r2) * 0.7)
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a1 = agents[i];
      const a2 = agents[j];
      // Note: pos coordinates are world coordinates (x, y mapped to 2D x, y grid position)
      const dist = Math.hypot(a1.pos.x - a2.pos.x, a1.pos.y - a2.pos.y);
      const minSafeDist = (a1.robotRadius + a2.robotRadius) * 0.7;

      if (dist < minSafeDist) {
        console.error(
          `🚨 [TEST_FAILED]: Physical collision detected at Tick ${tick}! Dist = ${dist.toFixed(3)}m < minSafeDist = ${minSafeDist.toFixed(3)}m between ${a1.id} and ${a2.id}`
        );
        process.exit(1);
      }
    }
  }

  // Assertion 2: Deadlock check (> 25 consecutive ticks where ALL robots have speedMps === 0 && distMoved === 0 in active states)
  const activeStates = ['MOVING_TO_PICKUP', 'TRANSPORTING', 'MOVING_TO_CHARGE'];
  const allActiveRobotsStuck =
    agents.length >= 2 &&
    agents.every(
      (a) => activeStates.includes(a.state) && a.speedMps === 0 && a.distMoved === 0
    );

  if (allActiveRobotsStuck) {
    consecutiveDeadlockTicks++;
    if (consecutiveDeadlockTicks > 25) {
      console.error(
        `🚨 [TEST_FAILED]: Deadlock confirmed in narrow corridor at Tick ${tick}! Robots blocked each other for > 25 consecutive ticks.`
      );
      process.exit(1);
    }
  } else {
    consecutiveDeadlockTicks = 0;
  }
}

console.log(
  `✅ [TEST_PASSED]: Corridor bottleneck resolved. Deliveries completed: ${summary.deliveriesCompleted}`
);
process.exit(0);
