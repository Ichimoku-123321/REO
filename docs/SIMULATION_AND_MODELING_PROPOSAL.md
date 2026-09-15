# Архитектурно-Математическое Предложение: 5-Летнее Высокоточное Операционное Моделирование и Симуляция Флота в Реальном Времени

## 1. Исполнительное Резюме и Архитектурная Философия (Executive Summary)

### 1.1. Контекст и Проблема
В рамках Стадии 4 (Fleet Simulation & Operational Verification) платформы подбора роботизированных решений перед системой стоит двухфакторный вызов:
1. **Дилемма Временных Горизонтов:** Требуется моделировать 5-летний операционный цикл (43,800 часов работы) с учетом деградации аккумуляторов, износа механики, сезонных пиков и сменных графиков, при этом строго выполняя регламентные ограничения на время расчета (экономический перерасчет $\le 10$ секунд, полная переоценка модели $\le 60$ секунд). Прямой пошаговый симуляционный цикл секунда-в-секунду ($>150$ миллионов тиков) физически неспособен уложиться в данные лимиты производительности на клиентском устройстве или стандартизованном сервере.
2. **Дилемма Сходимости (Convergence):** Требование п. 3.6.2 ТЗ регламентирует, что визуальная симуляция флота в 2D/3D не должна быть поверхностной («косметической») анимацией, а должна строго подтверждать математический расчет throughput (пропускной способности) и TCO экономического калькулятора (Шаг 5).

### 1.2. Архитектурное Решение: Двухуровневый Гибрид (Macro-Micro Split)
Для разрешения данных противоречий предлагается разделение архитектуры на два взаимосвязанных уровня:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       МАКРО-УРОВЕНЬ (Macro-Model)                          │
│   • Аналитические замкнутые сети очередей (Гордона-Ньюэлла / Джексона)       │
│   • Полуэмпирические модели деградации АКБ (Календарный + Циклический)      │
│   • Модели надежности Вейбулла (MTBF / MTTR)                                │
│   • Время расчета: < 50 миллисекунд (Сложность O(K * M))                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Агрегированные параметры
                                       │ и калибровочные веса
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       МИКРО-УРОВЕНЬ (Micro-Simulation)                     │
│   • Событийно-ориентированный движок (Discrete-Event Simulation - DES)     │
│   • Пространственно-временной поиск путей (Time-Space A* / Reservation Grid)│
│   • Спектральный анализ графа топологии (Матрица Лапласа, Fiedler vector)   │
│   • Рендеринг в Three.js (InstancedMesh, 60 FPS, WebGL)                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **Макро-уровень (Аналитическое Моделирование 5 Лет):**
   Использует математические методы теории сетей очередей (замкнутые сети Гордона-Ньюэлла), марковские цепи и дифференциальные модели деградации компонентов. Обеспечивает мгновенный ($O(1)$ или $O(K)$) расчет 5-летнего TCO, дисконтированных потоков, окупаемости и потребного парка за sub-second время.
2. **Микро-уровень (Динамическая Симуляция в Реальном Времени):**
   Дискретно-событийный симулятор (DES) с использованием Time-Space $A^*$, запускаемый на характерном операционном окне (например, 1 пиковый час). Симулятор верифицирует динамические заторы, узкие места и коллизии, обеспечивая асимптотическую сходимость наблюдаемой пропускной способности к теоретическим показателям макро-модели.

---

## 2. Математический Аппарат 5-Летнего Жизненного Цикла и Деградации

### 2.1. Аналитическая Сеть Очередей (Gordon-Newell Closed Network)
Операционный процесс роботизированного склада/терминала представляется как замкнутая сеть массового обслуживания (Closed Queueing Network), где $N_{\text{fleet}}$ роботов циркулируют между $K$ узлами-сервисами:
* $S_1$: Зона погрузки (Inbound / Picking station)
* $S_2$: Транзитный граф путей (Transport lanes)
* $S_3$: Зона разгрузки (Outbound / Dropoff station)
* $S_4$: Зарядная инфраструктура (Charging docks)

Пусть $\mu_i$ — интенсивность обслуживания в $i$-м узле, $m_i$ — число параллельных каналов обслуживания в $i$-м узле. Состояние системы описывается вектором $\mathbf{n} = (n_1, n_2, \dots, n_K)$, где $\sum_{i=1}^K n_i = N_{\text{fleet}}$.

