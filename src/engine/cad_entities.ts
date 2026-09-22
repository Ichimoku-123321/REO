import type { ConstructorGrid } from './constructor_engine.js';

export abstract class WarehouseElement {
  abstract readonly type: string;
  abstract readonly hasInspection: boolean;
  abstract readonly colorHex: number;
  rotationDeg: number = 0;

  constructor(public x: number, public z: number) {}
}

// STORAGE BRANCH: Units that hold inventory and pallets (Racks, Safes, Lockers)
export class StorageElement extends WarehouseElement {
  readonly hasInspection = true;

  constructor(
    x: number,
    z: number,
    public slotsPerRack: number = 12,
    public skuId: string | null = null,
    public readonly type: string = 'RACK',
    public readonly colorHex: number = 0x334155
  ) {
    super(x, z);
  }
}

export class RackEntity extends StorageElement {
  constructor(x: number, z: number, slots = 12, skuId: string | null = null) {
    super(x, z, slots, skuId, 'RACK', 0x334155);
  }
}

// INFRASTRUCTURE BRANCH: Static obstacles, chargers, docks (No inspection popover)
export class WallEntity extends WarehouseElement {
  readonly type = 'OBSTACLE';
  readonly hasInspection = false;
  readonly colorHex = 0xef4444;
}

export class ChargerEntity extends WarehouseElement {
  readonly type = 'CHARGER';
  readonly hasInspection = false;
  readonly colorHex = 0xf59e0b;
}

export abstract class DockEntity extends WarehouseElement {
  readonly hasInspection = false;
  static readonly maxInstances = 1;
}

export class InboundDockEntity extends DockEntity {
  readonly type = 'DOCK_INBOUND';
  readonly colorHex = 0x10b981; // Emerald Green
}

export class OutboundDockEntity extends DockEntity {
  readonly type = 'DOCK_OUTBOUND';
  readonly colorHex = 0x0284c7; // Sky Blue
}

/**
 * Transforms a ConstructorGrid state into a map of OOP WarehouseElement class instances.
 */
export function buildElementsMap(grid: ConstructorGrid): Map<string, WarehouseElement> {
  const elementsMap = new Map<string, WarehouseElement>();

  grid.tiles.forEach((tileType, key) => {
    if (!tileType || tileType === 'EMPTY_FLOOR') return;

    const [gxStr, gyStr] = key.split('_');
    const gx = parseInt(gxStr, 10);
    const gy = parseInt(gyStr, 10);
    const x = (gx + 0.5) * grid.cellSizeM;
    const z = (gy + 0.5) * grid.cellSizeM;

    const details = grid.elementDetails?.get(key);
    const rotationDeg = details?.rotationDeg ?? 0;

    let element: WarehouseElement | null = null;

    switch (tileType) {
      case 'RACK': {
        const slots = details?.slotsPerRack ?? 12;
        const skuId = details?.skuId ?? null;
        element = new RackEntity(x, z, slots, skuId);
        break;
      }
      case 'OBSTACLE': {
        element = new WallEntity(x, z);
        break;
      }
      case 'CHARGER': {
        element = new ChargerEntity(x, z);
        break;
      }
      case 'DOCK_INBOUND': {
        element = new InboundDockEntity(x, z);
        break;
      }
      case 'DOCK_OUTBOUND': {
        element = new OutboundDockEntity(x, z);
        break;
      }
    }

    if (element) {
      element.rotationDeg = rotationDeg;
      elementsMap.set(key, element);
    }
  });

  return elementsMap;
}
