import * as THREE from 'three';
import { STEPS, cellKey } from '../grid/roomDetection';
import { getFootprintCells, getFurnitureDef, joinedRun, seatEntrances } from '../build/furnitureCatalog';
import type { FurnitureUseKind } from '../build/furnitureCatalog';
import { canStep, findPath } from './pathfinding';
import type { Cell } from './pathfinding';
import { placeKey } from './world';
import type { LevelPiece, World } from './world';

/** A specific way for a pawn to use a piece: where it walks to, and where it settles if it sits or lies down. */
export interface FurnitureSpot {
  piece: LevelPiece;
  kind: FurnitureUseKind;
  /** The floor square next to the piece that the pawn walks to first. */
  approach: Cell;
  /** The square of the piece the pawn settles onto; null if it just stands at the piece. */
  seat: Seat | null;
  /** The other seats of a booth or sectional a pawn slides along to get from the approach to its own, in order. */
  via?: Cell[];
  /** A chair in front of the piece that the pawn sits in to use it, like the chair at a desk with a computer on it. `seat` is then the chair's square. */
  chair?: LevelPiece;
}

/** A square of a piece a pawn settles onto. On a bunk bed, tier 1 is the top bunk, above the bottom one on the same square. */
export type Seat = Cell & { tier?: number };

/** The piece whose seat a spot takes up: the chair it sits in to use something, or else the piece itself. */
export function seatPiece(spot: FurnitureSpot): LevelPiece {
  return spot.chair ?? spot.piece;
}

/** Identifies one seat, so two pawns can't claim the same one. */
export function seatKey(piece: { id: string }, seat: { x: number; z: number; tier?: number }): string {
  return `${piece.id}:${cellKey(seat.x, seat.z)}${seat.tier ? `:${seat.tier}` : ''}`;
}

/** How high a pawn lies or sits on a seat: the piece's own height, or a bunk bed's top bunk. */
export function seatHeight(type: string, seat: { tier?: number } | null): number {
  const def = getFurnitureDef(type);
  return seat?.tier && def.bunk ? def.bunk : def.height;
}

/** Whether the piece is still where it was when this spot was chosen. Moving, rotating or removing it means the pawn has to get up. */
export function isSpotStillValid(world: World, spot: FurnitureSpot): boolean {
  return isPieceStillThere(world, spot.piece) && (!spot.chair || isPieceStillThere(world, spot.chair));
}

export function isPieceStillThere(world: World, piece: LevelPiece): boolean {
  const current = world.allFurniture().find((other) => other.id === piece.id && other.level === piece.level);
  return current !== undefined && current.x === piece.x && current.z === piece.z && current.rotation === piece.rotation;
}

/**
 * The easiest free spot on this piece for a pawn starting at `from`. Each square
 * of a sofa is its own seat, a bed takes one sleeper, and a table can be used
 * from any open side. A fridge, stove or TV is only used from in front, and a
 * bed never from over its headboard, so a fridge facing a wall can't be used
 * at all until it's turned around. Null if nothing can be reached.
 */
export function findFurnitureSpot(world: World, piece: LevelPiece, from: Cell, occupied: Set<string>, takenSeats: Set<string>): FurnitureSpot | null {
  return findSpotFrom(world, piece, from, occupied, takenSeats, usableSides(piece));
}

/** The steps out from a piece that a pawn can use it from. */
function usableSides(piece: LevelPiece): readonly { dx: number; dz: number }[] {
  const { approach, onWall } = getFurnitureDef(piece.type);
  // A painting hangs over its own square, so that's where you stand to look at it.
  if (onWall) return [{ dx: 0, dz: 0 }];
  if (!approach) return STEPS;
  const front = frontStep(piece.rotation);
  if (approach === 'front') return [front];
  return STEPS.filter(({ dx, dz }) => dx !== -front.dx || dz !== -front.dz);
}

/** The step out from a piece's front, which faces +z before it's turned. */
function frontStep(rotation: number): { dx: number; dz: number } {
  const angle = THREE.MathUtils.degToRad(rotation);
  return { dx: Math.round(Math.sin(angle)), dz: Math.round(Math.cos(angle)) };
}