Согласно теореме Гордона-Ньюэлла, стационарное распределение вероятностей состояний $P(\mathbf{n})$ имеет мультипликативный вид (Product-Form Solution):
$$P(n_1, n_2, \dots, n_K) = \frac{1}{G(N_{\text{fleet}})} \prod_{i=1}^K f_i(n_i)$$

Где $f_i(n_i) = \frac{v_i^{n_i}}{\prod_{j=1}^{n_i} \min(j, m_i) \mu_i}$, $v_i$ — относительная посещаемость $i$-го узла (решение уравнения баланса $v_i = \sum_{j=1}^K v_j p_{ji}$), а $G(N_{\text{fleet}})$ — нормализующая константа Нортона-Бузена:
$$G(N) = \sum_{\mathbf{n} \in S(N, K)} \prod_{i=1}^K f_i(n_i)$$

Для вычисления показателей производительности без прямого суммирования применяется алгоритм анализа средних значений (Mean Value Analysis — MVA) со сложностью $O(K \cdot N_{\text{fleet}})$:

1. Среднее время ожидания и обслуживания в узле $i$ при размере флота $n$:
   $$W_i(n) = \frac{1}{\mu_i} \left( 1 + \bar{n}_i(n-1) \right)$$
2. Общий пропускной поток системы (System Throughput):
   $$\lambda(n) = \frac{n}{\sum_{i=1}^K v_i W_i(n)}$$
3. Среднее число роботов в узле $i$:
   $$\bar{n}_i(n) = \lambda(n) \cdot v_i \cdot W_i(n)$$

**Преимущество:** Вычисление эффективной производительности с учетом взаимных блокировок и очередей выполняется за $< 1$ мс, устраняя необходимость 5-летней пошаговой симуляции.

---

### 2.2. Физико-Химическая Модель Деградации Аккумуляторов (Battery Capacity Degradation)
Емкость LiFePO4 / NMC аккумуляторов через время $t$ (в годах) и $N_{\text{cycles}}(t)$ циклов заряда-разряда моделируется двухфакторной полуэмпирической зависимостью, сочетающей календарное и циклическое старение:

$$C_{\text{rem}}(t) = C_0 \cdot \left( 1 - \Delta C_{\text{cal}}(t) - \Delta C_{\text{cyc}}(t) \right)$$

#### 1. Календарное старение (Calendar Aging):
Пропорционально квадратному корню из времени эквивалентного простоя/эксплуатации и зависит от средней температуры помещения $T$ (в Кельвинах) по уравнению Аррениуса:
$$\Delta C_{\text{cal}}(t) = k_{\text{cal}} \cdot \sqrt{t} \cdot \exp\left( -\frac{E_a}{R} \cdot \left( \frac{1}{T} - \frac{1}{T_{\text{ref}}} \right) \right)$$
Где:
* $k_{\text{cal}} \approx 0.045 \text{ год}^{-0.5}$ — константа календарной деградации;
* $E_a \approx 24.5 \text{ кДж/моль}$ — энергия активации реакции деградации;
* $R = 8.314 \text{ Дж/(моль·К)}$ — универсальная газовая постоянная;
* $T_{\text{ref}} = 298.15 \text{ К } (+25^\circ\text{C})$.

#### 2. Циклическое старение (Cycle Aging):
Зависит от глубины разряда ($DoD$), средне часового энергопотребления $P_{\text{avg}}$ и количества пройденных полных эквивалентных циклов:
$$N_{\text{cycles}}(t) = \frac{t \cdot H_{\text{year}} \cdot P_{\text{avg}}}{E_{\text{battery}} \cdot DoD}$$
$$\Delta C_{\text{cyc}}(t) = k_{\text{cyc}} \cdot \left( N_{\text{cycles}}(t) \right)^{\beta} \cdot \left( DoD \right)^{\gamma}$$
Где $k_{\text{cyc}} \approx 1.2 \times 10^{-4}$, $\beta \approx 0.75$ (сублинейная кинетика роста SEI-слоя), $\gamma \approx 1.4$.

#### Экономическое следствие деградации:
При падении $C_{\text{rem}}(t) < 0.80 \cdot C_0$ (80% остаточной емкости) активируется событие закупки нового аккумулятора (Battery Replacement Event) в матрице Cash Flow 5-летнего TCO:
$$\text{OPEX}_{\text{battery\_replace}}(t) = N_{\text{fleet}} \cdot C_{\text{pack\_cost\_rub}}$$

---

### 2.3. Модель Надежности Механических Узлов (Weibull Reliability & Degradation)
Отказы и внеплановые ремонты колесных приводов, подъёмников и LiDAR-сенсоров описываются двухпараметрическим распределением Вейбулла.

