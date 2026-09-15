import { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FacilityRequirements } from '../types/facility.js';
import { generateFacilityTopology } from '../engine/topology_generator.js';
import type { FacilityTopology, NodeType } from '../types/topology.js';
import { Layers, MapPin, Navigation, Maximize2 } from 'lucide-react';

interface SimulationViewportProps {
  facility: FacilityRequirements;
}

export function SimulationViewport({ facility }: SimulationViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const topology: FacilityTopology = useMemo(() => {
    return generateFacilityTopology(facility);
  }, [facility]);

  const totalPathLengthM = useMemo(() => {
    return Math.round(
      topology.edges.reduce((sum, edge) => sum + edge.distanceM, 0)
    );
  }, [topology]);

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

    // 2. Camera setup (Orthographic Camera for 2.5D)
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

    // Position camera top-down with 20° isometric pitch
    // 20 degrees off vertical -> Y pitch
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
    controls.minPolarAngle = Math.PI / 8; // ~22.5 deg
    controls.maxPolarAngle = Math.PI / 3.2; // ~56 deg
    controls.update();

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

    // 6. Base Floor Construction
    const floorGeo = new THREE.PlaneGeometry(topology.widthM, topology.lengthM);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // slate-800
      roughness: 0.8,
      metalness: 0.1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(centerX, -0.01, centerZ);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Floor Grid Helper
    const gridHelper = new THREE.GridHelper(
      Math.max(topology.widthM, topology.lengthM),
      Math.max(10, Math.floor(Math.max(topology.widthM, topology.lengthM) / 5)),
      0x475569,
      0x334155
    );
    gridHelper.position.set(centerX, 0, centerZ);
    scene.add(gridHelper);

    // 7. Functional Zones Floor Patches & Extrusions
    topology.zones.forEach((zone) => {
      // Zone Floor Patch
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

      // If Storage Zone: generate 2.5D extruded rack boxes
      if (zone.type === 'STORAGE_AISLE') {
        const rackHeight = Math.min(4, facility.ceilingHeightM * 0.6);
        const rackGroup = new THREE.Group();

        // Create discrete parallel rack blocks
        const rackRows = 4;
        const rowHeight = (zone.height - 2) / rackRows;
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

          // Rack wireframe outline
          const rackEdges = new THREE.EdgesGeometry(rackGeo);
          const rackLineMat = new THREE.LineBasicMaterial({
            color: 0x64748b,
          });
          const rackLine = new THREE.LineSegments(rackEdges, rackLineMat);
          rackLine.position.copy(rackMesh.position);
          rackGroup.add(rackLine);
        }
        scene.add(rackGroup);
      }
    });

    // 8. Transit Waypoint Paths (Graph Edges Overlay)
    const nodeMap = new Map(topology.nodes.map((n) => [n.id, n]));

    topology.edges.forEach((edge) => {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) return;

      const points = [
        new THREE.Vector3(src.x, 0.1, src.y),
        new THREE.Vector3(tgt.x, 0.1, tgt.y),
      ];
      const edgeGeo = new THREE.BufferGeometry().setFromPoints(points);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8, // sky blue
        transparent: true,
        opacity: 0.6,
        linewidth: 2,
      });
      const line = new THREE.Line(edgeGeo, edgeMat);
      scene.add(line);
    });

    // 9. Node Markers (Docks, Charging Hubs, Waypoints)
    const getNodeColor = (type: NodeType): number => {
      switch (type) {
        case 'INBOUND_DOCK':
          return 0x3b82f6; // blue
        case 'OUTBOUND_DOCK':
          return 0x0284c7; // sky blue
        case 'CHARGING_HUB':
          return 0xf59e0b; // amber
        case 'STORAGE_AISLE':
          return 0x10b981; // emerald
        case 'WAYPOINT':
        default:
          return 0x94a3b8; // slate-400
      }
    };

    topology.nodes.forEach((node) => {
      const color = getNodeColor(node.type);

      if (node.type === 'WAYPOINT') {
        // Small waypoint dot
        const dotGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8);
        const dotMat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.3,
        });
        const dotMesh = new THREE.Mesh(dotGeo, dotMat);
        dotMesh.position.set(node.x, 0.05, node.y);
        scene.add(dotMesh);
      } else {
        // Prominent 3D marker cylinder/pin for key functional nodes
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

        // Top cap indicator
        const capGeo = new THREE.SphereGeometry(0.5, 12, 12);
        const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const capMesh = new THREE.Mesh(capGeo, capMat);
        capMesh.position.set(node.x, 0.9, node.y);
        scene.add(capMesh);
      }
    });

    // 10. Animation & Resize loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
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
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
    };
  }, [topology, facility]);

  const getFacilityTypeNameRu = (type: string) => {
    switch (type) {
      case 'warehouse':
        return 'Складской комплекс';
      case 'airport':
        return 'Аэропортовый терминал';
      case 'hospital':
        return 'Больничный комплекс';
      case 'custom':
      default:
        return 'Производственный объект';
    }
  };

  return (
    <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl mb-8">
      {/* Header telemetry bar */}
      <div className="bg-slate-900/90 border-b border-slate-700/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-bold text-slate-100">
              2.5D Интерактивная топология объекта
            </h3>
            <span className="text-xs bg-blue-500/20 text-blue-400 font-semibold px-2.5 py-0.5 rounded border border-blue-500/30">
              {getFacilityTypeNameRu(facility.industry)}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Процедурная генерация графа путей, функциональных зон и зарядной инфраструктуры
          </p>
        </div>

        {/* Dimension & Graph Metrics Badges */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-2 text-slate-300">
            <Maximize2 className="w-4 h-4 text-emerald-400" />
            <span>
              Габариты:{' '}
              <strong className="text-white">
                {topology.widthM} × {topology.lengthM} м
              </strong>{' '}
              ({facility.totalAreaSqm.toLocaleString('ru-RU')} м²)
            </span>
          </div>

          <div className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-2 text-slate-300">
            <MapPin className="w-4 h-4 text-purple-400" />
            <span>
              Активных зон:{' '}
              <strong className="text-white">{topology.zones.length}</strong>
            </span>
          </div>

          <div className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-2 text-slate-300">
            <Navigation className="w-4 h-4 text-sky-400" />
            <span>
              Транзитные трассы:{' '}
              <strong className="text-white">{totalPathLengthM} м</strong> (
              {topology.nodes.length} узлов)
            </span>
          </div>
        </div>
      </div>

      {/* Three.js Canvas Container */}
      <div className="relative w-full h-[520px] bg-slate-950">
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Legend Overlay */}
        <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700/80 rounded-lg p-3 backdrop-blur text-xs flex flex-wrap gap-4 text-slate-300 shadow-lg">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-blue-500" />
            <span>Зона приемки (Inbound)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-sky-600" />
            <span>Зона отгрузки (Outbound)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-slate-600" />
            <span>Стеллажный комплекс</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-amber-500" />
            <span>Зарядный хаб</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-sky-400" />
            <span>Транзитные трассы</span>
          </div>
        </div>

        {/* Viewport Control Tip */}
        <div className="absolute bottom-4 right-4 bg-slate-900/80 border border-slate-700/60 rounded-lg px-3 py-1.5 text-[11px] text-slate-400">
          Зажмите ЛКМ для вращения • Колесо для зума • ПКМ для панорамирования
        </div>
      </div>
    </div>
  );
}