/** The way a piece faces, as a step, and the step to its right. */
function axes(rotation: number): { forward: { dx: number; dz: number }; right: { dx: number; dz: number } } {
  const forward = frontStep(rotation);
  return { forward, right: { dx: forward.dz, dz: -forward.dx } };
}

/** A bed's sleeping places: one for each square across its head, so a big bed sleeps two side by side. */
export function bedSpaces<C extends { x: number; z: number }>(piece: { rotation: number }, footprint: C[]): C[] {
  const { forward } = axes(piece.rotation);
  const along = (cell: C) => cell.x * forward.dx + cell.z * forward.dz;
  const head = Math.min(...footprint.map(along));
  return footprint.filter((cell) => along(cell) === head);
}

/** The squares of a bed down the same side as this sleeping place. */
function sameSide(footprint: Cell[], seat: Cell, rotation: number): Cell[] {
  const { right } = axes(rotation);
  const across = (cell: Cell) => cell.x * right.dx + cell.z * right.dz;
  return footprint.filter((cell) => across(cell) === across(seat));
}

function findSpotFrom(
  world: World,
  piece: LevelPiece,
  from: Cell,
  occupied: Set<string>,
  takenSeats: Set<string>,
  sides: readonly { dx: number; dz: number }[],
): FurnitureSpot | null {
  const { use: kind } = getFurnitureDef(piece.type);
  // A copy, because rotating changes the piece in place, and isSpotStillValid has to notice that.
  const pieceNow = { ...piece };
  const level = piece.level;
  const footprint = getFootprintCells(piece.type, piece.x, piece.z, piece.rotation).map(({ x, z }) => ({ x, z, level }));
  const inFootprint = new Set(footprint.map((cell) => cellKey(cell.x, cell.z)));
  const blocked = world.blocked(level);

  // A bunk bed sleeps one more on top of each sleeping place below.
  const beds = kind === 'lie' ? bedSpaces(piece, footprint) : [];
  const bunks: Seat[] = getFurnitureDef(piece.type).bunk ? beds.map((bed) => ({ ...bed, tier: 1 })) : [];
  const seats: (Seat | null)[] = kind === 'stand' ? [null] : kind === 'lie' ? [...beds, ...bunks] : footprint;
  let best: FurnitureSpot | null = null;
  let shortest = Infinity;
  // A seat in a booth or a sectional is got onto from anywhere along the run it's part of: a pawn steps up beside the run, then slides along it.
  const run = kind === 'sit' && getFurnitureDef(piece.type).joins ? seatRun(world, piece) : null;
  for (const seat of seats) {
    if (seat && takenSeats.has(seatKey(piece, seat))) continue;
    // A sofa is approached from beside the seat itself, and a side of a big bed from beside that side. Anything else can be reached from beside any of its squares.
    const reachFrom = kind === 'sit' && seat ? [seat] : kind === 'lie' && seat ? sameSide(footprint, seat, piece.rotation) : footprint;
    const entrances = run?.entrances ?? reachFrom.flatMap((cell) => sides.map((side) => ({ cell, ...side })));
    for (const { cell, dx, dz } of entrances) {
      const approach = { x: cell.x + dx, z: cell.z + dz, level };
      const key = cellKey(approach.x, approach.z);
      const standsUnder = dx === 0 && dz === 0;
      if (occupied.has(placeKey(approach))) continue;
      if (standsUnder ? blocked.has(key) || !world.standable(approach) : inFootprint.has(key) || !canStep(world, cell, approach)) {
        // A chair where the pawn would stand isn't in the way: it sits in it instead, like at a desk.
        const chairSpot = kind === 'stand' && !standsUnder && !inFootprint.has(key) ? spotInChair(world, pieceNow, cell, approach, from, occupied, takenSeats) : null;
        // Sitting down to it beats standing somewhere else, by a few steps' worth.
        if (chairSpot && chairSpot.length - CHAIR_PREFERENCE_STEPS < shortest) {
          shortest = chairSpot.length - CHAIR_PREFERENCE_STEPS;
          best = chairSpot.spot;
        }
        continue;
      }
      const via = run && seat ? slideAlong(run, cell, seat, takenSeats) : [];
      if (!via) continue;
      const { path, reachedGoal } = findPath(world, from, approach, occupied);
      if (reachedGoal && path.length + via.length < shortest) {
        shortest = path.length + via.length;
        best = { piece: pieceNow, kind, approach, seat, ...(via.length > 0 ? { via } : {}) };
      }
    }
  }
  return best;
}

