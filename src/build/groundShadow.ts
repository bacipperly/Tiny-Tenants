import * as THREE from 'three';
import { GridModel } from '../grid/gridModel';
import { CELL_SIZE, edgeMidpointWorld, edgeRotationY } from '../grid/gridMath';
import { getFootprintCells } from './furnitureCatalog';
import { skipPools } from './poolBuilder';

const PIXELS_PER_CELL = 24;
const MAX_TEXTURE_SIZE = 2048;
const MARGIN_CELLS = 4;
/** Far wider than a wall really is, because blurring something thin would fade its shadow to almost nothing. */
const WALL_SHADOW_WIDTH = 0.5;
/** A wide, faint falloff, then a tighter and darker line where things meet the ground. */
const SHADOW_LAYERS = [
  { blurCells: 2, alpha: 0.32 },
  { blurCells: 0.5, alpha: 0.3 },
];

/** Stored as [minX, minZ, width, depth] in world units. */
type Rect = [number, number, number, number];

/**
 * A soft dark patch on the grass around everything built, so builds look like
 * they rest on the ground. It's painted once per change rather than cast by a
 * light, so it doesn't move when the camera rotates or walls lower.
 */
export class GroundShadow {
  readonly mesh: THREE.Mesh;
  private material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  private paintedRects = '';

  constructor() {
    skipPools(this.material);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = -0.006;
    // Drawn before the window glass, which would otherwise block it from showing through.
    this.mesh.renderOrder = -1;
    this.mesh.visible = false;
  }

  rebuild(model: GridModel) {
    const rects = shadowRects(model);
    // Repainting colors doesn't change the shape, and this runs for every tile of a paint drag.
    const key = rects.join(';');
    if (key === this.paintedRects) return;
    this.paintedRects = key;

    this.mesh.visible = rects.length > 0;
    if (rects.length > 0) this.paint(rects);
  }

  private paint(rects: Rect[]) {
    const minX = Math.min(...rects.map((r) => r[0])) - MARGIN_CELLS;
    const minZ = Math.min(...rects.map((r) => r[1])) - MARGIN_CELLS;
    const width = Math.max(...rects.map((r) => r[0] + r[2])) + MARGIN_CELLS - minX;
    const depth = Math.max(...rects.map((r) => r[1] + r[3])) + MARGIN_CELLS - minZ;
    const scale = Math.min(PIXELS_PER_CELL, MAX_TEXTURE_SIZE / Math.max(width, depth));

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(depth * scale);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    // One path, so overlapping shapes merge into one shadow instead of getting darker where they overlap.
    const path = new Path2D();
    for (const [x, z, w, d] of rects) path.rect((x - minX) * scale, (z - minZ) * scale, w * scale, d * scale);

    // Canvas only blurs shadows, so the shape itself is drawn off to the side and only its shadow lands on the canvas.
    const offscreen = canvas.width * 2;
    ctx.translate(-offscreen, 0);
    ctx.shadowOffsetX = offscreen;
    for (const layer of SHADOW_LAYERS) {
      ctx.shadowBlur = layer.blurCells * scale;
      ctx.shadowColor = `rgba(0, 0, 0, ${layer.alpha})`;
      ctx.fill(path);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    this.material.map?.dispose();
    this.material.map = texture;
    this.material.needsUpdate = true;

    this.mesh.position.x = minX + width / 2;
    this.mesh.position.z = minZ + depth / 2;
    this.mesh.scale.set(width, depth, 1);
  }
}

function shadowRects(model: GridModel): Rect[] {
  const rects: Rect[] = [];
  for (const cell of model.allFloors()) rects.push(cellRect(cell.x, cell.z));
  for (const piece of model.allFurniture()) {
    for (const cell of getFootprintCells(piece.type, piece.x, piece.z, piece.rotation)) rects.push(cellRect(cell.x, cell.z));
  }
  for (const wall of model.allWalls()) {
    const middle = edgeMidpointWorld(wall.x, wall.z, wall.dir);
    const runsAlongX = edgeRotationY(wall.dir) === 0;
    const width = runsAlongX ? CELL_SIZE : WALL_SHADOW_WIDTH;
    const depth = runsAlongX ? WALL_SHADOW_WIDTH : CELL_SIZE;
    rects.push([middle.x - width / 2, middle.z - depth / 2, width, depth]);
  }
  return rects;
}

function cellRect(x: number, z: number): Rect {
  return [x - CELL_SIZE / 2, z - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE];
}