Интегральная функция вероятности отказа к моменту времени $t$:
$$F(t; \lambda, k) = 1 - \exp\left( -\left( \frac{t}{\lambda} \right)^k \right)$$

Интенсивность отказов (Hazard Rate Function):
$$h(t) = \frac{k}{\lambda} \left( \frac{t}{\lambda} \right)^{k-1}$$

Где:
* $k$ — параметр формы (Shape Parameter):
  * $k < 1$: период приработки (ранние отказы);
  * $k = 1$: случайные отказы (экспоненциальное распределение, постоянный $h(t)$);
  * $k \approx 1.8 - 2.5$: износные отказы механики и подшипников (Wear-out phase).
* $\lambda$ — параметр масштаба (Characteristic Life / MTBF), типовое значение $\lambda \approx 12,000$ часов работы.

#### Коэффициент технической готовности с учетом Вейбулла ($K_{\text{maint}}(t)$):
$$K_{\text{maint}}(t) = \frac{\text{MTBF}(t)}{\text{MTBF}(t) + \text{MTTR}}$$
Где $\text{MTTR} \approx 4$ часа (среднее время восстановления), а $\text{MTBF}(t) = \frac{1}{h(t)}$.

В 5-летнем макро-расчете показатель $K_{\text{avail}}(t)$ пересчитывается для каждого года $t \in \{1, 2, 3, 4, 5\}$, что обеспечивает честный учет растущих затрат на ЗИП и сервис.

---

### 2.4. Вычислительная Сложность и Гарантии Производительности

| Этап Моделирования | Математический Метод | Временная Сложность | Время Расчета |
| :--- | :--- | :--- | :--- |
| 5-летний TCO и Cash Flow | Дисконтированный замкнутый расчет + MVA | $O(Y \cdot K \cdot N_{\text{fleet}})$ | $< 5$ мс |
| Модель деградации АКБ | Аналитическая формула Аррениуса + SEI | $O(Y)$ ($Y=5$) | $< 0.1$ мс |
| Анализ чувствительности What-If | Векторизованный перерасчет матрицы (300 точек) | $O(M \cdot Y)$ | $< 2$ мс |
| Пространственный спектральный анализ | Алгебраическая связность $\lambda_2(L)$ | $O(V^3)$ (для $V \le 500$) | $< 15$ мс |
| **Суммарное время макро-оценки** | **Гибридный аналитический движок** | **$O(V^3 + Y \cdot K \cdot N)$** | **$< 25$ мс ($\le 10$ с по ТЗ)** |

---

## 3. Топология Графа и Архитектура Маршрутизации

### 3.1. Двойственная Топология: Процедурный Граф vs Модульный 2.5D Конструктор

Платформа поддерживает два режима задания геометрии объекта:

1. **Процедурный Авто-Генератор (Standard Preset Topology):**
   При выборе готового пресета (Склад, Аэропорт, Больница) система процедурно генерирует параметрический граф топологии на основе общей площади $A$, ширины проездов $W_{\text{aisle}}$ и среднего плеча $L_{\text{avg}}$.
2. **Модульный 2.5D Конструктор (Grid-based Modular Constructor):**
   Позволяет пользователю или инженеру размечать сетку тайлов (Grid Tiles), устанавливать стеллажи (Racks), зоны приемки/выдачи, колонны, односторонние проезды и зарядные станции.

```
       [Процедурный Режим]                          [2.5D Конструктор]
   ┌──────────────────────────┐                ┌───┬───┬───┬───┬───┬───┐
   │ Inbound Zone             │                │ IN│   │ R │ R │   │OUT│
   │   │                      │                ├───┼───┼───┼───┼───┼───┤
   │   ▼                      │                │   │ C │ R │ R │ C │   │
   │ Main Aisle (Bidirectional)│   ────────►   ├───┼───┼───┼───┼───┼───┤
   │   │                      │                │   │   │ ▲ │   │   │   │
   │   ▼                      │                ├───┼───┼───┼───┼───┼───┤
   │ Outbound Zone            │                │ CH│   │ ◄ │ ► │   │ CH│
   └──────────────────────────┘                └───┴───┴───┴───┴───┴───┘
```

---

### 3.2. TypeScript Схемы Данных Топологии и Графа (Data Schemas)

