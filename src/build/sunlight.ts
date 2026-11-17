import * as THREE from 'three';
import type { GridModel, WindowSize } from '../grid/gridModel';
import { CELL_SIZE, edgeMidpointWorld } from '../grid/gridMath';
import { wallSides } from '../grid/roomDetection';

const GLOW_Y = 0.075;
const GLOW_OPACITY = 0.05;
const SUN_COLOR = 0xffe2a8;
const PIXELS_PER_CELL = 10;
const MAX_TEXTURE_SIZE = 512;
/** How far each size of window's light carries across the floor, in cells, and how much it adds. */
const GLOW_SIZES: Record<WindowSize, { radius: number; strength: number }> = {
  small: { radius: 5, strength: 0.1 },
  standard: { radius: 14, strength: 0.2 },
  tall: { radius: 14, strength: 0.3 },
};

type WindowLight = { x: number; z: number; size: WindowSize };
type LitRoom = { cells: { x: number; z: number }[]; windows: WindowLight[] };

/**
 * Daylight spreading across the floor from each window that faces outdoors.
 * All the windows in a room are added together into one painted map of light,
 * so they blend into a single soft glow instead of a stripe per window. Each
 * room is painted only from its own windows and only inside its own cells, so
 * light can't pass through a wall.
 */
export class Sunlight {
  readonly mesh: THREE.Mesh;
  private material = new THREE.MeshBasicMaterial({
    color: SUN_COLOR,
    opacity: GLOW_OPACITY,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private paintedRooms = '';

  constructor() {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = GLOW_Y;
    this.mesh.visible = false;
  }

  /** How light it is outdoors, from 1 by day to 0 at night: daylight through the windows fades with it. */
  setDaylight(amount: number) {
    this.material.opacity = GLOW_OPACITY * amount;
  }

  rebuild(model: GridModel) {
    const rooms = litRooms(model);
    // Repainting colors doesn't change the light, and this runs for every tile of a paint drag.
    const key = JSON.stringify(rooms);
    if (key === this.paintedRooms) return;
    this.paintedRooms = key;

    this.mesh.visible = rooms.length > 0;
    if (rooms.length > 0) this.paint(rooms);
  }

  private paint(rooms: LitRoom[]) {
    const cells = rooms.flatMap((room) => room.cells);
    const minX = Math.min(...cells.map((cell) => cell.x)) - CELL_SIZE / 2;
    const minZ = Math.min(...cells.map((cell) => cell.z)) - CELL_SIZE / 2;
    const width = Math.max(...cells.map((cell) => cell.x)) + CELL_SIZE / 2 - minX;
    const depth = Math.max(...cells.map((cell) => cell.z)) + CELL_SIZE / 2 - minZ;
    const scale = Math.min(PIXELS_PER_CELL, MAX_TEXTURE_SIZE / Math.max(width, depth));

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(depth * scale);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const image = ctx.createImageData(canvas.width, canvas.height);
    // Black adds no light, so everything outside a lit room starts out correct.
    for (let alpha = 3; alpha < image.data.length; alpha += 4) image.data[alpha] = 255;

    for (const room of rooms) {
      for (const cell of room.cells) {
        const left = Math.round((cell.x - CELL_SIZE / 2 - minX) * scale);
        const right = Math.round((cell.x + CELL_SIZE / 2 - minX) * scale);
        const top = Math.round((cell.z - CELL_SIZE / 2 - minZ) * scale);
        const bottom = Math.round((cell.z + CELL_SIZE / 2 - minZ) * scale);
        for (let row = top; row < bottom; row++) {
          for (let column = left; column < right; column++) {
            const brightness = lightAtPoint(room.windows, minX + (column + 0.5) / scale, minZ + (row + 0.5) / scale);
            image.data.fill(brightness * 255, (row * canvas.width + column) * 4, (row * canvas.width + column) * 4 + 3);
          }
        }
      }
    }
    ctx.putImageData(image, 0, 0);

    // Left as plain numbers rather than a color, so the light adds onto the floor at the strength worked out above.
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

/**
 * Adds up every window's light at this spot. The curve lifts faint light so one
 * window still shows, and levels off strong light so a wall full of windows
 * doesn't flatten into a solid band with a dark shape left in the middle.
 */
function lightAtPoint(windows: WindowLight[], x: number, z: number): number {
  let total = 0;
  for (const source of windows) {
    const { radius, strength } = GLOW_SIZES[source.size];
    const reached = ((x - source.x) ** 2 + (z - source.z) ** 2) / radius ** 2;
    // Eases out to nothing at the radius, with no peak or edge to show up as a shape.
    if (reached < 1) total += strength * (1 - reached) ** 2;
  }
  return 1 - Math.exp(-1.5 * total ** 0.7);
}

function litRooms(model: GridModel): LitRoom[] {
  const windowsByRoom = new Map<number, WindowLight[]>();
  for (const aperture of model.allApertures()) {
    if (aperture.kind !== 'window') continue;
    const [owner, neighbor] = wallSides(aperture.x, aperture.z, aperture.dir);
    const ownerRoom = model.roomIdAt(owner.x, owner.z);
    const neighborRoom = model.roomIdAt(neighbor.x, neighbor.z);
    if ((ownerRoom === 0) === (neighborRoom === 0)) continue;

    const room = ownerRoom || neighborRoom;
    const { x, z } = edgeMidpointWorld(aperture.x, aperture.z, aperture.dir);
    const windows = windowsByRoom.get(room) ?? [];
    windows.push({ x, z, size: aperture.size ?? 'standard' });
    windowsByRoom.set(room, windows);
  }
  return model.allRooms().flatMap((room) => {
    const windows = windowsByRoom.get(room.id);
    return windows ? [{ cells: room.cells, windows }] : [];
  });
}
