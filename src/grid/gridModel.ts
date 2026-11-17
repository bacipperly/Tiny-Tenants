import { cellKey, detectRooms, wallChangesRooms, wallSides } from './roomDetection';

export type Direction = 'N' | 'E' | 'S' | 'W';
export type ApertureKind = 'door' | 'window';
export type WindowSize = 'small' | 'standard' | 'tall';
/** What's in a doorway: nothing at all, an arch, or one of the doors that open as a pawn comes through. */
export type DoorStyle = 'open' | 'arch' | 'wood' | 'glass' | 'french' | 'sliding' | 'barn' | 'saloon';

export interface WallSegment {
  x: number;
  z: number;
  dir: Direction;
  /** Hex color (e.g. "#e8a0b0") of the side facing cell (x,z); unset means the default wall color. */
  ownerColor?: string;
  /** Hex color of the side facing the neighboring cell across this edge; unset means the default wall color. */
  neighborColor?: string;
}

/** A door or window attached to the wall on the same edge; it can't exist without that wall. */
export interface ApertureObject {
  x: number;
  z: number;
  dir: Direction;
  kind: ApertureKind;
  /** Windows only; unset means standard. */
  size?: WindowSize;
  /** Doors only; unset means an open doorway, which is all a door used to be. */
  style?: DoorStyle;
}

/** What a floor tile is made of. Plain if it's never been set, as every tile was before there were surfaces. */
export type FloorSurface = 'plain' | 'planks' | 'parquet' | 'tile' | 'checker' | 'stone' | 'carpet' | 'pavers' | 'asphalt' | 'road-line' | 'road-double' | 'crosswalk';

/** The railing drawn along a tile's open edges upstairs, or none. */
export type TileRail = FenceStyle | 'none';

export interface FloorCell {
  x: number;
  z: number;
  roomId: number;
  /** Hex color override (e.g. "#a7c957"); unset means the surface's own color. */
  color?: string;
  /** Plain if unset. */
  surface?: FloorSurface;
  /** Upstairs: the railing round this tile's open edges, picked when it was laid. */
  rail?: TileRail;
}

/** How a pillar looks. */
export type PillarStyle = 'wood' | 'column' | 'stone' | 'steel';

/** A post standing on a grid corner, holding up the floor above. Corner (x,z) is the low-x, low-z corner of cell (x,z). */
export interface Pillar {
  x: number;
  z: number;
  style: PillarStyle;
}

/** What a square of water is: a deep pool to swim in, or a shallow spa with a bench round it to soak in. */
export type PoolKind = 'pool' | 'spa';

/** A square of pool or spa, sunk into the ground. Only ever on the ground floor. */
export interface PoolCell {
  x: number;
  z: number;
  kind: PoolKind;
}

/** The paint on the gable end above the outside of square (x, z), on the `dir` side. */
export interface GablePaint {
  x: number;
  z: number;
  dir: Direction;
  color: string;
}

export interface FurniturePiece {
  id: string;
  type: string;
  x: number;
  z: number;
  rotation: 0 | 90 | 180 | 270;
  /** Whether something you switch on and off, like a fireplace, is on. Off if it's never been lit. */
  lit?: boolean;
  /** Hex color it's been given, like a bed's bedding. Its own color if unset. */
  color?: string;
  /** Something that grows, like a hedge: the day it was planted, counting from the first day played. */
  plantedOn?: number;
}

/** What a fence or railing looks like. */
export type FenceStyle = 'picket' | 'ranch' | 'privacy' | 'stone' | 'wood-rail' | 'iron-rail' | 'glass-rail' | 'half-wall';

/** A fence or railing along the edge between two squares: low, never a room's wall, and only a gate lets pawns through. */
export interface FenceSegment {
  x: number;
  z: number;
  dir: Direction;
  style: FenceStyle;
  /** A gate in the fence, which swings open for pawns. */
  gate?: boolean;
  /** Painted with the Paint tool; unset means the style's own colors. */
  color?: string;
}

