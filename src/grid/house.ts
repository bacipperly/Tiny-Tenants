import { GridModel, wallKey } from './gridModel';
import type { Direction, FenceStyle, GridModelData, TileRail } from './gridModel';
import { STEPS, cellKey, wallSides } from './roomDetection';
import { getFootprintCells, getFurnitureDef, isStairs, pieceSquare } from '../build/furnitureCatalog';
import { isCellInLot } from './gridMath';

/** How many floors a house can have, the ground floor included. */
export const MAX_LEVELS = 3;
/** Stairs are furniture, placed on the floor they start from. This is the plain straight kind; `isStairs` says whether a piece is any kind. */
export const STAIRS_TYPE = 'stairs';

/** How far past a wall or pillar below an upstairs floor can reach, in squares. */
export const OVERHANG = 2;

/** 3: a house became a list of floors. */
export const HOUSE_VERSION = 3;

/** How the house is roofed: flat, or pitched up from every side (hip), or to a ridge with walled-in ends (gable). */
export type RoofStyle = 'flat' | 'hip' | 'gable';
/** What a pitched roof is covered in. */
export type RoofMaterial = 'slate' | 'asphalt' | 'clay' | 'shakes' | 'metal' | 'thatch';
/** What a flat roof is finished with. */
export type FlatRoofFinish = 'gravel' | 'membrane' | 'green';
/** Everything about how the roof looks, the same on every floor. */
export interface RoofLook {
  style: RoofStyle;
  material: RoofMaterial;
  flat: FlatRoofFinish;
}

/** A house saved with its floors, ground floor first. */
export interface HouseData {
  version: number;
  levels: GridModelData[];
  /** Flat if left out, as every house was before roofs could be pitched. */
  roof?: RoofStyle;
  /** Slate if left out, as every pitched roof was before there was a choice. */
  roofMaterial?: RoofMaterial;
  /** Gravel if left out. */
  flatRoof?: FlatRoofFinish;
  /** Railings drawn round every open upstairs edge and stairwell. On if left out. */
  autoRailings?: boolean;
  /** The style auto-railings are drawn in. Wooden if left out. */
  railingStyle?: FenceStyle;
}

/** The squares the stairs on this floor take up, which are a hole in the floor above. */
export function stairCells(model: GridModel): Set<string> {
  const cells = new Set<string>();
  for (const piece of model.allFurniture()) {
    if (!isStairs(piece.type)) continue;
    for (const { x, z } of getFootprintCells(piece.type, piece.x, piece.z, piece.rotation)) cells.add(cellKey(x, z));
  }
  return cells;
}

/** Where each flight of stairs on this floor comes out on the floor above: the square past its top step, and the top step itself. */
export function stairLandings(model: GridModel): { top: { x: number; z: number }; last: { x: number; z: number } }[] {
  const landings: { top: { x: number; z: number }; last: { x: number; z: number } }[] = [];
  for (const piece of model.allFurniture()) {
    const shape = getFurnitureDef(piece.type).stairs;
    if (!shape) continue;
    landings.push({
      top: pieceSquare(piece.type, piece.x, piece.z, piece.rotation, shape.exit),
      last: pieceSquare(piece.type, piece.x, piece.z, piece.rotation, shape.path[shape.path.length - 1]),
    });
  }
  return landings;
}

/**
 * The squares a floor holds up on the floor above it. A room's ceiling spans
 * it from wall to wall; past that, a floor reaches out up to OVERHANG squares
 * from a wall or pillar, and stairs hold up the square they come out on and
 * the ones round it. Never a stairwell.
 */
function supportedAbove(below: GridModel): Set<string> {
  const supported = new Set<string>();
  const near = (x: number, z: number, reach: number) => {
    for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) supported.add(cellKey(x + dx, z + dz));
  };
  // A square beside a wall or a pillar is held up, and so are those up to a square further out.
  const reach = OVERHANG - 1;
  for (const room of below.allRooms()) for (const { x, z } of room.cells) supported.add(cellKey(x, z));
  for (const wall of below.allWalls()) for (const side of wallSides(wall.x, wall.z, wall.dir)) near(side.x, side.z, reach);
  for (const pillar of below.allPillars()) {
    for (const [dx, dz] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) near(pillar.x + dx, pillar.z + dz, reach);
  }
  for (const { top } of stairLandings(below)) near(top.x, top.z, 1);
  for (const stair of stairCells(below)) supported.delete(stair);
  return supported;
}

/**
 * The floors with every piece's id its own across the house. Each floor once
 * only checked its own, so a piece upstairs could share an id with one
 * downstairs. Any repeat gets a new id.
 */
function uniqueFurnitureIds(levels: GridModelData[]): GridModelData[] {
  const seen = new Set<string>();
  const all = levels.flatMap((level) => level.furniture.map((piece) => piece.id));
  let next = 1 + all.reduce((most, id) => Math.max(most, Number(id.slice(1)) || 0), 0);
  return levels.map((level) => ({
    ...level,
    furniture: level.furniture.map((piece) => {
      if (!seen.has(piece.id)) {
        seen.add(piece.id);
        return piece;
      }
      const id = `f${next++}`;
      seen.add(id);
      return { ...piece, id };
    }),
  }));
}

