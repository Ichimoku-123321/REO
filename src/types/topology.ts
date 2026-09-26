import { z } from 'zod';

export const nodeTypeSchema = z.enum([
  'INBOUND_DOCK',
  'OUTBOUND_DOCK',
  'STORAGE_AISLE',
  'CHARGING_HUB',
  'WAYPOINT',
]);

export type NodeType = z.infer<typeof nodeTypeSchema>;

export const graphNodeSchema = z.object({
  id: z.string(),
  type: nodeTypeSchema,
  x: z.number(),
  y: z.number(),
  zLevel: z.number().default(0),
  label: z.string().optional(),
  skuId: z.string().optional(),
  capacity: z.number().optional(),
});

export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  distanceM: z.number().positive(),
  bidirectional: z.boolean().default(true),
});

export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const facilityZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: nodeTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  color: z.string(),
});

export type FacilityZone = z.infer<typeof facilityZoneSchema>;

export const obstacleBoxSchema = z.object({
  minX: z.number(),
  maxX: z.number(),
  minY: z.number(),
  maxY: z.number(),
});

export type ObstacleBox = z.infer<typeof obstacleBoxSchema>;

export const facilityTopologySchema = z.object({
  widthM: z.number().positive(),
  lengthM: z.number().positive(),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  zones: z.array(facilityZoneSchema),
  obstacles: z.array(obstacleBoxSchema).optional(),
});

export type FacilityTopology = z.infer<typeof facilityTopologySchema>;
