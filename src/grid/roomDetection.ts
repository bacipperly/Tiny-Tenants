import type { Direction, WallSegment } from './gridModel';

type HasWall = (x: number, z: number, dir: Direction) => boolean;
type Cell = { x: number; z: number };
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export const STEPS: { dx: number; dz: number; dir: Direction }[] = [
  { dx: 0, dz: 1, dir: 'N' },
  { dx: 1, dz: 0, dir: 'E' },
  { dx: 0, dz: -1, dir: 'S' },
  { dx: -1, dz: 0, dir: 'W' },
];

export function cellKey(x: number, z: number): string {
  return `${x},${z}`;
}

export function wallSides(x: number, z: number, dir: Direction): [Cell, Cell] {
  switch (dir) {
    case 'N':
      return [{ x, z }, { x, z: z + 1 }];
    case 'S':
      return [{ x, z }, { x, z: z - 1 }];
    case 'E':
      return [{ x, z }, { x: x + 1, z }];
    case 'W':
      return [{ x, z }, { x: x - 1, z }];
  }
}

/** The lot has no fixed size, so its boundary is a one-cell ring around the walls; nothing beyond it can be enclosed. */
function lotBounds(walls: WallSegment[]): Bounds | null {
  if (walls.length === 0) return null;
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const wall of walls) {
    for (const { x, z } of wallSides(wall.x, wall.z, wall.dir)) {
      bounds.minX = Math.min(bounds.minX, x - 1);
      bounds.maxX = Math.max(bounds.maxX, x + 1);
      bounds.minZ = Math.min(bounds.minZ, z - 1);
      bounds.maxZ = Math.max(bounds.maxZ, z + 1);
    }
  }
  return bounds;
}

function isOnOrPastBoundary({ x, z }: Cell, bounds: Bounds): boolean {
  return x <= bounds.minX || x >= bounds.maxX || z <= bounds.minZ || z >= bounds.maxZ;
}

/** Marks everything reachable from the lot boundary as outside; whatever is left over, grouped by connection, is a room. */
export function detectRooms(walls: WallSegment[], hasWall: HasWall): Map<string, number> {
  const rooms = new Map<string, number>();
  const bounds = lotBounds(walls);
  if (!bounds) return rooms;

  const outside = new Set<string>();
  const queue: Cell[] = [];
  const seed = (x: number, z: number) => {
    if (outside.has(cellKey(x, z))) return;
    outside.add(cellKey(x, z));
    queue.push({ x, z });
  };
  for (let x = bounds.minX; x <= bounds.maxX; x++) {
    seed(x, bounds.minZ);
    seed(x, bounds.maxZ);
  }
  for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
    seed(bounds.minX, z);
    seed(bounds.maxX, z);
  }

  while (queue.length > 0) {
    const { x, z } = queue.pop()!;
    for (const { dx, dz, dir } of STEPS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < bounds.minX || nx > bounds.maxX || nz < bounds.minZ || nz > bounds.maxZ) continue;
      if (hasWall(x, z, dir)) continue;
      seed(nx, nz);
    }
  }

  let nextRoomId = 1;
  for (let x = bounds.minX; x <= bounds.maxX; x++) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
      const key = cellKey(x, z);
      if (outside.has(key) || rooms.has(key)) continue;
      const roomId = nextRoomId++;
      rooms.set(key, roomId);
      const roomQueue: Cell[] = [{ x, z }];
      while (roomQueue.length > 0) {
        const cell = roomQueue.pop()!;
        for (const { dx, dz, dir } of STEPS) {
          const neighbor = cellKey(cell.x + dx, cell.z + dz);
          if (hasWall(cell.x, cell.z, dir) || rooms.has(neighbor)) continue;
          rooms.set(neighbor, roomId);
          roomQueue.push({ x: cell.x + dx, z: cell.z + dz });
        }
      }
    }
  }
  return rooms;
}

/** Floods from `start` and stops as soon as it finds `target` or the lot boundary. */
function floodUntilFound(start: Cell, target: Cell, bounds: Bounds, hasWall: HasWall): 'target' | 'outside' | 'sealed' {
  const seen = new Set([cellKey(start.x, start.z)]);
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.pop()!;
    if (cell.x === target.x && cell.z === target.z) return 'target';
    if (isOnOrPastBoundary(cell, bounds)) return 'outside';
    for (const { dx, dz, dir } of STEPS) {
      const next = { x: cell.x + dx, z: cell.z + dz };
      const key = cellKey(next.x, next.z);
      if (seen.has(key) || hasWall(cell.x, cell.z, dir)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return 'sealed';
}

/** A new wall leaves rooms unchanged if its two sides still connect, or if both sides can still reach outside. */
export function wallChangesRooms(wall: WallSegment, walls: WallSegment[], hasWall: HasWall): boolean {
  const bounds = lotBounds(walls);
  if (!bounds) return false;
  const [sideA, sideB] = wallSides(wall.x, wall.z, wall.dir);
  const fromA = floodUntilFound(sideA, sideB, bounds, hasWall);
  if (fromA !== 'outside') return fromA === 'sealed';
  return floodUntilFound(sideB, sideA, bounds, hasWall) === 'sealed';
}