/**
 * A house of one or more floors, each its own GridModel with its own walls,
 * floors, furniture and rooms. The ground floor is level 0. A floor above the
 * ground keeps to a few rules, so nothing hangs in the air: its tiles are held
 * up by the rooms, walls, pillars and stairs below, its walls stand on that
 * floor or on a wall below, and nothing goes in a stairwell.
 */
export class House {
  readonly levels: GridModel[] = [];
  /** Called with the floor that changed. */
  onChange: ((level: number) => void) | null = null;
  /** The same on every floor. */
  roofStyle: RoofStyle = 'flat';
  roofMaterial: RoofMaterial = 'slate';
  flatRoof: FlatRoofFinish = 'gravel';
  /** Railings round every open upstairs edge and stairwell, drawn for you. */
  autoRailings = true;
  railingStyle: FenceStyle = 'wood-rail';
  /** While loading a whole house, so it's one change rather than one per floor. */
  private quiet = false;

  constructor() {
    this.addLevel();
  }

  get ground(): GridModel {
    return this.levels[0];
  }

  /** A new, empty floor on top, unless the house is as tall as it goes. */
  addLevel(): GridModel | null {
    if (this.levels.length >= MAX_LEVELS) return null;
    const level = this.levels.length;
    const model = new GridModel();
    if (level > 0) {
      const below = this.levels[level - 1];
      model.rules = {
        canFloor: (x, z) => this.supported(level).has(cellKey(x, z)),
        canWall: (x, z, dir) => this.supportsWall(model, below, x, z, dir),
        // A railing upstairs runs along the edge of a tile on its own floor.
        canFence: (x, z, dir) => wallSides(x, z, dir).some((side) => model.hasFloor(side.x, side.z)),
        // A pillar upstairs stands on a tile on its own floor.
        canPillar: (x, z) => [[-1, -1], [-1, 0], [0, -1], [0, 0]].some(([dx, dz]) => model.hasFloor(x + dx, z + dz)),
      };
      // A new tile upstairs gets the railing picked before it was laid.
      model.newTileRail = (): TileRail => (this.autoRailings ? this.railingStyle : 'none');
    }
    // A pool can't be dug under anything standing on the ground, though rugs and pool things are fine.
    if (level === 0) {
      model.poolBlocker = (x, z) =>
        model.allFurniture().some((piece) => {
          const def = getFurnitureDef(piece.type);
          if (def.onFloor || def.onTop || def.onWall || def.onCeiling || def.pool) return false;
          return getFootprintCells(piece.type, piece.x, piece.z, piece.rotation).some((cell) => cell.x === x && cell.z === z);
        });
    }
    model.onChange = () => {
      if (!this.quiet) this.onChange?.(level);
    };
    model.idTaken = (id) => this.levels.some((other) => other !== model && other.hasFurnitureId(id));
    this.levels.push(model);
    return model;
  }

  /** Whether a floor has anything on it. */
  isEmpty(level: number): boolean {
    const model = this.levels[level];
    return !model || (model.allFloors().length === 0 && model.allWalls().length === 0 && model.allFurniture().length === 0 && model.allFences().length === 0);
  }

  /** How many pieces of furniture there are on every floor. */
  furnitureCount(): number {
    return this.levels.reduce((sum, model) => sum + model.allFurniture().length, 0);
  }

  /** The squares the floor below holds up, kept until it changes, since a drag asks about every square. */
  private supportCache = new Map<number, { version: number; cells: Set<string> }>();

  /** Where a tile can go on this floor: wherever the floor below holds it up. */
  supported(level: number): Set<string> {
    const below = this.levels[level - 1];
    if (!below) return new Set();
    const cached = this.supportCache.get(level);
    if (cached && cached.version === below.version) return cached.cells;
    const cells = supportedAbove(below);
    this.supportCache.set(level, { version: below.version, cells });
    return cells;
  }

  /** Every square a floor tile can go on this floor, for the grid shown while building upstairs. */
  buildableCells(level: number): { x: number; z: number }[] {
    return [...this.supported(level)].map((key) => {
      const [x, z] = key.split(',').map(Number);
      return { x, z };
    }).filter(({ x, z }) => isCellInLot(x, z));
  }

  /** Tiles upstairs with nothing holding them up, as `level|x,z`: ones laid before the rules said so, or whose wall or pillar has just gone. */
  unsupportedTiles(): Set<string> {
    const loose = new Set<string>();
    this.levels.forEach((model, level) => {
      if (level === 0) return;
      const supported = this.supported(level);
      for (const { x, z } of model.allFloors()) if (!supported.has(cellKey(x, z))) loose.add(`${level}|${x},${z}`);
    });
    return loose;
  }

  /** A wall can stand on a wall below, or beside a tile on this floor or the floor below. */
  private supportsWall(model: GridModel, below: GridModel, x: number, z: number, dir: Direction): boolean {
    if (below.hasWall(x, z, dir)) return true;
    return wallSides(x, z, dir).some((side) => model.hasFloor(side.x, side.z) || below.hasFloor(side.x, side.z));
  }