export interface GridModelData {
  walls: (WallSegment & { kind?: string; color?: string })[];
  floors: FloorCell[];
  furniture: FurniturePiece[];
  /** Which version of the save format this is. Missing from saves made before versions were kept. */
  version?: number;
  apertures?: ApertureObject[];
  /** Left out of saves from before there were fences. */
  fences?: FenceSegment[];
  /** Upstairs: edges whose railing drawn for you has been taken away, by wall key. Left out if there are none. */
  railGaps?: string[];
  /** Squares roofed in a style of their own, rather than the house's. Left out if there are none. */
  roofAreas?: { x: number; z: number; style: 'flat' | 'hip' | 'gable' }[];
  /** Left out of saves without any. */
  pillars?: Pillar[];
  /** Gable ends painted by hand. Left out of saves without any: the rest take the color of the wall below. */
  gables?: GablePaint[];
  /** Pool and spa squares. Left out of saves without any. */
  pools?: PoolCell[];
}

/** Canonical key for a wall edge. Each edge is shared by two adjacent cells
 * (e.g. the N wall of (x,z) is the same edge as the S wall of (x,z+1)), so we
 * normalize to a single owning cell/direction pair to avoid storing duplicates. */
export function wallKey(x: number, z: number, dir: Direction): string {
  const [ox, oz, odir] = normalizeWall(x, z, dir);
  return `${ox},${oz},${odir}`;
}

function normalizeWall(x: number, z: number, dir: Direction): [number, number, Direction] {
  if (dir === 'S') return [x, z - 1, 'N'];
  if (dir === 'W') return [x - 1, z, 'E'];
  return [x, z, dir];
}

const floorKey = cellKey;

let furnitureIdCounter = 0;

/** 2: the desk and the computer became separate pieces. */
export const SAVE_VERSION = 2;

export class GridModel {
  private walls = new Map<string, WallSegment>();
  private apertures = new Map<string, ApertureObject>();
  private fences = new Map<string, FenceSegment>();
  /** Edges whose auto-railing has been deleted, by wall key. */
  private railGaps = new Set<string>();
  /** Squares roofed in a style of their own, by cell key. */
  private roofAreas = new Map<string, 'flat' | 'hip' | 'gable'>();
  private pillars = new Map<string, Pillar>();
  private gables = new Map<string, GablePaint>();
  private pools = new Map<string, PoolCell>();
  private floors = new Map<string, FloorCell>();
  private furniture = new Map<string, FurniturePiece>();
  /** Cells enclosed by walls, by room id. A cell that isn't listed is outside. */
  private roomCells = new Map<string, number>();
  private roomsStale = false;
  private pendingWallAdds: WallSegment[] = [];
  private batching = false;
  private batchDirty = false;

  onChange: (() => void) | null = null;
  /** Where tiles and walls may go, on a floor above the ground. Left unset on the ground floor, where they go anywhere. Loading a save doesn't check them. */
  rules: {
    canFloor: (x: number, z: number) => boolean;
    canWall: (x: number, z: number, dir: Direction) => boolean;
    canFence: (x: number, z: number, dir: Direction) => boolean;
    canPillar: (x: number, z: number) => boolean;
  } | null = null;

  /** Upstairs, the railing a new tile gets, picked before it's laid. */
  newTileRail: (() => TileRail) | null = null;

  /** Whether another floor of the house already has a piece with this id, so every piece's id is its own across the house. */
  idTaken: ((id: string) => boolean) | null = null;

  hasFurnitureId(id: string): boolean {
    return this.furniture.has(id);
  }

  /** Goes up with every change, so anything worked out from this floor can tell when it's out of date. */
  version = 0;

  private notify() {
    this.version++;
    if (this.batching) {
      this.batchDirty = true;
      return;
    }
    this.updateRoomsIfNeeded();
    this.onChange?.();
  }

  /** Runs `fn`, deferring onChange until it finishes, so a drag that touches
   * many cells triggers one rebuild instead of one per cell. */
  batch(fn: () => void) {
    const wasBatching = this.batching;
    this.batching = true;
    try {
      fn();
    } finally {
      this.batching = wasBatching;
      if (!this.batching && this.batchDirty) {
        this.batchDirty = false;
        this.updateRoomsIfNeeded();
        this.onChange?.();
      }
    }
  }

  // --- Walls ---

  setWall(x: number, z: number, dir: Direction) {
    if (this.rules && !this.hasWall(x, z, dir) && !this.rules.canWall(x, z, dir)) return;
    const [ox, oz, odir] = normalizeWall(x, z, dir);
    const existing = this.walls.get(wallKey(ox, oz, odir));
    const wall: WallSegment = { x: ox, z: oz, dir: odir, ownerColor: existing?.ownerColor, neighborColor: existing?.neighborColor };
    this.walls.set(wallKey(ox, oz, odir), wall);
    // A wall takes the place of any fence on its edge.
    this.fences.delete(wallKey(ox, oz, odir));
    if (!existing) this.pendingWallAdds.push(wall);
    this.notify();
  }

