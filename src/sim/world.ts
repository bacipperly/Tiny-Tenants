import type { FurniturePiece, GridModel } from '../grid/gridModel';
import type { House } from '../grid/house';
import { stairCells } from '../grid/house';
import { LEVEL_HEIGHT, isCellInLot } from '../grid/gridMath';
import { cellKey } from '../grid/roomDetection';
import { getFootprintCells, getFurnitureDef, pieceSquare } from '../build/furnitureCatalog';
import { stairProfile } from '../build/stairs';
import type { StairProfile } from '../build/stairs';
import type { RoomLight } from '../build/roomLighting';

/** A square on one floor of the house. The ground floor is level 0. */
export type Cell = { x: number; z: number; level: number };

/** A piece of furniture, and the floor it's on. */
export type LevelPiece = FurniturePiece & { level: number };

/** Identifies a square on a particular floor. */
export function placeKey(cell: Cell): string {
  return `${cell.level}|${cell.x},${cell.z}`;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.z === b.z && a.level === b.level;
}

/** Roughly how many steps going up or down a floor adds to a walk, for a quick guess at how far away something is. */
export const FLOOR_CHANGE_STEPS = 6;

/** How high a floor tile's top is above the floor it's on. */
export const FLOOR_TOP = 0.06;

/**
 * A flight of stairs, from the square in front of its bottom step, up its
 * steps, to the square past its top step on the floor above.
 */
export interface Flight {
  /** The stairs piece's id, which a pawn claims while it's on them, so it's one at a time. */
  id: string;
  bottom: Cell;
  /** Bottom step first. */
  steps: Cell[];
  top: Cell;
  /** Where each step up is along the way. */
  profile: StairProfile;
}

interface Worked {
  versions: number[];
  furniture: LevelPiece[];
  blocked: Set<string>[];
  holes: Set<string>[];
  flights: Flight[];
  /** For each stair square, its flight and which step it is. */
  stairSteps: Map<string, { flight: Flight; index: number }>;
  /** The squares one step along the stairs from each square on them, or at either end. */
  links: Map<string, Cell[]>;
}

/**
 * The whole house as the pawns see it: every floor, joined by the stairs.
 * What it works out from the floors is kept until one of them changes.
 */
export class World {
  readonly house: House;
  private lights: RoomLight[] = [];
  private worked: Worked | null = null;

  constructor(house: House) {
    this.house = house;
  }

  get levelCount(): number {
    return this.house.levels.length;
  }

  /** One floor's walls, tiles, furniture and rooms. */
  level(level: number): GridModel {
    return this.house.levels[level] ?? this.house.levels[0];
  }

  setLights(lights: RoomLight[]) {
    this.lights = lights;
  }

  /** Every piece on every floor. */
  allFurniture(): LevelPiece[] {
    return this.work().furniture;
  }

  /** The squares on this floor that furniture stands on, other than rugs and such that pawns walk over. Stairs included. */
  blocked(level: number): Set<string> {
    return this.work().blocked[level] ?? new Set();
  }

  /** Whether a pawn can stand here: anywhere in the lot on the ground floor but in a pool, and only on tiles upstairs, never over a stairwell. */
  standable(cell: Cell): boolean {
    if (!isCellInLot(cell.x, cell.z) || cell.level < 0 || cell.level >= this.levelCount) return false;
    if (cell.level === 0) return !this.level(0).hasPool(cell.x, cell.z);
    return this.level(cell.level).hasFloor(cell.x, cell.z) && !this.work().holes[cell.level]?.has(cellKey(cell.x, cell.z));
  }

  hasFloor(cell: Cell): boolean {
    return this.level(cell.level).hasFloor(cell.x, cell.z);
  }

  /** Room ids that are different on every floor. 0 is outside, on any floor. */
  roomAt(cell: Cell): number {
    const id = this.level(cell.level).roomIdAt(cell.x, cell.z);
    return id === 0 ? 0 : cell.level * 100000 + id;
  }

