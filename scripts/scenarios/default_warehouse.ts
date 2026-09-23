import { WarehouseBuilder } from '../scenario_builder.js';

console.log('🚀 Running default_warehouse scenario...');

const builder = new WarehouseBuilder(2.0);

// 1. Set floor dimensions 40m x 40m (20 x 20 grid cells of 2m)
builder.setFloor(40, 40);

// 2. Add Inbound Dock and Outbound Dock
builder.addDock(1, 10, 'INBOUND');
builder.addDock(18, 10, 'OUTBOUND');

// 3. Add Charging stations
builder.addCharger(10, 1);
builder.addCharger(10, 18);

// 4. Add Racks
for (let row = 4; row <= 15; row += 2) {
  for (let col = 5; col <= 14; col++) {
    builder.addRack(col, row, 12, 'sku-1');
  }
}

// 5. Add Walls/Obstacles
builder.addWall(0, 0);
builder.addWall(19, 0);
builder.addWall(0, 19);
builder.addWall(19, 19);

// 6. Save snapshot to .debug_logs/latest_snapshot.json
builder.saveSnapshot('.debug_logs/latest_snapshot.json');
console.log('✅ Snapshot saved to .debug_logs/latest_snapshot.json');

// 7. Run 600 ticks headless simulation
const report = builder.runHeadlessSimulation(600, 2);
console.log('📋 Simulation Report Summary:', report);

if (report.status === 'FAILED') {
  process.exit(1);
} else {
  process.exit(0);
}