  setRoofStyle(style: RoofStyle) {
    if (style === this.roofStyle) return;
    this.roofStyle = style;
    this.onChange?.(-1);
  }

  /** What pitched roofs are covered in, or what flat ones are finished with. */
  setRoofCovering(covering: { material?: RoofMaterial; flat?: FlatRoofFinish }) {
    const material = covering.material ?? this.roofMaterial;
    const flat = covering.flat ?? this.flatRoof;
    if (material === this.roofMaterial && flat === this.flatRoof) return;
    this.roofMaterial = material;
    this.flatRoof = flat;
    this.onChange?.(-1);
  }

  get roofLook(): RoofLook {
    return { style: this.roofStyle, material: this.roofMaterial, flat: this.flatRoof };
  }

  /**
   * The edges upstairs that get a railing drawn for you: every edge of a tile
   * that drops away, to nothing or down a stairwell, with no wall or fence of
   * its own, except where stairs come up onto the floor.
   */
  autoRailingEdges(level: number): { x: number; z: number; dir: Direction; style: FenceStyle }[] {
    const model = this.levels[level];
    const below = this.levels[level - 1];
    if (!model || !below) return [];
    const holes = stairCells(below);
    const standsOn = (x: number, z: number) => model.hasFloor(x, z) && !holes.has(cellKey(x, z));
    // The edge each flight of stairs comes up through.
    const openings = new Set<string>();
    for (const piece of below.allFurniture()) {
      const shape = getFurnitureDef(piece.type).stairs;
      if (!shape) continue;
      const last = pieceSquare(piece.type, piece.x, piece.z, piece.rotation, shape.path[shape.path.length - 1]);
      const top = pieceSquare(piece.type, piece.x, piece.z, piece.rotation, shape.exit);
      const step = STEPS.find(({ dx, dz }) => dx === top.x - last.x && dz === top.z - last.z);
      if (step) openings.add(wallKey(last.x, last.z, step.dir));
    }
    const edges: { x: number; z: number; dir: Direction; style: FenceStyle }[] = [];
    for (const { x, z, rail } of model.allFloors()) {
      // Each tile keeps the railing it was laid with, so picking another style later only changes tiles laid after.
      const style = rail ?? 'none';
      if (style === 'none' || !standsOn(x, z)) continue;
      for (const { dx, dz, dir } of STEPS) {
        if (standsOn(x + dx, z + dz) || model.hasWall(x, z, dir) || model.hasFence(x, z, dir) || openings.has(wallKey(x, z, dir))) continue;
        edges.push({ x, z, dir, style });
      }
    }
    return edges;
  }

  /** Turns auto-railings on or off, or changes their style, for tiles laid from now on. Tiles already laid keep theirs. */
  setAutoRailings(on: boolean, style: FenceStyle = this.railingStyle) {
    this.autoRailings = on;
    this.railingStyle = style;
  }

  toJSON(): HouseData {
    const levels = this.levels.map((model) => model.toJSON());
    // Empty floors on top aren't worth keeping.
    while (levels.length > 1 && this.isEmpty(levels.length - 1)) levels.pop();
    return {
      version: HOUSE_VERSION,
      levels,
      ...(this.roofStyle !== 'flat' && { roof: this.roofStyle }),
      ...(this.roofMaterial !== 'slate' && { roofMaterial: this.roofMaterial }),
      ...(this.flatRoof !== 'gravel' && { flatRoof: this.flatRoof }),
      ...(!this.autoRailings && { autoRailings: false }),
      ...(this.railingStyle !== 'wood-rail' && { railingStyle: this.railingStyle }),
    };
  }

  /** Loads every floor at once. Floors the save doesn't have are emptied. */
  loadJSON(data: HouseData) {
    this.quiet = true;
    this.roofStyle = data.roof ?? 'flat';
    this.roofMaterial = data.roofMaterial ?? 'slate';
    this.flatRoof = data.flatRoof ?? 'gravel';
    this.autoRailings = data.autoRailings ?? true;
    this.railingStyle = data.railingStyle ?? 'wood-rail';
    try {
      while (this.levels.length < Math.min(MAX_LEVELS, data.levels.length)) this.addLevel();
      const levels = uniqueFurnitureIds(data.levels);
      this.levels.forEach((model, level) => {
        const saved = levels[level];
        if (saved) model.loadJSON(saved);
        else model.clear();
        // Tiles from before each kept its own railing get the one the whole house had.
        if (level > 0) for (const tile of model.allFloors()) tile.rail ??= this.autoRailings ? this.railingStyle : 'none';
      });
    } finally {
      this.quiet = false;
    }
    this.onChange?.(-1);
  }

  /** Every floor emptied. */
  clear() {
    this.roofStyle = 'flat';
    this.roofMaterial = 'slate';
    this.flatRoof = 'gravel';
    this.autoRailings = true;
    this.railingStyle = 'wood-rail';
    this.quiet = true;
    try {
      for (const model of this.levels) model.clear();
    } finally {
      this.quiet = false;
    }
    this.onChange?.(-1);
  }
}