/** A run of booth or sectional seats: every seat's square and who'd claim it, and every way onto the run, which is each seat and the steps off it that aren't into the seat's back or the next seat along. */
interface SeatRun {
  seats: { cell: Cell; key: string }[];
  entrances: { cell: Cell; dx: number; dz: number }[];
}

function seatRun(world: World, piece: LevelPiece): SeatRun {
  const onFloor = world.allFurniture().filter((other) => other.level === piece.level);
  const run = joinedRun(piece, onFloor);
  const cellOf = (seat: LevelPiece): Cell => ({ x: seat.x, z: seat.z, level: seat.level });
  return {
    seats: run.map((seat) => ({ cell: cellOf(seat), key: seatKey(seat, seat) })),
    entrances: run.flatMap((seat) => seatEntrances(seat, onFloor).map(({ x: dx, z: dz }) => ({ cell: cellOf(seat), dx, dz }))),
  };
}

/**
 * The seats a pawn slides over to get from one seat in a run to another, the
 * first included and the last left out. Null if someone's sitting in the way:
 * nobody climbs over anybody.
 */
function slideAlong(run: SeatRun, start: Cell, end: Cell, takenSeats: Set<string>): Cell[] | null {
  const seats = new Map(run.seats.map((seat) => [cellKey(seat.cell.x, seat.cell.z), seat]));
  const cameFrom = new Map<string, string | null>([[cellKey(start.x, start.z), null]]);
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (cell.x === end.x && cell.z === end.z) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = cellKey(cell.x + dx, cell.z + dz);
      const next = seats.get(key);
      if (!next || cameFrom.has(key)) continue;
      cameFrom.set(key, cellKey(cell.x, cell.z));
      queue.push(next.cell);
    }
  }
  if (!cameFrom.has(cellKey(end.x, end.z))) return null;
  const slide: Cell[] = [];
  for (let key = cameFrom.get(cellKey(end.x, end.z)); key; key = cameFrom.get(key)) {
    const seat = seats.get(key)!;
    if (takenSeats.has(seat.key)) return null;
    slide.unshift(seat.cell);
  }
  return slide;
}

/** A chair pulled up to something is worth this many extra steps over standing at it. */
const CHAIR_PREFERENCE_STEPS = 3;

/** The direction of a step between neighboring squares, for checking for a wall between them. */
function stepDirection(dx: number, dz: number): 'N' | 'E' | 'S' | 'W' {
  return dx > 0 ? 'E' : dx < 0 ? 'W' : dz > 0 ? 'N' : 'S';
}

/**
 * Using a piece from a chair on the square in front of it: the pawn walks up
 * to the chair, sits, and uses the piece from there. Null if there's no chair
 * there, a wall between, someone already in it, or no way to get to it.
 */
function spotInChair(
  world: World,
  piece: LevelPiece,
  cell: Cell,
  chairCell: Cell,
  from: Cell,
  occupied: Set<string>,
  takenSeats: Set<string>,
): { spot: FurnitureSpot; length: number } | null {
  if (world.level(cell.level).hasWall(cell.x, cell.z, stepDirection(chairCell.x - cell.x, chairCell.z - cell.z))) return null;
  const chair = world.allFurniture().find((other) => {
    const def = getFurnitureDef(other.type);
    return other.level === chairCell.level && def.use === 'sit' && def.footprint.w === 1 && def.footprint.d === 1 && other.x === chairCell.x && other.z === chairCell.z;
  });
  if (!chair || takenSeats.has(seatKey(chair, chairCell))) return null;
  let best: { spot: FurnitureSpot; length: number } | null = null;
  for (const { dx, dz } of STEPS) {
    const approach = { x: chairCell.x + dx, z: chairCell.z + dz, level: chairCell.level };
    if (occupied.has(placeKey(approach)) || !canStep(world, chairCell, approach)) continue;
    const { path, reachedGoal } = findPath(world, from, approach, occupied);
    if (reachedGoal && (!best || path.length < best.length)) best = { spot: { piece, kind: 'sit', approach, seat: chairCell, chair: { ...chair } }, length: path.length };
  }
  return best;
}
