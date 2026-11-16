import type { WindowSize } from '../grid/gridModel';
import { CELL_SIZE, WALL_HEIGHT } from '../grid/gridMath';

/** Heights as a fraction of the wall, width as a fraction of the cell. */
export const WINDOW_SHAPES: Record<WindowSize, { sill: number; header: number; width: number }> = {
  small: { sill: 0.55, header: 0.18, width: 0.5 },
  standard: { sill: 0.38, header: 0.16, width: 0.92 },
  tall: { sill: 0.06, header: 0.06, width: 0.92 },
};

export function windowGlassArea(size: WindowSize = 'standard'): number {
  const { sill, header, width } = WINDOW_SHAPES[size];
  return (1 - sill - header) * WALL_HEIGHT * width * CELL_SIZE;
}
