import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FacilityRequirements } from '../types/facility.js';
import type { Robot } from '../types/robot.js';
import { generateFacilityTopology, calculateFacilityDimensions } from '../engine/topology_generator.js';
import type { FacilityTopology } from '../types/topology.js';
import {
  SimulationEngine,
  type SimulationTelemetry,
  type SimulationReplayFrame,
  type AgentFSMState,
} from '../engine/simulation_engine.js';
import type { FleetCompositionItem } from '../engine/fleet_optimizer.js';
import { analyzeTopologyBottlenecks, type SpectralAnalysisResult } from '../engine/spectral_analyzer.js';
import {
  createInitialConstructorGrid,
  rebuildTopologyFromGrid,
  checkGraphIsolation,
  getTileKey,
  calculateShoelaceArea,
  findMagneticSnapPosition,
  calculateWarehouseCapacity,
  isInsideFloor,
  emitDebugSnapshot,
  DEFAULT_SKU_LIST,
  DEFAULT_SUPPLY_SCHEDULE,
  type ConstructorGrid,
  type ConstructorTileType,
  type FloorDefinition,
  type Point2D,
  type SkuItem,
  type SupplySchedule,
} from '../engine/constructor_engine.js';
import { buildElementsMap, StorageElement } from '../engine/cad_entities.js';
import { SimulationControls } from './SimulationControls.js';
import { ConstructorToolbar, type CtorInteractionMode } from './ConstructorToolbar.js';
import { SkuInventoryModal } from './SkuInventoryModal.js';
import { SupplyScheduleModal } from './SupplyScheduleModal.js';
import { RackInspectionPopover } from './RackInspectionPopover.js';
import { audioEngine } from '../engine/audio_synth.js';
import { Layers, MapPin, Navigation, AlertTriangle, Edit3, Play, X } from 'lucide-react';

interface SimulationViewportProps {
  appMode: 'CONSTRUCTOR' | 'SIMULATION';
  onAppModeChange: (mode: 'CONSTRUCTOR' | 'SIMULATION') => void;
  facility: FacilityRequirements;
  onChangeFacility?: (updated: FacilityRequirements) => void;
  fleetConfig: Robot | FleetCompositionItem[] | null;
  fleetSize: number;
  targetThroughputPerHour: number;
  replayFrames?: SimulationReplayFrame[];
  onTriggerSimulationRun: (schedule?: SupplySchedule) => void;
  showToast: (msg: string) => void;
  onTopologyChange?: (topology: FacilityTopology) => void;
}

