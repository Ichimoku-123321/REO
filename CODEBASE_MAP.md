# CODEBASE MAP & ARCHITECTURE AUDIT

## Глобальный обзор архитектуры

Платформа представляет собой симулятор складов и цифровых двойников робототехники (Digital Twin Warehouse Constructor & Simulation Engine).
Система построена на связке **React 19**, **Three.js** (3D CAD вьюпорт), **Tailwind CSS v3** и **Fast Marching Eikonal Solvers**.

---

## 1. СИМУЛЯЦИОННЫЙ ДВИЖОК (`src/engine/`)

### `src/engine/simulation_engine.ts`
* **Суть и ответственность:** Монолитный движок физики, навигации, симуляции и телеметрии флота роботов. Управляет агентами, их конечным автоматом (FSM), движением по векторам потенциальных полей, разрядом аккумулятора, износом и формированием кадров реплея.
* **Ключевые сущности:**
  * Класс `SimulationEngine` (900+ строк): главный класс управления симуляцией.
  * Интерфейсы `AgentState`, `AgentSnapshot`, `RunSimulationOptions`, `ExtendedSimulationResult`, `SimulationReplayFrame`, `SimulationTelemetry`, `ObstacleBox`.
  * Вспомогательные функции: `lineIntersectsAABB`, `findShortestPath`.
* **Что он импортирует:** `FacilityTopology`, `GraphEdge`, `GraphNode`, `Robot`, `FacilityRequirements`, `FleetCompositionItem`, `FastMarchingSolver`.
* **Что он экспортирует:** `SimulationEngine`, `findShortestPath`, `lineIntersectsAABB`, типы `AgentFSMState`, `AgentSnapshot`, `RunSimulationOptions`, `ExtendedSimulationResult`, `SimulationReplayFrame`, `AgentState`, `OneHourSimulationResult`, `SimulationTelemetry`, `ObstacleBox`.
* **Подсистемы внутри `SimulationEngine`:**
  1. **Pathfinding (Поиск пути):** Dijkstra (`findShortestPath`, `getShortestPath`) по узлам графа топологии + Lookahead выбор с прямым обзором (Line-of-Sight).
  2. **Eikonal Gradient Guidance (Навигация Fast Marching):** Интеграция с `FastMarchingSolver` при отсутствии прямого обзора.
  3. **Physics & Collisions (Физика и коллизии):** Непрерывные потенциальные поля ($F_{att}$ целевая сила, $F_{obs}$ отталкивание от стен и выталкивание, $F_{avoid}$ отталкивание от других роботов).
  4. **FSM State Machine (Конечный автомат агентов):** Состояния `IDLE`, `MOVING_TO_PICKUP`, `LOADING`, `TRANSPORTING`, `UNLOADING`, `MOVING_TO_CHARGE`, `CHARGING`.
  5. **Battery, Wear & Breakdown (Батареи, износ и поломки):** Динамический расход заряда в зависимости от груза и состояния пола, накопление операционных часов, отказы по MTBF.
  6. **Replay & Decimation (Запись реплея):** Децимация кадров (`recordStride`), детекция событий (`PICKUP`, `DROPOFF`, `CHARGE_START`, `CHARGE_END`, `BRAKE`).
  7. **Telemetry & Deadlock Detection (Телеметрия):** Подсчет доставленных паллет, загрузки флота, детекция тупиков/клинчей (>30с неподвижности).
* **Мертвый код / Заглушки:**
  * `edgeProgressM`, `edgeDistanceM`, `currentEdgeId` в `AgentState` объявлены, но не используются при векторном движении.
* **Состояние "God Object":** **10/10** (Максимальный монолит. Связывает физику, математику Eikonal, FSM, бизнес-логику батарей, сбор телеметрии и компрессию реплея в одном классе).

---