  removeWall(x: number, z: number, dir: Direction) {
    const existing = this.walls.get(wallKey(x, z, dir));
    if (existing) {
      const [sideA, sideB] = wallSides(existing.x, existing.z, existing.dir);
      // Both sides already in the same room, or both outside, means removing this edge changes nothing.
      const sameRegion = this.roomIdAt(sideA.x, sideA.z) === this.roomIdAt(sideB.x, sideB.z);
      if (!sameRegion || this.pendingWallAdds.length > 0) this.roomsStale = true;
    }
    this.walls.delete(wallKey(x, z, dir));
    this.apertures.delete(wallKey(x, z, dir));
    this.notify();
  }

  // --- Fences and railings ---

  /** Does nothing where there's a wall, or upstairs where there's no tile on either side. Replaces any fence already there. */
  setFence(x: number, z: number, dir: Direction, style: FenceStyle, gate = false) {
    if (this.hasWall(x, z, dir)) return;
    if (this.rules && !this.rules.canFence(x, z, dir)) return;
    const [ox, oz, odir] = normalizeWall(x, z, dir);
    this.fences.set(wallKey(ox, oz, odir), { x: ox, z: oz, dir: odir, style, ...(gate && { gate }) });
    this.notify();
  }

  removeFence(x: number, z: number, dir: Direction) {
    if (!this.fences.delete(wallKey(x, z, dir))) return;
    this.notify();
  }

  /** Changes a fence to another style, keeping its gate and paint. */
  restyleFence(x: number, z: number, dir: Direction, style: FenceStyle) {
    const fence = this.getFence(x, z, dir);
    if (!fence || fence.style === style) return;
    this.fences.set(wallKey(x, z, dir), { ...fence, style });
    this.notify();
  }

  /** Paints a fence, or with no color, puts it back to its style's own colors. */
  paintFence(x: number, z: number, dir: Direction, color: string | undefined) {
    const fence = this.getFence(x, z, dir);
    if (!fence || fence.color === color) return;
    const { color: _old, ...rest } = fence;
    this.fences.set(wallKey(x, z, dir), color ? { ...rest, color } : rest);
    this.notify();
  }

  /** Takes away the railing drawn for you along one edge upstairs, leaving the rest. */
  removeRailing(x: number, z: number, dir: Direction) {
    const key = wallKey(x, z, dir);
    if (this.railGaps.has(key)) return;
    this.railGaps.add(key);
    this.notify();
  }

  /** Roofs these squares, a room say, in a style of their own; with none, they go back to the house's roof. */
  setRoofArea(cells: { x: number; z: number }[], style: 'flat' | 'hip' | 'gable' | null) {
    let changed = false;
    for (const { x, z } of cells) {
      const key = cellKey(x, z);
      if ((this.roofAreas.get(key) ?? null) === style) continue;
      if (style) this.roofAreas.set(key, style);
      else this.roofAreas.delete(key);
      changed = true;
    }
    if (changed) this.notify();
  }

  /** The roof style of a square of its own, if it has one. */
  roofAreaAt(x: number, z: number): 'flat' | 'hip' | 'gable' | undefined {
    return this.roofAreas.get(cellKey(x, z));
  }

  /** Whether any squares have a roof style of their own. */
  get hasRoofAreas(): boolean {
    return this.roofAreas.size > 0;
  }

  /** Puts every square back to the house's roof. */
  clearRoofAreas() {
    if (this.roofAreas.size === 0) return;
    this.roofAreas.clear();
    this.notify();
  }

  /** Whether the railing drawn for you along this edge has been taken away. */
  hasRailGap(x: number, z: number, dir: Direction): boolean {
    return this.railGaps.has(wallKey(x, z, dir));
  }

  getFence(x: number, z: number, dir: Direction): FenceSegment | undefined {
    return this.fences.get(wallKey(x, z, dir));
  }

  hasFence(x: number, z: number, dir: Direction): boolean {
    return this.fences.has(wallKey(x, z, dir));
  }

  allFences(): FenceSegment[] {
    return Array.from(this.fences.values());
  }

  // --- Pillars ---

  /** Replaces any pillar already on this corner. Upstairs, only beside a tile. */
  setPillar(x: number, z: number, style: PillarStyle) {
    if (this.rules && !this.rules.canPillar(x, z)) return;
    if (this.pillars.get(cellKey(x, z))?.style === style) return;
    this.pillars.set(cellKey(x, z), { x, z, style });
    this.notify();
  }