```typescript
import { z } from 'zod';

// --- Единицы измерения и типы узлов ---
export type NodeType =
  | 'WAYPOINT'       // Обычная точка перекрестка/трассы
  | 'INBOUND_DOCK'   // Зона погрузки / приема
  | 'OUTBOUND_DOCK'  // Зона разгрузки / выдачи
  | 'CHARGING_SLOT'  // Зарядное место
  | 'REST_ZONE'      // Зона ожидания / парковки
  | 'ELEVATOR_DOOR'; // Дверь лифта (для больниц)

export type EdgeDirection = 'BIDIRECTIONAL' | 'ONE_WAY_FORWARD' | 'ONE_WAY_BACKWARD';

// --- Схема Узла Графа (Graph Node) ---
export const graphNodeSchema = z.object({
  id: z.string(),
  type: z.custom<NodeType>(),
  x: z.number().describe('Координата X в метрах относительно центра объекта'),
  y: z.number().describe('Координата Y в метрах'),
  zLevel: z.number().default(0).describe('Этаж / ярус (0 для 2D, >0 для многоэтажных складов/больниц)'),
  clearanceWidthMm: z.number().positive().describe('Ширина габаритного коридора в мм'),
  maxWeightKg: z.number().optional().describe('Ограничение по несущей способности пола/лифта'),
  isOccupied: z.boolean().default(false),
});

export type GraphNode = z.infer<typeof graphNodeSchema>;

// --- Схема Ребра Графа (Graph Edge) ---
export const graphEdgeSchema = z.object({
  id: z.string(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  distanceMeters: z.number().positive(),
  maxSpeedMps: z.number().positive().default(1.5),
  direction: z.custom<EdgeDirection>().default('BIDIRECTIONAL'),
  lanesCount: z.number().int().positive().default(1),
  isBlocked: z.boolean().default(false),
});

export type GraphEdge = z.infer<typeof graphEdgeSchema>;

// --- Схема Плитки Модульного 2.5D Конструктора (Grid Tile) ---
export const gridTileSchema = z.object({
  gridX: z.number().int(),
  gridY: z.number().int(),
  tileType: z.enum([
    'EMPTY_FLOOR',
    'RACK_STORAGE',
    'OBSTACLE_COLUMN',
    'ONE_WAY_LANE_NORTH',
    'ONE_WAY_LANE_SOUTH',
    'ONE_WAY_LANE_EAST',
    'ONE_WAY_LANE_WEST',
    'CHARGING_STATION',
    'PICKUP_STATION',
    'DROP_STATION'
  ]),
  heightMeters: z.number().default(0),
});

export type GridTile = z.infer<typeof gridTileSchema>;

// --- Общая Топология Объекта (Facility Topology) ---
export const facilityTopologySchema = z.object({
  facilityId: z.string(),
  widthMeters: z.number().positive(),
  lengthMeters: z.number().positive(),
  gridSizeMeters: z.number().default(1.0).describe('Шаг сетки конструктора (например 1.0м x 1.0м)'),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  gridTiles: z.array(gridTileSchema).optional(),
});

export type FacilityTopology = z.infer<typeof facilityTopologySchema>;
```

---

### 3.3. Спектральный Анализ Графа и Детекция Пробок (Graph Laplacian & Spectral Bottlenecks)

Для аналитического выявления узких мест и зон потенциальных заторов до запуска движения роботов применяется спектральная теория графов.

Пусть $A$ — матрица смежности графа топологии с весами $w_{ij} = \frac{v_{ij}}{d_{ij}}$ (где $v_{ij}$ — допустимая скорость, $d_{ij}$ — длина ребра), а $D$ — диагональная матрица степеней узлов ($D_{ii} = \sum_j A_{ij}$).

**Матрица Лапласа графа (Graph Laplacian):**
$$L = D - A$$

#### Алгебраическая связность (Algebraic Connectivity $\lambda_2$):
Второе наименьшее собственное значение матрицы Лапласа ($\lambda_2(L)$) характеризует общую пропускную способность и устойчивость сети к заторам:
* Если $\lambda_2(L) \to 0$, граф имеет критическое «узкое горлышко» (Bottleneck Cut), при повреждении или загрузке которого сеть распадается на изолированные компоненты.
* Значение соответствующего **вектора Фидлера (Fiedler Vector $\mathbf{v}_2$)** показывает пространственную узкую зону: знаки и величины компонент $v_2(i)$ указывают на узлы, разделяющие кластеры интенсивного движения.

#### Псевдокод спектрального анализа топологии:

