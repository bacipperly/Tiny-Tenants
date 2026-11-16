import type { Direction, GridModel } from '../grid/gridModel';
import { LOT_MAX_CELL, LOT_MIN_CELL } from '../grid/gridMath';
import { cellKey } from '../grid/roomDetection';
import { placeKey } from './world';
import type { Cell, World } from './world';

export type { Cell } from './world';

/** Walking through a square someone else has is worth this many extra squares of detour to avoid. Kept low, because brushing past someone looks better than a long way round. */
const OCCUPIED_SQUARE_COST = 2;

/** Whether a pawn standing here is in a piece of furniture, other than on the stairs, where it's meant to be. */
export function isInFurniture(world: World, cell: Cell): boolean {
  return world.blocked(cell.level).has(cellKey(cell.x, cell.z)) && !world.stairStep(cell);
}

/** The collision check: whether one step between neighboring squares is allowed. */
export function canStep(world: World, from: Cell, to: Cell): boolean {
  const onStairs = world.stairLink(from, to);
  if (onStairs === false) return false;
  if (onStairs) {
    if (!world.stairStep(to) && (!world.standable(to) || world.blocked(to.level).has(cellKey(to.x, to.z)))) return false;
    // Up or down a floor, the wall that matters is on the floor where the step lands beside the stairwell.
    const level = Math.max(from.level, to.level);
    const model = world.level(level);
    return !blocksWalking(model, { x: from.x, z: from.z }, stepDirection(to.x - from.x, to.z - from.z));
  }
  if (to.level !== from.level || !world.standable(to)) return false;
  const blocked = world.blocked(to.level);
  if (blocked.has(cellKey(to.x, to.z))) return false;
  const model = world.level(from.level);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dirX: Direction = dx > 0 ? 'E' : 'W';
  const dirZ: Direction = dz > 0 ? 'N' : 'S';

  if (dz === 0) return !blocksWalking(model, from, dirX);
  if (dx === 0) return !blocksWalking(model, from, dirZ);

  // A diagonal passes through a grid corner, so all four edges meeting there must be clear, even of doors, and upstairs both squares beside it must be floor.
  const sideX = { x: to.x, z: from.z, level: from.level };
  const sideZ = { x: from.x, z: to.z, level: from.level };
  if (blocked.has(cellKey(sideX.x, sideX.z)) || blocked.has(cellKey(sideZ.x, sideZ.z))) return false;
  if (!world.standable(sideX) || !world.standable(sideZ)) return false;
  // A pillar stands on the corner a diagonal cuts across.
  if (model.hasPillar(Math.max(from.x, to.x), Math.max(from.z, to.z))) return false;
  return (
    !hasEdge(model, from.x, from.z, dirX) &&
    !hasEdge(model, from.x, from.z, dirZ) &&
    !hasEdge(model, sideX.x, sideX.z, dirZ) &&
    !hasEdge(model, sideZ.x, sideZ.z, dirX)
  );
}

function stepDirection(dx: number, dz: number): Direction {
  return dx > 0 ? 'E' : dx < 0 ? 'W' : dz > 0 ? 'N' : 'S';
}

/** A wall, or a fence, or a gate in one: anything on the edge, which a diagonal step can't squeeze past. */
function hasEdge(model: GridModel, x: number, z: number, dir: Direction): boolean {
  return model.hasWall(x, z, dir) || model.hasFence(x, z, dir);
}

/** A wall with no door in it, or a fence that isn't a gate. */
function blocksWalking(model: GridModel, cell: { x: number; z: number }, dir: Direction): boolean {
  if (model.hasWall(cell.x, cell.z, dir)) return model.getAperture(cell.x, cell.z, dir)?.kind !== 'door';
  const fence = model.getFence(cell.x, cell.z, dir);
  return fence !== undefined && !fence.gate;
}

function distanceSquared(a: Cell, b: Cell): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2 + (a.level - b.level) ** 2;
}

