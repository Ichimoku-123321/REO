# **ТЕХНИЧЕСКИЙ ПЛАН РЕАЛИЗАЦИИ: ПЛАТФОРМА ПОДБОРА РОБОТИЗИРОВАННЫХ РЕШЕНИЙ**

Настоящий документ представляет собой исчерпывающую техническую спецификацию для прямого исполнения. Документ регламентирует стек технологий, типы данных, математические зависимости, логику СППР, архитектуру 2D-симулятора и формат выходных отчетов в строгом соответствии с требованиями ТЗ хакатона 2026 года.

## **1\. АРХИТЕКТУРА И ТЕХНОЛОГИЧЕСКИЙ СТЕК**

### **1.1. Базовый стек**

* **Frontend:** React 19 / Next.js 15 (App Router, Server Components для каталога, Client Components для калькулятора и симуляции).  
* **Стилизация:** Tailwind CSS \+ Radix UI (shadcn/ui) для доступных компонентов форм, слайдеров и таблиц.  
* **Управление состоянием:** Zustand (изолированные сторы: useProjectStore, useCatalogStore, useSimulationStore).  
* **2D-симуляция:** HTML5 Canvas API (нативный Context 2D) с requestAnimationFrame-лупом, упакованный в изолированный React-хук.  
* **3D-визуализация (дополнительный модуль):** Three.js (@react-three/fiber \+ @react-three/drei) с переключателем проекции 2D/3D.  
* **Валидация данных:** Zod (проверка ручного ввода, CSV/JSON импорта и структуры пресетов).  
* **Экспорт:** jspdf \+ jspdf-autotable (генерация PDF ТЭО на клиенте), xlsx (выгрузка финансовой модели).

### **1.2. Карта состояний приложения (Screen Flow)**

\[ Главная / Выбор типа объекта \]

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├──► Выбор демо-пресета (Склад / Аэропорт / Медучреждение) ИЛИ загрузка CSV

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

\[ Мастер ввода параметров объекта \] ──(Валидация Zod)──┐

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│                                               │

\[ Модуль СППР: Фильтрация и Ранжирование \] ◄───────────┘

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├──► Карточки подходящих роботов (ранжированный список \+ вклад факторов)

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└──► Раздел "Исключенные решения" с явной причиной дисквалификации

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

\[ Экономический движок & What-If калькулятор \]

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├──► Сравнение 3 сценариев: As-Is vs Покупка (CAPEX) vs RaaS (Подписка)

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├──► Интерактивные слайдеры чувствительности (ФОТ, стоимость, поток)

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└──► Модальное окно с открытыми формулами и допущениями

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

\[ Цифровой двойник: 2D-симуляция \]

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├──► Движение по графу путей / зонам (Canvas 2D)

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├──► HUD: выработка (ед/час), загрузка флота (%), детекция узких мест

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└──► Опциональный переключатель в 3D (Three.js)

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

\[ Экспорт результатов \] ──► Скачать PDF ТЭО / Excel-таблицу

&nbsp;

## **2\. БЛОК 1: СХЕМА ДАННЫХ И МОДЕЛИ ТИПОВ (TypeScript)**

### **2.1. Интерфейс робототехнического решения (Robot)**

export type IndustryType \= 'warehouse' | 'airport' | 'hospital' | 'custom';

export type RobotCategory \= 'AMR' | 'AGV' | 'Forklift\_FMR' | 'Cleaning' | 'Tugger' | 'Shuttle';

export type NavigationType \= 'SLAM\_LiDAR' | 'QR\_Code' | 'Magnetic\_Tape' | 'Vision';

&nbsp;

export interface RobotSpecification {

&nbsp;&nbsp;id: string;

&nbsp;&nbsp;name: string;

&nbsp;&nbsp;vendor: string;

&nbsp;&nbsp;country: string;

&nbsp;&nbsp;category: RobotCategory;

&nbsp;&nbsp;industries: IndustryType\[\];

&nbsp;&nbsp;isAvailableInRf: boolean;

&nbsp;

&nbsp;&nbsp;// Технические характеристики

&nbsp;&nbsp;payloadKg: number;              // Грузоподъемность (кг)

&nbsp;&nbsp;lengthMm: number;               // Длина (мм)

&nbsp;&nbsp;widthMm: number;                // Ширина (мм)

&nbsp;&nbsp;heightMm: number;               // Высота (мм)

&nbsp;&nbsp;turningRadiusMm: number;        // Радиус разворота (мм)

&nbsp;&nbsp;minAisleWidthMm: number;        // Минимальная ширина проезда (мм)

&nbsp;&nbsp;maxSpeedMps: number;            // Максимальная скорость (м/с)

&nbsp;&nbsp;batteryLifeHours: number;       // Автономность без подзарядки (ч)

&nbsp;&nbsp;chargeTimeHours: number;        // Время быстрой зарядки (ч)

&nbsp;&nbsp;maxFloorGradientDeg: number;    // Максимальный преодолеваемый уклон (град)

&nbsp;

&nbsp;&nbsp;// Экономические параметры

&nbsp;&nbsp;purchasePriceRub: number;       // Стоимость покупки единицы (руб.)

&nbsp;&nbsp;softwareLicensePerYearRub: number; // Лицензия на ПО и систему управления (руб/год)

&nbsp;&nbsp;maintenanceCostPerYearRub: number; // Сервисный контракт и ЗИП в год (руб/год)

&nbsp;&nbsp;powerConsumptionKw: number;     // Средняя потребляемая мощность (кВт)

&nbsp;&nbsp;serviceLifeYears: number;       // Нормативный срок службы (лет, обычно 5\)

&nbsp;&nbsp;raasMonthlyRateRub: number;     // Месячная ставка аренды по модели RaaS (руб/мес)

&nbsp;&nbsp;

&nbsp;&nbsp;// Метаданные допущений

&nbsp;&nbsp;priceAssumptionNotes: string;   // Обоснование оценки цены (источник/рыночный срез)

}