### `src/engine/constructor_engine.ts`
* **Суть и ответственность:** Движок 2D/3D интерактивного конструктора склада (CAD Grid). Управляет плитками пола, размещением стеллажей, доков и зарядок, расчетом площади пола по алгоритму Shoelace, а также динамическим перестроением графа топологии `FacilityTopology`.
* **Ключевые сущности:**
  * `rebuildTopologyFromGrid`: генерация узлов и ребер графа из ячеек сетки.
  * `calculateShoelaceArea`: формула Гаусса для полигональных полов.
  * `findMagneticSnapPosition`: привязка по координатам.
  * `calculateWarehouseCapacity`: подсчет вместимости стеллажей.
  * `isInsideFloor`: проверка попадания точки в контур пола.
  * `createDebugSnapshotPayload`, `emitDebugSnapshot`: создание отладочных снимков layout.
* **Что он импортирует:** `FacilityRequirements`, `FacilityTopology`, `FacilityZone`, `GraphEdge`, `GraphNode`, `NodeType`, `buildElementsMap`, `StorageElement`.
* **Что он экспортирует:** Все перечисленные функции, типы `ConstructorTileType`, `PlacedElement`, `SupplySchedule`, `ConstructorGrid`, `FloorDefinition`, `DebugSnapshotPayload`.
* **Мертвый код / Заглушки:**
  * `GridTileState` определен, но используется `ConstructorTileType` и `Map<string, ConstructorTileType>`.
* **Состояние "God Object":** **7/10** (Содержит и геометрию пола, и Zod/fetch отладчик, и генератор графа).

---

### `src/engine/cad_entities.ts`
* **Суть и ответственность:** Объектно-ориентированная иерархия классов элементов склада для CAD конструктора.
* **Ключевые сущности:**
  * Абстрактный класс `WarehouseElement`.
  * Дочерние классы: `StorageElement`, `RackEntity`, `WallEntity`, `ChargerEntity`, `DockEntity`, `InboundDockEntity`, `OutboundDockEntity`.
  * Функция `buildElementsMap(grid)`.
* **Что он импортирует:** `ConstructorGrid`, `ConstructorTileType`.
* **Что он экспортирует:** Классы и функцию `buildElementsMap`.
* **Мертвый код / Заглушки:**
  * Класс `WallEntity`, `RackEntity` имеют свойства `heightM` / `widthM`, которые переопределяются логикой `ConstructorGrid`.
* **Состояние "God Object":** **2/10** (Чистая OOP иерархия).

---

### `src/engine/fast_marching.ts`
* **Суть и ответственность:** Численный солвер уравнения Эйконала ($|\nabla T| = F$) методом Fast Marching Method для построения полей времени проезда и обхода сложных препятствий.
* **Ключевые сущности:**
  * Класс `FastMarchingSolver` с кешированием полей `eikonalCache`.
  * Метод `solveEikonalField(targetX, targetY)`.
  * Метод `getGradientVelocity(x, y, eikonalField, maxSpeed)`.
* **Что он импортирует:** `FacilityRequirements`, `Robot`.
* **Что он экспортирует:** `FastMarchingSolver`, интерфейсы `FastMarchingOptions`, `GridResolution`.
* **Мертвый код / Заглушки:** Нет.
* **Состояние "God Object":** **3/10** (Сфокусированный алгоритмический солвер).

---

### `src/engine/spectral_analyzer.ts`
* **Суть и ответственность:** Спектральный анализ графа топологии с использованием матрицы Лапласа графа ($L = D - A$) и степенного метода для определения связности $\lambda_2$ (алгебраическая связность) и вектора Фидлера $v_2$. Выявляет узкие горлышки склада.
* **Ключевые сущности:**
  * Класс `SpectralAnalyzer`.
  * Методы `buildLaplacianMatrix`, `computeAlgebraicConnectivity`, `identifyCriticalNodes`.
* **Что он импортирует:** `FacilityTopology`.
* **Что он экспортирует:** `SpectralAnalyzer`, интерфейс `SpectralAnalysisResult`.
* **Мертвый код / Заглушки:** Нет.
* **Состояние "God Object":** **2/10** (Чистая линейная алгебра).

