import * as THREE from 'three';
import type { GridModel } from '../grid/gridModel';
import { LEVEL_HEIGHT } from '../grid/gridMath';
import { stairCells } from '../grid/house';
import type { RoofLook } from '../grid/house';
import { WallBuilder } from './wallBuilder';
import { FloorBuilder } from './floorBuilder';
import { FurniturePlacer } from './furniturePlacer';
import { FurnitureLights } from './furnitureLights';
import { RoofBuilder } from './roofBuilder';
import { FenceBuilder } from './fenceBuilder';
import { PillarBuilder } from './pillarBuilder';
import { PoolBuilder } from './poolBuilder';
import { RoomOverlay } from './roomOverlay';
import { Sunlight } from './sunlight';
import { computeRoomLight } from './roomLighting';
import type { RoomLight } from './roomLighting';

/**
 * Everything drawn for one floor of the house, raised to that floor's
 * height: its walls, floor tiles, furniture and the light from its lamps,
 * the sun through its windows, its rooms when they're shown, and its roof.
 */
export class LevelView {
  readonly group = new THREE.Group();
  readonly walls = new WallBuilder();
  readonly floors = new FloorBuilder();
  readonly furniture = new FurniturePlacer();
  readonly lights = new FurnitureLights();
  readonly roof = new RoofBuilder();
  readonly fences = new FenceBuilder();
  readonly pillars = new PillarBuilder();
  /** Pools and spas, only ever on the ground floor. */
  readonly pools = new PoolBuilder();
  readonly rooms = new RoomOverlay();
  readonly sunlight = new Sunlight();
  /** How much daylight each of this floor's rooms gets, as of the last rebuild. */
  light: RoomLight = new Map();
  readonly level: number;

  constructor(level: number) {
    this.level = level;
    this.group.position.y = level * LEVEL_HEIGHT;
    this.rooms.group.visible = false;
    this.roof.group.visible = false;
    this.group.add(this.walls.group, this.fences.group, this.pillars.group, this.pools.group, this.floors.group, this.rooms.group, this.furniture.group, this.lights.group, this.roof.group, this.sunlight.mesh);
  }

  /** Builds the whole floor again. `below` and `above` are the floors either side of it, if there are any. */
  rebuild(model: GridModel, below: GridModel | null, above: GridModel | null, realLights: number, roof: RoofLook) {
    this.light = computeRoomLight(model);
    this.walls.rebuild(model, this.light);
    this.pillars.rebuild(model);
    this.pools.rebuild(model);
    this.rebuildFloors(model, below);
    this.furniture.rebuild(model, this.light);
    this.lights.rebuild(model, this.light, realLights);
    this.rooms.rebuild(model);
    this.rebuildRoof(model, above, roof);
    this.sunlight.rebuild(model);
  }

  /** Just the tiles: stairs coming up from the floor below leave a hole. */
  rebuildFloors(model: GridModel, below: GridModel | null) {
    this.floors.rebuild(model, this.light, below ? stairCells(below) : new Set());
  }

  /** Just the roof: none where the floor above is built over, and none over stairs, which open up through it to the floor above. */
  rebuildRoof(model: GridModel, above: GridModel | null, look: RoofLook) {
    const covered = new Set([...(above?.allFloors() ?? []).map((cell) => `${cell.x},${cell.z}`), ...stairCells(model)]);
    this.roof.rebuild(model, covered, look);
  }
}