  removePillar(x: number, z: number) {
    if (!this.pillars.delete(cellKey(x, z))) return;
    this.notify();
  }

  hasPillar(x: number, z: number): boolean {
    return this.pillars.has(cellKey(x, z));
  }

  allPillars(): Pillar[] {
    return Array.from(this.pillars.values());
  }

  // --- Pools ---

  /**
   * Digs a square of pool or spa here, or changes which it is. Only on the
   * ground floor, and not under a floor tile or anything standing there,
   * which a pool would swallow.
   */
  setPool(x: number, z: number, kind: PoolKind) {
    if (this.rules) return;
    const key = cellKey(x, z);
    if (this.pools.get(key)?.kind === kind) return;
    if (this.floors.has(floorKey(x, z))) return;
    if (!this.pools.has(key) && this.poolBlocker?.(x, z)) return;
    this.pools.set(key, { x, z, kind });
    this.notify();
  }

  removePool(x: number, z: number) {
    if (!this.pools.delete(cellKey(x, z))) return;
    this.notify();
  }

  getPool(x: number, z: number): PoolCell | undefined {
    return this.pools.get(cellKey(x, z));
  }

  hasPool(x: number, z: number): boolean {
    return this.pools.has(cellKey(x, z));
  }

  allPools(): PoolCell[] {
    return Array.from(this.pools.values());
  }

  /** Whether something on this square, like a sofa, keeps a pool from being dug there. */
  poolBlocker: ((x: number, z: number) => boolean) | null = null;

  // --- Gable ends ---

  /** Paints the gable end above the `dir` side of square (x, z). No color takes the paint off, so it goes back to matching the wall below. */
  paintGable(x: number, z: number, dir: Direction, color: string | undefined) {
    const key = `${x},${z},${dir}`;
    if (this.gables.get(key)?.color === color) return;
    if (color) this.gables.set(key, { x, z, dir, color });
    else if (!this.gables.delete(key)) return;
    this.notify();
  }

  /** The paint on a gable end, or undefined where it follows the wall below. */
  gableColor(x: number, z: number, dir: Direction): string | undefined {
    return this.gables.get(`${x},${z},${dir}`)?.color;
  }

  allGables(): GablePaint[] {
    return Array.from(this.gables.values());
  }

  // --- Doors and windows ---

  /** Does nothing unless a wall is on this edge, and replaces any door or window already there. */
  placeAperture(x: number, z: number, dir: Direction, kind: ApertureKind, size?: WindowSize, style?: DoorStyle) {
    if (!this.hasWall(x, z, dir)) return;
    const [ox, oz, odir] = normalizeWall(x, z, dir);
    this.apertures.set(wallKey(ox, oz, odir), { x: ox, z: oz, dir: odir, kind, ...(size && { size }), ...(style && { style }) });
    this.notify();
  }

  removeAperture(x: number, z: number, dir: Direction) {
    this.apertures.delete(wallKey(x, z, dir));
    this.notify();
  }

  getAperture(x: number, z: number, dir: Direction): ApertureObject | undefined {
    return this.apertures.get(wallKey(x, z, dir));
  }

  allApertures(): ApertureObject[] {
    return Array.from(this.apertures.values());
  }

  getWall(x: number, z: number, dir: Direction): WallSegment | undefined {
    return this.walls.get(wallKey(x, z, dir));
  }

  hasWall(x: number, z: number, dir: Direction): boolean {
    return this.walls.has(wallKey(x, z, dir));
  }

  allWalls(): WallSegment[] {
    return Array.from(this.walls.values());
  }

  /** Recolors the side of a wall that looks into `facing`, one of the two cells it separates; a no-op if there's no wall here. */
  paintWallFace(x: number, z: number, dir: Direction, facing: { x: number; z: number }, color: string) {
    const seg = this.walls.get(wallKey(x, z, dir));
    if (!seg) return;
    const side = facing.x === seg.x && facing.z === seg.z ? 'ownerColor' : 'neighborColor';
    if (seg[side] === color) return;
    seg[side] = color;
    this.notify();
  }

  /** The stored color of the side of a wall that looks into `facing`; undefined means it's unpainted. */
  wallFaceColor(x: number, z: number, dir: Direction, facing: { x: number; z: number }): string | undefined {
    const seg = this.walls.get(wallKey(x, z, dir));
    if (!seg) return undefined;
    return facing.x === seg.x && facing.z === seg.z ? seg.ownerColor : seg.neighborColor;
  }