&nbsp;

### **2.2. Интерфейс параметров объекта (FacilityParameters)**

export interface FacilityParameters {

&nbsp;&nbsp;industry: IndustryType;

&nbsp;&nbsp;name: string;

&nbsp;&nbsp;

&nbsp;&nbsp;// Геометрия и физика

&nbsp;&nbsp;areaSqM: number;                // Общая площадь (кв. м)

&nbsp;&nbsp;clearAisleWidthMm: number;      // Фактическая ширина проездов (мм)

&nbsp;&nbsp;floorRoughnessMm: number;       // Неровность пола (мм на 2 метра)

&nbsp;&nbsp;hasElevators: boolean;          // Наличие лифтов (для больниц)

&nbsp;&nbsp;ambientTempC: number;           // Температура помещения (град. C)

&nbsp;&nbsp;

&nbsp;&nbsp;// Операционный профиль

&nbsp;&nbsp;workShiftsPerDay: number;       // Число смен в сутки (1, 2 или 3\)

&nbsp;&nbsp;hoursPerShift: number;          // Длительность смены (ч, обычно 8 или 12\)

&nbsp;&nbsp;operatingDaysPerYear: number;   // Рабочих дней в году (247 или 365\)

&nbsp;&nbsp;peakOperationsPerHour: number;  // Пиковый грузопоток (перемещений грузов в час)

&nbsp;&nbsp;avgOperationDistanceM: number;  // Среднее плечо перемещения в один конец (м)

&nbsp;&nbsp;

&nbsp;&nbsp;// Параметры груза

&nbsp;&nbsp;targetPayloadKg: number;        // Средняя масса грузовой единицы (кг)

&nbsp;&nbsp;cargoLengthMm: number;          // Длина грузовой единицы (мм)

&nbsp;&nbsp;cargoWidthMm: number;           // Ширина грузовой единицы (мм)

&nbsp;&nbsp;

&nbsp;&nbsp;// Текущий ручной процесс (As-Is)

&nbsp;&nbsp;manualOperatorsCount: number;   // Текущая численность персонала в смену (чел)

&nbsp;&nbsp;operatorSalaryRubPerMonth: number; // Оклад оператора до вычета НДФЛ (руб/мес)

&nbsp;&nbsp;laborTaxRate: number;           // Ставка страховых взносов и налогов (по умолчанию 0.302)

&nbsp;&nbsp;manualHandlingCostPerItemRub: number; // Себестоимость ручной обработки единицы (руб)

}

&nbsp;

### **2.3. Структура эталонного каталога роботов (Seed Data)**

Ниже представлены 6 верифицированных моделей для заполнения базового каталога:

1. **Ronavi H1500** (AMR, Склад/Производство, Россия, 1500 кг, ширина проезда 1200 мм, LiDAR SLAM, цена: 4 200 000 руб.).  
2. **DMR 1500** (Автономный вилочный погрузчик FMR, Склад, Россия, 1500 кг, ширина проезда 2400 мм, SLAM, цена: 8 900 000 руб.).  
3. **Evocargo N1** (Электротягач-платформа, Аэропорт/Открытые зоны, Россия, 2000 кг, ширина проезда 3000 мм, GNSS+LiDAR, цена: 12 500 000 руб.).  
4. **Cognitive Tugger 3000** (Беспилотный тягач багажных тележек, Аэропорт, Россия, 3000 кг, ширина проезда 2500 мм, Vision+LiDAR, цена: 7 800 000 руб.).  
5. **Ronavi SD 100** (Сервисный курьерский робот, Больницы/Лаборатории, Россия, 100 кг, ширина проезда 900 мм, SLAM, цена: 1 850 000 руб.).  
6. **PuduBot 2** (Курьер-доставщик лекарств и питания, Больница, 40 кг, ширина проезда 800 мм, VSLAM, цена: 1 200 000 руб.).

