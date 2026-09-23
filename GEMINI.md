# Headless-драйвер конструктора и оракул телеметрии (Virtual CAD & Sim Oracle)

## Описание
Настоящий модуль предоставляет headless-инструментарий для автоматизированного тестирования без браузера. Включает программный драйвер `HeadlessWarehouseDriver` и ультра-диагностический оракул телеметрии (`dumpRawTruth()`, `getAuditSummary()`), позволяющий проводить глубокий аудит геометрической целостности склада, математических формул вместимости и буферов, а также получать покадровую телеметрию работы симуляции роботов с детекцией коллизий и тупиков.

---

## 🚀 Быстрый запуск

Запуск эталонного сценария тестирования оракула:
```bash
npm run oracle:run
# или
npx tsx scripts/run_oracle_test.ts
```

При запуске команда:
1. Создает виртуальный склад с полом 30×30м.
2. Размещает ворота приемки и отгрузки, 2 зарядные станции и 20 стеллажей.
3. Добавляет объект-стену за пределами пола (для проверки срабатывания детектора аномалий).
4. Задает график поставок ($Q_{in} = 50$, $Q_{out} = 150$).
5. Запускает симуляцию на 300 тиков.
6. Выводит в `stdout` текстовый отчет `dumpRawTruth()` и структурированную сводку `getAuditSummary()`, сохраняет отчет в `.debug_logs/oracle_dump.txt`, а покадровую телеметрию роботов — в `.debug_logs/oracle_telemetry.log`.

---

## 🛠️ API `HeadlessWarehouseDriver` (`scripts/headless_driver.ts`)

Класс `HeadlessWarehouseDriver` позволяет программно управлять сеткой склада и запускать симуляцию:

```typescript
import { HeadlessWarehouseDriver } from './scripts/headless_driver.js';

const driver = new HeadlessWarehouseDriver({ cellSizeM: 2.0 });

// 1. Выбор инструмента панели
driver.selectTool('RACK'); // 'SELECT' | 'RACK' | 'OBSTACLE' | 'CHARGER' | 'DOCK_INBOUND' | 'DOCK_OUTBOUND' | 'ERASE' | 'ERASE_FLOOR'

// 2. Рисование и удаление прямоугольного пола (по координатам ячеек сетки)
driver.drawRectFloor(0, 0, 14, 14);
driver.eraseFloorRect(12, 12, 14, 14); // Удаление участка пола для теста висящих элементов

// 3. Выбор SKU чипа
driver.pickSkuChip('sku-1');

// 4. Клики и размещение элементов
driver.clickCell(4, 2); // Ставит выбранный элемент в ячейку (4, 2)
driver.clickCell(20, 20, { force: true }); // Принудительно ставит элемент вне пола для теста аномалий

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

// 8. Машиночитаемая сводка аудита (для автотестов)
const summary = driver.getAuditSummary();
console.log(summary.isValid); // boolean: true если нет ошибок, висящих элементов, тупиков и коллизий

// 9. Получение полного нефильтрованного отчета оракула
const report = driver.dumpRawTruth();
console.log(report);
```

---

## 📊 Машиночитаемый метод `getAuditSummary()`

Метод `driver.getAuditSummary()` возвращает строго структурированный объект для `assert`-проверок в автотестах без распарсивания текста:

```typescript
export interface AuditSummary {
  isValid: boolean;               // true, если нет висящих элементов, ошибок геометрии/математики, тупиков и коллизий
  errors: string[];              // список текстовых описаний обнаруженных ошибок
  floatingCount: number;         // количество висящих в воздухе объектов
  deadlockCount: number;         // количество тупиков (>10 тиков)
  collisionCount: number;        // количество физических пересечений роботов
  deliveriesCompleted: number;    // количество успешно выполненных доставок
}
```

---

## 🔮 Отчет Оракула (`dumpRawTruth()`)

Методом `driver.dumpRawTruth()` генерируется подробный текстовый отчет из 4 разделов:

### 1. ASCII-карта склада
Визуальное отображение сетки склада текстовыми символами:
* `.` — чистый пол
* `#` — стена / препятствие (`OBSTACLE`)
* `R` — стеллаж (`RACK`)
* `I` — ворота приемки (`DOCK_INBOUND`)
* `O` — ворота отгрузки (`DOCK_OUTBOUND`)
* `C` — зарядная станция (`CHARGER`)
* `!` — висящий в воздухе объект / аномалия (`IN_THE_AIR`)

### 2. Срез геометрии и объектов (Raw Geometry & Floor Audit)
* Границы и точная площадь пола ($м^2$).
* Перечень размещенных элементов, координат $(x, z)$, углов поворота, SKU и вместимости.
* **Детекция аномалий пола:** при обнаружении объектов вне границ пола:
  `🚨 [CRITICAL_ANOMALY: FLOATING_OBJECT]: OBSTACLE at (20, 20) is SUSPENDED IN MID-AIR (Floor bounds violated)!`
* **Детекция превышения лимита ворот:**
  `🚨 [DOCK_LIMIT_EXCEEDED]: Found 2 inbound docks (max allowed: 1)!`

### 3. Сверка математики и формул (Mathematical Integrity Audit)
* **Вместимость стеллажей:** сверка суммы `slotsPerRack` с функцией `calculateWarehouseCapacity`. При расхождении:
  `❌ [MATH_ERROR] Capacity mismatch: sum=${actual}, state=${reported}`
* **Баланс поставок и буфера:**
  * Вычисление суточных объемов $Q_{in\_day} = Q_{in} \times (24 / T_{in})$ и $Q_{out\_day} = Q_{out} \times (24 / T_{out})$.
  * При $Q_{out\_day} > Q_{in\_day}$: `[SUPPLY_AUDIT: IDLE_CAPACITY] Outbound exceeds Inbound by ${diff} pallets/day. System status: GREEN (Valid).`
  * При $Q_{in\_day} > Q_{out\_day}$: `[SUPPLY_AUDIT: OVERFLOW_RISK] Inbound exceeds Outbound by ${diff} pallets/day. Warehouse capacity ${C} will be depleted in ${hours}h (${days}d). System status: AMBER (Warning).`

### 4. Покадровая телеметрия роботов (`.debug_logs/oracle_telemetry.log`)
При каждом запуске `runSimulation()` в файл `.debug_logs/oracle_telemetry.log` перезаписывается логирование каждого тика:
```text
[Tick 12 | t=6.0s] Robot agent_1: pos=(2.10, 0.50), v=1.20m/s, battery=60.0%, state=MOVING_TO_PICKUP, target=(0.50, 2.50) ⚠️ [STALL] 🚨 [DEADLOCK_CONFIRMED]
🚨 [COLLISION] Tick 15: Robot agent_1 and Robot agent_2 overlapped at (4.50, 2.10)!
```
* `⚠️ [STALL]` — робот не сдвинулся более чем на 0.02м за последние 3 тика в движущемся статусе.
* `🚨 [DEADLOCK_CONFIRMED]` — робот находится без движения более 10 тиков.
* `🚨 [COLLISION]` — зафиксировано физическое перекрытие радиусов двух роботов (`dist < (r1 + r2) * 0.8`).

В конце раздела выводится итоговый статус симуляции:
* `❌ [SIMULATION_FAILED]: Deadlocks (N) or Collisions (M) occurred during run!` — если были зафиксированы коллизии или тупики.
* `✅ [SIMULATION_PASSED]: Clean run with 0 deadlocks and 0 collisions.` — при чистом прогоне.

---

## 📁 Создаваемые файлы логов
* `.debug_logs/oracle_dump.txt` — сохраненный текстовый отчет `dumpRawTruth()`.
* `.debug_logs/oracle_telemetry.log` — полная покадровая телеметрия состояния всех роботов.
