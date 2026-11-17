import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FloorSurface } from '../grid/gridModel';
import { GridModel } from '../grid/gridModel';
import { cellToWorld, CELL_SIZE } from '../grid/gridMath';
import { lightAt } from './roomLighting';
import type { RoomLight } from './roomLighting';
import { surfaceColor, surfaceLook, surfaceTexture } from './floorTextures';

export const FLOOR_COLOR = surfaceColor('plain');

/** How far along a road to look, each way, to tell which way it runs. */
const ROAD_LOOK = 6;

/**
 * Which way a road marking runs. A yellow line runs on into the line tiles
 * beside it; where lines meet from both ways, at a corner or crossing, it's
 * 'both', and the tile is bare asphalt. A crosswalk's stripes run across its
 * row of crosswalk tiles. A marking with nothing like it beside it to go by
 * runs along the road: the longer way the asphalt goes.
 */
function markingRuns(model: GridModel, x: number, z: number, kind: 'line' | 'crosswalk'): 'north-south' | 'east-west' | 'both' {
  const look = (dx: number, dz: number) => surfaceLook(model.getFloor(x + dx, z + dz)?.surface ?? 'plain');
  const eastWest = look(1, 0).marking === kind || look(-1, 0).marking === kind;
  const northSouth = look(0, 1).marking === kind || look(0, -1).marking === kind;
  if (kind === 'line') {
    if (eastWest && northSouth) return 'both';
    if (eastWest) return 'east-west';
    if (northSouth) return 'north-south';
  } else if (eastWest !== northSouth) {
    // The crosswalk's row goes one way, so its stripes go the other.
    return eastWest ? 'north-south' : 'east-west';
  }
  const isRoad = (dx: number, dz: number) => {
    const surface = model.getFloor(x + dx, z + dz)?.surface;
    return surface === 'asphalt' || look(dx, dz).marking !== undefined;
  };
  const reach = (dx: number, dz: number) => {
    let steps = 0;
    while (steps < ROAD_LOOK && isRoad(dx * (steps + 1), dz * (steps + 1))) steps++;
    return steps;
  };
  return reach(1, 0) + reach(-1, 0) > reach(0, 1) + reach(0, -1) ? 'east-west' : 'north-south';
}

/**
 * Renders one flat tile per floor cell in the model, folded into one shape
 * per surface, so the whole floor is drawn in a few goes however big the
 * house gets. Each tile keeps its own color, dimmed by how much light its
 * room gets. Rebuilt wholesale on every change.
 */
export class FloorBuilder {
  readonly group = new THREE.Group();
  /** Plain tiles have a hairline gap between them, as they always have. */
  private plainTile = new THREE.BoxGeometry(CELL_SIZE * 0.98, 0.06, CELL_SIZE * 0.98);
  /** Every other surface butts up to the next tile, so its pattern runs on unbroken. */
  private fullTile = new THREE.BoxGeometry(CELL_SIZE, 0.06, CELL_SIZE);
  private materials = new Map<FloorSurface, THREE.MeshStandardMaterial>();
  /** What the floor was last built from, so a rebuild that changes nothing about the tiles is skipped. */
  private built = '';

  /** `open` is the squares left as a hole, where stairs come up from the floor below. */
  rebuild(model: GridModel, light: RoomLight, open: ReadonlySet<string> = new Set()) {
    // Placing furniture or putting up a fence rebuilds the floor too; with the tiles and their light the same, there's nothing to do.
    const tiles = model.allFloors();
    const built = JSON.stringify([tiles, tiles.map((cell) => lightAt(light, model, cell)), [...open].sort()]);
    if (built === this.built) return;
    this.built = built;
    for (const child of this.group.children) (child as THREE.Mesh).geometry.dispose();
    this.group.clear();
    const bySurface = new Map<FloorSurface, THREE.BufferGeometry[]>();
    for (const cell of model.allFloors()) {
      if (open.has(`${cell.x},${cell.z}`)) continue;
      let surface = cell.surface ?? 'plain';
      // A road marking runs one way or the other, or, where lines meet, there's bare asphalt.
      const marking = surfaceLook(surface).marking;
      const runs = marking ? markingRuns(model, cell.x, cell.z, marking) : null;
      if (runs === 'both') surface = 'asphalt';
      const pos = cellToWorld(cell.x, cell.z);
      const tile = (surface === 'plain' ? this.plainTile : this.fullTile).clone().translate(pos.x, 0.03, pos.z);
      const color = new THREE.Color(cell.color ?? surfaceColor(surface)).multiplyScalar(lightAt(light, model, cell));
      const count = tile.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
      tile.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const repeat = surfaceLook(surface).cells;
      if (runs === 'north-south' || runs === 'east-west') {
        // A marking is laid square by square, its line up the picture turned to run north to south or east to west.
        const positions = tile.getAttribute('position');
        const uv = tile.getAttribute('uv');
        for (let i = 0; i < count; i++) {
          const across = positions.getX(i) - pos.x + 0.5;
          const along = -(positions.getZ(i) - pos.z) + 0.5;
          if (runs === 'north-south') uv.setXY(i, across, along);
          else uv.setXY(i, along, across);
        }
      } else if (repeat > 0) {
        // The picture is laid across the floor by where each corner is, not per tile.
        const positions = tile.getAttribute('position');
        const uv = tile.getAttribute('uv');
        for (let i = 0; i < count; i++) uv.setXY(i, (positions.getX(i) + 0.5) / repeat, -(positions.getZ(i) + 0.5) / repeat);
      }
      const list = bySurface.get(surface) ?? [];
      list.push(tile);
      bySurface.set(surface, list);
    }
    for (const [surface, tiles] of bySurface) {
      const merged = mergeGeometries(tiles);
      for (const tile of tiles) tile.dispose();
      if (merged) this.group.add(new THREE.Mesh(merged, this.material(surface)));
    }
  }

  private material(surface: FloorSurface): THREE.MeshStandardMaterial {
    let material = this.materials.get(surface);
    if (!material) {
      const map = surfaceTexture(surface);
      material = new THREE.MeshStandardMaterial({ vertexColors: true, map });
      // Carpet catches the light on its pile, and has no shine at all.
      if (surface === 'carpet') {
        material.bumpMap = map;
        material.bumpScale = 3;
        material.roughness = 1;
      }
      this.materials.set(surface, material);
    }
    return material;
  }
}