## **3\. БЛОК 2: ПАРАМЕТРЫ ОБЪЕКТА, ВАЛИДАЦИЯ И ПРЕСЕТЫ В 1 КЛИК**

### **3.1. Zod-схема валидации формы ввода**

import { z } from 'zod';

&nbsp;

export const facilitySchema \= z.object({

&nbsp;&nbsp;industry: z.enum(\['warehouse', 'airport', 'hospital', 'custom'\]),

&nbsp;&nbsp;name: z.string().min(3, 'Наименование объекта должно содержать не менее 3 символов'),

&nbsp;&nbsp;areaSqM: z.number().min(50, 'Площадь не может быть менее 50 кв.м').max(500000),

&nbsp;&nbsp;clearAisleWidthMm: z.number().min(600, 'Ширина проезда должна быть от 600 мм').max(10000),

&nbsp;&nbsp;workShiftsPerDay: z.number().int().min(1).max(3),

&nbsp;&nbsp;hoursPerShift: z.number().min(4).max(12),

&nbsp;&nbsp;operatingDaysPerYear: z.number().int().min(100).max(365),

&nbsp;&nbsp;peakOperationsPerHour: z.number().min(1, 'Требуется минимум 1 операция в час').max(10000),

&nbsp;&nbsp;avgOperationDistanceM: z.number().min(5, 'Минимальное плечо перемещения — 5 м').max(2000),

&nbsp;&nbsp;targetPayloadKg: z.number().min(0.5, 'Масса груза не менее 0.5 кг').max(10000),

&nbsp;&nbsp;manualOperatorsCount: z.number().int().min(1, 'Укажите текущее количество персонала'),

&nbsp;&nbsp;operatorSalaryRubPerMonth: z.number().min(20000, 'Зарплата не может быть ниже МРОТ').max(500000),

&nbsp;&nbsp;laborTaxRate: z.number().min(0).max(0.5).default(0.302),

});

&nbsp;

### **3.2. Готовые демонстрационные пресеты (1 клик для жюри)**

#### **Пресет 1: Склад (Логистический комплекс класса «А»)**

* industry: 'warehouse'  
* name: 'Распределительный центр "Северный"'  
* areaSqM: 12000  
* clearAisleWidthMm: 2600  
* workShiftsPerDay: 2  
* hoursPerShift: 11  
* operatingDaysPerYear: 365  
* peakOperationsPerHour: 85 (паллет/час)  
* avgOperationDistanceM: 95  
* targetPayloadKg: 800  
* manualOperatorsCount: 14 (в смену)  
* operatorSalaryRubPerMonth: 85000

#### **Пресет 2: Аэропорт (Грузовой багажный терминал)**

* industry: 'airport'  
* name: 'Багажный терминал B'  
* areaSqM: 25000  
* clearAisleWidthMm: 3500  
* workShiftsPerDay: 3  
* hoursPerShift: 8  
* operatingDaysPerYear: 365  
* peakOperationsPerHour: 120 (контейнеров/тележек в час)  
* avgOperationDistanceM: 220  
* targetPayloadKg: 1200  
* manualOperatorsCount: 22 (в смену)  
* operatorSalaryRubPerMonth: 95000

#### **Пресет 3: Медицинское учреждение (Клинический стационар)**

* industry: 'hospital'  
* name: 'Городская клиническая больница №1'  
* areaSqM: 8500  
* clearAisleWidthMm: 1400  
* workShiftsPerDay: 2  
* hoursPerShift: 12  
* operatingDaysPerYear: 365  
* peakOperationsPerHour: 35 (доставок/час)  
* avgOperationDistanceM: 60  
* targetPayloadKg: 45  
* manualOperatorsCount: 8 (санитаров-курьеров в смену)  
* operatorSalaryRubPerMonth: 55000

## **4\. БЛОК 3: ИНТЕЛЛЕКТУАЛЬНАЯ СППР (ФИЛЬТРАЦИЯ И РАНЖИРОВАНИЕ)**

### **4.1. Логика жестких фильтров (Hard Screening)**

Решение дисквалифицируется, если нарушается хотя бы одно условие физической совместимости. Система возвращает массив строковых причин для вкладки «Исключенные решения» (выполнение п. 3.4.2 ТЗ).

export interface ScreeningResult {

&nbsp;&nbsp;isCompatible: boolean;

&nbsp;&nbsp;disqualificationReasons: string\[\];

}

&nbsp;