  // --- Floors / rooms ---

  /** Lays a tile, or changes an existing tile's surface. A tile already there keeps its color and railing. */
  setFloor(x: number, z: number, surface?: FloorSurface) {
    const existing = this.floors.get(floorKey(x, z));
    if (this.rules && !existing && !this.rules.canFloor(x, z)) return;
    // Water's no place for a floor tile.
    if (this.pools.has(cellKey(x, z))) return;
    if (existing && (surface === undefined || (existing.surface ?? 'plain') === surface)) return;
    const rail = existing ? existing.rail : this.newTileRail?.();
    const chosen = surface ?? existing?.surface;
    this.floors.set(floorKey(x, z), {
      x, z, roomId: this.roomIdAt(x, z),
      ...(existing?.color && { color: existing.color }),
      ...(chosen && chosen !== 'plain' && { surface: chosen }),
      ...(rail && { rail }),
    });
    this.notify();
  }

  removeFloor(x: number, z: number) {
    this.floors.delete(floorKey(x, z));
    this.notify();
  }

  hasFloor(x: number, z: number): boolean {
    return this.floors.has(floorKey(x, z));
  }

  getFloor(x: number, z: number): FloorCell | undefined {
    return this.floors.get(floorKey(x, z));
  }

  allFloors(): FloorCell[] {
    return Array.from(this.floors.values());
  }

  /** Recolors an existing floor tile; a no-op if there's no floor there yet. */
  paintFloor(x: number, z: number, color: string) {
    const cell = this.floors.get(floorKey(x, z));
    if (!cell) return;
    cell.color = color;
    this.notify();
  }

  // --- Rooms: sealed by walls, whether or not they have floors ---

  /** The room containing this cell, or 0 if it's outside. */
  roomIdAt(x: number, z: number): number {
    return this.roomCells.get(cellKey(x, z)) ?? 0;
  }

  allRooms(): { id: number; cells: { x: number; z: number }[] }[] {
    const rooms = new Map<number, { x: number; z: number }[]>();
    for (const [key, id] of this.roomCells) {
      const [x, z] = key.split(',').map(Number);
      const cells = rooms.get(id) ?? [];
      cells.push({ x, z });
      rooms.set(id, cells);
    }
    return Array.from(rooms, ([id, cells]) => ({ id, cells }));
  }

  private updateRoomsIfNeeded() {
    const adds = this.pendingWallAdds;
    this.pendingWallAdds = [];
    let needsRecompute = this.roomsStale || adds.length > 1;
    if (!needsRecompute && adds.length === 1) {
      needsRecompute = wallChangesRooms(adds[0], this.allWalls(), this.hasWallAt);
    }
    if (needsRecompute) this.recomputeRooms();
  }

  private recomputeRooms() {
    this.roomsStale = false;
    this.roomCells = detectRooms(this.allWalls(), this.hasWallAt);
    for (const floor of this.floors.values()) floor.roomId = this.roomIdAt(floor.x, floor.z);
  }

  private hasWallAt = (x: number, z: number, dir: Direction) => this.hasWall(x, z, dir);

  // --- Furniture ---

  addFurniture(type: string, x: number, z: number, rotation: 0 | 90 | 180 | 270 = 0): string {
    // The counter restarts on page load, but loaded pieces keep their saved ids.
    let id = `f${furnitureIdCounter++}`;
    while (this.furniture.has(id) || this.idTaken?.(id)) id = `f${furnitureIdCounter++}`;
    this.furniture.set(id, { id, type, x, z, rotation });
    this.notify();
    return id;
  }

  removeFurniture(id: string) {
    this.furniture.delete(id);
    this.notify();
  }

  /** Picks a piece up and puts it down somewhere else, turned however it's turned now. */
  /** Notes the day something that grows was planted, so it can grow in from there. */
  plantFurniture(id: string, day: number) {
    const piece = this.furniture.get(id);
    if (!piece) return;
    this.furniture.set(id, { ...piece, plantedOn: day });
    this.notify();
  }

  moveFurniture(id: string, x: number, z: number, rotation: 0 | 90 | 180 | 270) {
    const piece = this.furniture.get(id);
    if (!piece) return;
    // A new object rather than changed in place, so anyone holding the old one can tell it's moved.
    this.furniture.set(id, { ...piece, x, z, rotation });
    this.notify();
  }

