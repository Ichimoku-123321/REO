# Headless-драйвер конструктора и телеметрический сниффер (Virtual CAD & Sim Sniffer)

## Описание
Настоящий модуль предоставляет беспристрастный headless-инструментарий для программного управления складом и снятия дампа состояния сетки и симуляции без браузера.
Драйвер `HeadlessWarehouseDriver` работает как измерительный прибор: он не навязывает интерпретаций, суждений или оценок ("ошибка", "норма", "статус"), не пересчитывает физику за движок, а выдает нефильтрованную сырую правду о состоянии сетки, вызовах REO и покадровой телеметрии агентов.

---

## 🚀 Быстрый запуск

Запуск сценария снятия сырого дампа:
```bash
npm run oracle:run
# или
npx tsx scripts/run_oracle_test.ts
```

При запуске команда:
1. Создает виртуальный склад с полом 30×30м.
2. Размещает ворота приемки и отгрузки, 2 зарядные станции и 20 стеллажей.
3. Добавляет объект-стену за пределами пола (`force: true`).
4. Задает график поставок ($Q_{in} = 50$, $Q_{out} = 150$).
5. Запускает симуляцию на 300 тиков.
6. Выводит в `stdout` текстовый дамп `dumpRawTruth()` и структурированную метрику `getAuditSummary()`, сохраняет дамп в `.debug_logs/oracle_dump.txt`, а покадровую телеметрию роботов — в `.debug_logs/oracle_telemetry.log`.

---

## 🛠️ API `HeadlessWarehouseDriver` (`scripts/headless_driver.ts`)

Класс `HeadlessWarehouseDriver` позволяет программно управлять сеткой склада и снимать сырой дамп:

```typescript
import { HeadlessWarehouseDriver } from './scripts/headless_driver.js';

const driver = new HeadlessWarehouseDriver({ cellSizeM: 2.0 });

// 1. Выбор инструмента панели
driver.selectTool('RACK'); // 'SELECT' | 'RACK' | 'OBSTACLE' | 'CHARGER' | 'DOCK_INBOUND' | 'DOCK_OUTBOUND' | 'ERASE' | 'ERASE_FLOOR'

// 2. Рисование и удаление прямоугольного пола (по координатам ячеек сетки)
driver.drawRectFloor(0, 0, 14, 14);
driver.eraseFloorRect(12, 12, 14, 14); // Удаление участка пола

// 3. Выбор SKU чипа
driver.pickSkuChip('sku-1');

// 4. Клики и размещение элементов
driver.clickCell(4, 2); // Ставит выбранный элемент в ячейку (4, 2)
driver.clickCell(20, 20, { force: true }); // Принудительно ставит элемент вне пола

// 5. Задание вместимости конкретного стеллажа
driver.setRackCapacity(4, 2, 24);

// 6. Настройка графика поставок
driver.setSupplySchedule({
  qIn: 50,       // Объем партии приемки (паллет)
  tInHours: 24,  // Интервал приемки (часов)
  qOut: 150,     // Объем партии отгрузки (паллет)
  tOutHours: 24, // Интервал отгрузки (часов)
});

// 7. Запуск расчета симуляции
driver.runSimulation(300 /* тиков */, 0.5 /* dt (сек) */);

// 8. Машиночитаемые сырые метрики (для автотестов)
const summary = driver.getAuditSummary();
console.log(summary.floatingElementsCount);

// 9. Получение сырого дампа состояния
const report = driver.dumpRawTruth();
console.log(report);
```

---

## 📊 Машиночитаемый метод `getAuditSummary()`

Метод `driver.getAuditSummary()` возвращает сырые числовые факты о состоянии памяти:

```typescript
export interface RawAuditSummary {
  tilesCount: number;             // общее количество активных плиток в сетке
  floorTilesCount: number;        // количество плиток пола
  placedElementsCount: number;    // количество размещенных объектов (без EMPTY_FLOOR)
  floatingElementsCount: number;  // количество объектов за пределами плиток пола
  reportedCapacity: {             // сырой ответ функции calculateWarehouseCapacity(grid)
    totalRacks: number;
    totalPalletCapacity: number;
  };
  deliveriesCompleted: number;    // количество выполненных доставок в движке
  simulatedTicks: number;         // количество выполненных тиков
}
```

---

## 🔮 Сырой Дамп Состояния (`dumpRawTruth()`)

Методом `driver.dumpRawTruth()` генерируется нефильтрованный текстовый дамп:

### 1. ASCII-карта склада
Прямое отображение объектов сетки реальными символами (без подмен):
* `.` — пол
* `#` — стена / препятствие (`OBSTACLE`)
* `R` — стеллаж (`RACK`)
* `I` — ворота приемки (`DOCK_INBOUND`)
* `O` — ворота отгрузки (`DOCK_OUTBOUND`)
* `C` — зарядная станция (`CHARGER`)

### 2. Срез сетки и геометрии (Raw Grid & Geometry Dump)
* Контур и площадь пола ($м^2$).
* Поэлементный срез каждой занятой ячейки:
  `[1, 1] | Entity: RACK | Floor: YES | SKU: NONE | Slots: 12 | Rot: 0°`
  `[20, 20] | Entity: OBSTACLE | Floor: NO | SKU: NONE | Slots: N/A | Rot: 0°`

### 3. Прямой вывод функций REO (Direct REO Engine Output)
Вызов существующих функций проекта без дублирования расчетов:
* Вызов `calculateWarehouseCapacity(this.grid)`:
  `REO Capacity Engine Output: {"totalRacks":1,"totalPalletCapacity":12}`
* График поставок:
  `REO Supply Schedule Raw Params: Inbound(50 pallets / 24h), Outbound(150 pallets / 24h)`

### 4. Сырая телеметрия симуляции (`.debug_logs/oracle_telemetry.log`)
При вызове `runSimulation()` в `.debug_logs/oracle_telemetry.log` заносится прямая фиксиция внутренних данных `engine.agents`:
```text
[Tick 12 | t=6.0s] Agent agent_1: pos=(2.10, 0.50), state=MOVING_TO_PICKUP, targetNode=c_node_0_2, battery=60.0%
```

---

## 📁 Создаваемые файлы логов
* `.debug_logs/oracle_dump.txt` — сохраненный сырой дамп `dumpRawTruth()`.
* `.debug_logs/oracle_telemetry.log` — полная покадровая телеметрия памяти симулятора.