/** Straight-line steps plus diagonal shortcuts: the shortest possible walk with no walls in the way. Going up or down a floor only ever adds to that. */
function walkingEstimate(a: Cell, b: Cell): number {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

/**
 * The shortest walk from `start` to `goal`, both included, using A*, up and
 * down the stairs if it has to. If the goal can't be reached, the path ends at
 * the reachable square closest to it instead. `occupied` squares (by
 * placeKey) belong to other pawns: a walk prefers to go around them and can
 * pass through if it has to, but can never end on one.
 */
export function findPath(world: World, start: Cell, goal: Cell, occupied: Set<string> = new Set()): { path: Cell[]; reachedGoal: boolean } {
  const goalKey = placeKey(goal);
  const startKey = placeKey(start);
  const startInFurniture = isInFurniture(world, start);

  const cells = new Map<string, Cell>([[startKey, start]]);
  const costs = new Map<string, number>([[startKey, 0]]);
  const cameFrom = new Map<string, string>();
  const open = new Set([startKey]);
  const closed = new Set<string>();
  let closestKey = startKey;

  while (open.size > 0) {
    let currentKey = '';
    let lowestScore = Infinity;
    for (const key of open) {
      const score = costs.get(key)! + walkingEstimate(cells.get(key)!, goal);
      if (score < lowestScore) {
        lowestScore = score;
        currentKey = key;
      }
    }
    open.delete(currentKey);
    closed.add(currentKey);
    if (currentKey === goalKey && !occupied.has(goalKey)) {
      closestKey = goalKey;
      break;
    }

    const current = cells.get(currentKey)!;
    const closestDistance = distanceSquared(cells.get(closestKey)!, goal);
    const currentDistance = distanceSquared(current, goal);
    // Someone getting up has to get off the furniture, even if that's as close as it gets to a square that's taken.
    const isStillOnFurniture = closestKey === startKey && currentKey !== startKey && startInFurniture;
    const isCloser = isStillOnFurniture || currentDistance < closestDistance || (currentDistance === closestDistance && costs.get(currentKey)! < costs.get(closestKey)!);
    // Nobody stops halfway up the stairs.
    if (isCloser && !occupied.has(currentKey) && !world.stairStep(current)) closestKey = currentKey;

    for (const next of world.neighbors(current)) {
      const nextKey = placeKey(next);
      if (closed.has(nextKey) || !canStep(world, current, next)) continue;
      const cost = costs.get(currentKey)! + Math.hypot(next.x - current.x, next.z - current.z) + (occupied.has(nextKey) ? OCCUPIED_SQUARE_COST : 0);
      if (cost >= (costs.get(nextKey) ?? Infinity)) continue;
      cells.set(nextKey, next);
      costs.set(nextKey, cost);
      cameFrom.set(nextKey, currentKey);
      open.add(nextKey);
    }
  }

  const path: Cell[] = [];
  for (let key: string | undefined = closestKey; key !== undefined; key = cameFrom.get(key)) path.unshift(cells.get(key)!);
  return { path, reachedGoal: closestKey === goalKey };
}

/** Every square a walk of up to `steps` steps can reach from `start`, not counting `start` or the stairs themselves. Other pawns don't block a walk, so they don't count here either. */
export function cellsWithinWalk(world: World, start: Cell, steps: number): Cell[] {
  const startKey = placeKey(start);
  const reached = new Map<string, Cell>([[startKey, start]]);
  let frontier = [start];
  for (let step = 0; step < steps; step++) {
    const nextFrontier: Cell[] = [];
    for (const cell of frontier) {
      for (const next of world.neighbors(cell)) {
        const nextKey = placeKey(next);
        if (reached.has(nextKey) || !canStep(world, cell, next)) continue;
        reached.set(nextKey, next);
        nextFrontier.push(next);
      }
    }
    frontier = nextFrontier;
  }
  reached.delete(startKey);
  return [...reached.values()].filter((cell) => !world.stairStep(cell));
}

/** The closest square on the same floor that a pawn can stand on, with no furniture on it, optionally limited to squares that pass `filter`. */
export function nearestFreeCell(world: World, cell: Cell, filter: (candidate: Cell) => boolean = () => true): Cell | null {
  const blocked = world.blocked(cell.level);
  let nearest: Cell | null = null;
  for (let x = LOT_MIN_CELL; x <= LOT_MAX_CELL; x++) {
    for (let z = LOT_MIN_CELL; z <= LOT_MAX_CELL; z++) {
      const candidate = { x, z, level: cell.level };
      if (blocked.has(cellKey(x, z)) || !world.standable(candidate) || !filter(candidate)) continue;
      if (!nearest || distanceSquared(candidate, cell) < distanceSquared(nearest, cell)) nearest = candidate;
    }
  }
  return nearest;
}
