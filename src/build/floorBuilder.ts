import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FloorSurface } from '../grid/gridModel';
import { GridModel } from '../grid/gridModel';
import { cellToWorld, CELL_SIZE } from '../grid/gridMath';
import { lightAt } from './roomLighting';
import type { RoomLight } from './roomLighting';
import { surfaceColor, surfaceLook, surfaceTexture } from './floorTextures';

export const FLOOR_COLOR = surfaceColor('plain');

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

  /** `open` is the squares left as a hole, where stairs come up from the floor below. */
  rebuild(model: GridModel, light: RoomLight, open: ReadonlySet<string> = new Set()) {
    for (const child of this.group.children) (child as THREE.Mesh).geometry.dispose();
    this.group.clear();
    const bySurface = new Map<FloorSurface, THREE.BufferGeometry[]>();
    for (const cell of model.allFloors()) {
      if (open.has(`${cell.x},${cell.z}`)) continue;
      const surface = cell.surface ?? 'plain';
      const pos = cellToWorld(cell.x, cell.z);
      const tile = (surface === 'plain' ? this.plainTile : this.fullTile).clone().translate(pos.x, 0.03, pos.z);
      const color = new THREE.Color(cell.color ?? surfaceColor(surface)).multiplyScalar(lightAt(light, model, cell));
      const count = tile.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
      tile.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const repeat = surfaceLook(surface).cells;
      if (repeat > 0) {
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