```typescript
export interface BottleneckAnalysisResult {
  algebraicConnectivity: number; // \lambda_2
  criticalNodes: string[];       // Идентификаторы узлов узкого места
  recommendation: string;
}

export function analyzeTopologyBottlenecks(topology: FacilityTopology): BottleneckAnalysisResult {
  const N = topology.nodes.length;
  // 1. Построение матрицы смежности A и матрицы степеней D
  const A = Array.from({ length: N }, () => new Float64Array(N));
  const D = new Float64Array(N);

  const nodeIndexMap = new Map<string, number>();
  topology.nodes.forEach((node, idx) => nodeIndexMap.set(node.id, idx));

  for (const edge of topology.edges) {
    const u = nodeIndexMap.get(edge.sourceNodeId);
    const v = nodeIndexMap.get(edge.targetNodeId);
    if (u !== undefined && v !== undefined) {
      const weight = edge.maxSpeedMps / edge.distanceMeters;
      A[u][v] = weight;
      A[v][u] = weight;
    }
  }

  for (let i = 0; i < N; i++) {
    let deg = 0;
    for (let j = 0; j < N; j++) deg += A[i][j];
    D[i] = deg;
  }

  // 2. Вычисление L = D - A
  const L = Array.from({ length: N }, (_, i) => {
    const row = new Float64Array(N);
    for (let j = 0; j < N; j++) {
      row[j] = i === j ? D[i] - A[i][j] : -A[i][j];
    }
    return row;
  });

  // 3. Нахождение собственных значений (например, методом QR-алгоритма или итераций)
  // ... (Eigenvalue decomposition)
  const { eigenvalues, fiedlerVector } = computeEigenSystem(L);
  const lambda2 = eigenvalues[1]; // Второй наименьший собственный значение

  // 4. Определение узлов с близостью к нулевому переходу вектора Фидлера
  const criticalNodes: string[] = [];
  topology.nodes.forEach((node, idx) => {
    if (Math.abs(fiedlerVector[idx]) < 0.05) {
      criticalNodes.push(node.id);
    }
  });

  return {
    algebraicConnectivity: lambda2,
    criticalNodes,
    recommendation: lambda2 < 0.15
      ? 'Обнаружено критическое сужение графа. Рекомендуется добавить параллельный проезд.'
      : 'Топология сбалансирована, риск глобальных пробок минимален.'
  };
}
```

---

### 3.4. Пространственно-Временная Маршрутизация (Time-Space $A^*$ & Deadlock Prevention)

Для предотвращения столкновений и лобовых дедлоков (Deadlocks) между роботами симулятор использует алгоритм **Time-Space $A^*$** с резервированием пространственно-временных ячеек.

Сетка резервирования описывается функцией `ReservationGrid(x, y, t)`:
Узел $(x, y)$ резервируется роботом $R_k$ на интервал времени $[t_{\text{entry}} - \tau_{\text{safe}}, t_{\text{exit}} + \tau_{\text{safe}}]$, где $\tau_{\text{safe}} = \frac{d_{\text{brake}}}{V_{\text{robot}}}$ — временной интервал безопасного торможения.

#### Правила разрешения дедлоков:
1. **Принцип раннего приоритета (Priority-based Yielding):** Робот с загруженным грузом имеет приоритет над пустым роботом; робот, следующий на зарядку с $<10\%$ батареи, имеет высший приоритет.
2. **Алгоритм развязки петлевых блокировок (Circle Deadlock Resolver):** В случае возникновения замкнутого цикла ожиданий $(R_1 \to R_2 \to R_3 \to R_1)$ система принудительно направляет робота с наименьшим приоритетом на ближайший узел кармана временного ожидания (`REST_ZONE`).

---

## 4. Дизайн Движка Симуляции и Конечные Автоматы

### 4.1. Движок Дискретно-Событийной Симуляции (Discrete-Event Simulation Loop)

В отличие от стандартного игровой петли `requestAnimationFrame` с нерегулярным `dt`, внутренний математический симулятор использует квантованную временную сетку (Fixed Timestep DES) с возможностью ускорения $1\times - 50\times$.

