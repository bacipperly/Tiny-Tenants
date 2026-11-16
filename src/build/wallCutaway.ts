import type { WallSegment } from '../grid/gridModel';
import { wallKey } from '../grid/gridModel';

// How far, in cells along each axis, a full-height wall covers the ground behind it at the iso camera angle.
const OCCLUSION_REACH = 2;
const STRUCTURE_GAP = 4;

/** Decides which walls drop to a sill using only wall positions and the camera, never floors or enclosure. */
export function computeHiddenWalls(walls: WallSegment[], cameraDir: { x: number; y: number }): Set<string> {
  const signX = cameraDir.x > 0 ? 1 : -1;
  const signZ = cameraDir.y > 0 ? 1 : -1;
  const hidden = new Set<string>();

  hideWallsWithAWallBehindThem(walls, signX, signZ, hidden);
  hideWallsCoveringAnotherWall(walls, signX, signZ, hidden);
  lowerMostlyLoweredRuns(walls, hidden);
  return hidden;
}

/** Within each structure, only the wall farthest from the camera in each row or column stays up. */
function hideWallsWithAWallBehindThem(walls: WallSegment[], signX: number, signZ: number, hidden: Set<string>) {
  const structureOf = nearbyStructures(walls);
  const nearestToBack = new Map<string, number>();
  const laneOf = (w: WallSegment) => `${structureOf(w)}|${w.dir}|${w.dir === 'N' ? w.x : w.z}`;
  const depthOf = (w: WallSegment) => (w.dir === 'N' ? w.z * signZ : w.x * signX);

  for (const wall of walls) {
    const lane = laneOf(wall);
    const best = nearestToBack.get(lane);
    if (best === undefined || depthOf(wall) < best) nearestToBack.set(lane, depthOf(wall));
  }
  for (const wall of walls) {
    if (depthOf(wall) > nearestToBack.get(laneOf(wall))!) hidden.add(wallKey(wall.x, wall.z, wall.dir));
  }
}

/** The camera looks diagonally, so a back wall can still stand in front of a wall in a neighboring row or column. */
function hideWallsCoveringAnotherWall(walls: WallSegment[], signX: number, signZ: number, hidden: Set<string>) {
  const present = new Set(walls.map((w) => wallKey(w.x, w.z, w.dir)));
  for (const wall of walls) {
    const key = wallKey(wall.x, wall.z, wall.dir);
    if (hidden.has(key)) continue;

    const crossDir = wall.dir === 'N' ? 'E' : 'N';
    for (let distance = 1; distance <= OCCLUSION_REACH; distance++) {
      const parallel = wallKey(wall.x - signX * distance, wall.z - signZ * distance, wall.dir);
      const crossDistance = distance - 0.5;
      const crossX = wall.dir === 'N' ? wall.x - signX * crossDistance - 0.5 : wall.x + 0.5 - signX * crossDistance;
      const crossZ = wall.dir === 'N' ? wall.z + 0.5 - signZ * crossDistance : wall.z - signZ * crossDistance - 0.5;
      if (present.has(parallel) || present.has(wallKey(crossX, crossZ, crossDir))) {
        hidden.add(key);
        break;
      }
    }
  }
}

/** A straight wall lowers as one piece, so erasing part of the wall behind it can't leave tall pieces sticking up. */
function lowerMostlyLoweredRuns(walls: WallSegment[], hidden: Set<string>) {
  const lines = new Map<string, number[]>();
  for (const wall of walls) {
    const line = `${wall.dir}|${wall.dir === 'N' ? wall.z : wall.x}`;
    const positions = lines.get(line) ?? [];
    positions.push(wall.dir === 'N' ? wall.x : wall.z);
    lines.set(line, positions);
  }

  for (const [line, positions] of lines) {
    const [dir, coord] = line.split('|');
    const keyAt = (position: number) =>
      dir === 'N' ? wallKey(position, Number(coord), 'N') : wallKey(Number(coord), position, 'E');
    const present = new Set(positions);
    for (const start of positions) {
      if (present.has(start - 1)) continue;
      const run: string[] = [];
      for (let position = start; present.has(position); position++) run.push(keyAt(position));
      const loweredCount = run.filter((key) => hidden.has(key)).length;
      if (loweredCount * 2 >= run.length) run.forEach((key) => hidden.add(key));
    }
  }
}

/** Walls within STRUCTURE_GAP cells of each other form one structure, so leftovers from deleting still act as one house. */
function nearbyStructures(walls: WallSegment[]): (wall: WallSegment) => string {
  const parent = new Map<string, string>();
  const find = (corner: string): string => {
    let root = corner;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(corner, root);
    return root;
  };
  const cornerKey = (a: number, b: number) => `${a},${b}`;
  const cornersOf = (w: WallSegment): [number, number][] =>
    w.dir === 'N'
      ? [[w.x, w.z], [w.x + 1, w.z]]
      : [[w.x + 1, w.z - 1], [w.x + 1, w.z]];

  const corners = new Map<string, [number, number]>();
  for (const wall of walls) {
    for (const [a, b] of cornersOf(wall)) corners.set(cornerKey(a, b), [a, b]);
    const [first, second] = cornersOf(wall);
    parent.set(find(cornerKey(...first)), find(cornerKey(...second)));
  }
  for (const [key, [a, b]] of corners) {
    for (let da = -STRUCTURE_GAP; da <= STRUCTURE_GAP; da++) {
      for (let db = -STRUCTURE_GAP; db <= STRUCTURE_GAP; db++) {
        const neighbor = cornerKey(a + da, b + db);
        if (corners.has(neighbor)) parent.set(find(key), find(neighbor));
      }
    }
  }

  // A scrap in the middle of a big room can be far from every wall but is still inside that house's footprint.
  let merged = true;
  while (merged) {
    merged = false;
    const footprints = new Map<string, { minA: number; maxA: number; minB: number; maxB: number }>();
    for (const [key, [a, b]] of corners) {
      const root = find(key);
      const box = footprints.get(root);
      if (!box) {
        footprints.set(root, { minA: a, maxA: a, minB: b, maxB: b });
      } else {
        box.minA = Math.min(box.minA, a);
        box.maxA = Math.max(box.maxA, a);
        box.minB = Math.min(box.minB, b);
        box.maxB = Math.max(box.maxB, b);
      }
    }
    const entries = [...footprints];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [rootA, boxA] = entries[i];
        const [rootB, boxB] = entries[j];
        const overlaps =
          boxA.minA <= boxB.maxA && boxB.minA <= boxA.maxA && boxA.minB <= boxB.maxB && boxB.minB <= boxA.maxB;
        if (overlaps && find(rootA) !== find(rootB)) {
          parent.set(find(rootA), find(rootB));
          merged = true;
        }
      }
    }
  }
  return (wall) => find(cornerKey(...cornersOf(wall)[0]));
}