const DEFAULT_TELEMETRY: SimulationTelemetry = {
  elapsedSimSeconds: 0,
  completedDeliveries: 0,
  realizedThroughputPerHour: 0,
  fleetUtilizationPercent: 0,
  activeInTransitCount: 0,
  chargingCount: 0,
  queuedCount: 0,
  congestionDetected: false,
  congestionNodeLabel: null,
  isCalibrating: true,
  totalCorridorWaitSeconds: 0,
  bottleneckDetected: false,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function angleLerp(a: number, b: number, t: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

interface AgentMeshGroup {
  group: THREE.Group;
  chassisMesh: THREE.Mesh;
  haloMesh: THREE.Mesh;
  cargoMesh: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
}

export function SimulationViewport({
  appMode,
  onAppModeChange,
  facility,
  onChangeFacility,
  fleetConfig,
  fleetSize,
  targetThroughputPerHour,
  replayFrames = [],
  onTriggerSimulationRun,
  showToast,
  onTopologyChange,
}: SimulationViewportProps) {
  const outerContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isConstructorMode = appMode === 'CONSTRUCTOR';

  // CAD Interaction mode
  const [interactionMode, setInteractionMode] = useState<CtorInteractionMode>('SELECT');
  const [selectedTileType, setSelectedTileType] = useState<ConstructorTileType>('RACK');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [snappingEnabled, setSnappingEnabled] = useState<boolean>(true);

  // Selected Object & Popover State
  const [selectedTileKeys, setSelectedTileKeys] = useState<Set<string>>(new Set());
  const [selectedSkuChip, setSelectedSkuChip] = useState<string | null>('CLEAR_SKU');
  const SKU_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
  const [inspectorWindowPos, setInspectorWindowPos] = useState<{ x: number; y: number } | null>(null);
  const [targetScreenPos, setTargetScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingInspector, setIsDraggingInspector] = useState<boolean>(false);
  const dragOffsetRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const isMouseDownRef = useRef<boolean>(false);

  // SKU & Supply Schedule State
  const [skuList, setSkuList] = useState<SkuItem[]>(DEFAULT_SKU_LIST);
  // REO: Синхронизация максимального веса активных SKU с требованиями объекта
  useEffect(() => {
    if (!onChangeFacility || !skuList || skuList.length === 0) return;
    
    // Безопасно достаем вес паллеты (учитывая любое имя поля: weightKg, m_unit, massKg)
    const weights = skuList.map((s: any) => 
      Number(s.weightKg ?? s.m_unit ?? s.massKg ?? s.weight ?? 500) || 500
    );
    const maxWeight = Math.max(...weights);

    if (facility.requiredPayloadKg !== maxWeight) {
      onChangeFacility({
        ...facility,
        requiredPayloadKg: maxWeight,
      });
    }
  }, [skuList, facility.requiredPayloadKg, onChangeFacility]);
  const [selectedSkuForBox, setSelectedSkuForBox] = useState<SkuItem | null>(DEFAULT_SKU_LIST[0]);
  const [supplySchedule, setSupplySchedule] = useState<SupplySchedule>(DEFAULT_SUPPLY_SCHEDULE);

  // Modals Visibility State
  const [isSkuModalOpen, setIsSkuModalOpen] = useState<boolean>(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);

  // Floor Contour Drawing State
  const [drawingPoints, setDrawingPoints] = useState<Point2D[]>([]);
  const [isDrawingActive, setIsDrawingActive] = useState<boolean>(false);
  const [liveRectDims, setLiveRectDims] = useState<{
    widthM: number;
    lengthM: number;
    areaSqm: number;
    isErase: boolean;
  } | null>(null);

  // Box Marquee Drag State via DOM Ref (Zero React Lag)
  const marqueeRef = useRef<HTMLDivElement>(null);
  const marqueeData = useRef({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    isDragging: false,
  });

  // Playback & Simulation state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(2);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.5);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<SimulationTelemetry>(DEFAULT_TELEMETRY);

  const lastProcessedFrameIndexRef = useRef<number>(-1);

  // Facility dimensions
  const facilityDims = useMemo(() => {
    return calculateFacilityDimensions(facility);
  }, [facility]);

  // Constructor Grid State
  const [grid, setGrid] = useState<ConstructorGrid>(() => {
    const cellSize = facility.totalAreaSqm > 5000 ? 2.0 : 1.0;
    return createInitialConstructorGrid(facilityDims.widthM, facilityDims.lengthM, cellSize);
  });

  // Reset Grid when facility dimensions change
  useEffect(() => {
    setGrid((prevGrid) => {
      const cellSize = facility.totalAreaSqm > 5000 ? 2.0 : 1.0;
      const newGrid = createInitialConstructorGrid(facilityDims.widthM, facilityDims.lengthM, cellSize);

      // Preserve existing tiles and details instead of wiping them!
      if (prevGrid && prevGrid.tiles.size > 0) {
        newGrid.tiles = new Map(prevGrid.tiles);
      }
      if (prevGrid && prevGrid.elementDetails) {
        newGrid.elementDetails = new Map(prevGrid.elementDetails);
      }

      return newGrid;
    });
  }, [facilityDims, facility.totalAreaSqm]);

  // Capacity calculation
  const warehouseCapacity = useMemo(() => {
    return calculateWarehouseCapacity(grid);
  }, [grid]);

  // Count placed elements for live CAD bar & validation
  const gridElementCounts = useMemo(() => {
    let inboundDocks = 0;
    let outboundDocks = 0;
    let racks = 0;
    let chargers = 0;

    grid.tiles.forEach((type: any) => {
      if (type === 'DOCK_INBOUND') inboundDocks++;
      if (type === 'DOCK_OUTBOUND') outboundDocks++;
      if (type === 'RACK') racks++;
      if (type === 'CHARGER') chargers++;
    });

    return { inboundDocks, outboundDocks, racks, chargers };
  }, [grid]);

  // Derived active topology
  const topology: FacilityTopology = useMemo(() => {
    if (gridElementCounts.racks > 0 || gridElementCounts.inboundDocks > 0 || gridElementCounts.outboundDocks > 0) {
      return rebuildTopologyFromGrid(grid, facilityDims.widthM, facilityDims.lengthM);
    }
    if (isConstructorMode) {
      return rebuildTopologyFromGrid(grid, facilityDims.widthM, facilityDims.lengthM);
    }
    return generateFacilityTopology(facility);
  }, [isConstructorMode, grid, facilityDims, facility, gridElementCounts]);

  useEffect(() => {
    if (onTopologyChange) {
      onTopologyChange(topology);
    }
  }, [topology, onTopologyChange]);

  // Check graph isolation warning (ONLY in SIMULATION mode)
  const isIsolatedZone = useMemo(() => {
    if (isConstructorMode) return false;
    return checkGraphIsolation(topology);
  }, [isConstructorMode, topology]);

  // Spectral Analysis result (ONLY in SIMULATION mode)
  const spectralAnalysis: SpectralAnalysisResult = useMemo(() => {
    if (isConstructorMode) {
      return {
        algebraicConnectivity: 0,
        fiedlerVector: [],
        criticalNodes: [],
        criticalNodeIds: [],
        bottleneckEdges: [],
        networkStatus: 'OPTIMAL',
        status: 'OPTIMAL',
        recommendation: '',
      };
    }
    return analyzeTopologyBottlenecks(topology);
  }, [isConstructorMode, topology]);

  const totalPathLengthM = useMemo(() => {
    if (isConstructorMode) return 0;
    return Math.round(
      topology.edges.reduce((sum, edge) => sum + edge.distanceM, 0)
    );
  }, [isConstructorMode, topology]);

  // Simulation Engine Instance ref
  const engineRef = useRef<SimulationEngine | null>(null);

  // Persistent Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const floorGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const objectsGroupRef = useRef<THREE.Group | null>(null);
  const agentsGroupRef = useRef<THREE.Group | null>(null);
  const ghostGroupRef = useRef<THREE.Group | null>(null);
  const guideLineRef = useRef<THREE.LineSegments | null>(null);
  const guideGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const drawingLineRef = useRef<THREE.Line | null>(null);
  const drawingGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const agentMeshMapRef = useRef<Map<string, AgentMeshGroup>>(new Map());

  // Ref to hold current state for interaction listeners
  const stateRef = useRef({
    isConstructorMode,
    interactionMode,
    selectedTileType,
    showGrid,
    snappingEnabled,
    selectedTileKeys,
    selectedSkuChip,
    skuList,
    drawingPoints,
    isDrawingActive,
    grid,
    facility,
    facilityDims,
    isPlaying,
    speedMultiplier,
    replayFrames,
    targetThroughputPerHour,
  });

  useEffect(() => {
    stateRef.current = {
      isConstructorMode,
      interactionMode,
      selectedTileType,
      showGrid,
      snappingEnabled,
      selectedTileKeys,
      selectedSkuChip,
      skuList,
      drawingPoints,
      isDrawingActive,
      grid,
      facility,
      facilityDims,
      isPlaying,
      speedMultiplier,
      replayFrames,
      targetThroughputPerHour,
    };
  }, [
    isConstructorMode,
    interactionMode,
    selectedTileType,
    showGrid,
    snappingEnabled,
    selectedTileKeys,
    selectedSkuChip,
    skuList,
    drawingPoints,
    isDrawingActive,
    grid,
    facility,
    facilityDims,
    isPlaying,
    speedMultiplier,
    replayFrames,
    targetThroughputPerHour,
  ]);

  // Initialize/Re-initialize Engine on topology or fleetConfig change
  useEffect(() => {
    if (fleetConfig && fleetSize > 0) {
      engineRef.current = new SimulationEngine(topology, fleetConfig);
    } else {
      engineRef.current = null;
    }
    setCurrentTimeSec(0);
    lastProcessedFrameIndexRef.current = -1;
    setTelemetry(DEFAULT_TELEMETRY);
  }, [topology, fleetConfig, fleetSize]);

  // Reset timeline when replayFrames change
  useEffect(() => {
    setCurrentTimeSec(0);
    lastProcessedFrameIndexRef.current = -1;
  }, [replayFrames]);

  // Finish Construction & Start Simulation Handler
  const handleFinishConstructionAndSimulate = useCallback(() => {
    if (
      gridElementCounts.inboundDocks < 1 ||
      gridElementCounts.outboundDocks < 1 ||
      gridElementCounts.racks < 1
    ) {
      showToast('⚠️ Разместите хотя бы одни ворота приемки, отгрузки и стеллаж');
      return;
    }

    const testTopology = rebuildTopologyFromGrid(grid, facilityDims.widthM, facilityDims.lengthM);
    if (checkGraphIsolation(testTopology)) {
      showToast('⚠️ Внимание: изолированная зона. Роботы не могут построить маршрут к доку или зарядной станции.');
      return;
    }

    onTriggerSimulationRun(supplySchedule);
    onAppModeChange('SIMULATION');
    setIsPlaying(true);
  }, [gridElementCounts, grid, facilityDims, supplySchedule, onTriggerSimulationRun, onAppModeChange, showToast]);

  // Return to CAD Editor Handler
  const handleReturnToEditor = useCallback(() => {
    setIsPlaying(false);
    setCurrentTimeSec(0);
    onAppModeChange('CONSTRUCTOR');
  }, [onAppModeChange]);

  const handleResetGrid = useCallback(() => {
    const cellSize = facility.totalAreaSqm > 5000 ? 2.0 : 1.0;
    const newGrid = createInitialConstructorGrid(facilityDims.widthM, facilityDims.lengthM, cellSize);
    setGrid(newGrid);
    setSelectedTileKeys(new Set());
    emitDebugSnapshot('RESET_GRID', newGrid);
  }, [facilityDims, facility.totalAreaSqm]);

  const handleRotateSelected = useCallback(() => {
    if (selectedTileKeys.size === 0) return;
    setGrid((prev) => {
      const detailsMap = new Map(prev.elementDetails || []);
      for (const key of selectedTileKeys) {
        const existing = detailsMap.get(key) || {};
        const currentRot = existing.rotationDeg ?? 0;
        const nextRot = (currentRot + 90) % 360;
        detailsMap.set(key, { ...existing, rotationDeg: nextRot });
      }
      const updatedGrid = { ...prev, elementDetails: detailsMap };
      emitDebugSnapshot('ROTATE_ELEMENT', updatedGrid);
      return updatedGrid;
    });
  }, [selectedTileKeys]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedTileKeys.size === 0) return;
    setGrid((prev) => {
      const updatedTiles = new Map(prev.tiles);
      const detailsMap = new Map(prev.elementDetails || []);
      for (const key of selectedTileKeys) {
        updatedTiles.set(key, 'EMPTY_FLOOR');
        detailsMap.delete(key);
      }
      const updatedGrid = { ...prev, tiles: updatedTiles, elementDetails: detailsMap };
      emitDebugSnapshot('DELETE_ELEMENT', updatedGrid);
      return updatedGrid;
    });
    setSelectedTileKeys(new Set());
  }, [selectedTileKeys]);

  // Window centering on selection change (only for single element inspection)
  useEffect(() => {
    if (selectedTileKeys.size !== 1) {
      setInspectorWindowPos(null);
      setTargetScreenPos(null);
      return;
    }

    setInspectorWindowPos((prev) => {
      if (prev !== null) return prev;
      const winW = 288;
      const winH = 280;

      const centerX = Math.max(0, (window.innerWidth - winW) / 2);
      const centerY = Math.max(0, (window.innerHeight - winH) / 2);

      return { x: centerX, y: centerY };
    });
  }, [selectedTileKeys]);

  // Window dragging & strict screen boundary clamping
  const handleStartWindowDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!inspectorWindowPos) return;
      dragOffsetRef.current = {
        offsetX: e.clientX - inspectorWindowPos.x,
        offsetY: e.clientY - inspectorWindowPos.y,
      };
      setIsDraggingInspector(true);
    },
    [inspectorWindowPos]
  );

  // Global pointer listeners during window dragging to ensure dragging stops reliably on button release anywhere
  useEffect(() => {
    if (!isDraggingInspector) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (!dragOffsetRef.current) return;
      const isSingle = stateRef.current.selectedTileKeys.size === 1;
      const winW = isSingle ? 288 : 580;
      const winH = isSingle ? 280 : 56;

      const rawX = e.clientX - dragOffsetRef.current.offsetX;
      const rawY = e.clientY - dragOffsetRef.current.offsetY;

      const clampedX = Math.max(0, Math.min(rawX, window.innerWidth - winW));
      const clampedY = Math.max(0, Math.min(rawY, window.innerHeight - winH));

      setInspectorWindowPos({ x: clampedX, y: clampedY });
    };

    const handleGlobalPointerUp = () => {
      setIsDraggingInspector(false);
      dragOffsetRef.current = null;
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('blur', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('blur', handleGlobalPointerUp);
    };
  }, [isDraggingInspector]);

  // Resize clamping effect
  useEffect(() => {
    const handleResizeClamp = () => {
      if (!inspectorWindowPos || selectedTileKeys.size === 0) return;
      const isSingle = selectedTileKeys.size === 1;
      const winW = isSingle ? 288 : 580;
      const winH = isSingle ? 280 : 56;

      const clampedX = Math.max(0, Math.min(inspectorWindowPos.x, window.innerWidth - winW));
      const clampedY = Math.max(0, Math.min(inspectorWindowPos.y, window.innerHeight - winH));

      if (clampedX !== inspectorWindowPos.x || clampedY !== inspectorWindowPos.y) {
        setInspectorWindowPos({ x: clampedX, y: clampedY });
      }
    };

    window.addEventListener('resize', handleResizeClamp);
    return () => window.removeEventListener('resize', handleResizeClamp);
  }, [inspectorWindowPos, selectedTileKeys.size]);

  // Hotkey keyboard event listener [G], [S], [R], [Del]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }

      const st = stateRef.current;

      if (e.key === 'Escape') {
        setSelectedSkuChip(null);
        setSelectedTileKeys(new Set());
        if (st.interactionMode !== 'SELECT') {
          setInteractionMode('SELECT');
          setIsDrawingActive(false);
          setDrawingPoints([]);
          if (ghostGroupRef.current) {
            ghostGroupRef.current.visible = false;
          }
        }
      } else if (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') {
        setShowGrid((prev) => !prev);
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
        setSnappingEnabled((prev) => !prev);
      } else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        handleRotateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRotateSelected, handleDeleteSelected]);

  const handleVolumeChange = useCallback((newVol: number) => {
    setVolume(newVol);
    audioEngine.setVolume(newVol);
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
      audioEngine.toggleMute(false);
    }
  }, [isMuted]);

  const handleToggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioEngine.toggleMute(nextMuted);
  }, [isMuted]);

  const handleToggleFullscreen = useCallback(() => {
    if (!outerContainerRef.current) return;
    if (!document.fullscreenElement) {
      outerContainerRef.current.requestFullscreen().catch((err) => {
        console.error('Fullscreen request failed:', err);
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // ONE-TIME INITIALIZATION OF THREE.JS SCENE, CAMERA & ORBITCONTROLS (Fix #1)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';

    const width = container.clientWidth;
    const height = container.clientHeight || 500;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#EAEAE6'); // Clean alabaster CAD grid background (No dark grey slab)
    sceneRef.current = scene;

    // 2. Camera setup
    const aspect = width / height;
    const viewSize = Math.max(facilityDims.widthM, facilityDims.lengthM) * 1.15;
    const camera = new THREE.OrthographicCamera(
      (-viewSize * aspect) / 2,
      (viewSize * aspect) / 2,
      viewSize / 2,
      -viewSize / 2,
      -10000,
      10000
    );
    cameraRef.current = camera;

    const centerX = facilityDims.widthM / 2;
    const centerZ = facilityDims.lengthM / 2;

    const cameraDistance = Math.max(facilityDims.widthM, facilityDims.lengthM) * 1.5;
    const pitchAngleRad = THREE.MathUtils.degToRad(30);

    // Initial positioning strictly once
    camera.position.set(
      centerX,
      cameraDistance * Math.cos(pitchAngleRad),
      centerZ + cameraDistance * Math.sin(pitchAngleRad)
    );
    camera.lookAt(centerX, 0, centerZ);

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(centerX, 0, centerZ);
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.minPolarAngle = Math.PI / 16;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.update();
    controlsRef.current = controls;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(centerX - 20, 40, centerZ - 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // 6. CAD Floor Plane (Removed as requested)

    // 7. Groups for Objects, Agents, Ghost, and Guides
    const floorGroup = new THREE.Group();
    scene.add(floorGroup);
    floorGroupRef.current = floorGroup;

    const objectsGroup = new THREE.Group();
    scene.add(objectsGroup);
    objectsGroupRef.current = objectsGroup;

    const agentsGroup = new THREE.Group();
    scene.add(agentsGroup);
    agentsGroupRef.current = agentsGroup;

    // Ghost Preview Mesh for Element Placement Hover
    const ghostGroup = new THREE.Group();
    const ghostGeo = new THREE.BoxGeometry(1.0 * 0.85, 2.0, 1.0 * 0.85);
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      transparent: true,
      opacity: 0.5,
      wireframe: true,
    });
    const ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
    ghostGroup.add(ghostMesh);
    ghostGroup.visible = false;
    scene.add(ghostGroup);
    ghostGroupRef.current = ghostGroup;

    // Visual Magnetic Snapping Guide Lines
    const guideLineMat = new THREE.LineDashedMaterial({
      color: 0xd4af37,
      dashSize: 0.5,
      gapSize: 0.2,
      linewidth: 2,
    });
    const guideGeo = new THREE.BufferGeometry();
    guideGeoRef.current = guideGeo;
    const guideLine = new THREE.LineSegments(guideGeo, guideLineMat);
    guideLine.visible = false;
    scene.add(guideLine);
    guideLineRef.current = guideLine;

    // Drawing Contours Preview Line
    const drawingGeo = new THREE.BufferGeometry();
    drawingGeoRef.current = drawingGeo;
    const drawingLine = new THREE.Line(drawingGeo, new THREE.LineBasicMaterial({ color: 0x8a6826, linewidth: 2 }));
    scene.add(drawingLine);
    drawingLineRef.current = drawingLine;

    // Pointer Move Handler for Hover Preview and Snapping Guides
    const handlePointerMove = (event: MouseEvent) => {
      const st = stateRef.current;
      if (!st.isConstructorMode) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // CRITICAL: Intersect against the infinite Y=0 plane instead of the finite floorMesh
      const yZeroPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersectPoint = new THREE.Vector3();
      const point = raycaster.ray.intersectPlane(yZeroPlane, intersectPoint);

      if (point) {
        if (st.snappingEnabled) {
          const existingPositions: Point2D[] = [];
          stateRef.current.grid.tiles.forEach((type: any, key: any) => {
            if (type !== 'EMPTY_FLOOR') {
              const [gx, gy] = key.split('_').map((s: any) => parseInt(s, 10));
              existingPositions.push({
                x: (gx + 0.5) * stateRef.current.grid.cellSizeM,
                z: (gy + 0.5) * stateRef.current.grid.cellSizeM,
              });
            }
          });

          const snapRes = findMagneticSnapPosition({ x: point.x, z: point.z }, existingPositions, 0.35);
          point.x = snapRes.snapped.x;
          point.z = snapRes.snapped.z;

          if (snapRes.guideX !== null || snapRes.guideZ !== null) {
            const guidePoints: THREE.Vector3[] = [];
            if (snapRes.guideX !== null) {
              guidePoints.push(new THREE.Vector3(snapRes.guideX, 0.05, -100));
              guidePoints.push(new THREE.Vector3(snapRes.guideX, 0.05, 100));
            }
            if (snapRes.guideZ !== null) {
              guidePoints.push(new THREE.Vector3(-100, 0.05, snapRes.guideZ));
              guidePoints.push(new THREE.Vector3(100, 0.05, snapRes.guideZ));
            }
            guideGeo.setFromPoints(guidePoints);
            guideLine.computeLineDistances();
            guideLine.visible = true;
          } else {
            guideLine.visible = false;
          }
        } else {
          guideLine.visible = false;
        }

        if (st.interactionMode === 'PLACE_ELEMENT') {
          // Snap ghost to grid cell center using integer grid coordinates
          const gx = Math.floor(point.x / stateRef.current.grid.cellSizeM);
          const gy = Math.floor(point.z / stateRef.current.grid.cellSizeM);
          const snappedX = (gx + 0.5) * stateRef.current.grid.cellSizeM;
          const snappedZ = (gy + 0.5) * stateRef.current.grid.cellSizeM;

          ghostGroup.position.set(snappedX, 1.0, snappedZ);
          ghostGroup.visible = true;

          // 1. Рисование стен с зажатой ЛКМ ТОЛЬКО по существующему полу
          if ((event.buttons === 1 || isMouseDownRef.current) && st.selectedTileType === 'OBSTACLE') {
            const key = getTileKey(gx, gy);
            // Стену можно ставить ТОЛЬКО если под ней УЖЕ есть пол и это не ворота/зарядка
            if (st.grid.tiles.has(key) && st.grid.tiles.get(key) === 'EMPTY_FLOOR') {
              setGrid((prev) => {
                const updatedTiles = new Map(prev.tiles);
                updatedTiles.set(key, 'OBSTACLE');
                return { ...prev, tiles: updatedTiles };
              });
            }
          }
        } else if (st.interactionMode === 'ERASE') {
          ghostGroup.visible = false;
          if (event.buttons === 1 || isMouseDownRef.current) {
            const gx = Math.floor(point.x / stateRef.current.grid.cellSizeM);
            const gy = Math.floor(point.z / stateRef.current.grid.cellSizeM);
            const key = getTileKey(gx, gy);
            
            // ЛАСТИК: стирает объект в EMPTY_FLOOR только если плитка реально существует в сетке!
            setGrid((prev) => {
              if (prev.tiles.has(key) && prev.tiles.get(key) !== 'EMPTY_FLOOR') {
                const updatedTiles = new Map(prev.tiles);
                updatedTiles.set(key, 'EMPTY_FLOOR');
                const updatedDetails = new Map(prev.elementDetails || []);
                updatedDetails.delete(key);
                return { ...prev, tiles: updatedTiles, elementDetails: updatedDetails };
              }
              return prev;
            });
          }
        }
        } else {
          ghostGroup.visible = false;
        }
      } else {
        ghostGroup.visible = false;
      }

      // Render Active Drawing Lines
      if (st.isDrawingActive && st.drawingPoints.length > 0 && drawingGeoRef.current && drawingLineRef.current) {
        const pts: THREE.Vector3[] = [];
        for (const p of st.drawingPoints) {
          pts.push(new THREE.Vector3(p.x, 0.1, p.z));
        }

        if (st.interactionMode === 'DRAW_RECT' || st.interactionMode === 'ERASE_FLOOR_RECT') {
          // Draw dynamic rectangle
          const startPt = st.drawingPoints[0];
          if (point) {
            pts.push(new THREE.Vector3(point.x, 0.1, startPt.z));
            pts.push(new THREE.Vector3(point.x, 0.1, point.z));
            pts.push(new THREE.Vector3(startPt.x, 0.1, point.z));

            const wM = Math.abs(point.x - startPt.x);
            const lM = Math.abs(point.z - startPt.z);
            const aSqm = Math.round(wM * lM * 10) / 10;
            setLiveRectDims({
              widthM: wM,
              lengthM: lM,
              areaSqm: aSqm,
              isErase: st.interactionMode === 'ERASE_FLOOR_RECT',
            });
          }
          pts.push(new THREE.Vector3(startPt.x, 0.1, startPt.z)); // close loop
        }

        drawingGeoRef.current.setFromPoints(pts);
        if (drawingLineRef.current) {
          drawingLineRef.current.visible = true;
          if (st.interactionMode === 'ERASE_FLOOR_RECT') {
            (drawingLineRef.current.material as THREE.LineBasicMaterial).color.setHex(0xef4444);
          } else {
            (drawingLineRef.current.material as THREE.LineBasicMaterial).color.setHex(0xd4af37);
          }
        }
      } else if (drawingLineRef.current) {
        drawingLineRef.current.visible = false;
      }
    };

    const handleCanvasPointerDown = (event: MouseEvent) => {
      const st = stateRef.current;
      if (!st.isConstructorMode) return;
      if (event.target !== domElem) return;

      if (event.button === 0) {
        isMouseDownRef.current = true;
      }

      mouseDownPosRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleCanvasPointerUp = (event: MouseEvent) => {
      const st = stateRef.current;
      if (!st.isConstructorMode) return;
      if (event.target !== domElem) return;

      if (event.button === 0) {
        isMouseDownRef.current = false;
      }

      const downPos = mouseDownPosRef.current;
      mouseDownPosRef.current = null;

      if (downPos) {
        const dx = event.clientX - downPos.x;
        const dy = event.clientY - downPos.y;
        // Increased jitter tolerance threshold to 8px so natural slight mouse movement during click doesn't cancel placement
        if (Math.sqrt(dx * dx + dy * dy) >= 8) {
          return;
        }
      }

      // Ignore right clicks for placement/drawing logic
      if (event.button === 2) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // CRITICAL: Intersect against the infinite Y=0 plane
      const yZeroPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersectPoint = new THREE.Vector3();
      const point = raycaster.ray.intersectPlane(yZeroPlane, intersectPoint);

      if (point) {
        if (st.snappingEnabled) {
          const existingPositions: Point2D[] = [];
          stateRef.current.grid.tiles.forEach((type: any, key: any) => {
            if (type !== 'EMPTY_FLOOR') {
              const [gx, gy] = key.split('_').map((s: any) => parseInt(s, 10));
              existingPositions.push({
                x: (gx + 0.5) * stateRef.current.grid.cellSizeM,
                z: (gy + 0.5) * stateRef.current.grid.cellSizeM,
              });
            }
          });
          const snapRes = findMagneticSnapPosition({ x: point.x, z: point.z }, existingPositions, 0.35);
          point.x = snapRes.snapped.x;
          point.z = snapRes.snapped.z;
        }

        const gx = Math.floor(point.x / stateRef.current.grid.cellSizeM);
        const gy = Math.floor(point.z / stateRef.current.grid.cellSizeM);

        if (event.button === 0 && (st.interactionMode === 'DRAW_RECT' || st.interactionMode === 'ERASE_FLOOR_RECT')) {
          if (!st.isDrawingActive) {
            setDrawingPoints([{ x: point.x, z: point.z }]);
            setIsDrawingActive(true);
          } else {
            const startPt = st.drawingPoints[0];
            const endPt = { x: point.x, z: point.z };

            const minX = Math.min(startPt.x, endPt.x);
            const maxX = Math.max(startPt.x, endPt.x);
            const minZ = Math.min(startPt.z, endPt.z);
            const maxZ = Math.max(startPt.z, endPt.z);

            const cellSize = stateRef.current.grid.cellSizeM;
            const startCol = Math.floor(minX / cellSize);
            const endCol = Math.floor(maxX / cellSize);
            const startRow = Math.floor(minZ / cellSize);
            const endRow = Math.floor(maxZ / cellSize);

            if (!isErase && st.grid.tiles.size > 0) {
              let touchesExistingFloor = false;
              for (let cx = startCol; cx <= endCol; cx++) {
                for (let cy = startRow; cy <= endRow; cy++) {
                  const neighbors = [
                    getTileKey(cx - 1, cy),
                    getTileKey(cx + 1, cy),
                    getTileKey(cx, cy - 1),
                    getTileKey(cx, cy + 1),
                  ];
                  if (neighbors.some((nKey) => st.grid.tiles.has(nKey))) {
                    touchesExistingFloor = true;
                    break;
                  }
                }
                if (touchesExistingFloor) break;
              }

              if (!touchesExistingFloor) {
                showToast('⚠️ Пол должен быть единым контуром и соединяться с существующим зданием');
                setDrawingPoints([]);
                setIsDrawingActive(false);
                setLiveRectDims(null);
                return;
              }
            }

            setGrid((prev) => {
              const newTiles = new Map(prev.tiles);
              const newDetails = new Map(prev.elementDetails || []);
              let newCols = prev.cols;
              let newRows = prev.rows;

              if (!isErase) {
                newCols = Math.max(prev.cols, endCol + 1);
                newRows = Math.max(prev.rows, endRow + 1);
              }

              for (let cx = startCol; cx <= endCol; cx++) {
                for (let cy = startRow; cy <= endRow; cy++) {
                  const key = getTileKey(cx, cy);
                  if (isErase) {
                    newTiles.delete(key);
                    newDetails.delete(key);
                  } else {
                    if (!newTiles.has(key)) {
                      newTiles.set(key, 'EMPTY_FLOOR');
                    }
                  }
                }
              }

              const activeCount = newTiles.size;
              const calculatedArea = Math.round(activeCount * cellSize * cellSize);
              if (calculatedArea >= 0 && onChangeFacility) {
                onChangeFacility({ ...st.facility, totalAreaSqm: calculatedArea });
              }

              let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
              newTiles.forEach((_, k) => {
                const [xS, zS] = k.split('_');
                const xVal = parseInt(xS, 10);
                const zVal = parseInt(zS, 10);
                if (!isNaN(xVal) && !isNaN(zVal)) {
                  if (xVal < minX) minX = xVal;
                  if (xVal > maxX) maxX = xVal;
                  if (zVal < minZ) minZ = zVal;
                  if (zVal > maxZ) maxZ = zVal;
                }
              });

              const newFloor: FloorDefinition = {
                type: 'RECTANGLE',
                bounds: minX !== Infinity ? { minX, maxX, minZ, maxZ } : { minX: 0, maxX: newCols, minZ: 0, maxZ: newRows },
                areaSqm: calculatedArea,
              };

              const updatedGrid = {
                ...prev,
                cols: newCols,
                rows: newRows,
                tiles: newTiles,
                elementDetails: newDetails,
                floor: newFloor,
              };
              emitDebugSnapshot(isErase ? 'ERASE_FLOOR_RECT' : 'DRAW_FLOOR_RECT', updatedGrid, { x: gx, y: gy });
              return updatedGrid;
            });

            setDrawingPoints([]);
            setIsDrawingActive(false);
            setLiveRectDims(null);
          }
          return;
        }

        if (event.button === 0 && st.interactionMode === 'ERASE') {
          const key = getTileKey(gx, gy);
          setGrid((prev) => {
             if (!prev.tiles.has(key) || prev.tiles.get(key) === 'EMPTY_FLOOR') {
               return prev;
             }
             const updatedTiles = new Map(prev.tiles);
             updatedTiles.set(key, 'EMPTY_FLOOR');
             const updatedDetails = new Map(prev.elementDetails || []);
             updatedDetails.delete(key);
             const updatedGrid = { ...prev, tiles: updatedTiles, elementDetails: updatedDetails };
             emitDebugSnapshot('ERASE_TILE', updatedGrid, { x: gx, y: gy });
             return updatedGrid;
          });
          setSelectedTileKeys(new Set());
          return;
        }

        if (event.button === 0 && st.interactionMode === 'PLACE_ELEMENT') {
          const isValidFloor = isInsideFloor(gx, gy, st.grid.floor);
          if (!isValidFloor) {
            showToast('⚠️ Нельзя размещать объекты за пределами границы пола');
            return;
          }

          const key = getTileKey(gx, gy);

          if (st.selectedTileType === 'DOCK_INBOUND' || st.selectedTileType === 'DOCK_OUTBOUND') {
            let inboundCount = 0;
            let outboundCount = 0;
            stateRef.current.grid.tiles.forEach((type: any) => {
              if (type === 'DOCK_INBOUND') inboundCount++;
              if (type === 'DOCK_OUTBOUND') outboundCount++;
            });

            if (st.selectedTileType === 'DOCK_INBOUND' && inboundCount >= 1 && stateRef.current.grid.tiles.get(key) !== 'DOCK_INBOUND') {
              showToast('⚠️ На складе уже размещены ворота приемки (максимум 1)');
              return;
            }
            if (st.selectedTileType === 'DOCK_OUTBOUND' && outboundCount >= 1 && stateRef.current.grid.tiles.get(key) !== 'DOCK_OUTBOUND') {
              showToast('⚠️ На складе уже размещены ворота отгрузки (максимум 1)');
              return;
            }
          }

          setGrid((prev) => {
            const updatedTiles = new Map(prev.tiles);
            updatedTiles.set(key, st.selectedTileType);
            const updatedDetails = new Map(prev.elementDetails || []);
            if (st.selectedTileType !== 'RACK') {
              updatedDetails.delete(key);
            }
            const newCols = Math.max(prev.cols, gx + 1);
            const newRows = Math.max(prev.rows, gy + 1);
            const updatedGrid = { ...prev, cols: newCols, rows: newRows, tiles: updatedTiles, elementDetails: updatedDetails };
            emitDebugSnapshot(`PLACE_${st.selectedTileType}`, updatedGrid, { x: gx, y: gy });
            return updatedGrid;
          });

          setSelectedTileKeys(new Set());
          return;
        }

        if (st.interactionMode === 'SELECT') {
          const key = getTileKey(gx, gy);
          const tileType = stateRef.current.grid.tiles.get(key);

          if (tileType === 'RACK') {
            if (st.selectedSkuChip) {
              setGrid((prev) => {
                const detailsMap = new Map(prev.elementDetails || []);
                const existing = detailsMap.get(key) || {};
                detailsMap.set(key, { ...existing, skuId: st.selectedSkuChip || undefined });
                const updatedGrid = { ...prev, elementDetails: detailsMap };
                emitDebugSnapshot('ASSIGN_SKU', updatedGrid, { x: gx, y: gy });
                return updatedGrid;
              });
            }
            setSelectedTileKeys(new Set([key]));
          } else {
            // Non-rack elements (walls, chargers, docks, empty floor) cannot be selected
            setSelectedTileKeys(new Set());
          }
        }
      } else {
        setSelectedTileKeys(new Set());
      }
    };

    const domElem = renderer.domElement;
    const handlePointerLeave = () => {
      isMouseDownRef.current = false;
    };
    domElem.addEventListener('mousemove', handlePointerMove);
    domElem.addEventListener('pointerdown', handleCanvasPointerDown);
    domElem.addEventListener('pointerup', handleCanvasPointerUp);
    domElem.addEventListener('pointerleave', handlePointerLeave);

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    domElem.addEventListener('contextmenu', handleContextMenu);

    // Animation Render Loop
    const clock = new THREE.Clock();
    let animationFrameId: number;
    let telemetryTimer = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const deltaReal = clock.getDelta();
      const st = stateRef.current;

      if (st.isPlaying) {
        setCurrentTimeSec((prevTime) => {
          let nextTime = prevTime + deltaReal * st.speedMultiplier;
          if (nextTime >= 3600) {
            nextTime = 0;
          }

          if (st.replayFrames && st.replayFrames.length > 0) {
            const frameIndex = Math.min(
              st.replayFrames.length - 2,
              Math.max(0, Math.floor(nextTime * 2))
            );

            const frame0 = st.replayFrames[frameIndex];
            const frame1 = st.replayFrames[frameIndex + 1] || frame0;

            const alpha = Math.max(0, Math.min(1, (nextTime - frame0.timestampSec) / 0.5));

            if (frameIndex !== lastProcessedFrameIndexRef.current) {
              lastProcessedFrameIndexRef.current = frameIndex;

              if (frame0.events && frame0.events.length > 0) {
                frame0.events.forEach((evt: any) => {
                  switch (evt) {
                    case 'CHARGE_START':
                      audioEngine.playChargeStart();
                      break;
                    case 'CHARGE_END':
                      audioEngine.playChargeEnd();
                      break;
                    case 'PICKUP':
                      audioEngine.playBoxPick();
                      break;
                    case 'DROPOFF':
                      audioEngine.playBoxDrop();
                      break;
                    case 'BRAKE':
                      audioEngine.playBrake();
                      break;
                  }
                });
              }
            }

            const numAgents = Math.min(frame0.agents.length, frame1.agents.length);
            for (let i = 0; i < numAgents; i++) {
              const a0 = frame0.agents[i];
              const a1 = frame1.agents[i];

              let meshGroup = agentMeshMapRef.current.get(a0.id);
              if (!meshGroup) {
                // Create Robot Mesh
                const group = new THREE.Group();

                const chassisGeo = new THREE.BoxGeometry(1.2, 0.4, 1.2);
                const chassisMat = new THREE.MeshStandardMaterial({
                  color: 0x2563eb,
                  roughness: 0.3,
                  metalness: 0.6,
                });
                const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
                chassisMesh.position.y = 0.2;
                chassisMesh.castShadow = true;
                chassisMesh.receiveShadow = true;
                group.add(chassisMesh);

                const haloGeo = new THREE.RingGeometry(0.8, 1.1, 24);
                const haloMat = new THREE.MeshBasicMaterial({
                  color: 0x10b981,
                  side: THREE.DoubleSide,
                  transparent: true,
                  opacity: 0.8,
                });
                const haloMesh = new THREE.Mesh(haloGeo, haloMat);
                haloMesh.rotation.x = -Math.PI / 2;
                haloMesh.position.y = 0.03;
                group.add(haloMesh);

                const cargoGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
                const cargoMat = new THREE.MeshStandardMaterial({
                  color: 0x0284c7,
                  roughness: 0.5,
                });
                const cargoMesh = new THREE.Mesh(cargoGeo, cargoMat);
                cargoMesh.position.set(0, 0.7, 0);
                cargoMesh.visible = false;
                group.add(cargoMesh);

                agentsGroup.add(group);
                meshGroup = { group, chassisMesh, haloMesh, cargoMesh, haloMat };
                agentMeshMapRef.current.set(a0.id, meshGroup);
              }

              const interpX = lerp(a0.x, a1.x, alpha);
              const interpY = lerp(a0.y, a1.y, alpha);
              const interpHeading = angleLerp(a0.headingRad, a1.headingRad, alpha);

              if (Number.isFinite(interpX) && Number.isFinite(interpY)) {
                meshGroup.group.position.set(interpX, 0, interpY);
              }
              if (Number.isFinite(interpHeading)) {
                meshGroup.group.rotation.y = -interpHeading + Math.PI / 2;
              }

              let colorHex = 0x64748b;
              if (a0.isDeadlocked) colorHex = 0xef4444;
              else if (a0.isQueued || (a0.state !== 'IDLE' && a0.state !== 'CHARGING' && typeof a0.speedMps === 'number' && a0.speedMps < 0.05)) colorHex = 0xf59e0b;
              else switch (a0.state) {
                case 'TRANSPORTING':
                case 'MOVING_TO_PICKUP':
                  colorHex = 0x10b981;
                  break;
                case 'LOADING':
                case 'UNLOADING':
                  colorHex = 0xf59e0b;
                  break;
                case 'MOVING_TO_CHARGE':
                case 'CHARGING':
                  colorHex = 0x06b6d4;
                  break;
                default:
                  colorHex = 0x64748b;
              }

              meshGroup.haloMat.color.setHex(colorHex);
              meshGroup.cargoMesh.visible = a0.cargoPayload;
            }
          }

          return nextTime;
        });

        telemetryTimer += deltaReal;
        if (telemetryTimer >= 0.3) {
          telemetryTimer = 0;
          if (engineRef.current) {
            setTelemetry(engineRef.current.getTelemetry(st.targetThroughputPerHour));
          }
        }
      }

      if (!st.isDrawingActive && drawingLineRef.current) {
        drawingLineRef.current.visible = false;
      }

      // Compute 2D Projected Screen Position for Inspector Connector Beam Line (single selection only)
      const currentSelected = stateRef.current.selectedTileKeys;
      if (currentSelected.size === 1 && cameraRef.current && containerRef.current) {
        const key = Array.from(currentSelected)[0];
        const currentGrid = stateRef.current.grid;
        const [gxStr, gyStr] = key.split('_');
        const gx = parseInt(gxStr, 10);
        const gy = parseInt(gyStr, 10);
        if (!isNaN(gx) && !isNaN(gy)) {
          const avgX = (gx + 0.5) * currentGrid.cellSizeM;
          const avgZ = (gy + 0.5) * currentGrid.cellSizeM;
          const targetVec = new THREE.Vector3(avgX, 1.0, avgZ);
          targetVec.project(cameraRef.current);

          const rect = containerRef.current.getBoundingClientRect();
          const screenX = ((targetVec.x + 1) / 2) * rect.width + rect.left;
          const screenY = ((-targetVec.y + 1) / 2) * rect.height + rect.top;

          setTargetScreenPos((prev) => {
            if (!prev || Math.abs(prev.x - screenX) > 0.5 || Math.abs(prev.y - screenY) > 0.5) {
              return { x: screenX, y: screenY };
            }
            return prev;
          });
        }
      } else {
        setTargetScreenPos(null);
      }

      controls.update();
      try {
        renderer.render(scene, camera);
      } catch (err) {
        console.error('Three.js render loop exception:', err);
      }
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight || 500;
      const newAspect = w / h;

      camera.left = (-viewSize * newAspect) / 2;
      camera.right = (viewSize * newAspect) / 2;
      camera.top = viewSize / 2;
      camera.bottom = -viewSize / 2;
      camera.near = -10000;
      camera.far = 10000;
      camera.updateProjectionMatrix();

      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      domElem.removeEventListener('mousemove', handlePointerMove);
      domElem.removeEventListener('pointerdown', handleCanvasPointerDown);
      domElem.removeEventListener('pointerup', handleCanvasPointerUp);
      domElem.removeEventListener('pointerleave', handlePointerLeave);
      domElem.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
    };
  }, []); // Strictly ONE-TIME effect: Camera and OrbitControls never reset!

  // Update OrbitControls Mouse Bindings dynamically based on mode without touching camera
  useEffect(() => {
    if (!controlsRef.current) return;
    if (isConstructorMode) {
      // In constructor mode, ALWAYS unbind LEFT click from OrbitControls
      // so CAD interactions (marquee, place, select) work without camera drag.
      // RIGHT = Rotate, MIDDLE = Pan. (Scroll = Zoom is default)
      controlsRef.current.mouseButtons = {
        LEFT: undefined as unknown as THREE.MOUSE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    } else {
      // In simulation mode, use standard navigation
      controlsRef.current.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    }
  }, [isConstructorMode]);

  // Update Floor Mesh & Grid Helper dynamically
  useEffect(() => {
    if (!floorGroupRef.current) return;

    const group = floorGroupRef.current;

    // Clear existing floor meshes and grid lines
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ('geometry' in child && child.geometry) (child.geometry as THREE.BufferGeometry).dispose();
      if ('material' in child && child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else (child.material as THREE.Material).dispose();
      }
    }

    if (grid.tiles.size === 0) return;

    const cellSize = grid.cellSizeM;

    // 1. Render Solid Floor Planks/Slab Mesh
    const positions: number[] = [];
    const normals: number[] = [];

    grid.tiles.forEach((_, key) => {
      const [gxStr, gyStr] = key.split('_');
      const gx = parseInt(gxStr, 10);
      const gy = parseInt(gyStr, 10);
      if (isNaN(gx) || isNaN(gy)) return;

      const x0 = gx * cellSize;
      const x1 = (gx + 1) * cellSize;
      const z0 = gy * cellSize;
      const z1 = (gy + 1) * cellSize;

      // Top face of tile slab at Y=0
      // Triangle 1
      positions.push(x0, 0, z0,  x1, 0, z0,  x0, 0, z1);
      normals.push(0, 1, 0,  0, 1, 0,  0, 1, 0);

      // Triangle 2
      positions.push(x1, 0, z0,  x1, 0, z1,  x0, 0, z1);
      normals.push(0, 1, 0,  0, 1, 0,  0, 1, 0);
    });

    if (positions.length > 0) {
      const floorGeo = new THREE.BufferGeometry();
      floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      floorGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

      const floorMat = new THREE.MeshStandardMaterial({
        color: 0xE2E2DC, // Alabaster floor slab color
        roughness: 0.8,
        metalness: 0.1,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });

      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.receiveShadow = true;
      group.add(floorMesh);
    }

    // 2. Render Grid Border Lines over floor slab
    if (showGrid) {
      const points: THREE.Vector3[] = [];
      const addedSegments = new Set<string>();

      const addSegment = (x1: number, z1: number, x2: number, z2: number) => {
        const segKey = x1 < x2 || (x1 === x2 && z1 < z2) ? `${x1},${z1}_${x2},${z2}` : `${x2},${z2}_${x1},${z1}`;
        if (!addedSegments.has(segKey)) {
          addedSegments.add(segKey);
          points.push(new THREE.Vector3(x1, 0.005, z1));
          points.push(new THREE.Vector3(x2, 0.005, z2));
        }
      };

      grid.tiles.forEach((_, key) => {
        const [gxStr, gyStr] = key.split('_');
        const gx = parseInt(gxStr, 10);
        const gy = parseInt(gyStr, 10);
        if (isNaN(gx) || isNaN(gy)) return;

        const x0 = gx * cellSize;
        const x1 = (gx + 1) * cellSize;
        const z0 = gy * cellSize;
        const z1 = (gy + 1) * cellSize;

        addSegment(x0, z0, x1, z0);
        addSegment(x1, z0, x1, z1);
        addSegment(x1, z1, x0, z1);
        addSegment(x0, z1, x0, z0);
      });

      if (points.length > 0) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0xC5B288,
          opacity: 0.7,
          transparent: true,
        });
        const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
        group.add(lineSegments);
      }
    }
  }, [showGrid, grid.tiles, grid.cellSizeM]);

  // Re-render Objects in objectsGroupRef dynamically when grid or selectedTileKeys changes
  useEffect(() => {
    if (!objectsGroupRef.current) return;

    const group = objectsGroupRef.current;

    // Clear existing objects
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ('geometry' in child && child.geometry) (child.geometry as THREE.BufferGeometry).dispose();
      if ('material' in child && child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else (child.material as THREE.Material).dispose();
      }
    }

    if (!isConstructorMode) return;

    grid.tiles.forEach((type: any, key: any) => {
      const [gxStr, gyStr] = key.split('_');
      const gx = parseInt(gxStr, 10);
      const gy = parseInt(gyStr, 10);
      const tileX = (gx + 0.5) * grid.cellSizeM;
      const tileY = (gy + 0.5) * grid.cellSizeM;

      const isSelected = stateRef.current.selectedTileKeys.has(key);
      const details = grid.elementDetails?.get(key);
      const rotRad = THREE.MathUtils.degToRad(details?.rotationDeg || 0);

      if (type === 'RACK') {
        const rackGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.85, 2.2, grid.cellSizeM * 0.85);
        const skuIdx = details?.skuId ? skuList.findIndex((s) => s.id === details.skuId) : -1;
        const skuColor = skuIdx >= 0 ? SKU_PALETTE[skuIdx % SKU_PALETTE.length] : undefined;
        const rackMat = new THREE.MeshStandardMaterial({
          color: isSelected ? 0xd4af37 : skuColor ? skuColor : 0x334155,
          emissive: isSelected ? 0xd4af37 : 0x000000,
          emissiveIntensity: isSelected ? 0.2 : 0,
          roughness: 0.4,
          metalness: 0.3,
        });
        const rackMesh = new THREE.Mesh(rackGeo, rackMat);
        rackMesh.position.set(tileX, 1.1, tileY);
        rackMesh.rotation.y = rotRad;
        rackMesh.castShadow = true;
        rackMesh.receiveShadow = true;
        group.add(rackMesh);

        const rackEdges = new THREE.EdgesGeometry(rackGeo);
        const rackLineMat = new THREE.LineBasicMaterial({
          color: isSelected ? 0x1a1a1a : 0x64748b,
        });
        const rackLine = new THREE.LineSegments(rackEdges, rackLineMat);
        rackLine.position.copy(rackMesh.position);
        rackLine.rotation.y = rotRad;
        group.add(rackLine);
      } else if (type === 'OBSTACLE') {
        const obsGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.9, 3.0, grid.cellSizeM * 0.9);
        const obsMat = new THREE.MeshStandardMaterial({
          color: isSelected ? 0xd4af37 : 0xef4444,
          roughness: 0.3,
          metalness: 0.1,
        });
        const obsMesh = new THREE.Mesh(obsGeo, obsMat);
        obsMesh.position.set(tileX, 1.5, tileY);
        obsMesh.rotation.y = rotRad;
        obsMesh.castShadow = true;
        group.add(obsMesh);
      } else if (type === 'CHARGER') {
        const cGeo = new THREE.CylinderGeometry(grid.cellSizeM * 0.35, grid.cellSizeM * 0.35, 0.4, 16);
        const cMat = new THREE.MeshStandardMaterial({
          color: isSelected ? 0xd4af37 : 0xf59e0b,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.3,
        });
        const cMesh = new THREE.Mesh(cGeo, cMat);
        cMesh.position.set(tileX, 0.2, tileY);
        group.add(cMesh);
      } else if (type === 'DOCK_INBOUND') {
        const dGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.9, 0.1, grid.cellSizeM * 0.9);
        const dMat = new THREE.MeshStandardMaterial({
          color: isSelected ? 0xd4af37 : 0x10b981,
          transparent: true,
          opacity: 0.7,
        });
        const dMesh = new THREE.Mesh(dGeo, dMat);
        dMesh.position.set(tileX, 0.02, tileY);
        group.add(dMesh);
      } else if (type === 'DOCK_OUTBOUND') {
        const dGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.9, 0.1, grid.cellSizeM * 0.9);
        const dMat = new THREE.MeshStandardMaterial({
          color: isSelected ? 0xd4af37 : 0x0284c7,
          transparent: true,
          opacity: 0.7,
        });
        const dMesh = new THREE.Mesh(dGeo, dMat);
        dMesh.position.set(tileX, 0.02, tileY);
        group.add(dMesh);
      }
    });
  }, [grid, selectedTileKeys, isConstructorMode]);

  let selectedRobotFullName: string | null = null;
  if (Array.isArray(fleetConfig)) {
    if (fleetConfig.length > 0) {
      selectedRobotFullName = fleetConfig.map((item) => `${item.robot.model} (${item.count} ед.)`).join(' + ');
    }
  } else if (fleetConfig) {
    selectedRobotFullName = `${fleetConfig.vendor} ${fleetConfig.model}`;
  }

  // Handle Box Marquee Dragging over 3D Viewport when interactionMode === 'SELECT'
  const handleMarqueeMouseDown = (e: React.MouseEvent) => {
    if (interactionMode !== 'SELECT' || e.button !== 0) return;
    if (e.target !== containerRef.current && (e.target as HTMLElement).tagName !== 'CANVAS') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    marqueeData.current = {
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      currentX: e.clientX - rect.left,
      currentY: e.clientY - rect.top,
      isDragging: true,
    };
  };

  const handleMarqueeMouseMove = (e: React.MouseEvent) => {
    if (!marqueeData.current.isDragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    marqueeData.current.currentX = e.clientX - rect.left;
    marqueeData.current.currentY = e.clientY - rect.top;

    if (marqueeRef.current) {
      const { startX, startY, currentX, currentY } = marqueeData.current;
      const minX = Math.min(startX, currentX);
      const minY = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      if (width > 5 || height > 5) {
        marqueeRef.current.style.display = 'block';
        marqueeRef.current.style.left = `${minX}px`;
        marqueeRef.current.style.top = `${minY}px`;
        marqueeRef.current.style.width = `${width}px`;
        marqueeRef.current.style.height = `${height}px`;
      }
    }
  };

  const handleMarqueeMouseUp = (e: React.MouseEvent) => {
    if (!marqueeData.current.isDragging) return;
    marqueeData.current.isDragging = false;

    if (marqueeRef.current) {
      marqueeRef.current.style.display = 'none';
    }

    const { startX, startY, currentX, currentY } = marqueeData.current;
    const dx = Math.abs(currentX - startX);
    const dy = Math.abs(currentY - startY);

    // Only trigger bulk box select if drag distance > 10px
    if (dx > 10 && dy > 10 && cameraRef.current) {
      const minX = Math.min(startX, currentX);
      const maxX = Math.max(startX, currentX);
      const minY = Math.min(startY, currentY);
      const maxY = Math.max(startY, currentY);

      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const newSelected = new Set<string>();
        // Project 3D positions to 2D screen to find selected items (RACKS ONLY)
        grid.tiles.forEach((type: any, key: any) => {
          if (type === 'RACK') {
            const [gx, gy] = key.split('_').map((s: any) => parseInt(s, 10));
            const worldX = (gx + 0.5) * grid.cellSizeM;
            const worldZ = (gy + 0.5) * grid.cellSizeM;

            const vec = new THREE.Vector3(worldX, 0, worldZ);
            vec.project(cameraRef.current!);

            const screenX = (vec.x * 0.5 + 0.5) * rect.width;
            const screenY = (vec.y * -0.5 + 0.5) * rect.height;

            if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
              newSelected.add(key);
            }
          }
        });

        if (newSelected.size > 0) {
          if (stateRef.current.selectedSkuChip) {
            setGrid((prev) => {
              const detailsMap = new Map(prev.elementDetails || []);
              for (const k of newSelected) {
                if (prev.tiles.get(k) === 'RACK') {
                  const existing = detailsMap.get(k) || {};
                  detailsMap.set(k, { ...existing, skuId: stateRef.current.selectedSkuChip || undefined });
                }
              }
              return { ...prev, elementDetails: detailsMap };
            });
          }
          setSelectedTileKeys(newSelected);
        } else {
          setSelectedTileKeys(new Set());
        }
      }
    }
  };

  return (
    <div
      ref={outerContainerRef}
      className="bg-[#EAEAE6] h-full flex flex-col overflow-hidden font-sans text-[#1A1A1A] rounded-none select-none"
    >
      {/* Viewport Header */}
      <div className="bg-[#FFFFFF] border-b border-[#D4AF37]/40 px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 font-mono text-xs rounded-none">
        <div className="flex items-center gap-3">
          {isConstructorMode ? (
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#8A6826]" />
              <h3 className="font-bold uppercase tracking-tight text-[#1A1A1A]">
                [ REO CAD CONSTRUCTOR ] • [ {(facility as any).name || 'Проект склада #1'} ] • [ Режим: Чертеж ]
              </h3>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#8A6826]" />
              <h3 className="font-bold uppercase tracking-tight text-[#1A1A1A]">
                3D CAD WAREHOUSE CONSTRUCTOR
              </h3>
            </div>
          )}

          {/* Mode Action Button when in Simulation */}
          {appMode === 'SIMULATION' && (
            <button
              type="button"
              onClick={handleReturnToEditor}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#D4AF37] hover:bg-[#BFA02E] text-[#1A1A1A] font-bold text-xs uppercase tracking-tight border border-[#BFA02E] rounded-none cursor-pointer transition shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#1A1A1A]" />
              <span>[ ✏️ ВЕРНУТЬСЯ В РЕДАКТОР CAD ]</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 px-2 py-1 flex items-center gap-1.5 text-[#4F4F47]">
            <span>
              Габариты:{' '}
              <strong className="text-[#1A1A1A] tabular-nums">
                {topology.widthM} × {topology.lengthM} м
              </strong>
            </span>
          </div>

          {!isConstructorMode && (
            <>
              <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 px-2 py-1 flex items-center gap-1.5 text-[#4F4F47]">
                <MapPin className="w-3.5 h-3.5 text-purple-600" />
                <span>
                  Зон: <strong className="text-[#1A1A1A]">{topology.zones.length}</strong>
                </span>
              </div>

              <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 px-2 py-1 flex items-center gap-1.5 text-[#4F4F47]">
                <Navigation className="w-3.5 h-3.5 text-sky-600" />
                <span>
                  Трассы:{' '}
                  <strong className="text-[#1A1A1A] tabular-nums">{totalPathLengthM} м</strong> (
                  {topology.nodes.length} узлов)
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Graph Isolation Warning Banner */}
      {isIsolatedZone && isConstructorMode && (
        <div className="bg-red-900 border-b border-red-700 px-4 py-1.5 flex items-center gap-2 text-white text-xs font-bold font-mono shrink-0 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          <span>Внимание: изолированная зона. Роботы не могут построить маршрут к доку или зарядной станции.</span>
        </div>
      )}

      {/* Three.js Canvas Container (CENTER OF ZONE 2) */}
      <div
        className="relative flex-1 bg-[#EAEAE6] overflow-hidden"
        onMouseDown={handleMarqueeMouseDown}
        onMouseMove={handleMarqueeMouseMove}
        onMouseUp={handleMarqueeMouseUp}
      >
        {/* Floating Single-Row Constructor Toolbar & Zone 2 Geometry Status Bar */}
        {isConstructorMode && (
          <ConstructorToolbar
            interactionMode={interactionMode}
            onChangeInteractionMode={setInteractionMode}
            selectedTileType={selectedTileType}
            onSelectTileType={setSelectedTileType}
            showGrid={showGrid}
            onToggleGrid={() => setShowGrid((prev) => !prev)}
            snappingEnabled={snappingEnabled}
            onToggleSnapping={() => setSnappingEnabled((prev) => !prev)}
            onResetGrid={handleResetGrid}
            selectedTileKeys={selectedTileKeys}
            onRotateSelected={handleRotateSelected}
            onDeleteSelected={handleDeleteSelected}
            onOpenSkuModal={() => setIsSkuModalOpen(true)}
            onOpenSchedulePanel={() => setIsScheduleModalOpen(true)}
            selectedSkuChip={selectedSkuChip}
            onSelectSkuChip={setSelectedSkuChip}
            selectedSkuForBox={selectedSkuForBox}
            skuList={skuList}
            onSelectSkuForBox={setSelectedSkuForBox}
            totalRacks={warehouseCapacity.totalRacks}
            totalPalletCapacity={warehouseCapacity.totalPalletCapacity}
            inboundDocksCount={gridElementCounts.inboundDocks}
            outboundDocksCount={gridElementCounts.outboundDocks}
            calculatedAreaSqm={facility.totalAreaSqm}
            ceilingHeightM={facility.ceilingHeightM ?? 8.0}
            onChangeCeilingHeight={(heightM) => {
              if (onChangeFacility) {
                onChangeFacility({ ...facility, ceilingHeightM: heightM });
              }
            }}
          />
        )}

        {/* 2D Marquee Box Overlay for Bulk Selection */}
        <div
          ref={marqueeRef}
          style={{ display: 'none', position: 'absolute' }}
          className="border-2 border-dashed border-[#D4AF37] bg-[#D4AF37]/20 pointer-events-none z-30"
        />

        {/* Live Rectangle Dimension Badge Overlay during Floor Drawing / Erasing */}
        {isConstructorMode && isDrawingActive && liveRectDims && (
          <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none select-none font-mono">
            <div
              className={`px-3 py-1.5 border shadow-xl flex items-center gap-2 text-xs font-bold text-white uppercase rounded-none ${
                liveRectDims.isErase
                  ? 'bg-red-900/90 border-red-500'
                  : 'bg-[#1A1A1A]/90 border-[#D4AF37]'
              }`}
            >
              <span className={liveRectDims.isErase ? 'text-red-300' : 'text-[#D4AF37]'}>
                {liveRectDims.isErase ? '[ 🧹 Удаление пола ]' : '[ 📐 Добавление пола ]'}
              </span>
              <span>
                {liveRectDims.widthM.toFixed(1)} м × {liveRectDims.lengthM.toFixed(1)} м
              </span>
              <span className="text-[#D4AF37]">•</span>
              <span className="tabular-nums">{liveRectDims.areaSqm} м²</span>
            </div>
          </div>
        )}

        {/* SVG Connector Beam Line to 3D object/zone (single selection only) */}
        {isConstructorMode && selectedTileKeys.size === 1 && inspectorWindowPos && targetScreenPos && (
          <svg className="fixed inset-0 w-full h-full pointer-events-none z-20">
            <line
              x1={inspectorWindowPos.x + 144}
              y1={inspectorWindowPos.y + 140}
              x2={targetScreenPos.x}
              y2={targetScreenPos.y}
              stroke="#D4AF37"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            <circle cx={targetScreenPos.x} cy={targetScreenPos.y} r="6" fill="#D4AF37" stroke="#FFFFFF" strokeWidth="2" />
            <circle
              cx={inspectorWindowPos.x + 144}
              cy={inspectorWindowPos.y + 140}
              r="4"
              fill="#D4AF37"
            />
          </svg>
        )}

        {/* Rack Inspection Popover */}
        {isConstructorMode && selectedTileKeys.size === 1 && inspectorWindowPos && (
          <RackInspectionPopover
            isOpen={true}
            onClose={() => setSelectedTileKeys(new Set())}
            rackKey={Array.from(selectedTileKeys)[0]}
            gridX={parseInt(Array.from(selectedTileKeys)[0].split('_')[0], 10)}
            gridY={parseInt(Array.from(selectedTileKeys)[0].split('_')[1], 10)}
            currentSkuId={grid.elementDetails?.get(Array.from(selectedTileKeys)[0])?.skuId}
            slotsPerRack={grid.elementDetails?.get(Array.from(selectedTileKeys)[0])?.slotsPerRack ?? 12}
            skuList={skuList}
            onChangeCapacity={(key, capacity) => {
              setGrid((prev) => {
                const detailsMap = new Map(prev.elementDetails || []);
                const existing = detailsMap.get(key) || {};
                detailsMap.set(key, { ...existing, slotsPerRack: capacity });
                return { ...prev, elementDetails: detailsMap };
              });
            }}
            onAssignSku={(key, skuId) => {
              setGrid((prev) => {
                const detailsMap = new Map(prev.elementDetails || []);
                const existing = detailsMap.get(key) || {};
                detailsMap.set(key, { ...existing, skuId });
                return { ...prev, elementDetails: detailsMap };
              });
            }}
            onDeleteRack={handleDeleteSelected}
            screenPos={inspectorWindowPos}
            onStartDrag={handleStartWindowDrag}
          />
        )}

        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Legend Overlay in Simulation mode */}
        {appMode === 'SIMULATION' && (
          <div className="absolute bottom-3 left-3 bg-[#FFFFFF]/95 border border-[#D4AF37]/40 p-2 text-[11px] flex flex-wrap gap-3 text-[#1A1A1A] shadow-md z-10 font-mono rounded-none">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-emerald-600" />
              <span>В пути</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-amber-500" />
              <span>Погрузка/Ожидание</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-cyan-600" />
              <span>Зарядка</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2 bg-sky-600" />
              <span>Груз</span>
            </div>
          </div>
        )}

        {/* Viewport Control Tip */}
        <div className="absolute bottom-3 right-3 bg-[#FFFFFF]/90 border border-[#D4AF37]/40 px-2.5 py-1 text-[10px] text-[#4F4F47] z-10 font-mono rounded-none">
          {isConstructorMode
            ? 'Клик для установки блока • ЛКМ: вращение • Колесо: зум • ПКМ: контекст'
            : 'ЛКМ: вращение • Колесо: зум • ПКМ: панорамирование'}
        </div>
      </div>

      {/* BOTTOM ACTION / SIMULATION PLAYER AREA */}
      {isConstructorMode ? (
        /* Bottom CAD Action Bar */
        <div className="h-14 bg-[#FFFFFF] border-t border-[#D4AF37]/40 px-4 flex items-center justify-between shrink-0 font-mono text-xs shadow-md z-20 rounded-none">
          <div className="flex items-center gap-3 text-[#1A1A1A]">
            <span className="bg-[#F4F4F0] border border-[#D4AF37]/30 px-2.5 py-1 rounded-none font-semibold">
              Площадь: <strong className="text-[#8A6826] font-bold tabular-nums">{facility.totalAreaSqm} м²</strong>
            </span>
            <span className="bg-[#F4F4F0] border border-[#D4AF37]/30 px-2.5 py-1 rounded-none font-semibold">
              Стеллажей: <strong className="text-[#8A6826] font-bold tabular-nums">{warehouseCapacity.totalRacks} шт.</strong>
            </span>
            <span className="bg-[#F4F4F0] border border-[#D4AF37]/30 px-2.5 py-1 rounded-none font-semibold">
              Вместимость: <strong className="text-[#8A6826] font-bold tabular-nums">{warehouseCapacity.totalPalletCapacity} паллет</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={handleFinishConstructionAndSimulate}
            className="px-6 py-2.5 bg-[#D4AF37] hover:bg-[#BFA02E] active:bg-[#8A6826] text-[#1A1A1A] font-bold uppercase tracking-wider text-xs border border-[#BFA02E] shadow-xs rounded-none cursor-pointer flex items-center gap-2 transition"
          >
            <Play className="w-4 h-4 text-[#1A1A1A] fill-[#1A1A1A]" />
            <span>[ СКЛАД ГОТОВ: ЗАПУСТИТЬ РАСЧЕТ И МОДЕЛИРОВАНИЕ ]</span>
          </button>
        </div>
      ) : (
        /* Bottom Simulation Replay Player with Telemetry Cards */
        <div className="shrink-0">
          <SimulationControls
            isPlaying={isPlaying}
            onTogglePlayPause={() => {
              audioEngine.initAudioContext();
              setIsPlaying((prev) => !prev);
            }}
            speedMultiplier={speedMultiplier}
            onSpeedChange={setSpeedMultiplier}
            currentTimestampSec={currentTimeSec}
            totalDurationSec={3600}
            onSeek={(sec) => {
              setCurrentTimeSec(sec);
              lastProcessedFrameIndexRef.current = -1;
            }}
            volume={volume}
            onVolumeChange={handleVolumeChange}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            onToggleFullscreen={handleToggleFullscreen}
            telemetry={telemetry}
            targetThroughputPerHour={targetThroughputPerHour}
            fleetSize={fleetSize}
            selectedRobotName={selectedRobotFullName}
            spectralAnalysis={spectralAnalysis}
          />
        </div>
      )}

      {/* SKU Inventory Panel Modal */}
      <SkuInventoryModal
        isOpen={isSkuModalOpen}
        onClose={() => setIsSkuModalOpen(false)}
        skuList={skuList}
        onAddSku={(newSku) => {
          const updated = [...skuList, newSku];
          setSkuList(updated);
          if (onChangeFacility) {
            const weights = updated.map((s: any) => Number(s.weightKg ?? s.m_unit ?? s.massKg ?? s.weight ?? 500) || 500);
            onChangeFacility({ ...facility, requiredPayloadKg: Math.max(...weights) });
          }
        }}
        onDeleteSku={(id) => {
          const updated = skuList.filter((s) => s.id !== id);
          setSkuList(updated);
          if (onChangeFacility) {
            const weights = updated.map((s: any) => Number(s.weightKg ?? s.m_unit ?? s.massKg ?? s.weight ?? 500) || 500);
            onChangeFacility({ ...facility, requiredPayloadKg: weights.length > 0 ? Math.max(...weights) : 500 });
          }
          setGrid((prev) => {
            const detailsMap = new Map(prev.elementDetails || []);
            let changed = false;
            detailsMap.forEach((det, key) => {
              if (det.skuId === id) {
                detailsMap.set(key, { ...det, skuId: undefined });
                changed = true;
              }
            });
            return changed ? { ...prev, elementDetails: detailsMap } : prev;
          });
          if (selectedSkuChip === id) {
            setSelectedSkuChip('CLEAR_SKU');
          }
        }}
      />

      {/* Supply Schedule Panel Modal */}
      <SupplyScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        schedule={supplySchedule}
        onChangeSchedule={setSupplySchedule}
        totalPalletCapacity={warehouseCapacity.totalPalletCapacity}
        totalRacks={warehouseCapacity.totalRacks}
        onApplySchedule={(calculatedQuota) => {
          if (onChangeFacility) {
            onChangeFacility({
              ...facility,
              targetThroughputPerHour: calculatedQuota,
            });
          }
          showToast(`REO: Грузопоток обновлен по расписанию: ${calculatedQuota} шт/ч`);
        }}
      />
    </div>
  );
}