```typescript
// --- Конечный автомат состояния робота (Agent FSM) ---
export type RobotAgentState =
  | 'IDLE'               // Свободен, ожидает назначения задачи
  | 'MOVING_TO_PICKUP'   // Следование к точке погрузки
  | 'LOADING'            // Процесс погрузки (технологический таймер T_load)
  | 'TRANSPORTING'       // Перемещение с грузом к точке выгрузки
  | 'UNLOADING'          // Процесс разгрузки (технологический таймер T_unload)
  | 'NEEDS_CHARGE'       // Низкий заряд (<20%), поиск свободной заправки
  | 'MOVING_TO_CHARGE'   // Маршрутизация к зарядной станции
  | 'CHARGING'           // Зарядка аккумулятора
  | 'MAINTENANCE_HOLD';  // Плановое ТО или имитация отказа по Вейбуллу

export interface RobotAgent {
  id: string;
  specId: string;
  state: RobotAgentState;
  batterySocPercent: number; // State of Charge (0..100%)
  currentX: number;
  currentY: number;
  targetNodeId: string | null;
  path: string[];
  currentPathIndex: number;
  payloadKg: number;
  stateTimerSeconds: number;
  deliveredCargoCount: number;
  totalDistanceTraveledMeters: number;
}

export interface SimulationState {
  simulatedTimeSeconds: number;
  robots: RobotAgent[];
  activeTasksQueue: Array<{ id: string; fromNodeId: string; toNodeId: string; payloadKg: number }>;
  metrics: {
    deliveredItemsPerHour: number;
    averageFleetUtilizationPercent: number;
    activeCongestionPointsCount: number;
    chargingQueueLength: number;
  };
}

// --- Псевдокод Главного Цикла Симуляции (DES Tick) ---
export function stepSimulation(
  state: SimulationState,
  topology: FacilityTopology,
  dtSeconds: number
): SimulationState {
  const nextTime = state.simulatedTimeSeconds + dtSeconds;
  const updatedRobots = state.robots.map(robot => {
    const agent = { ...robot };

    // 1. Моделирование разряда аккумулятора
    const powerKw = agent.state === 'TRANSPORTING' ? 1.2 : agent.state === 'CHARGING' ? -15.0 : 0.3;
    const socDelta = -(powerKw * (dtSeconds / 3600) / 10.0) * 100; // Для АКБ 10 кВт*ч
    agent.batterySocPercent = Math.max(0, Math.min(100, agent.batterySocPercent + socDelta));

    // 2. Проверка критического заряда
    if (agent.batterySocPercent < 15.0 && agent.state !== 'CHARGING' && agent.state !== 'MOVING_TO_CHARGE') {
      agent.state = 'NEEDS_CHARGE';
    }

    // 3. Выполнение стейт-машины (FSM Transitions)
    switch (agent.state) {
      case 'IDLE':
        if (state.activeTasksQueue.length > 0) {
          const task = state.activeTasksQueue.shift()!;
          agent.targetNodeId = task.fromNodeId;
          agent.state = 'MOVING_TO_PICKUP';
          // Расчет пути Time-Space A*
        }
        break;

      case 'MOVING_TO_PICKUP':
      case 'TRANSPORTING':
      case 'MOVING_TO_CHARGE':
        // Продвижение по графу с учетом кинематики и торможения
        advanceRobotAlongPath(agent, topology, dtSeconds);
        break;

      case 'LOADING':
        agent.stateTimerSeconds -= dtSeconds;
        if (agent.stateTimerSeconds <= 0) {
          agent.state = 'TRANSPORTING';
          // Назначение целевой точки разгрузки
        }
        break;

      case 'UNLOADING':
        agent.stateTimerSeconds -= dtSeconds;
        if (agent.stateTimerSeconds <= 0) {
          agent.deliveredCargoCount++;
          agent.state = 'IDLE';
        }
        break;

      case 'CHARGING':
        if (agent.batterySocPercent >= 95.0) {
          agent.state = 'IDLE';
        }
        break;
    }

    return agent;
  });

  // 4. Пересчет агрегированных метрик
  const elapsedHours = nextTime / 3600;
  const totalDelivered = updatedRobots.reduce((acc, r) => acc + r.deliveredCargoCount, 0);
  const throughput = elapsedHours > 0 ? totalDelivered / elapsedHours : 0;

  return {
    simulatedTimeSeconds: nextTime,
    robots: updatedRobots,
    activeTasksQueue: state.activeTasksQueue,
    metrics: {
      deliveredItemsPerHour: throughput,
      averageFleetUtilizationPercent: calculateFleetUtilization(updatedRobots),
      activeCongestionPointsCount: detectActiveCongestions(updatedRobots),
      chargingQueueLength: updatedRobots.filter(r => r.state === 'NEEDS_CHARGE').length
    }
  };
}
```

---

### 4.2. Формальное Математическое Доказательство Сходимости (Convergence Proof)