  /** Lights a fire, or puts it out. */
  setFurnitureLit(id: string, lit: boolean) {
    const piece = this.furniture.get(id);
    if (!piece || (piece.lit ?? false) === lit) return;
    this.furniture.set(id, { ...piece, lit });
    this.notify();
  }

  /** Recolors a piece, like a bed's bedding. No color puts it back to its own. */
  setFurnitureColor(id: string, color: string | undefined) {
    const piece = this.furniture.get(id);
    if (!piece || piece.color === color) return;
    const { color: _old, ...rest } = piece;
    this.furniture.set(id, color ? { ...rest, color } : rest);
    this.notify();
  }

  rotateFurniture(id: string, delta: 90 | -90 = 90) {
    const piece = this.furniture.get(id);
    if (!piece) return;
    piece.rotation = (((piece.rotation + delta + 360) % 360) as 0 | 90 | 180 | 270);
    this.notify();
  }

  allFurniture(): FurniturePiece[] {
    return Array.from(this.furniture.values());
  }

  furnitureAt(x: number, z: number): FurniturePiece | undefined {
    return Array.from(this.furniture.values()).find((f) => f.x === x && f.z === z);
  }

  // --- Serialization ---

  toJSON(): GridModelData {
    return {
      walls: this.allWalls(),
      floors: this.allFloors(),
      furniture: this.allFurniture(),
      apertures: this.allApertures(),
      ...(this.fences.size > 0 && { fences: this.allFences() }),
      ...(this.pillars.size > 0 && { pillars: this.allPillars() }),
      ...(this.gables.size > 0 && { gables: this.allGables() }),
      ...(this.pools.size > 0 && { pools: this.allPools() }),
      ...(this.railGaps.size > 0 && { railGaps: [...this.railGaps] }),
      ...(this.roofAreas.size > 0 && { roofAreas: [...this.roofAreas].map(([key, style]) => ({ ...parseCell(key), style })) }),
      version: SAVE_VERSION,
    };
  }

  loadJSON(data: GridModelData) {
    this.walls.clear();
    this.apertures.clear();
    this.floors.clear();
    this.furniture.clear();
    for (const { kind, color, ...wall } of data.walls) {
      const key = wallKey(wall.x, wall.z, wall.dir);
      // Older saves stored one color for both sides of a wall.
      this.walls.set(key, color ? { ...wall, ownerColor: color, neighborColor: color } : wall);
      // Older saves stored a door or window as a type of wall.
      if (kind === 'door' || kind === 'window') this.apertures.set(key, { x: wall.x, z: wall.z, dir: wall.dir, kind });
    }
    for (const a of data.apertures ?? []) {
      if (this.hasWall(a.x, a.z, a.dir)) this.apertures.set(wallKey(a.x, a.z, a.dir), a);
    }
    this.fences.clear();
    for (const fence of data.fences ?? []) if (!this.hasWall(fence.x, fence.z, fence.dir)) this.fences.set(wallKey(fence.x, fence.z, fence.dir), fence);
    this.pillars.clear();
    for (const pillar of data.pillars ?? []) this.pillars.set(cellKey(pillar.x, pillar.z), pillar);
    this.gables.clear();
    for (const gable of data.gables ?? []) this.gables.set(`${gable.x},${gable.z},${gable.dir}`, gable);
    this.pools.clear();
    for (const pool of data.pools ?? []) this.pools.set(cellKey(pool.x, pool.z), pool);
    this.railGaps = new Set(data.railGaps ?? []);
    this.roofAreas = new Map((data.roofAreas ?? []).map(({ x, z, style }) => [cellKey(x, z), style]));
    for (const f of data.floors) this.floors.set(floorKey(f.x, f.z), f);
    for (const p of data.furniture) this.furniture.set(p.id, p);
    this.roomsStale = true;
    this.notify();
  }

  clear() {
    this.walls.clear();
    this.apertures.clear();
    this.fences.clear();
    this.railGaps.clear();
    this.roofAreas.clear();
    this.pillars.clear();
    this.gables.clear();
    this.pools.clear();
    this.floors.clear();
    this.furniture.clear();
    this.roomCells.clear();
    this.pendingWallAdds = [];
    this.roomsStale = false;
    this.notify();
  }
}

function parseCell(key: string): { x: number; z: number } {
  const [x, z] = key.split(',').map(Number);
  return { x, z };
}
