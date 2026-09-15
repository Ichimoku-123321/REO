import type { FacilityTopology } from '../types/topology.js';

export interface SpectralAnalysisResult {
  algebraicConnectivity: number;
  criticalNodeIds: string[];
  status: 'OPTIMAL' | 'MODERATE' | 'CRITICAL';
  recommendation: string;
}

/**
 * Analyzes graph topology using spectral graph theory (Graph Laplacian & Fiedler vector).
 */
export function analyzeTopologyBottlenecks(topology: FacilityTopology): SpectralAnalysisResult {
  const nodes = topology.nodes;
  const edges = topology.edges;
  const N = nodes.length;

  if (N <= 1) {
    return {
      algebraicConnectivity: 0,
      criticalNodeIds: [],
      status: 'CRITICAL',
      recommendation: 'Недостаточно узлов графа для спектрального анализа.',
    };
  }

  const nodeIndexMap = new Map<string, number>();
  nodes.forEach((node, idx) => nodeIndexMap.set(node.id, idx));

  // Build Adjacency Matrix A and Degree Matrix D
  const A: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  const D: number[] = new Array(N).fill(0);

  for (const edge of edges) {
    const u = nodeIndexMap.get(edge.source);
    const v = nodeIndexMap.get(edge.target);
    if (u !== undefined && v !== undefined) {
      // Weight inverse to distance or standard unit weight
      const weight = 1.0 / Math.max(0.1, edge.distanceM);
      A[u][v] += weight;
      if (edge.bidirectional) {
        A[v][u] += weight;
      }
    }
  }

  for (let i = 0; i < N; i++) {
    let deg = 0;
    for (let j = 0; j < N; j++) {
      deg += A[i][j];
    }
    D[i] = deg;
  }

  // Laplacian Matrix L = D - A
  const L: number[][] = Array.from({ length: N }, (_, i) => {
    const row = new Array(N).fill(0);
    for (let j = 0; j < N; j++) {
      row[j] = i === j ? D[i] - A[i][j] : -A[i][j];
    }
    return row;
  });

  // Calculate algebraic connectivity lambda2 and Fiedler vector v2
  // We use Power Iteration on M = shift * I - L, projecting out v1 = [1, 1, ..., 1] / sqrt(N)
  let maxDegree = 0;
  for (let i = 0; i < N; i++) {
    if (D[i] > maxDegree) maxDegree = D[i];
  }

  const shift = Math.max(2.0, maxDegree * 2.5);

  // M = shift * I - L
  const M: number[][] = Array.from({ length: N }, (_, i) => {
    const row = new Array(N).fill(0);
    for (let j = 0; j < N; j++) {
      row[j] = i === j ? shift - L[i][j] : -L[i][j];
    }
    return row;
  });

  // Initial random vector for v2
  let v2 = new Array(N).fill(0).map((_, idx) => Math.sin(idx + 1.5));

  // Helper to project out v1 = ones / sqrt(N)
  const projectOutOnes = (v: number[]): number[] => {
    let mean = 0;
    for (let i = 0; i < N; i++) mean += v[i];
    mean /= N;
    return v.map((x) => x - mean);
  };

  const normalize = (v: number[]): number[] => {
    let sumSq = 0;
    for (let i = 0; i < N; i++) sumSq += v[i] * v[i];
    const norm = Math.sqrt(sumSq) || 1.0;
    return v.map((x) => x / norm);
  };

  v2 = projectOutOnes(v2);
  v2 = normalize(v2);

  // Power iteration on M
  const maxIterations = 200;
  for (let iter = 0; iter < maxIterations; iter++) {
    const nextV = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let j = 0; j < N; j++) {
        sum += M[i][j] * v2[j];
      }
      nextV[i] = sum;
    }

    let projected = projectOutOnes(nextV);
    projected = normalize(projected);

    // Check convergence
    let diff = 0;
    for (let i = 0; i < N; i++) {
      diff += Math.abs(Math.abs(projected[i]) - Math.abs(v2[i]));
    }

    v2 = projected;
    if (diff < 1e-6) break;
  }

  // Rayleigh quotient for lambda2 = v2^T * L * v2
  let lambda2 = 0;
  for (let i = 0; i < N; i++) {
    let Lv_i = 0;
    for (let j = 0; j < N; j++) {
      Lv_i += L[i][j] * v2[j];
    }
    lambda2 += v2[i] * Lv_i;
  }

  lambda2 = Math.max(0, Math.round(lambda2 * 1000) / 1000);

  // Critical nodes identification where |v2[i]| < 0.05
  const criticalNodeIds: string[] = [];
  nodes.forEach((node, idx) => {
    if (Math.abs(v2[idx]) < 0.05) {
      criticalNodeIds.push(node.id);
    }
  });

  let status: 'OPTIMAL' | 'MODERATE' | 'CRITICAL' = 'OPTIMAL';
  let recommendation = 'Топология сбалансирована, риск глобальных пробок минимален.';

  if (lambda2 < 0.15) {
    status = 'CRITICAL';
    recommendation = 'Обнаружено критическое узкое горлышко. Рекомендуется добавить параллельный проезд.';
  } else if (lambda2 < 0.35) {
    status = 'MODERATE';
    recommendation = 'Умеренная пропускная способность. Возможны локальные заторы при пиковой нагрузке.';
  }

  return {
    algebraicConnectivity: lambda2,
    criticalNodeIds,
    status,
    recommendation,
  };
}