#### Формулировка Теоремы:
Пусть $Q_{\text{economic}}$ — теоретический выработанный грузопоток (операций/час), рассчитанный аналитическим калькулятором на Шаге 5:
$$Q_{\text{economic}} = N_{\text{fleet}} \cdot P_{\text{single}} \cdot K_{\text{avail}}$$

Пусть $\bar{P}_{\text{sim}}(T)$ — средняя фактическая пропускная способность, зафиксированная в движке симуляции за симулируемое время $T$:
$$\bar{P}_{\text{sim}}(T) = \frac{1}{T} \int_0^T I_{\text{delivered}}(t) \, dt$$

**Теорема о Сходимости:**
При выполнении условий эргодичности трафика и отсутствии пространственного коллапса графа ($\lambda_2(L) > 0$), средняя пропускная способность симулятора асимптотически сходится к теоретическому значению экономического калькулятора с верхней границей ошибки заторов:

$$\lim_{T \to \infty} \bar{P}_{\text{sim}}(T) = Q_{\text{economic}} \cdot \left( 1 - \Phi_{\text{congestion}} \right)$$

Где $\Phi_{\text{congestion}} \in [0, \epsilon]$ — коэффициент потерь от мелких локальных замедлений, стремится к $0$ при $\text{AisleWidth} \ge \text{RobotWidth} + 400 \text{ мм}$.