---

### `src/engine/fleet_optimizer.ts`
* **Суть и ответственность:** Алгоритм дискретной оптимизации состава флота (выбор между моно-флотом и 2-типовым гетерогенным флотом с учетом коэф. 1.15 на интеграцию/инфраструктуру и критерия выгоды TCO $\ge 5\%$).
* **Ключевые сущности:**
  * Функция `optimizeFleetComposition`.
* **Что он импортирует:** `Robot`, `FacilityRequirements`, `calculate5YearTCO`.
* **Что он экспортирует:** `optimizeFleetComposition`, типы `FleetOptimizationResult`, `FleetCompositionItem`.
* **Мертвый код / Заглушки:** Нет.
* **Состояние "God Object":** **3/10**.

---

### `src/engine/dss.ts`
* **Суть и ответственность:** Система поддержки принятия решений (Decision Support System). Анализирует показатели окупаемости, ROI, узкие места и формирует финальный вердикт (Зеленый / Желтый / Красный) и рекомендации.
* **Ключевые сущности:**
  * Функция `evaluateDecisionSupport`.
* **Что он импортирует:** `FacilityRequirements`, `FinancialEvaluationResult`, `SpectralAnalysisResult`, `SimulationTelemetry`.
* **Что он экспортирует:** `evaluateDecisionSupport`, интерфейс `DSSReport`.
* **Мертвый код / Заглушки:** Нет.
* **Состояние "God Object":** **3/10**.

---

### `src/engine/economics.ts`
* **Суть и ответственность:** Финансовая модель склада и робототехники. Рассчитывает CAPEX, OPEX, TCO за 5 лет, простой ручного персонала, окупаемость (Payback Period) и ROI для трех сценариев (CAPEX покупка, RaaS аренда, Ручной труд).
* **Ключевые сущности:**
  * Функция `calculateEconomics`.
  * Формулы расчета штата операторов (`Staff_manual = max(1, ceil(target / 12) * shifts)`).
* **Что он импортирует:** `FacilityRequirements`, `Robot`, `FleetCompositionItem`.
* **Что он экспортирует:** `calculateEconomics`, типы `EconomicsOptions`, `FinancialEvaluationResult`, `ScenarioFinancials`.
* **Мертвый код / Заглушки:** Нет.
* **Состояние "God Object":** **6/10** (Содержит много расчетов ставок, инфляции и сценариев).

---

### `src/engine/topology_generator.ts`
* **Суть и ответственность:** Генератор процедурных топологий графов для разных типов объектов (Склад Class A, Аэропорт, Больница) с учетом пропорций (Aspect Ratio) и нормативного буфера безопасности `RACK_CLEARANCE_BUFFER_M = 1.0`.
* **Ключевые сущности:**
  * `generateFacilityTopology`, `calculateFacilityDimensions`.
* **Что он импортирует:** `FacilityRequirements`, `FacilityTopology`, `FacilityZone`, `GraphEdge`, `GraphNode`.
* **Что он экспортирует:** `generateFacilityTopology`, `calculateFacilityDimensions`, `RACK_CLEARANCE_BUFFER_M`.
* **Мертвый код / Заглушки:**
  * Генераторы аэропорта и больницы сохранены для совместимости.
* **Состояние "God Object":** **5/10**.

---

### `src/engine/audio_synth.ts`
* **Суть и ответственность:** Веб-аудио синти-движок на базе Web Audio API (`AudioContext`). Синтезирует процедурные звуки для симуляции (зарядка, pick, drop, торможение).
* **Ключевые сущности:**
  * Класс `SimulationAudioEngine` (синглтон).
* **Что он импортирует:** Нет.
* **Что он экспортирует:** `SimulationAudioEngine`, синглтон `simulationAudio`.
* **Мертвый код / Заглушки:** Нет.
* **Состояние "God Object":** **2/10**.

---

