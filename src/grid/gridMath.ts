import * as THREE from 'three';
import type { Direction } from './gridModel';

/** World units per grid cell. */
export const CELL_SIZE = 1;
export const WALL_HEIGHT = 2;
/** How far each floor of the house is above the one below: a wall's height, so it sits on the walls under it. */
export const LEVEL_HEIGHT = WALL_HEIGHT;
export const WALL_THICKNESS = 0.08;

/** The buildable lot, in cells; both values are inclusive. */
export const LOT_MIN_CELL = -32;
export const LOT_MAX_CELL = 31;

export function isCellInLot(x: number, z: number): boolean {
  return x >= LOT_MIN_CELL && x <= LOT_MAX_CELL && z >= LOT_MIN_CELL && z <= LOT_MAX_CELL;
}

export function clampCellToLot(cell: { x: number; z: number }): { x: number; z: number } {
  return {
    x: Math.min(LOT_MAX_CELL, Math.max(LOT_MIN_CELL, cell.x)),
    z: Math.min(LOT_MAX_CELL, Math.max(LOT_MIN_CELL, cell.z)),
  };
}

/** Corners are where grid lines cross. Corner (x,z) is the low-x, low-z corner of cell (x,z). */
export function worldToCorner(worldX: number, worldZ: number): { x: number; z: number } {
  return { x: Math.round(worldX / CELL_SIZE + 0.5), z: Math.round(worldZ / CELL_SIZE + 0.5) };
}

export function cornerToWorld(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3((x - 0.5) * CELL_SIZE, 0, (z - 0.5) * CELL_SIZE);
}

export function isCornerInLot(x: number, z: number): boolean {
  return x >= LOT_MIN_CELL && x <= LOT_MAX_CELL + 1 && z >= LOT_MIN_CELL && z <= LOT_MAX_CELL + 1;
}

export function clampCornerToLot(corner: { x: number; z: number }): { x: number; z: number } {
  return {
    x: Math.min(LOT_MAX_CELL + 1, Math.max(LOT_MIN_CELL, corner.x)),
    z: Math.min(LOT_MAX_CELL + 1, Math.max(LOT_MIN_CELL, corner.z)),
  };
}

export function cellToWorld(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x * CELL_SIZE, 0, z * CELL_SIZE);
}

export function worldToCell(worldX: number, worldZ: number): { x: number; z: number } {
  return { x: Math.round(worldX / CELL_SIZE), z: Math.round(worldZ / CELL_SIZE) };
}

/** Nearest grid edge to a world point. A cell (x,z) is CENTERED at world (x,z)
 * and spans [x-0.5, x+0.5] on each axis (same convention floor tiles and
 * furniture use) — so the cell's own edges sit at a half-cell offset from its
 * center, not a full cell away. Picks whichever axis the point is closer to
 * an edge on, then returns the edge on the near side along that axis. */
export function worldToEdge(worldX: number, worldZ: number): { x: number; z: number; dir: Direction } {
  const cellX = Math.round(worldX / CELL_SIZE);
  const cellZ = Math.round(worldZ / CELL_SIZE);
  const fx = worldX / CELL_SIZE - cellX; // offset from cell center, in [-0.5, 0.5]
  const fz = worldZ / CELL_SIZE - cellZ;

  if (Math.abs(fx) > Math.abs(fz)) {
    const dir: Direction = fx >= 0 ? 'E' : 'W';
    return { x: cellX, z: cellZ, dir };
  }
  const dir: Direction = fz >= 0 ? 'N' : 'S';
  return { x: cellX, z: cellZ, dir };
}

/** World-space midpoint of a wall edge, using the same centered-cell
 * convention as cellToWorld: the N/S edges of cell (x,z) sit at
 * z ± CELL_SIZE/2, and the E/W edges sit at x ± CELL_SIZE/2. */
export function edgeMidpointWorld(x: number, z: number, dir: Direction): THREE.Vector3 {
  const base = cellToWorld(x, z);
  switch (dir) {
    case 'N':
      return base.clone().add(new THREE.Vector3(0, 0, CELL_SIZE / 2));
    case 'S':
      return base.clone().add(new THREE.Vector3(0, 0, -CELL_SIZE / 2));
    case 'E':
      return base.clone().add(new THREE.Vector3(CELL_SIZE / 2, 0, 0));
    case 'W':
      return base.clone().add(new THREE.Vector3(-CELL_SIZE / 2, 0, 0));
  }
}

export function edgeRotationY(dir: Direction): number {
  return dir === 'N' || dir === 'S' ? 0 : Math.PI / 2;
}

/** Raycasts the mouse against the ground plane (y=0) and returns the world point. */
/** Where the cursor meets the ground, or the floor at `height` when building upstairs. */
export function raycastGround(
  mouseNdc: THREE.Vector2,
  camera: THREE.Camera,
  height = 0,
): THREE.Vector3 | null {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouseNdc, camera);
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
  const point = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(groundPlane, point);
  return hit ? point : null;
}

export function mouseToNdc(event: MouseEvent, element: HTMLElement): THREE.Vector2 {
  const rect = element.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  return new THREE.Vector2(x, y);
}
