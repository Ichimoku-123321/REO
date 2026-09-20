import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FacilityRequirements } from '../types/facility.js';
import type { Robot } from '../types/robot.js';
import { generateFacilityTopology, calculateFacilityDimensions } from '../engine/topology_generator.js';
import type { FacilityTopology, NodeType } from '../types/topology.js';
import {
  SimulationEngine,
  type SimulationTelemetry,
  type AgentFSMState,
  type SimulationReplayFrame,
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
  DEFAULT_SKU_LIST,
  DEFAULT_SUPPLY_SCHEDULE,
  type ConstructorGrid,
  type ConstructorTileType,
  type Point2D,
  type SkuItem,
  type SupplySchedule,
} from '../engine/constructor_engine.js';
import { SimulationControls } from './SimulationControls.js';
import { ConstructorToolbar, type CtorInteractionMode } from './ConstructorToolbar.js';
import { SkuInventoryModal } from './SkuInventoryModal.js';
import { SupplyScheduleModal } from './SupplyScheduleModal.js';
import { RackInspectionPopover } from './RackInspectionPopover.js';
import { audioEngine } from '../engine/audio_synth.js';
import { Layers, MapPin, Navigation, AlertTriangle, Building2, Wrench } from 'lucide-react';

interface SimulationViewportProps {
  facility: FacilityRequirements;
  onChangeFacility?: (updated: FacilityRequirements) => void;
  fleetConfig: Robot | FleetCompositionItem[] | null;
  fleetSize: number;
  targetThroughputPerHour: number;
  replayFrames?: SimulationReplayFrame[];
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
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function angleLerp(a: number, b: number, t: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

export function SimulationViewport({
  facility,
  onChangeFacility,
  fleetConfig,
  fleetSize,
  targetThroughputPerHour,
  replayFrames = [],
}: SimulationViewportProps) {
  const outerContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Viewport mode & CAD Interaction mode
  const [isConstructorMode, setIsConstructorMode] = useState<boolean>(false);
  const [interactionMode, setInteractionMode] = useState<CtorInteractionMode>('SELECT');
  const [selectedTileType, setSelectedTileType] = useState<ConstructorTileType>('RACK');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [snappingEnabled, setSnappingEnabled] = useState<boolean>(true);
  const [showBottleneckHeatmap, setShowBottleneckHeatmap] = useState<boolean>(false);

  // Selected Object & Popover State
  const [selectedTileKey, setSelectedTileKey] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);

  // SKU & Supply Schedule State
  const [skuList, setSkuList] = useState<SkuItem[]>(DEFAULT_SKU_LIST);
  const [selectedSkuForBox, setSelectedSkuForBox] = useState<SkuItem | null>(DEFAULT_SKU_LIST[0]);
  const [supplySchedule, setSupplySchedule] = useState<SupplySchedule>(DEFAULT_SUPPLY_SCHEDULE);

  // Modals Visibility State
  const [isSkuModalOpen, setIsSkuModalOpen] = useState<boolean>(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);

  // Floor Contour Drawing State
  const [drawingPoints, setDrawingPoints] = useState<Point2D[]>([]);
  const [isDrawingActive, setIsDrawingActive] = useState<boolean>(false);

  // Box Marquee Drag State
  const [marqueeBox, setMarqueeBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isDragging: boolean;
  } | null>(null);

  // Playback & Simulation state
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
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
    const cellSize = facility.totalAreaSqm > 5000 ? 2.0 : 1.0;
    setGrid(createInitialConstructorGrid(facilityDims.widthM, facilityDims.lengthM, cellSize));
  }, [facilityDims, facility.totalAreaSqm]);

  // Capacity calculation
  const warehouseCapacity = useMemo(() => {
    return calculateWarehouseCapacity(grid);
  }, [grid]);

  // Derived active topology
  const topology: FacilityTopology = useMemo(() => {
    if (isConstructorMode) {
      return rebuildTopologyFromGrid(grid, facilityDims.widthM, facilityDims.lengthM);
    }
    return generateFacilityTopology(facility);
  }, [isConstructorMode, grid, facilityDims, facility]);

  // Check graph isolation warning
  const isIsolatedZone = useMemo(() => {
    return checkGraphIsolation(topology);
  }, [topology]);

  // Spectral Analysis result
  const spectralAnalysis: SpectralAnalysisResult = useMemo(() => {
    return analyzeTopologyBottlenecks(topology);
  }, [topology]);

  const totalPathLengthM = useMemo(() => {
    return Math.round(
      topology.edges.reduce((sum, edge) => sum + edge.distanceM, 0)
    );
  }, [topology]);

  // Simulation Engine Instance ref
  const engineRef = useRef<SimulationEngine | null>(null);

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

  const handleResetGrid = useCallback(() => {
    const cellSize = facility.totalAreaSqm > 5000 ? 2.0 : 1.0;
    setGrid(createInitialConstructorGrid(facilityDims.widthM, facilityDims.lengthM, cellSize));
    setSelectedTileKey(null);
    setPopoverPos(null);
  }, [facilityDims, facility.totalAreaSqm]);

  const handleRotateSelected = useCallback(() => {
    if (!selectedTileKey) return;
    setGrid((prev) => {
      const detailsMap = new Map(prev.elementDetails || []);
      const existing = detailsMap.get(selectedTileKey) || {};
      const currentRot = existing.rotationDeg || 0;
      const nextRot = (currentRot + 90) % 360;
      detailsMap.set(selectedTileKey, { ...existing, rotationDeg: nextRot });
      return { ...prev, elementDetails: detailsMap };
    });
  }, [selectedTileKey]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedTileKey) return;
    setGrid((prev) => {
      const updatedTiles = new Map(prev.tiles);
      updatedTiles.set(selectedTileKey, 'EMPTY_FLOOR');
      const detailsMap = new Map(prev.elementDetails || []);
      detailsMap.delete(selectedTileKey);
      return { ...prev, tiles: updatedTiles, elementDetails: detailsMap };
    });
    setSelectedTileKey(null);
    setPopoverPos(null);
  }, [selectedTileKey]);

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

      if (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') {
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

  // Main Three.js Scene Setup & Interaction Loop
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';

    const width = container.clientWidth;
    const height = container.clientHeight || 500;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#EAEAE6'); // Alabaster CAD background

    // 2. Camera setup
    const aspect = width / height;
    const viewSize = Math.max(topology.widthM, topology.lengthM) * 1.15;
    const camera = new THREE.OrthographicCamera(
      (-viewSize * aspect) / 2,
      (viewSize * aspect) / 2,
      viewSize / 2,
      -viewSize / 2,
      0.1,
      1000
    );

    const centerX = topology.widthM / 2;
    const centerZ = topology.lengthM / 2;

    const cameraDistance = Math.max(topology.widthM, topology.lengthM) * 1.5;
    const pitchAngleRad = THREE.MathUtils.degToRad(30);

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

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(centerX, 0, centerZ);
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.minPolarAngle = Math.PI / 8;
    controls.maxPolarAngle = Math.PI / 3.2;
    controls.update();

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

    // 6. CAD Floor Plane
    const floorGeo = new THREE.PlaneGeometry(topology.widthM, topology.lengthM);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f0, // Light CAD floor
      roughness: 0.9,
      metalness: 0.05,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(centerX, -0.01, centerZ);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Grid Helper
    let gridHelper: THREE.GridHelper | null = null;
    if (showGrid) {
      gridHelper = new THREE.GridHelper(
        Math.max(topology.widthM, topology.lengthM),
        Math.max(10, Math.floor(Math.max(topology.widthM, topology.lengthM) / (isConstructorMode ? grid.cellSizeM : 5))),
        0xd4af37, // Gold primary lines
        0xc0c0b8  // Fine secondary lines
      );
      gridHelper.position.set(centerX, 0, centerZ);
      scene.add(gridHelper);
    }

    // Ghost Preview Mesh for Drag & Drop / Hover
    const ghostGroup = new THREE.Group();
    const ghostGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.85, 2.0, grid.cellSizeM * 0.85);
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

    // Visual Magnetic Snapping Guide Lines
    const guideLineMat = new THREE.LineDashedMaterial({
      color: 0xd4af37,
      dashSize: 0.5,
      gapSize: 0.2,
      linewidth: 2,
    });
    const guideGeo = new THREE.BufferGeometry();
    const guideLine = new THREE.LineSegments(guideGeo, guideLineMat);
    guideLine.visible = false;
    scene.add(guideLine);

    // Render Tiles / Elements in Constructor Mode
    if (isConstructorMode) {
      grid.tiles.forEach((type, key) => {
        const [gxStr, gyStr] = key.split('_');
        const gx = parseInt(gxStr, 10);
        const gy = parseInt(gyStr, 10);
        const tileX = (gx + 0.5) * grid.cellSizeM;
        const tileY = (gy + 0.5) * grid.cellSizeM;

        const isSelected = selectedTileKey === key;
        const details = grid.elementDetails?.get(key);
        const rotRad = THREE.MathUtils.degToRad(details?.rotationDeg || 0);

        if (type === 'RACK') {
          const rackGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.85, 2.2, grid.cellSizeM * 0.85);
          const rackMat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xd4af37 : details?.skuId ? 0x0284c7 : 0x334155,
            roughness: 0.4,
            metalness: 0.3,
          });
          const rackMesh = new THREE.Mesh(rackGeo, rackMat);
          rackMesh.position.set(tileX, 1.1, tileY);
          rackMesh.rotation.y = rotRad;
          rackMesh.castShadow = true;
          rackMesh.receiveShadow = true;
          scene.add(rackMesh);

          const rackEdges = new THREE.EdgesGeometry(rackGeo);
          const rackLineMat = new THREE.LineBasicMaterial({
            color: isSelected ? 0x1a1a1a : 0x64748b,
          });
          const rackLine = new THREE.LineSegments(rackEdges, rackLineMat);
          rackLine.position.copy(rackMesh.position);
          rackLine.rotation.y = rotRad;
          scene.add(rackLine);
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
          scene.add(obsMesh);
        } else if (type === 'CHARGER') {
          const cGeo = new THREE.CylinderGeometry(grid.cellSizeM * 0.35, grid.cellSizeM * 0.35, 0.4, 16);
          const cMat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xd4af37 : 0xf59e0b,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.3,
          });
          const cMesh = new THREE.Mesh(cGeo, cMat);
          cMesh.position.set(tileX, 0.2, tileY);
          scene.add(cMesh);
        } else if (type === 'DOCK_INBOUND') {
          const dGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.9, 0.1, grid.cellSizeM * 0.9);
          const dMat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xd4af37 : 0x3b82f6,
            transparent: true,
            opacity: 0.7,
          });
          const dMesh = new THREE.Mesh(dGeo, dMat);
          dMesh.position.set(tileX, 0.02, tileY);
          scene.add(dMesh);
        } else if (type === 'DOCK_OUTBOUND') {
          const dGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.9, 0.1, grid.cellSizeM * 0.9);
          const dMat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xd4af37 : 0x0284c7,
            transparent: true,
            opacity: 0.7,
          });
          const dMesh = new THREE.Mesh(dGeo, dMat);
          dMesh.position.set(tileX, 0.02, tileY);
          scene.add(dMesh);
        }
      });
    }

    // Automatic Mode Functional Zones
    if (!isConstructorMode) {
      topology.zones.forEach((zone) => {
        const zoneGeo = new THREE.PlaneGeometry(zone.width, zone.height);
        const zoneMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(zone.color),
          transparent: true,
          opacity: 0.25,
          roughness: 0.5,
        });
        const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
        zoneMesh.rotation.x = -Math.PI / 2;
        zoneMesh.position.set(
          zone.x + zone.width / 2,
          0.01,
          zone.y + zone.height / 2
        );
        zoneMesh.receiveShadow = true;
        scene.add(zoneMesh);

        const borderEdgesGeo = new THREE.EdgesGeometry(zoneGeo);
        const borderMat = new THREE.LineBasicMaterial({
          color: new THREE.Color(zone.color),
          linewidth: 2,
        });
        const borderLine = new THREE.LineSegments(borderEdgesGeo, borderMat);
        borderLine.rotation.x = -Math.PI / 2;
        borderLine.position.set(
          zone.x + zone.width / 2,
          0.02,
          zone.y + zone.height / 2
        );
        scene.add(borderLine);

        if (zone.type === 'STORAGE_AISLE') {
          const rackHeight = Math.min(4, (facility.ceilingHeightM ?? 8.0) * 0.6);
          const rackGroup = new THREE.Group();

          const isVertical = zone.height > zone.width * 1.2;

          if (isVertical) {
            const rackCols = 4;
            const colWidth = Math.max(0.1, (zone.width - 2) / rackCols);
            for (let c = 0; c < rackCols; c++) {
              const rackGeo = new THREE.BoxGeometry(
                colWidth * 0.6,
                rackHeight,
                zone.height - 2
              );
              const rackMat = new THREE.MeshStandardMaterial({
                color: 0x334155,
                roughness: 0.4,
                metalness: 0.3,
              });
              const rackMesh = new THREE.Mesh(rackGeo, rackMat);
              rackMesh.position.set(
                zone.x + 1 + c * colWidth + colWidth * 0.3,
                rackHeight / 2,
                zone.y + zone.height / 2
              );
              rackMesh.castShadow = true;
              rackMesh.receiveShadow = true;
              rackGroup.add(rackMesh);
            }
          } else {
            const rackRows = 4;
            const rowHeight = Math.max(0.1, (zone.height - 2) / rackRows);
            for (let r = 0; r < rackRows; r++) {
              const rackGeo = new THREE.BoxGeometry(
                zone.width - 2,
                rackHeight,
                rowHeight * 0.6
              );
              const rackMat = new THREE.MeshStandardMaterial({
                color: 0x334155,
                roughness: 0.4,
                metalness: 0.3,
              });
              const rackMesh = new THREE.Mesh(rackGeo, rackMat);
              rackMesh.position.set(
                zone.x + zone.width / 2,
                rackHeight / 2,
                zone.y + 1 + r * rowHeight + rowHeight * 0.3
              );
              rackMesh.castShadow = true;
              rackMesh.receiveShadow = true;
              rackGroup.add(rackMesh);
            }
          }
          scene.add(rackGroup);
        }
      });
    }

    // Nodes visual markers
    const getNodeColor = (type: NodeType): number => {
      switch (type) {
        case 'INBOUND_DOCK':
          return 0x3b82f6;
        case 'OUTBOUND_DOCK':
          return 0x0284c7;
        case 'CHARGING_HUB':
          return 0xf59e0b;
        case 'STORAGE_AISLE':
          return 0x10b981;
        case 'WAYPOINT':
        default:
          return 0x94a3b8;
      }
    };

    topology.nodes.forEach((node) => {
      if (node.type === 'WAYPOINT') return;
      const color = getNodeColor(node.type);
      const markerGeo = new THREE.CylinderGeometry(0.8, 1.2, 0.8, 16);
      const markerMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.2,
        metalness: 0.5,
        emissive: color,
        emissiveIntensity: 0.2,
      });
      const markerMesh = new THREE.Mesh(markerGeo, markerMat);
      markerMesh.position.set(node.x, 0.4, node.y);
      markerMesh.castShadow = true;
      scene.add(markerMesh);
    });

    // Bottleneck Heatmap Overlay
    if (showBottleneckHeatmap) {
      const criticalSet = new Set(spectralAnalysis.criticalNodeIds);
      topology.nodes.forEach((node) => {
        if (criticalSet.has(node.id)) {
          const ringGeo = new THREE.RingGeometry(1.0, 1.8, 32);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0xef4444,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
          });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.rotation.x = -Math.PI / 2;
          ringMesh.position.set(node.x, 0.15, node.y);
          scene.add(ringMesh);
        }
      });
    }

    // Dynamic Robot Fleet Meshes
    interface AgentMeshGroup {
      group: THREE.Group;
      chassisMesh: THREE.Mesh;
      haloMesh: THREE.Mesh;
      cargoMesh: THREE.Mesh;
      haloMat: THREE.MeshBasicMaterial;
    }

    const agentMeshMap = new Map<string, AgentMeshGroup>();

    const getHaloColorFromSnapshot = (a0: {
      state: AgentFSMState;
      isQueued?: boolean;
      isDeadlocked?: boolean;
      speedMps?: number;
    }): number => {
      if (a0.isDeadlocked) return 0xef4444;
      const hasActiveTask = a0.state !== 'IDLE' && a0.state !== 'CHARGING';
      const isSlowMoving = hasActiveTask && typeof a0.speedMps === 'number' && a0.speedMps < 0.05;
      if (a0.isQueued || isSlowMoving) return 0xf59e0b;
      switch (a0.state) {
        case 'TRANSPORTING':
        case 'MOVING_TO_PICKUP':
          return 0x10b981;
        case 'LOADING':
        case 'UNLOADING':
          return 0xf59e0b;
        case 'MOVING_TO_CHARGE':
        case 'CHARGING':
          return 0x06b6d4;
        case 'IDLE':
        default:
          return 0x64748b;
      }
    };

    const createRobotMeshGroup = (): AgentMeshGroup => {
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

      scene.add(group);

      return { group, chassisMesh, haloMesh, cargoMesh, haloMat };
    };

    // Pointer Interaction Handler for Pointer Move & Hover
    const handlePointerMove = (event: MouseEvent) => {
      if (!isConstructorMode) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(floorMesh);

      if (intersects.length > 0) {
        let point = intersects[0].point;

        // Snapping check
        if (snappingEnabled) {
          const existingPositions: Point2D[] = [];
          grid.tiles.forEach((type, key) => {
            if (type !== 'EMPTY_FLOOR') {
              const [gx, gy] = key.split('_').map((s) => parseInt(s, 10));
              existingPositions.push({
                x: (gx + 0.5) * grid.cellSizeM,
                z: (gy + 0.5) * grid.cellSizeM,
              });
            }
          });

          const snapRes = findMagneticSnapPosition({ x: point.x, z: point.z }, existingPositions, 0.35);
          point = new THREE.Vector3(snapRes.snapped.x, 0, snapRes.snapped.z);

          // Render magnetic snap guide line if snapped
          if (snapRes.guideX !== null || snapRes.guideZ !== null) {
            const guidePoints: THREE.Vector3[] = [];
            if (snapRes.guideX !== null) {
              guidePoints.push(new THREE.Vector3(snapRes.guideX, 0.05, 0));
              guidePoints.push(new THREE.Vector3(snapRes.guideX, 0.05, topology.lengthM));
            }
            if (snapRes.guideZ !== null) {
              guidePoints.push(new THREE.Vector3(0, 0.05, snapRes.guideZ));
              guidePoints.push(new THREE.Vector3(topology.widthM, 0.05, snapRes.guideZ));
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

        if (interactionMode === 'PLACE_ELEMENT') {
          ghostGroup.position.set(point.x, 1.0, point.z);
          ghostGroup.visible = true;
        } else {
          ghostGroup.visible = false;
        }
      }
    };

    // Pointer Click Handler
    const handleCanvasPointerDown = (event: MouseEvent) => {
      if (!isConstructorMode) return;

      // Ignore right-click for placement
      if (event.button === 2) {
        // Right-Click Inspection Popover
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(floorMesh);

        if (intersects.length > 0) {
          const point = intersects[0].point;
          const gx = Math.floor(point.x / grid.cellSizeM);
          const gy = Math.floor(point.z / grid.cellSizeM);
          const key = getTileKey(gx, gy);

          if (grid.tiles.get(key) === 'RACK') {
            setSelectedTileKey(key);
            setPopoverPos({ x: event.clientX, y: event.clientY });
          }
        }
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(floorMesh);

      if (intersects.length > 0) {
        let point = intersects[0].point;

        if (snappingEnabled) {
          const existingPositions: Point2D[] = [];
          grid.tiles.forEach((type, key) => {
            if (type !== 'EMPTY_FLOOR') {
              const [gx, gy] = key.split('_').map((s) => parseInt(s, 10));
              existingPositions.push({
                x: (gx + 0.5) * grid.cellSizeM,
                z: (gy + 0.5) * grid.cellSizeM,
              });
            }
          });
          const snapRes = findMagneticSnapPosition({ x: point.x, z: point.z }, existingPositions, 0.35);
          point = new THREE.Vector3(snapRes.snapped.x, 0, snapRes.snapped.z);
        }

        const gx = Math.floor(point.x / grid.cellSizeM);
        const gy = Math.floor(point.z / grid.cellSizeM);

        // Floor Contour Drawing Modes
        if (interactionMode === 'DRAW_RECT') {
          if (!isDrawingActive) {
            setDrawingPoints([{ x: point.x, z: point.z }]);
            setIsDrawingActive(true);
          } else {
            const startPt = drawingPoints[0];
            const endPt = { x: point.x, z: point.z };
            const rectPoly = [
              startPt,
              { x: endPt.x, z: startPt.z },
              endPt,
              { x: startPt.x, z: endPt.z },
            ];
            const areaSqm = calculateShoelaceArea(rectPoly);
            if (areaSqm > 0 && onChangeFacility) {
              onChangeFacility({ ...facility, totalAreaSqm: areaSqm });
            }
            setDrawingPoints([]);
            setIsDrawingActive(false);
            setInteractionMode('SELECT');
          }
          return;
        }

        if (interactionMode === 'DRAW_POLY') {
          const nextPts = [...drawingPoints, { x: point.x, z: point.z }];
          setDrawingPoints(nextPts);
          setIsDrawingActive(true);

          if (nextPts.length >= 3) {
            const areaSqm = calculateShoelaceArea(nextPts);
            if (areaSqm > 0 && onChangeFacility) {
              onChangeFacility({ ...facility, totalAreaSqm: areaSqm });
            }
          }
          return;
        }

        // Element Placement Mode
        if (interactionMode === 'PLACE_ELEMENT' && gx >= 0 && gx < grid.cols && gy >= 0 && gy < grid.rows) {
          const key = getTileKey(gx, gy);
          setGrid((prev) => {
            const updatedTiles = new Map(prev.tiles);
            updatedTiles.set(key, selectedTileType);
            return { ...prev, tiles: updatedTiles };
          });
          setSelectedTileKey(key);
          setPopoverPos(null);
          return;
        }

        // Select Mode
        if (interactionMode === 'SELECT' && gx >= 0 && gx < grid.cols && gy >= 0 && gy < grid.rows) {
          const key = getTileKey(gx, gy);
          if (grid.tiles.get(key) !== 'EMPTY_FLOOR') {
            setSelectedTileKey(key);
            setPopoverPos({ x: event.clientX, y: event.clientY });
          } else {
            setSelectedTileKey(null);
            setPopoverPos(null);
          }
        }
      }
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('mousemove', handlePointerMove);
    domElem.addEventListener('pointerdown', handleCanvasPointerDown);

    // Context Menu Prevent Default for Right Click Inspection
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    domElem.addEventListener('contextmenu', handleContextMenu);

    // Animation Loop
    const clock = new THREE.Clock();
    let animationFrameId: number;
    let telemetryTimer = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const deltaReal = clock.getDelta();

      if (isPlaying) {
        setCurrentTimeSec((prevTime) => {
          let nextTime = prevTime + deltaReal * speedMultiplier;
          if (nextTime >= 3600) {
            nextTime = 0;
          }

          if (replayFrames && replayFrames.length > 0) {
            const frameIndex = Math.min(
              replayFrames.length - 2,
              Math.max(0, Math.floor(nextTime * 2))
            );

            const frame0 = replayFrames[frameIndex];
            const frame1 = replayFrames[frameIndex + 1] || frame0;

            const alpha = Math.max(0, Math.min(1, (nextTime - frame0.timestampSec) / 0.5));

            if (frameIndex !== lastProcessedFrameIndexRef.current) {
              lastProcessedFrameIndexRef.current = frameIndex;

              if (frame0.events && frame0.events.length > 0) {
                frame0.events.forEach((evt) => {
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

              let meshGroup = agentMeshMap.get(a0.id);
              if (!meshGroup) {
                meshGroup = createRobotMeshGroup();
                agentMeshMap.set(a0.id, meshGroup);
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

              const colorHex = getHaloColorFromSnapshot(a0);
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
            setTelemetry(engineRef.current.getTelemetry(targetThroughputPerHour));
          }
        }
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
      camera.updateProjectionMatrix();

      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      domElem.removeEventListener('mousemove', handlePointerMove);
      domElem.removeEventListener('pointerdown', handleCanvasPointerDown);
      domElem.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
    };
  }, [
    topology,
    facility,
    isPlaying,
    speedMultiplier,
    targetThroughputPerHour,
    isConstructorMode,
    interactionMode,
    grid,
    selectedTileType,
    showGrid,
    snappingEnabled,
    showBottleneckHeatmap,
    spectralAnalysis,
    replayFrames,
    selectedTileKey,
    drawingPoints,
    isDrawingActive,
    onChangeFacility,
  ]);

  const isFleetEmpty = fleetSize === 0 || !fleetConfig;

  let selectedRobotFullName: string | null = null;
  if (Array.isArray(fleetConfig)) {
    if (fleetConfig.length > 0) {
      selectedRobotFullName = fleetConfig.map((item) => `${item.robot.model} (${item.count} ед.)`).join(' + ');
    }
  } else if (fleetConfig) {
    selectedRobotFullName = `${fleetConfig.vendor} ${fleetConfig.model}`;
  }

  // Handle Box Marquee Dragging over 3D Viewport
  const handleMarqueeMouseDown = (e: React.MouseEvent) => {
    if (interactionMode !== 'BOX_SELECT_SKU' || !selectedSkuForBox) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMarqueeBox({
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      currentX: e.clientX - rect.left,
      currentY: e.clientY - rect.top,
      isDragging: true,
    });
  };

  const handleMarqueeMouseMove = (e: React.MouseEvent) => {
    if (!marqueeBox || !marqueeBox.isDragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMarqueeBox((prev) =>
      prev
        ? {
            ...prev,
            currentX: e.clientX - rect.left,
            currentY: e.clientY - rect.top,
          }
        : null
    );
  };

  const handleMarqueeMouseUp = () => {
    if (!marqueeBox || !marqueeBox.isDragging || !selectedSkuForBox) return;

    const minX = Math.min(marqueeBox.startX, marqueeBox.currentX);
    const maxX = Math.max(marqueeBox.startX, marqueeBox.currentX);
    const minY = Math.min(marqueeBox.startY, marqueeBox.currentY);
    const maxY = Math.max(marqueeBox.startY, marqueeBox.currentY);

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      // Bulk assign SKU to racks inside bounding box
      setGrid((prev) => {
        const detailsMap = new Map(prev.elementDetails || []);
        prev.tiles.forEach((type, key) => {
          if (type === 'RACK') {
            const [gx, gy] = key.split('_').map((s) => parseInt(s, 10));
            const posX = ((gx + 0.5) / prev.cols) * rect.width;
            const posY = ((gy + 0.5) / prev.rows) * rect.height;

            if (posX >= minX && posX <= maxX && posY >= minY && posY <= maxY) {
              const existing = detailsMap.get(key) || {};
              detailsMap.set(key, { ...existing, skuId: selectedSkuForBox.id });
            }
          }
        });
        return { ...prev, elementDetails: detailsMap };
      });
    }

    setMarqueeBox(null);
  };

  return (
    <div
      ref={outerContainerRef}
      className="bg-[#EAEAE6] h-full flex flex-col overflow-y-auto font-sans text-[#1A1A1A] rounded-none"
    >
      {/* Viewport Header with Mode Switcher */}
      <div className="bg-[#FFFFFF] border-b border-[#D4AF37]/40 px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 font-mono text-xs rounded-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#8A6826]" />
            <h3 className="font-bold uppercase tracking-tight text-[#1A1A1A]">
              2.5D CAD Viewport
            </h3>
          </div>

          <div className="flex items-center bg-[#F4F4F0] border border-[#D4AF37]/40 p-0.5 ml-2 rounded-none">
            <button
              type="button"
              onClick={() => setIsConstructorMode(false)}
              className={`flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold uppercase transition rounded-none cursor-pointer ${
                !isConstructorMode
                  ? 'bg-[#D4AF37] text-[#1A1A1A] shadow-xs'
                  : 'text-[#4F4F47] hover:text-[#1A1A1A]'
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>🏢 Автоматическая схема</span>
            </button>

            <button
              type="button"
              onClick={() => setIsConstructorMode(true)}
              className={`flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold uppercase transition rounded-none cursor-pointer ${
                isConstructorMode
                  ? 'bg-[#D4AF37] text-[#1A1A1A] shadow-xs'
                  : 'text-[#4F4F47] hover:text-[#1A1A1A]'
              }`}
            >
              <Wrench className="w-3 h-3" />
              <span>🛠️ Конструктор 2.5D</span>
            </button>
          </div>
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
        </div>
      </div>

      {/* Graph Isolation Warning Banner */}
      {isIsolatedZone && (
        <div className="bg-red-900 border-b border-red-700 px-4 py-1.5 flex items-center gap-2 text-white text-xs font-bold font-mono shrink-0 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          <span>Внимание: изолированная зона. Роботы не могут построить маршрут к доку или зарядной станции.</span>
        </div>
      )}

      {/* Three.js Canvas Container (CENTER OF ZONE 2) */}
      <div
        className="relative w-full h-[480px] min-h-[380px] bg-[#EAEAE6] shrink-0 overflow-hidden"
        onMouseDown={handleMarqueeMouseDown}
        onMouseMove={handleMarqueeMouseMove}
        onMouseUp={handleMarqueeMouseUp}
      >
        {/* Floating Constructor Toolbar */}
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
            showBottleneckHeatmap={showBottleneckHeatmap}
            onToggleBottleneckHeatmap={() => setShowBottleneckHeatmap((prev) => !prev)}
            onResetGrid={handleResetGrid}
            selectedElementId={selectedTileKey}
            onRotateSelected={handleRotateSelected}
            onDeleteSelected={handleDeleteSelected}
            onOpenSkuModal={() => setIsSkuModalOpen(true)}
            onOpenSchedulePanel={() => setIsScheduleModalOpen(true)}
            selectedSkuForBox={selectedSkuForBox}
            skuList={skuList}
            onSelectSkuForBox={setSelectedSkuForBox}
            totalRacks={warehouseCapacity.totalRacks}
            totalPalletCapacity={warehouseCapacity.totalPalletCapacity}
            supplySchedule={supplySchedule}
            calculatedAreaSqm={facility.totalAreaSqm}
          />
        )}

        {/* 2D Marquee Box Overlay for Bulk SKU Assignment */}
        {marqueeBox && marqueeBox.isDragging && (
          <div
            style={{
              position: 'absolute',
              left: `${Math.min(marqueeBox.startX, marqueeBox.currentX)}px`,
              top: `${Math.min(marqueeBox.startY, marqueeBox.currentY)}px`,
              width: `${Math.abs(marqueeBox.currentX - marqueeBox.startX)}px`,
              height: `${Math.abs(marqueeBox.currentY - marqueeBox.startY)}px`,
            }}
            className="border-2 border-dashed border-[#D4AF37] bg-[#D4AF37]/20 pointer-events-none z-30"
          />
        )}

        {/* Rack Inspection Popover */}
        {selectedTileKey && (
          <RackInspectionPopover
            isOpen={true}
            onClose={() => {
              setSelectedTileKey(null);
              setPopoverPos(null);
            }}
            rackKey={selectedTileKey}
            gridX={parseInt(selectedTileKey.split('_')[0], 10)}
            gridY={parseInt(selectedTileKey.split('_')[1], 10)}
            currentSkuId={grid.elementDetails?.get(selectedTileKey)?.skuId}
            slotsPerRack={grid.elementDetails?.get(selectedTileKey)?.slotsPerRack ?? 12}
            skuList={skuList}
            onAssignSku={(key, skuId) => {
              setGrid((prev) => {
                const detailsMap = new Map(prev.elementDetails || []);
                const existing = detailsMap.get(key) || {};
                detailsMap.set(key, { ...existing, skuId });
                return { ...prev, elementDetails: detailsMap };
              });
            }}
            onDeleteRack={handleDeleteSelected}
            screenPos={popoverPos ?? undefined}
          />
        )}

        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Empty Fleet Overlay Banner */}
        {isFleetEmpty && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-6 text-center z-10 font-sans">
            <div className="bg-[#FFFFFF] border-2 border-[#D4AF37] p-6 max-w-md shadow-2xl rounded-none">
              <div className="p-3 bg-[#D4AF37]/15 text-[#8A6826] w-fit mx-auto mb-3 border border-[#D4AF37]/30 rounded-none">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-[#1A1A1A] mb-1 uppercase tracking-tight">
                Парк не сформирован
              </h4>
              <p className="text-xs text-[#4F4F47]">
                Выберите подходящее роботизированное решение или нажмите «Запустить моделирование и расчет» слева.
              </p>
            </div>
          </div>
        )}

        {/* Legend Overlay */}
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

        {/* Viewport Control Tip */}
        <div className="absolute bottom-3 right-3 bg-[#FFFFFF]/90 border border-[#D4AF37]/40 px-2.5 py-1 text-[10px] text-[#4F4F47] z-10 font-mono rounded-none">
          {isConstructorMode
            ? 'Клик для установки блока • ЛКМ: вращение • Колесо: зум • ПКМ: контекст'
            : 'ЛКМ: вращение • Колесо: зум • ПКМ: панорамирование'}
        </div>
      </div>

      {/* Simulation HUD Controls Bar (STRICTLY BELOW CANVAS) */}
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

      {/* SKU Inventory Panel Modal */}
      <SkuInventoryModal
        isOpen={isSkuModalOpen}
        onClose={() => setIsSkuModalOpen(false)}
        skuList={skuList}
        onAddSku={(newSku) => setSkuList((prev) => [...prev, newSku])}
        onDeleteSku={(id) => setSkuList((prev) => prev.filter((s) => s.id !== id))}
      />

      {/* Supply Schedule Panel Modal */}
      <SupplyScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        schedule={supplySchedule}
        onChangeSchedule={setSupplySchedule}
        totalPalletCapacity={warehouseCapacity.totalPalletCapacity}
        totalRacks={warehouseCapacity.totalRacks}
      />
    </div>
  );
}