### `src/engine/export_pdf.ts`, `export_excel.ts`, `import_facility.ts`, `export_types.ts`
* **Суть и ответственность:** Экспорт PDF отчетов (jsPDF + autoTable), 4-страничных Excel книги (xlsx), а также импорт CSV/JSON параметров склада с Zod валидацией.
* **Ключевые сущности:**
  * `generateFeasibilityReportPDF`, `generateExcelWorkbook`, `parseFacilityImport`.
* **Состояние "God Object":** **4/10**.

---

## 2. ПОЛЬЗОВАТЕЛЬСКИЙ ИНТЕРФЕЙС (`src/components/` & `src/App.tsx`)

### `src/App.tsx`
* **Суть и ответственность:** Главный координирующий компонент платформы. Управляет состоянием режима (`appMode: 'CONSTRUCTOR' | 'SIMULATION'`), данными склада `facility`, списком SKU, выбором робота, результатами расчета симуляции и переключением модальных окон.
* **Ключевые сущности:** Компонент `App`.
* **Что он импортирует:** Практически все компоненты из `src/components/`, сиды роботов, движки расчета.
* **Состояние "God Object":** **8/10** (Содержит все состояние платформы в одном файле).

---

### `src/components/SimulationViewport.tsx`
* **Суть и ответственность:** 3D Вьюпорт на Three.js для черчения CAD и визуализации симуляции роботов в реальном времени.
* **Ключевые сущности:**
  * Canvas рендерер Three.js, OrbitControls, карточки инспекции, анимация агентов через LERP, выделение рамкой (Marquee).
* **Состояние "God Object":** **9/10** (1200+ строк Three.js кода, мешей, событий мыши и рейкастинга).

---

### `src/components/Zone1Sidebar.tsx`
* **Суть и ответственность:** Левая панель параметров (Зона 1). Содержит 6 аккордеонов экономико-эксплуатационных правил.
* **Состояние "God Object":** **5/10**.

---

### `src/components/ConstructorToolbar.tsx`
* **Суть и ответственность:** Горизонтальная панель инструментов CAD Конструктора (выбор инструментов, выпадающие списки пола и SKU).
* **Состояние "God Object":** **4/10**.

---

### `src/components/RackInspectionPopover.tsx`
* **Суть и ответственность:** Плавающее окно инспекции и редактирования параметров конкретного стеллажа в 3D CAD.
* **Состояние "God Object":** **3/10**.

---

### Остальные компоненты (`FacilityForm`, `FleetConfigPanel`, `WhatIfPanel`, `ScenarioMatrix`, `SimulationControls`, `SupplyScheduleModal`, `SkuInventoryModal`, `ExportToolbar`, `FormulaModal`, `CalculationProgressModal`, `RobotCard`, `RobotComparisonTable`, `ExcludedRobotsAccordion`)
* Сфокусированные формы и UI модалки управления параметрами, графиками и экспортом.

---

## 3. ТИПЫ И ДАННЫЕ (`src/types/`, `src/data/`, `src/db/`)

### `src/types/facility.ts`, `robot.ts`, `topology.ts`
* Схемы Zod и TypeScript интерфейсы для складов, роботов и топологий графа.

### `src/data/robots.seed.ts`
* Набор данных актуальных моделей AMR/AGV роботов (Ronavi, Яндекс, OMRON, KUKA и др.).

### `src/data/presets.ts`
* Сид пресетов (очищены, сохранены структуры).

### `src/db/schema.ts`
* Схема таблиц БД.

---

## ИТОГОВЫЙ СУММАРНЫЙ ВЕРДИКТ И ПЛАН РАСПИЛА

1. **Главный "God Object" движка:** `src/engine/simulation_engine.ts` (10/10). Рекомендуется разбить на подмодули: `AgentFSM.ts`, `VectorSteeringPhysics.ts`, `BatteryWearSimulator.ts`, `SimulationReplayRecorder.ts`.
2. **Главный "God Object" UI:** `src/components/SimulationViewport.tsx` (9/10) и `src/App.tsx` (8/10).