  /** How bright it is here, from the daylight and lamps in its room. */
  lightAt(cell: Cell): number {
    const light = this.lights[cell.level];
    return light?.get(this.level(cell.level).roomIdAt(cell.x, cell.z)) ?? 1;
  }

  /** The height of the floor a pawn standing here stands on. */
  floorHeight(cell: Cell): number {
    return cell.level * LEVEL_HEIGHT + (this.hasFloor(cell) ? FLOOR_TOP : 0);
  }

  flights(): Flight[] {
    return this.work().flights;
  }

  /** The flight this square is a step of, if it's on the stairs. */
  stairStep(cell: Cell): { flight: Flight; index: number } | undefined {
    return this.work().stairSteps.get(placeKey(cell));
  }

  /** Squares a pawn could step to from here: the eight around it on its floor, and along the stairs. */
  neighbors(cell: Cell): Cell[] {
    const around: Cell[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) if (dx !== 0 || dz !== 0) around.push({ x: cell.x + dx, z: cell.z + dz, level: cell.level });
    }
    for (const linked of this.work().links.get(placeKey(cell)) ?? []) if (linked.level !== cell.level) around.push(linked);
    return around;
  }

  /** Whether one step goes along the stairs: true if it does, false if it touches a stair square any other way, and undefined if it has nothing to do with the stairs. */
  stairLink(from: Cell, to: Cell): boolean | undefined {
    const linked = this.work().links.get(placeKey(from));
    if (linked?.some((cell) => sameCell(cell, to))) return true;
    if (this.stairStep(from) || this.stairStep(to)) return false;
    return undefined;
  }

  private work(): Worked {
    // Checked on every step of every route, so it's kept quick.
    const levels = this.house.levels;
    const worked = this.worked;
    if (worked && worked.versions.length === levels.length && levels.every((model, level) => model.version === worked.versions[level])) return worked;
    const versions = levels.map((model) => model.version);
    const furniture = this.house.levels.flatMap((model, level) => model.allFurniture().map((piece) => ({ ...piece, level })));
    const blocked = this.house.levels.map(() => new Set<string>());
    for (const piece of furniture) {
      const def = getFurnitureDef(piece.type);
      // A pool ladder stands at the very edge, and swimmers step onto its square to climb in.
      if (def.onFloor || def.onTop || def.onWall || def.onCeiling || def.pool === 'edge') continue;
      for (const { x, z } of getFootprintCells(piece.type, piece.x, piece.z, piece.rotation)) blocked[piece.level].add(cellKey(x, z));
    }
    const holes = this.house.levels.map((_, level) => (level === 0 ? new Set<string>() : stairCells(this.house.levels[level - 1])));

    const flights: Flight[] = [];
    const stairSteps = new Map<string, { flight: Flight; index: number }>();
    const links = new Map<string, Cell[]>();
    const link = (a: Cell, b: Cell) => {
      links.set(placeKey(a), [...(links.get(placeKey(a)) ?? []), b]);
      links.set(placeKey(b), [...(links.get(placeKey(b)) ?? []), a]);
    };
    for (const piece of furniture) {
      const shape = getFurnitureDef(piece.type).stairs;
      // Stairs on the top floor lead nowhere.
      if (!shape || piece.level + 1 >= this.levelCount) continue;
      const place = (square: [number, number], level: number): Cell => ({ ...pieceSquare(piece.type, piece.x, piece.z, piece.rotation, square), level });
      const steps = shape.path.map((square) => place(square, piece.level));
      const flight: Flight = { id: piece.id, bottom: place(shape.entry, piece.level), steps, top: place(shape.exit, piece.level + 1), profile: stairProfile(shape) };
      const last = steps[steps.length - 1];
      flights.push(flight);
      steps.forEach((step, index) => stairSteps.set(placeKey(step), { flight, index }));
      link(flight.bottom, steps[0]);
      for (let index = 1; index < steps.length; index++) link(steps[index - 1], steps[index]);
      link(last, flight.top);
    }
    this.worked = { versions, furniture, blocked, holes, flights, stairSteps, links };
    return this.worked;
  }
}
