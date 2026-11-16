import type { GridModel } from './gridModel';
import { LOT_MAX_CELL, LOT_MIN_CELL } from './gridMath';
import { STEPS, cellKey } from './roomDetection';

type Cell = { x: number; z: number };

/**
 * Every cell reachable from `start` without crossing a wall, door or window,
 * limited to those `canEnter` allows. Reaches one cell past the lot line, so a
 * wall built on the line can still be reached from its outer side.
 */
export function connectedCells(model: GridModel, start: Cell, canEnter: (cell: Cell) => boolean = () => true): Cell[] {
  if (!canEnter(start)) return [];
  const seen = new Set([cellKey(start.x, start.z)]);
  const cells = [start];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    for (const { dx, dz, dir } of STEPS) {
      const next = { x: cell.x + dx, z: cell.z + dz };
      const key = cellKey(next.x, next.z);
      if (seen.has(key) || model.hasWall(cell.x, cell.z, dir)) continue;
      if (next.x < LOT_MIN_CELL - 1 || next.x > LOT_MAX_CELL + 1 || next.z < LOT_MIN_CELL - 1 || next.z > LOT_MAX_CELL + 1) continue;
      if (!canEnter(next)) continue;
      seen.add(key);
      cells.push(next);
    }
  }
  return cells;
}
