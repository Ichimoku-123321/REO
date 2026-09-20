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
  type ConstructorGrid,
  type ConstructorTileType,
} from '../engine/constructor_engine.js';
import { SimulationControls } from './SimulationControls.js';
import { ConstructorToolbar } from './ConstructorToolbar.js';
import { audioEngine } from '../engine/audio_synth.js';
import { Layers, MapPin, Navigation, Maximize2, AlertCircle, Wrench, Building2, AlertTriangle } from 'lucide-react';

interface SimulationViewportProps {
  facility: FacilityRequirements;
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
  fleetConfig,
  fleetSize,
  targetThroughputPerHour,
  replayFrames = [],
}: SimulationViewportProps) {
  const outerContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Viewport mode: Automatic vs Interactive Constructor
  const [isConstructorMode, setIsConstructorMode] = useState<boolean>(false);
  const [selectedTileType, setSelectedTileType] = useState<ConstructorTileType>('RACK');
  const [showBottleneckHeatmap, setShowBottleneckHeatmap] = useState<boolean>(false);

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
  }, [facilityDims, facility.totalAreaSqm]);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous elements
    container.innerHTML = '';

    const width = container.clientWidth;
    const height = container.clientHeight || 500;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a'); // slate-900

    // 2. Camera setup (Orthographic Camera for 2.5D isometric view)
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
    const pitchAngleRad = THREE.MathUtils.degToRad(25);

    camera.position.set(
      centerX,
      cameraDistance * Math.cos(pitchAngleRad),
      centerZ + cameraDistance * Math.sin(pitchAngleRad)
    );
    camera.lookAt(centerX, 0, centerZ);

    // 3. Renderer setup
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

    // Raycaster for Grid Tile Interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(centerX - 20, 40, centerZ - 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    dirLight.shadow.camera.left = -viewSize;
    dirLight.shadow.camera.right = viewSize;
    dirLight.shadow.camera.top = viewSize;
    dirLight.shadow.camera.bottom = -viewSize;
    scene.add(dirLight);

    // 6. Industrial CAD Floor Plane
    const floorGeo = new THREE.PlaneGeometry(topology.widthM, topology.lengthM);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // slate-800 CAD floor
      roughness: 0.8,
      metalness: 0.1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(centerX, -0.01, centerZ);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Clean Subtle Floor Grid Helper
    const gridHelper = new THREE.GridHelper(
      Math.max(topology.widthM, topology.lengthM),
      Math.max(10, Math.floor(Math.max(topology.widthM, topology.lengthM) / (isConstructorMode ? grid.cellSizeM : 5))),
      0x475569,
      0x334155
    );
    gridHelper.position.set(centerX, 0, centerZ);
    scene.add(gridHelper);

    // Constructor Interactive Tile Rendering
    if (isConstructorMode) {
      grid.tiles.forEach((type, key) => {
        const [gxStr, gyStr] = key.split('_');
        const gx = parseInt(gxStr, 10);
        const gy = parseInt(gyStr, 10);
        const tileX = (gx + 0.5) * grid.cellSizeM;
        const tileY = (gy + 0.5) * grid.cellSizeM;

        if (type === 'RACK') {
          const rackGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.85, 2.2, grid.cellSizeM * 0.85);
          const rackMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.3 });
          const rackMesh = new THREE.Mesh(rackGeo, rackMat);
          rackMesh.position.set(tileX, 1.1, tileY);
          rackMesh.castShadow = true;
          rackMesh.receiveShadow = true;
          scene.add(rackMesh);

          const rackEdges = new THREE.EdgesGeometry(rackGeo);
          const rackLineMat = new THREE.LineBasicMaterial({ color: 0x64748b });
          const rackLine = new THREE.LineSegments(rackEdges, rackLineMat);
          rackLine.position.copy(rackMesh.position);
          scene.add(rackLine);
        } else if (type === 'OBSTACLE') {
          const obsGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.9, 3.0, grid.cellSizeM * 0.9);
          const obsMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.1 });
          const obsMesh = new THREE.Mesh(obsGeo, obsMat);
          obsMesh.position.set(tileX, 1.5, tileY);
          obsMesh.castShadow = true;
          scene.add(obsMesh);
        } else if (type === 'CHARGER') {
          const cGeo = new THREE.CylinderGeometry(grid.cellSizeM * 0.35, grid.cellSizeM * 0.35, 0.4, 16);
          const cMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.3 });
          const cMesh = new THREE.Mesh(cGeo, cMat);
          cMesh.position.set(tileX, 0.2, tileY);
          scene.add(cMesh);
        } else if (type === 'DOCK_INBOUND') {
          const dGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.9, 0.1, grid.cellSizeM * 0.9);
          const dMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.6 });
          const dMesh = new THREE.Mesh(dGeo, dMat);
          dMesh.position.set(tileX, 0.02, tileY);
          scene.add(dMesh);
        } else if (type === 'DOCK_OUTBOUND') {
          const dGeo = new THREE.BoxGeometry(grid.cellSizeM * 0.9, 0.1, grid.cellSizeM * 0.9);
          const dMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, transparent: true, opacity: 0.6 });
          const dMesh = new THREE.Mesh(dGeo, dMat);
          dMesh.position.set(tileX, 0.02, tileY);
          scene.add(dMesh);
        }
      });
    }

    // 7. Automatic Mode Functional Zones Floor Patches & Extrusions
    if (!isConstructorMode) {
      topology.zones.forEach((zone) => {
        const zoneGeo = new THREE.PlaneGeometry(zone.width, zone.height);
        const zoneMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(zone.color),
          transparent: true,
          opacity: 0.35,
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

        // Border outline for Zone
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

        // Extruded Storage Rack Blocks
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

              const rackEdges = new THREE.EdgesGeometry(rackGeo);
              const rackLineMat = new THREE.LineBasicMaterial({ color: 0x64748b });
              const rackLine = new THREE.LineSegments(rackEdges, rackLineMat);
              rackLine.position.copy(rackMesh.position);
              rackGroup.add(rackLine);
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

              const rackEdges = new THREE.EdgesGeometry(rackGeo);
              const rackLineMat = new THREE.LineBasicMaterial({ color: 0x64748b });
              const rackLine = new THREE.LineSegments(rackEdges, rackLineMat);
              rackLine.position.copy(rackMesh.position);
              rackGroup.add(rackLine);
            }
          }
          scene.add(rackGroup);
        }
      });
    }

    // 8. Infrastructure Destination Markers (Inbound, Outbound, Charging Docks)
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
      if (node.type === 'WAYPOINT') {
        return;
      }

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

      const capGeo = new THREE.SphereGeometry(0.5, 12, 12);
      const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.set(node.x, 0.9, node.y);
      scene.add(capMesh);
    });

    // Visual Bottleneck Heatmap Overlay
    if (showBottleneckHeatmap) {
      const criticalSet = new Set(spectralAnalysis.criticalNodeIds);
      topology.nodes.forEach((node) => {
        if (criticalSet.has(node.id)) {
          const ringGeo = new THREE.RingGeometry(1.0, 1.8, 32);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0xef4444, // Glowing Red
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
          });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.rotation.x = -Math.PI / 2;
          ringMesh.position.set(node.x, 0.15, node.y);
          scene.add(ringMesh);

          const innerRingGeo = new THREE.RingGeometry(1.8, 2.3, 32);
          const innerRingMat = new THREE.MeshBasicMaterial({
            color: 0xf59e0b, // Amber
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
          });
          const innerRingMesh = new THREE.Mesh(innerRingGeo, innerRingMat);
          innerRingMesh.rotation.x = -Math.PI / 2;
          innerRingMesh.position.set(node.x, 0.14, node.y);
          scene.add(innerRingMesh);
        }
      });
    }

    // 9. Dynamic Robot Fleet Meshes Map
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
      if (a0.isDeadlocked) {
        return 0xef4444; // Red for deadlock
      }
      const hasActiveTask = a0.state !== 'IDLE' && a0.state !== 'CHARGING';
      const isSlowMoving = hasActiveTask && typeof a0.speedMps === 'number' && a0.speedMps < 0.05;
      if (a0.isQueued || isSlowMoving) {
        return 0xf59e0b; // Yellow/Amber for queue or slow movement
      }
      switch (a0.state) {
        case 'TRANSPORTING':
        case 'MOVING_TO_PICKUP':
          return 0x10b981; // Green for normal moving
        case 'LOADING':
        case 'UNLOADING':
          return 0xf59e0b; // Amber
        case 'MOVING_TO_CHARGE':
        case 'CHARGING':
          return 0x06b6d4; // Cyan
        case 'IDLE':
        default:
          return 0x64748b; // Slate
      }
    };

    const createRobotMeshGroup = (): AgentMeshGroup => {
      const group = new THREE.Group();

      const chassisGeo = new THREE.BoxGeometry(1.2, 0.4, 1.2);
      const chassisMat = new THREE.MeshStandardMaterial({
        color: 0x2563eb, // blue-600 AMR chassis
        roughness: 0.3,
        metalness: 0.6,
      });
      const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
      chassisMesh.position.y = 0.2;
      chassisMesh.castShadow = true;
      chassisMesh.receiveShadow = true;
      group.add(chassisMesh);

      const noseGeo = new THREE.BoxGeometry(0.3, 0.2, 0.3);
      const noseMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0 });
      const noseMesh = new THREE.Mesh(noseGeo, noseMat);
      noseMesh.position.set(0.5, 0.3, 0);
      group.add(noseMesh);

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
        color: 0x0284c7, // Sky blue cargo crate
        roughness: 0.5,
        metalness: 0.2,
      });
      const cargoMesh = new THREE.Mesh(cargoGeo, cargoMat);
      cargoMesh.position.set(0, 0.7, 0);
      cargoMesh.castShadow = true;
      cargoMesh.visible = false;
      group.add(cargoMesh);

      scene.add(group);

      return { group, chassisMesh, haloMesh, cargoMesh, haloMat };
    };

    // Constructor Click Handler
    const handleCanvasPointerDown = (event: MouseEvent) => {
      if (!isConstructorMode) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(floorMesh);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        const gx = Math.floor(point.x / grid.cellSizeM);
        const gy = Math.floor(point.z / grid.cellSizeM);

        if (gx >= 0 && gx < grid.cols && gy >= 0 && gy < grid.rows) {
          const key = getTileKey(gx, gy);
          setGrid((prev) => {
            const updated = new Map(prev.tiles);
            updated.set(key, selectedTileType);
            return { ...prev, tiles: updated };
          });
        }
      }
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', handleCanvasPointerDown);

    // 10. Animation Loop: Interpolates from replayFrames or runs real-time physics fallback
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
            nextTime = 0; // Loop back to start
          }

          // Replay Frames Interpolation Logic
          if (replayFrames && replayFrames.length > 0) {
            const frameIndex = Math.min(
              replayFrames.length - 2,
              Math.max(0, Math.floor(nextTime * 2))
            );

            const frame0 = replayFrames[frameIndex];
            const frame1 = replayFrames[frameIndex + 1] || frame0;

            const alpha = Math.max(0, Math.min(1, (nextTime - frame0.timestampSec) / 0.5));

            // Trigger audio events on frame index transition
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

            // Interpolate agent positions & headings
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

        // Telemetry update interval throttled to 300ms (3.33Hz)
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
      domElem.removeEventListener('pointerdown', handleCanvasPointerDown);
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
    grid,
    selectedTileType,
    showBottleneckHeatmap,
    spectralAnalysis,
    replayFrames,
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

  return (
    <div
      ref={outerContainerRef}
      className="bg-slate-900 h-full flex flex-col overflow-y-auto"
    >
      {/* Viewport Header with Mode Switcher */}
      <div className="bg-slate-900/95 border-b border-slate-700/80 px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-tight text-slate-100">
              2.5D CAD Viewport
            </h3>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="flex items-center bg-slate-800 border border-slate-700 p-0.5 ml-2">
            <button
              type="button"
              onClick={() => setIsConstructorMode(false)}
              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold transition-all ${
                !isConstructorMode
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>🏢 Автоматическая схема</span>
            </button>

            <button
              type="button"
              onClick={() => setIsConstructorMode(true)}
              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold transition-all ${
                isConstructorMode
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wrench className="w-3 h-3" />
              <span>🛠️ Конструктор 2.5D</span>
            </button>
          </div>
        </div>

        {/* Dimension & Graph Metrics Badges */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <div className="bg-slate-800 border border-slate-700 px-2 py-1 flex items-center gap-1.5 text-slate-300">
            <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Габариты:{' '}
              <strong className="text-white">
                {topology.widthM} × {topology.lengthM} м
              </strong>
            </span>
          </div>

          <div className="bg-slate-800 border border-slate-700 px-2 py-1 flex items-center gap-1.5 text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-purple-400" />
            <span>
              Зон: <strong className="text-white">{topology.zones.length}</strong>
            </span>
          </div>

          <div className="bg-slate-800 border border-slate-700 px-2 py-1 flex items-center gap-1.5 text-slate-300">
            <Navigation className="w-3.5 h-3.5 text-sky-400" />
            <span>
              Трассы:{' '}
              <strong className="text-white">{totalPathLengthM} м</strong> (
              {topology.nodes.length} узлов)
            </span>
          </div>
        </div>
      </div>

      {/* Graph Isolation Warning Banner */}
      {isIsolatedZone && (
        <div className="bg-red-950/90 border-b border-red-800/80 px-4 py-1.5 flex items-center gap-2 text-red-200 text-xs font-bold animate-pulse shrink-0">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>Внимание: изолированная зона. Роботы не могут построить маршрут к доку или зарядной станции.</span>
        </div>
      )}

      {/* Three.js Canvas Container (CENTER OF ZONE 2) */}
      <div className="relative w-full h-[450px] min-h-[350px] bg-slate-950 shrink-0">
        {/* Floating Constructor Toolbar */}
        {isConstructorMode && (
          <ConstructorToolbar
            selectedTileType={selectedTileType}
            onSelectTileType={setSelectedTileType}
            showBottleneckHeatmap={showBottleneckHeatmap}
            onToggleBottleneckHeatmap={() => setShowBottleneckHeatmap((prev) => !prev)}
            onResetGrid={handleResetGrid}
          />
        )}

        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Empty Fleet Overlay Banner */}
        {isFleetEmpty && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 text-center z-10">
            <div className="bg-slate-900 border border-amber-500/40 p-6 max-w-md shadow-2xl">
              <div className="p-3 bg-amber-500/10 text-amber-400 w-fit mx-auto mb-3 border border-amber-500/20">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-slate-100 mb-1">
                Парк не сформирован
              </h4>
              <p className="text-xs text-slate-400">
                Выберите подходящее роботизированное решение или нажмите «Запустить моделирование и расчет» слева.
              </p>
            </div>
          </div>
        )}

        {/* Legend Overlay */}
        <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-700/80 p-2 backdrop-blur text-[11px] flex flex-wrap gap-3 text-slate-300 shadow-md z-10 font-mono">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>В пути</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Погрузка/Ожидание</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
            <span>Зарядка</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2 bg-sky-500" />
            <span>Груз</span>
          </div>
        </div>

        {/* Viewport Control Tip */}
        <div className="absolute bottom-3 right-3 bg-slate-900/80 border border-slate-700/60 px-2.5 py-1 text-[10px] text-slate-400 z-10">
          {isConstructorMode
            ? 'Клик для установки блока • ЛКМ: вращение • Колесо: зум'
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
    </div>
  );
}
