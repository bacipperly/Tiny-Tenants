import type { GridModel } from '../grid/gridModel';
import { wallSides } from '../grid/roomDetection';
import { windowGlassArea } from './windowShapes';

/** How bright a color stays in a sealed room with no windows, as a multiplier. */
const DARKEST = 0.18;
/** A room this well supplied with glass, per cell, is as bright as outdoors. */
const GLASS_PER_CELL_FOR_FULL_LIGHT = 0.15;
/** Light from a doorway, counted as if it were this much window glass. */
const DOOR_GLASS_EQUIVALENT = 0.25;

/** Brightness multipliers by room id. A room that isn't listed, including outdoors (0), is fully lit. */
export type RoomLight = Map<number, number>;

/** Only windows and doors with outdoors on their other side let daylight in. */
export function computeRoomLight(model: GridModel): RoomLight {
  const glassByRoom = new Map<number, number>();
  for (const aperture of model.allApertures()) {
    const [sideA, sideB] = wallSides(aperture.x, aperture.z, aperture.dir);
    const roomA = model.roomIdAt(sideA.x, sideA.z);
    const roomB = model.roomIdAt(sideB.x, sideB.z);
    if ((roomA === 0) === (roomB === 0)) continue;
    const room = roomA || roomB;
    const glass = aperture.kind === 'door' ? DOOR_GLASS_EQUIVALENT : windowGlassArea(aperture.size);
    glassByRoom.set(room, (glassByRoom.get(room) ?? 0) + glass);
  }

  const light: RoomLight = new Map();
  for (const room of model.allRooms()) {
    const glassPerCell = (glassByRoom.get(room.id) ?? 0) / room.cells.length;
    // A square root, so the first window makes a visible difference even in a big room.
    const daylight = Math.min(1, Math.sqrt(glassPerCell / GLASS_PER_CELL_FOR_FULL_LIGHT));
    light.set(room.id, DARKEST + (1 - DARKEST) * daylight);
  }
  return light;
}

export function lightAt(light: RoomLight, model: GridModel, cell: { x: number; z: number }): number {
  return light.get(model.roomIdAt(cell.x, cell.z)) ?? 1;
}