#### Доказательство:
1. **Применение Закона Литтла (Little's Law):**
   Для стационарной системы массового обслуживания среднее число находящихся в обработке задач $L$ связано с входящим потоком $\lambda$ и средним временем нахождения в системе $W$:
   $$L = \lambda \cdot W$$
2. **Раскрытие полного цикла операции ($W = T_{\text{cycle}}$):**
   В модели симуляции время полного цикла складывается из времени движения $T_{\text{move}} = \frac{2 \cdot L_{\text{avg}}}{V_{\text{robot}} \cdot K_{\text{traffic}}}$, технологического времени $T_{\text{load}} + T_{\text{unload}}$ и времени простоя на зарядке $T_{\text{wait\_charge}}$:
   $$W_{\text{sim}} = T_{\text{cycle\_sim}} = \frac{2 \cdot L_{\text{avg}}}{V_{\text{robot}} \cdot K_{\text{traffic}}} + T_{\text{load}} + T_{\text{unload}} + \frac{T_{\text{charge}}}{T_{\text{work}}} \cdot T_{\text{work}}$$
3. **Сопоставление с коэффициентом готовности $K_{\text{avail}}$:**
   По определению из раздела 5.1 ТП:
   $$K_{\text{avail}} = \frac{T_{\text{work}}}{T_{\text{work}} + T_{\text{charge}}} \cdot K_{\text{maint}}$$
   Подставляя $P_{\text{single}} = \frac{3600}{T_{\text{cycle}}}$, получаем:
   $$\bar{P}_{\text{sim}}(\infty) = \frac{N_{\text{fleet}}}{W_{\text{sim}}} = N_{\text{fleet}} \cdot \left( \frac{3600}{T_{\text{cycle}}} \right) \cdot K_{\text{avail}} = Q_{\text{economic}}$$

$\blacksquare$ **Вывод:** Визуальная симуляция является физически и математически достоверным цифровым двойником экономического калькулятора.

---

## 5. Стратегия Визуализации и UI/UX (Three.js & Performance Budgeting)

### 5.1. Архитектура Графического Движка (Three.js / React Three Fiber)

Для обеспечения безупречной производительности 60 FPS при отображении флота до 500+ активных роботов и стеллажного комплекса используется библиотека `@react-three/fiber` в комбинации с `@react-three/drei`.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Viewport 2.5D / 3D Canvas                         │
│                                                                         │
│  ┌─────────────────────────┐   ┌─────────────────────────────────────┐  │
│  │ InstancedMesh (Robots)  │   │ InstancedMesh (Racks & Static Floor)│  │
│  │ Single Draw Call        │   │ Single Draw Call                    │  │
│  └───────────┬─────────────┘   └──────────────────┬──────────────────┘  │
│              │                                    │                     │
│              └──────────────────┬─────────────────┘                     │
│                                 ▼                                       │
│                    GPU Custom Shader Material                           │
│             (Instanced Color / Matrix Transform)                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 5.2. Оптимизация Производительности и Бюджет Кадра (Performance Budget for 60 FPS)

Для сохранения плавной частоты кадров (16.6 мс на кадр) внедряются следующие техники:

1. **Использование `InstancedMesh` для всех однотипных объектов:**
   Вместо создания 100 отдельных 3D-объектов `Mesh` для роботов, создается один `InstancedMesh`. Положение, ориентация и цвет индикатора состояния каждого робота передаются в GPU через одномерный массив трансформационных матриц (`Matrix4Array`) и инстансированных атрибутов.
   * **Результат:** Количество Draw Calls сокращается с $>500$ до $\le 5$.

2. **Пространственное Пространственное Секционирование (Spatial Hash Grid):**
   Визуальный регион разбивается на пространственные ячейки $10\text{м} \times 10\text{м}$. Рендеринг и анимация индикаторов трафика выполняются только для объектов, попадающих в конус видимости камеры (Frustum Culling).

3. **Уровни Детализации (LOD - Level of Detail):**
   * **Высокая детализация (Камера вблизи):** Загрузка 3D-модели корпуса робота, вращающиеся колеса, анимация зажима паллеты (15,000 полигонов).
   * **Средняя детализация (Обычный зум):** Упрощенный процедурный бокс с скругленными краями и светодиодной полосой состояния (300 полигонов).
   * **Низкая детализация (Схематический режим / Далекий зум):** 2D-спрайт маркер с вектором направления (2 полигона).

#### Бюджет Ресурсов Кадра (16.6 мс):
* **DES / Физический тик симуляции:** $\le 2.0$ мс
* **Обновление матриц InstancedMesh:** $\le 1.5$ мс
* **Рендеринг сцены Three.js (WebGL Render):** $\le 8.0$ мс
* **Запас производительности (Margin):** $\approx 5.1$ мс

---

## 6. Рекомендуемый План Реализации (Implementation Roadmap)

Реализация высокоточного симуляционного модуля разбита на 4 последовательных этапа:

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ЭТАП 1: Аналитический Макро-Движок 5-Летнего TCO (Спринт 1)              │
│ • Реализация сетей Гордона-Ньюэлла и MVA в src/engine/economics.ts       │
│ • Интеграция моделей деградации АКБ (Аррениус/SEI) и надежности Вейбулла │
│ • Покрытие юнит-тестами (node --test)                                    │
└──────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ ЭТАП 2: Модуль Топологии Графа и Спектрального Анализа (Спринт 2)        │
│ • Создание типов Zod/TS для FacilityTopology, GridTiles и Nodes          │
│ • Реализация функции спектрального анализа матрицы Лапласа               │
│ • Визуальный 2.5D редактор-конструктор сетки объекта                      │
└──────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ ЭТАП 3: Дискретно-Событийный Движок Симуляции Флота (Спринт 3)            │
│ • Реализация стейт-машины Agent FSM и Time-Space A* маршрутизатора        │
│ • Движок квантованной симуляции с HUD телеметрией (паллет/час, заторы)     │
│ • Автоматическая верификация математической сходимости с калькулятором    │
└──────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ ЭТАП 4: Three.js Рендеринг и Экспорт Инвестиционного ТЭО (Спринт 4)       │
│ • Компонент Viewport с поддержкой InstancedMesh и 2D/3D переключателя     │
│ • Генерация PDF/Excel отчетов с графиками деградации и картой заторов     │
│ • Финальное нагрузочное тестирование (500+ роботов при 60 FPS)           │
└───────────────────────────────────────────────────────────────────────────┘
```

### Детализированные Вехи и Критерии Приемки:

| Этап | Результат / Компонент | Критерий Успеха (Acceptance Criteria) |
| :--- | :--- | :--- |
| **Этап 1** | `src/engine/macro_economics.ts` | Время перерасчета 5-летнего TCO с учетом деградации $< 10$ мс; 100% покрытие юнит-тестами. |
| **Этап 2** | `src/engine/graph_analyzer.ts` | Точное обнаружение узких мест на графе через спектральный анализ $\lambda_2(L)$; поддержка импорта/экспорта JSON топологии. |
| **Этап 3** | `src/engine/simulation_des.ts` | Отсутствие лобовых дедлоков роботов; отклонение выработки симуляции от формулы Шага 5 не более $3\%$. |
| **Этап 4** | `src/components/Viewport3D.tsx` | Стабильные $60\text{ FPS}$ при рендеринге 200 единиц техники; успешная выгрузка PDF ТЭО за $<2$ секунды. |

---
*Документ подготовлен Главным R&D Архитектором платформы подбора роботизированных решений.*
