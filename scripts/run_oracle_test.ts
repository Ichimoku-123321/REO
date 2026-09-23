import fs from 'node:fs';
import path from 'node:path';
import { HeadlessWarehouseDriver } from './headless_driver.js';

function runOracleTest(): void {
  console.log('🚀 Starting Headless Warehouse Oracle Test...\n');

  const driver = new HeadlessWarehouseDriver({ cellSizeM: 2.0, heightM: 8.0 });

  // 1. Draw 30x30m floor (15 x 15 tiles of 2.0m = 30m x 30m)
  driver.drawRectFloor(0, 0, 14, 14);

  // Set warehouse clear ceiling height
  driver.setWarehouseHeight(8.0);

  // 2. Place Inbound and Outbound Docks
  driver.selectTool('DOCK_INBOUND').clickCell(0, 2);
  driver.selectTool('DOCK_OUTBOUND').clickCell(14, 12);

  // Place 2 Chargers
  driver.selectTool('CHARGER').clickCell(1, 0).clickCell(2, 0);

  // Place 20 Racks
  driver.selectTool('RACK');
  let rackCount = 0;
  for (let x = 4; x <= 10; x += 2) {
    for (let z = 2; z <= 12; z += 2) {
      if (rackCount < 20) {
        driver.clickCell(x, z);
        rackCount++;
      }
    }
  }

  // 3. Place one wall OUTSIDE floor bounds with force: true
  driver.selectTool('OBSTACLE').clickCell(20, 20, { force: true });

  // 4. Set supply schedule: Q_in = 50 pallets, Q_out = 150 pallets
  driver.setSupplySchedule({
    qIn: 50,
    tInHours: 24,
    qOut: 150,
    tOutHours: 24,
  });

  // 5. Run simulation for 300 ticks
  console.log('⚡ Running simulation for 300 ticks...');
  driver.runSimulation(300);

  // 6. Output formatted raw truth report to stdout and save to .debug_logs/oracle_dump.txt
  const rawTruthReport = driver.dumpRawTruth();
  console.log(rawTruthReport);

  // 7. Output machine-readable audit summary
  const auditSummary = driver.getAuditSummary();
  console.log('📊 Machine-Readable Audit Summary:');
  console.log(JSON.stringify(auditSummary, null, 2));

  // Factual alert checks for scenario reporter
  if (auditSummary.floatingElementsCount > 0) {
    console.warn(`\n⚠️ [ORACLE_ALERT] Detected ${auditSummary.floatingElementsCount} floating element(s) outside floor bounds!`);
  }
  if (auditSummary.deliveriesCompleted === 0 && auditSummary.simulatedTicks > 100) {
    console.warn(`\n⚠️ [ORACLE_ALERT] Zero throughput detected! Completed 0 deliveries during simulation run.`);
  }

  const logDir = path.resolve(process.cwd(), '.debug_logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const dumpFilePath = path.join(logDir, 'oracle_dump.txt');
  fs.writeFileSync(dumpFilePath, rawTruthReport, 'utf-8');

  console.log(`\n📄 Oracle dump saved successfully to ${dumpFilePath}`);
}

runOracleTest();