export function evaluateHardFilters(robot: RobotSpecification, facility: FacilityParameters): ScreeningResult {

&nbsp;&nbsp;const reasons: string\[\] \= \[\];

&nbsp;

&nbsp;&nbsp;// 1\. Фильтр грузоподъемности

&nbsp;&nbsp;if (robot.payloadKg \< facility.targetPayloadKg) {

&nbsp;&nbsp;&nbsp;&nbsp;reasons.push(

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\`Недостаточная грузоподъемность: робот рассчитан на ${robot.payloadKg} кг, масса груза объекта составляет ${facility.targetPayloadKg} кг.\`

&nbsp;&nbsp;&nbsp;&nbsp;);

&nbsp;&nbsp;}

&nbsp;

&nbsp;&nbsp;// 2\. Фильтр габаритов проезда (запас безопасности не менее 200 мм по бокам)

&nbsp;&nbsp;const requiredSafetyAisleWidth \= robot.widthMm \+ 400;

&nbsp;&nbsp;if (facility.clearAisleWidthMm \< robot.minAisleWidthMm || facility.clearAisleWidthMm \< requiredSafetyAisleWidth) {

&nbsp;&nbsp;&nbsp;&nbsp;reasons.push(

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\`Ширина проезда объекта (${facility.clearAisleWidthMm} мм) недостаточна. Минимально допустимая ширина для модели ${robot.name} составляет ${Math.max(robot.minAisleWidthMm, requiredSafetyAisleWidth)} мм.\`

&nbsp;&nbsp;&nbsp;&nbsp;);

&nbsp;&nbsp;}

&nbsp;

&nbsp;&nbsp;// 3\. Фильтр отраслевой специализации

&nbsp;&nbsp;if (\!robot.industries.includes(facility.industry) && facility.industry \!== 'custom') {

&nbsp;&nbsp;&nbsp;&nbsp;reasons.push(

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\`Модель не сертифицирована для применения в категории "${facility.industry}".\`

&nbsp;&nbsp;&nbsp;&nbsp;);

&nbsp;&nbsp;}

&nbsp;

&nbsp;&nbsp;return {

&nbsp;&nbsp;&nbsp;&nbsp;isCompatible: reasons.length \=== 0,

&nbsp;&nbsp;&nbsp;&nbsp;disqualificationReasons: reasons

&nbsp;&nbsp;};

}

&nbsp;

### **4.2. Алгоритм скоринга и ранжирования (Explainable Soft Scoring)**

Для прошедших отбор роботов вычисляется агрегированный балл соответствия от 0 до 100 (Explainable AI, требование п. 3.4.5 ТЗ):

$$S \= w\_1 \\cdot S\_{\\text{payload}} \+ w\_2 \\cdot S\_{\\text{speed}} \+ w\_3 \\cdot S\_{\\text{autonomy}} \+ w\_4 \\cdot S\_{\\text{capex}}$$

Весовые коэффициенты:

* $w\_1 \= 0.25$ (Утилизация грузоподъемности: штраф за избыточный или пограничный запас).  
* $w\_2 \= 0.25$ (Эффективная скорость на маршруте).  
* $w\_3 \= 0.20$ (Автономность и скорость восполнения заряда).  
* $w\_4 \= 0.30$ (Удельный CAPEX на единицу переносимого веса).

В интерфейсе выводится радарная диаграмма или процентный прогресс-бар с расшифровкой вклада каждого фактора.

## **5\. БЛОК 4: ЭКОНОМИЧЕСКИЙ ДВИЖОК И WHAT-IF АНАЛИЗ**

Все вычисления детерминированы, выполняются по открытым формулам без скрытых коэффициентов (п. 3.5.8 ТЗ).

### **5.1. Расчет потребного парка техники**

1. **Время одного полного цикла операции (**$T\_{\\text{cycle}}$**, сек):**  
2. $$T\_{\\text{cycle}} \= 2 \\cdot \\left(\\frac{L\_{\\text{avg}}}{V\_{\\text{robot}} \\cdot K\_{\\text{traffic}}}\\right) \+ T\_{\\text{load}} \+ T\_{\\text{unload}}$$  
   * $L\_{\\text{avg}}$ — среднее плечо перемещения (м).  
   * $V\_{\\text{robot}}$ — паспортная скорость робота (м/с).  
   * $K\_{\\text{traffic}} \= 0.85$ — коэффициент замедления в проходах и на поворотах.  
   * $T\_{\\text{load}} \= 20\\text{ с}$, $T\_{\\text{unload}} \= 20\\text{ с}$ — технологическое время захвата и сброса груза.  
3. **Производительность одного робота в час (**$P\_{\\text{single}}$**, операций/час):**  
4. $$P\_{\\text{single}} \= \\frac{3600}{T\_{\\text{cycle}}}$$  
5. **Коэффициент готовности с учетом подзарядки (**$K\_{\\text{avail}}$**):**  
6. $$K\_{\\text{avail}} \= \\frac{T\_{\\text{work}}}{T\_{\\text{work}} \+ T\_{\\text{charge}}} \\cdot K\_{\\text{maint}}$$  
   * $T\_{\\text{work}}$ — время работы на одном заряде (ч).  
   * $T\_{\\text{charge}}$ — время полной зарядки (ч).  
   * $K\_{\\text{maint}} \= 0.95$ — техническая готовность парка (ТО, плановый сервис).  
7. **Итоговое требуемое число роботов (**$N\_{\\text{fleet}}$**, шт.):**  
8. $$N\_{\\text{calc}} \= \\frac{Q\_{\\text{peak}}}{P\_{\\text{single}} \\cdot K\_{\\text{avail}}}$$  
9. $$N\_{\\text{fleet}} \= \\lceil N\_{\\text{calc}} \\rceil \+ N\_{\\text{reserve}}$$  
   * $Q\_{\\text{peak}}$ — пиковый входящий/внутрискладской поток операций в час.  
   * $N\_{\\text{reserve}} \= \\lceil 0.10 \\cdot N\_{\\text{calc}} \\rceil$ — резервный фонд техники (минимум 1 машина при парке от 5 единиц).  
10. **Потребность в зарядных станциях (**$N\_{\\text{chargers}}$**, шт.):**  
11. $$N\_{\\text{chargers}} \= \\max\\left(1, \\left\\lceil N\_{\\text{fleet}} \\cdot \\frac{T\_{\\text{charge}}}{T\_{\\text{work}} \+ T\_{\\text{charge}}} \\right\\rceil\\right)$$

### **5.2. Сравнение трех моделей (As-Is vs CAPEX vs RaaS)**

#### **Сценарий 1: Базовый ручной труд (As-Is)**

* **CAPEX:**  
* $$\\text{CAPEX}\_{\\text{As-Is}} \= 0\\text{ руб.}$$  
* **Годовой OPEX персонала:**  
* $$\\text{OPEX}\_{\\text{As-Is}} \= M\_{\\text{staff}} \\cdot S\_{\\text{month}} \\cdot (1 \+ K\_{\\text{tax}}) \\cdot 12$$  
  * $M\_{\\text{staff}} \= \\text{manualOperatorsCount} \\cdot \\text{workShiftsPerDay}$ (общий штат во всех сменах).  
  * $S\_{\\text{month}}$ — среднемесячная заработная плата оператора.  
  * $K\_{\\text{tax}} \= 0.302$ — ставка отчислений во внебюджетные фонды.  
* **TCO за 5 лет:**  
* $$\\text{TCO}\_{\\text{As-Is}} \= \\sum\_{t=1}^{5} \\text{OPEX}\_{\\text{As-Is}} \\cdot (1 \+ i)^{t-1}$$  
  * $i \= 0.07$ (ежегодная индексация ФОТ на уровне 7%).

#### **Сценарий 2: Покупка оборудования в собственность (CAPEX-модель)**

* **Статьи разового CAPEX:**  
  * Закупка роботов: $C\_{\\text{robots}} \= N\_{\\text{fleet}} \\cdot \\text{purchasePriceRub}$.  
  * Инфраструктура и зарядки: $C\_{\\text{chargers}} \= N\_{\\text{chargers}} \\cdot 450\\,000\\text{ руб.}$  
  * Внедрение, пусконаладка и интеграция с WMS/ERP:  
  * $$C\_{\\text{integr}} \= 2\\,500\\,000\\text{ руб.} \+ (N\_{\\text{fleet}} \\cdot 120\\,000\\text{ руб.})$$  
  * Резерв непредвиденных затрат ($5\\%$): $C\_{\\text{contingency}} \= 0.05 \\cdot (C\_{\\text{robots}} \+ C\_{\\text{chargers}} \+ C\_{\\text{integr}})$.  
  * **Итоговый CAPEX:**  
  * $$\\text{CAPEX}\_{\\text{buy}} \= C\_{\\text{robots}} \+ C\_{\\text{chargers}} \+ C\_{\\text{integr}} \+ C\_{\\text{contingency}}$$  
* **Ежегодный OPEX эксплуатации флота:**  
  * Сервисный контракт и ЗИП: $O\_{\\text{maint}} \= N\_{\\text{fleet}} \\cdot \\text{maintenanceCostPerYearRub}$.  
  * Лицензии на Fleet Management System: $O\_{\\text{lic}} \= N\_{\\text{fleet}} \\cdot \\text{softwareLicensePerYearRub}$.  
  * Затраты на электроэнергию:  
  * $$O\_{\\text{power}} \= N\_{\\text{fleet}} \\cdot W\_{\\text{power}} \\cdot H\_{\\text{year}} \\cdot T\_{\\text{kwh}}$$  
  * ($W\_{\\text{power}}$ в кВт, $H\_{\\text{year}}$ часов работы в год, тариф $T\_{\\text{kwh}} \= 8.5\\text{ руб/кВт}\\cdot\\text{ч}$).  
  * ФОТ остаточного надзорного персонала (1 диспетчер/оператор на смену вместо ручной бригады):  
  * $$O\_{\\text{supervisors}} \= N\_{\\text{shifts}} \\cdot 1 \\cdot S\_{\\text{operator}} \\cdot (1 \+ K\_{\\text{tax}}) \\cdot 12$$  
  * **Итоговый годовой OPEX:**  
  * $$\\text{OPEX}\_{\\text{buy}} \= O\_{\\text{maint}} \+ O\_{\\text{lic}} \+ O\_{\\text{power}} \+ O\_{\\text{supervisors}}$$  
* **Амортизация:** Линейный метод, горизонт $T\_{\\text{amort}} \= 5\\text{ лет}$:  
* $$A\_{\\text{annual}} \= \\frac{\\text{CAPEX}\_{\\text{buy}}}{5}$$  
* **Чистый годовой экономический эффект:**  
* $$\\Delta\_{\\text{annual}} \= \\text{OPEX}\_{\\text{As-Is}} \- \\text{OPEX}\_{\\text{buy}}$$  
* **Простой срок окупаемости (Payback Period, лет):**  
* $$\\text{PP} \= \\frac{\\text{CAPEX}\_{\\text{buy}}}{\\Delta\_{\\text{annual}}}$$  
* **ROI на горизонте 5 лет (%):**  
* $$\\text{ROI}\_{5\\text{y}} \= \\frac{(5 \\cdot \\Delta\_{\\text{annual}}) \- \\text{CAPEX}\_{\\text{buy}}}{\\text{CAPEX}\_{\\text{buy}}} \\cdot 100\\%$$  
* **TCO за 5 лет:**  
* $$\\text{TCO}\_{\\text{buy}} \= \\text{CAPEX}\_{\\text{buy}} \+ \\sum\_{t=1}^{5} \\text{OPEX}\_{\\text{buy}, t}$$

#### **Сценарий 3: Роботы как услуга (RaaS / Подписка / Аренда)**

* **CAPEX:**  
* $$\\text{CAPEX}\_{\\text{RaaS}} \= C\_{\\text{integr\\\_setup}} \= 1\\,200\\,000\\text{ руб. (разовое подключение и настройка сети)}$$  
* **Годовой OPEX подписки:**  
* $$\\text{OPEX}\_{\\text{RaaS}} \= (N\_{\\text{fleet}} \\cdot \\text{raasMonthlyRateRub} \\cdot 12\) \+ O\_{\\text{power}} \+ O\_{\\text{supervisors}}$$  
* *(Сервис, ЗИП и лицензии включены в ставку RaaS вендора)*.  
* **Чистый годовой экономический эффект RaaS:**  
* $$\\Delta\_{\\text{annual\\\_RaaS}} \= \\text{OPEX}\_{\\text{As-Is}} \- \\text{OPEX}\_{\\text{RaaS}}$$  
* **Срок окупаемости затрат на интеграцию:**  
* $$\\text{PP}\_{\\text{RaaS}} \= \\frac{\\text{CAPEX}\_{\\text{RaaS}}}{\\Delta\_{\\text{annual\\\_RaaS}}}\\quad (\\text{обычно } \< 0.5\\text{ года})$$

### **5.3. What-If Анализ и оценка рисков (Чувствительность)**

В интерфейсе размещаются 3 реактивных слайдера с шагом пересчета 100 мс:

1. **Динамика ФОТ (**$\\pm 30\\%$**):** изменение базовой зарплаты операторов.  
2. **Изменение стоимости робототехники (**$\\pm 25\\%$**):** оценка скидки вендора или удорожания парка.  
3. **Рост грузопотока (**$\\pm 50\\%$**):** масштабирование операций склада/терминала.

#### **Алгоритм автоматического вердикта целесообразности (п. 3.5.7 ТЗ)**

Система не ограничивается сухой цифрой окупаемости, а выдает квалифицированное заключение:

* **ЗЕЛЕНЫЙ СТАТУС (**$\\text{PP} \\le 3.0\\text{ лет}$**):**  
* *Вердикт:* «Проект высокоэффективен для прямой покупки в собственность. Экономия на ФОТ полностью окупает капиталовложения в пределах нормативного горизонта.»  
* **ЖЕЛТЫЙ СТАТУС (**$3.0 \< \\text{PP} \\le 5.0\\text{ лет}$**):**  
* *Вердикт:* «Умеренная целесообразность покупки. Высокий порог входа. Рекомендуется сценарий RaaS (роботы по подписке), исключающий разовый CAPEX и обеспечивающий положительный операционный поток с 1-го месяца.»  
* **КРАСНЫЙ СТАТУС (**$\\text{PP} \> 5.0\\text{ лет}$ **или** $\\Delta\_{\\text{annual}} \\le 0$**):**  
* *Вердикт:* «Роботизация в текущих параметрах экономически нецелесообразна. Ручной труд на текущем масштабе дешевле автоматизации. Рекомендуется пересмотреть интенсивность сменности либо рассмотреть роботизацию отдельных критических узлов.»

## **6\. БЛОК 5: ДВИЖОК 2D-СИМУЛЯЦИИ (ЦИТИРОВАНИЕ П. 3.6 ТЗ)**

Симуляция подтверждает математический расчет: если калькулятор выдал $N$ роботов, именно это число роботов запускается на схеме и должно перевезти заданный объем паллет в час.

┌────────────────────────────────────────────────────────────────────────┐

│ \[Плей\] \[Пауза\] \[Сброс\]   Скорость: \[1x\] \[2x\] \[5x\]   Режим: \[ 2D \] \[3D\] │

├────────────────────────────────────────────────────────────────────────┤

│  \[Зона приемки\] ──(Маршрут)──► \[Зона хранения\] ──(Маршрут)──► \[Отгрузка\]│

│        ▲                              │                              │ │

│        │                              ▼                              │ │

│  \[Зарядная станция 1\]          \[Зарядная 2\]             \[Зарядная 3\]  │ │

│                                                                        │

│  HUD: План: 85 пал/ч | Факт: 87 пал/ч | Загрузка: 84% | Простой: 4%    │

└────────────────────────────────────────────────────────────────────────┘

&nbsp;

### **6.1. Архитектура и физическая дискретизация**

* Схема рендерится на элементе \<canvas id="simCanvas" width="1000" height="560"\>.  
* Топология объекта описывается графом узлов (Waypoints) и ребер:  
  * **Зоны загрузки (Inbound):** генераторы паллет/задач с очередью ожидания.  
  * **Зоны разгрузки (Outbound):** стоки для готовой продукции.  
  * **Трассы (Lanes):** направленные коридоры с контролем дистанции (Safe Braking Distance \= 25 пикселей).  
  * **Зарядные карманы (Charging Docks):** выделенные слоты с индикацией подачи питания.

### **6.2. Конечный автомат поведения робота (Agent FSM)**

Каждый робот в цикле симуляции имеет одно из состояний:

export type RobotState \=&nbsp;

&nbsp;&nbsp;| 'IDLE'               // Ожидание назначения задачи

&nbsp;&nbsp;| 'MOVING\_TO\_PICKUP'   // Следование к точке погрузки

&nbsp;&nbsp;| 'LOADING'            // Погрузка груза (таймер 20 с)

&nbsp;&nbsp;| 'TRANSPORTING'       // Перемещение груза к назначению

&nbsp;&nbsp;| 'UNLOADING'          // Разгрузка (таймер 20 с)

&nbsp;&nbsp;| 'NEEDS\_CHARGE'       // Заряд \< 20%, поиск свободной станции

&nbsp;&nbsp;| 'MOVING\_TO\_CHARGE'   // Маршрутизация на зарядку

&nbsp;&nbsp;| 'CHARGING';          // Накопление энергии

&nbsp;

### **6.3. Модуль аналитики симуляции в реальном времени (HUD)**

Каждые 60 кадров (1 сек реального времени) пересчитываются метрики:

1. **Фактическая выработка:**  
2. $$\\text{Throughput}\_{\\text{sim}} \= \\frac{\\text{deliveredCargosCounter}}{\\text{simulatedHoursElapsed}}$$  
3. **Коэффициент утилизации флота:**  
4. $$U\_{\\text{fleet}} \= \\frac{\\text{Time}\_{\\text{transporting}} \+ \\text{Time}\_{\\text{loading}}}{\\text{Time}\_{\\text{total}}} \\cdot 100\\%$$  
5. **Детектор заторов (Bottleneck Detection):** если скорость робота в коридоре падает ниже $0.1\\cdot V\_{\\text{max}}$ более чем на 5 виртуальных секунд, сегмент трассы подсвечивается пульсирующим оранжевым контуром, а в панели телеметрии инкрементируется счетчик «Узкие места проездов».

## **7\. БЛОК 6: ГЕНЕРАЦИЯ ОТЧЕТОВ (PDF / EXCEL) И АДМИН-ПАНЕЛЬ**

### **7.1. Структура экспортируемого PDF-отчета (ТЭО)**

Формируется средствами библиотеки jspdf по нажатию одной кнопки «Скачать инвестиционное ТЭО»:

1. **Титульный блок:** Логотипы хакатона/заказчика, название объекта, отрасль, дата формирования, статус проекта.  
2. **Резюме проекта (Executive Summary):** Рекомендованная модель робота, рекомендуемый сценарий (Покупка vs RaaS), срок окупаемости, 5-летний чистый эффект.  
3. **Сводная таблица сравнения сценариев:** Полная матрица As-Is / CAPEX / RaaS со статьями затрат.  
4. **Технические параметры и подтверждение симуляции:** Расчетное количество техники, пиковая пропускная способность, факт из симулятора.  
5. **Математические допущения и правовая сноска:**  
6. *«Предварительный расчет носит оценочный характер на основе математического моделирования и открытых данных производителей. Окончательные параметры внедрения подлежат уточнению на этапе предпроектного обследования объекта.»*

### **7.2. Структура Excel-файла (.xlsx)**

* Лист 1: Входные данные (все параметры объекта и грузов).  
* Лист 2: Каталог решений (характеристики рассмотренных моделей, включая отсеянные с причинами).  
* Лист 3: Финмодель 5 лет (помесячный/погодовой Cash Flow для 3 сценариев с формулами сумм и разностей).

### **7.3. Админ-панель (CRUD)**

Минималистичная страница /admin для демонстрации жюри п. 2.1.6 ТЗ:

* Таблица роботов каталога с возможностью отредактировать цену, скорость или добавить нового отечественного робота.  
* Переключатель глобальных макро-допущений:  
  * Ставка рефинансирования / дисконтирования ($16\\%$).  
  * Тариф на электроэнергию ($8.5\\text{ руб/кВт}\\cdot\\text{ч}$).  
  * Ставка страховых взносов ФОТ ($30.2\\%$).

## **8\. ПОШАГОВЫЙ ПЛАН СБОРКИ (ENGINEERING CHECKLIST)**

\[x\] ЭТАП 1: Инициализация и База (Часы 0 \- 3\)

&nbsp;&nbsp;&nbsp;&nbsp;\[x\] 1.1. Развернуть репозиторий Next.js 15, Tailwind, lucide-react, zustand, zod.

&nbsp;&nbsp;&nbsp;&nbsp;\[x\] 1.2. Создать файл типов \`src/types/robotics.ts\` (скопировать раздел 2 настоящего ТП).

&nbsp;&nbsp;&nbsp;&nbsp;\[x\] 1.3. Создать файл пресетов \`src/data/presets.ts\` (Склад, Аэропорт, Больница).

&nbsp;&nbsp;&nbsp;&nbsp;\[x\] 1.4. Наполнить каталог \`src/data/robots.ts\` (6 эталонных моделей).

&nbsp;

\[ \] ЭТАП 2: Модуль СППР и Форма объекта (Часы 3 \- 6\)

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 2.1. Реализовать \`FacilityForm.tsx\` с кнопками переключения 3 пресетов в 1 клик.

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 2.2. Запрограммировать функцию \`evaluateHardFilters\` и отсечение моделей.

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 2.3. Создать UI-компонент карточек роботов \+ раскрывающийся аккордеон "Исключенные решения".

&nbsp;

\[ \] ЭТАП 3: Финансовый движок (Часы 6 \- 10\)

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 3.1. Написать чистые функции расчета парка, CAPEX, OPEX, TCO, PP, ROI (\`src/lib/finance.ts\`).

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 3.2. Собрать сводную таблицу сравнения 3 сценариев: As-Is, Покупка, RaaS.

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 3.3. Привязать интерактивные слайдеры чувствительности What-If (ФОТ, Цена, Поток).

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 3.4. Добавить динамическую карточку заключения (Зеленый / Желтый / Красный статус).

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 3.5. Сделать модальное окно «Используемые формулы и допущения».

&nbsp;

\[ \] ЭТАП 4: 2D-Симуляция флота (Часы 10 \- 15\)

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 4.1. Разработать Canvas-компонент схемы объекта с разметкой зон и путей.

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 4.2. Запустить анимационный цикл с движением маркеров роботов согласно расчетному $N\_{\\text{fleet}}$.

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 4.3. Реализовать стейт-машину робота (Погрузка \-\> Транзит \-\> Разгрузка \-\> Зарядка).

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 4.4. Добавить плеер управления (Play/Pause, слайдер скорости 1x-5x).

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 4.5. Вывести панель реального времени: паллет/час, процент загрузки парка, детекция пробок.

&nbsp;

\[ \] ЭТАП 5: Экспорт, Полировка и Подготовка к Защите (Часы 15 \- 18\)

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 5.1. Подключить кнопку выгрузки PDF ТЭО через \`jspdf\`.

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 5.2. Добавить кнопку выгрузки Excel-модели через \`xlsx\`.

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 5.3. Сделать страницу \`/admin\` с базовым редактированием цен роботов.

&nbsp;&nbsp;&nbsp;&nbsp;\[ \] 5.4. Проверить адаптивность интерфейса под разрешение от 1366x768 (п. 4.5.5 ТЗ).

&nbsp;

&nbsp;
