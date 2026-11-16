import * as THREE from 'three';
import { LEVEL_HEIGHT, cellToWorld } from '../grid/gridMath';
import { STEPS, cellKey } from '../grid/roomDetection';
import { getFootprintCells, getFurnitureDef } from '../build/furnitureCatalog';
import type { FurnitureSpot } from './furnitureUse';
import { MESSES, cleanSecondsFor, messCell, reliefOf } from './messes';
import type { Mess, Messes } from './messes';
import { canStep, cellsWithinWalk, findPath } from './pathfinding';
import type { Cell } from './pathfinding';
import { FLOOR_CHANGE_STEPS, placeKey, sameCell } from './world';
import type { LevelPiece as FurniturePiece, World } from './world';
import type { Pawn } from './pawn';
import { TIDINESS_HABITS } from './personality';
import type { Relationships } from './relationships';
import type { Option } from './wandering';

/** How far a pawn will go to clean something up. */
const CLEAN_WALK_STEPS = 32;
/** How much a walk this many squares long takes off cleaning something up, by half, the same as for furniture. */
const DISTANCE_HALVES_UTILITY_AT = 30;
/** Coming in from the yard, a pawn can track mud this many steps into the house, unless it wipes its feet on a rug first. */
const MUDDY_STEPS = 3;
/** Mud on a step is this much less likely than a pawn's usual chance of making a mess. */
const MUD_SHARE = 0.55;
/** How likely a spill is when getting out of each of these, before a pawn's own tidiness. */
const SPILLS: Record<string, number> = { shower: 1, bathtub: 0.9, sink: 0.25 };
/** Cooking scraps are likelier than not from the stove, and least likely just grabbing something from the fridge. */
const SCRAPS: Record<string, number> = { stove: 1, counter: 0.85, fridge: 0.4, 'apple-tree': 0.3 };
/** Dropping trash in the bin, and washing up a plate. */
const DISPOSE_SECONDS = { trash: { min: 1, max: 1.5 }, sink: { min: 4, max: 7 }, dishwasher: { min: 1.5, max: 2.5 } };
const SURROUNDINGS_EVERY_SECONDS = 0.5;
/** Cleaning up after someone else costs this much of how a neat pawn feels about them. */
const CLEANING_UP_AFTER_SOMEONE = -3;
const REACTION_SECONDS = 2;

type Job =
  | { stage: 'going'; messId: string; spot: Cell; ordered: boolean }
  | { stage: 'cleaning'; messId: string; secondsLeft: number }
  | { stage: 'taking'; item: Mess; pieceId: string }
  | { stage: 'disposing'; item: Mess; pieceId: string; secondsLeft: number };

/**
 * The mess pawns make just by living, and their cleaning up after it. Showers
 * and baths leave puddles, cooking leaves scraps, coming in from the yard
 * tracks mud through, and anyone who doesn't wash up leaves dishes. Neat pawns
 * can't stand it and are quick to clean, sloppy ones barely notice, and anyone
 * will clean up if you send them to it.
 */
export class Chores {
  private model: World;
  private messes: Messes;
  private relationships: Relationships;
  private findSpot: (pawn: Pawn, piece: FurniturePiece) => FurnitureSpot | null;
  private takenCells: (pawn: Pawn) => Set<string>;
  /** Somewhere this pawn shouldn't go right now, like a bathroom someone's using. */
  isOffLimits: (pawn: Pawn, cell: Cell) => boolean = () => false;
  private random: () => number;
  private jobs = new Map<Pawn, Job>();
  private lastCell = new Map<Pawn, Cell>();
  private muddySteps = new Map<Pawn, number>();
  private lastSpot = new Map<Pawn, FurnitureSpot | null>();
  private untilSurroundings = 0;

  constructor(
    model: World,
    messes: Messes,
    relationships: Relationships,
    findSpot: (pawn: Pawn, piece: FurniturePiece) => FurnitureSpot | null,
    takenCells: (pawn: Pawn) => Set<string>,
    random: () => number = Math.random,
  ) {
    this.model = model;
    this.messes = messes;
    this.relationships = relationships;
    this.findSpot = findSpot;
    this.takenCells = takenCells;
    this.random = random;
  }

  /** Cleaning something up, so it shouldn't go off and do something else. */
  isBusy(pawn: Pawn): boolean {
    return this.jobs.has(pawn);
  }

  /** Whether someone's already seeing to this mess. */
  isClaimed(messId: string): boolean {
    for (const job of this.jobs.values()) if ((job.stage === 'going' || job.stage === 'cleaning') && job.messId === messId) return true;
    return false;
  }

  update(seconds: number, pawns: Pawn[]) {
    for (const pawn of [...this.jobs.keys()]) if (!pawns.includes(pawn)) this.jobs.delete(pawn);
    for (const pawn of pawns) {
      this.trackMud(pawn);
      this.spillOnGettingOut(pawn);
      const job = this.jobs.get(pawn);
      if (job?.stage === 'going') this.go(pawn, job);
      else if (job?.stage === 'cleaning') this.clean(pawn, job, seconds);
      else if (job?.stage === 'taking') this.take(pawn, job);
      else if (job?.stage === 'disposing') this.dispose(pawn, job, seconds);
    }
    this.untilSurroundings -= seconds;
    if (this.untilSurroundings <= 0) {
      this.untilSurroundings = SURROUNDINGS_EVERY_SECONDS;
      for (const pawn of pawns) pawn.mind.setSurroundings(this.messes.pleasantnessAt(pawn.currentCell(), TIDINESS_HABITS[pawn.info.tidiness].bothered));
    }
  }

  /** Cooking leaves scraps on the counter, or on the floor in front of the stove or fridge. */
  cooked(pawn: Pawn, source: FurniturePiece) {
    const chance = (SCRAPS[source.type] ?? 0) * TIDINESS_HABITS[pawn.info.tidiness].messChance;
    if (this.random() >= chance) return;
    const def = getFurnitureDef(source.type);
    const madeBy = pawn.info.id;
    if (def.holds !== undefined) {
      this.messes.add('trash', { x: source.x, z: source.z, level: source.level }, { host: source.id, y: def.holds, dx: (this.random() - 0.5) * 0.3, dz: (this.random() - 0.5) * 0.2, madeBy });
      return;
    }
    this.messes.add('trash', pawn.currentCell(), { ...this.offsetToward(pawn.currentCell(), source), madeBy });
  }

  /** A plate left behind: on the table it was eaten at, on the seat it was eaten in, or on the floor. */
  leftDishes(pawn: Pawn, onTable: { piece: FurniturePiece; cell: Cell; position: THREE.Vector3 } | null) {
    const madeBy = pawn.info.id;
    if (onTable) {
      const center = cellToWorld(onTable.cell.x, onTable.cell.z);
      this.messes.add('dishes', onTable.cell, { host: onTable.piece.id, y: onTable.position.y - onTable.cell.level * LEVEL_HEIGHT, dx: onTable.position.x - center.x, dz: onTable.position.z - center.z, madeBy });
      return;
    }
    const here = pawn.currentCell();
    const seat = pawn.settledPiece;
    if (seat && pawn.isOnFurniture) {
      const def = getFurnitureDef(seat.type);
      this.messes.add('dishes', here, { host: seat.id, y: def.holds ?? def.height, dx: 0.18, dz: 0.1, madeBy });
      return;
    }
    this.messes.add('dishes', here, { dx: (this.random() - 0.5) * 0.3, dz: (this.random() - 0.5) * 0.3, madeBy });
  }

  /**
   * Each mess in reach as something this pawn might do, scored like furniture:
   * by how much cleaning it up would do for its Environment, which counts for
   * a lot with a neat pawn and almost nothing with a sloppy one.
   */
  options(pawn: Pawn, minimum: number): Option[] {
    if (pawn.isHoldingItem || this.jobs.has(pawn) || this.messes.all().length === 0) return [];
    const here = pawn.currentCell();
    const reachable = new Set(cellsWithinWalk(this.model, here, CLEAN_WALK_STEPS).map(placeKey));
    reachable.add(placeKey(here));
    const canDispose = { trash: this.disposals(pawn, 'trash', reachable).length > 0, sink: this.disposals(pawn, 'sink', reachable).length > 0 };
    const options: Option[] = [];
    for (const mess of this.messes.all()) {
      const goesTo = MESSES[mess.kind].goesTo;
      const at = messCell(mess);
      if (this.isClaimed(mess.id) || (goesTo && !canDispose[goesTo]) || this.isOffLimits(pawn, at)) continue;
      const nearby = [at, ...STEPS.map(({ dx, dz }) => ({ ...at, x: at.x + dx, z: at.z + dz }))];
      if (!nearby.some((cell) => reachable.has(placeKey(cell)))) continue;
      const walk = DISTANCE_HALVES_UTILITY_AT / (DISTANCE_HALVES_UTILITY_AT + Math.hypot(mess.x - here.x, mess.z - here.z));
      const utility = pawn.mind.utilityOf({ environment: reliefOf(mess) }) * walk;
      if (utility < minimum) continue;
      options.push({ utility, act: () => this.cleanUp(pawn, mess.id, false) });
    }
    return options;
  }

  /** Sets off to clean up a mess. If it has to go in the bin or the sink and there isn't one, the pawn says so instead. False if it can't. */
  cleanUp(pawn: Pawn, messId: string, ordered: boolean): boolean {
    const mess = this.messes.get(messId);
    if (!mess || pawn.isHoldingItem) return false;
    const goesTo = MESSES[mess.kind].goesTo;
    if (goesTo && this.disposals(pawn, goesTo).length === 0) {
      if (ordered) pawn.think(goesTo === 'trash' ? '🗑️' : '🚰', REACTION_SECONDS);
      return false;
    }
    // Someone else on their way to it gives way.
    if (ordered) for (const [other, job] of this.jobs) if (other !== pawn && job.stage === 'going' && job.messId === messId) this.stop(other, job);
    const current = this.jobs.get(pawn);
    if (current) this.stop(pawn, current);
    const spot = this.standingSpot(pawn, mess);
    if (!spot) {
      if (ordered) pawn.walkTo(messCell(mess));
      return false;
    }
    this.jobs.set(pawn, { stage: 'going', messId, spot, ordered });
    if (ordered) pawn.walkTo(spot);
    else pawn.strollTo(spot);
    if (ordered && TIDINESS_HABITS[pawn.info.tidiness].bothered < 1) pawn.think('🙄', REACTION_SECONDS);
    return true;
  }

  /** Forgets everything, for a house that's been cleared. */
  reset() {
    for (const [pawn, job] of this.jobs) this.stop(pawn, job, false);
  }

  private go(pawn: Pawn, job: Extract<Job, { stage: 'going' }>) {
    const mess = this.messes.get(job.messId);
    if (!mess) return this.stop(pawn, job);
    if (pawn.isWalking) {
      // Sent somewhere else on the way.
      if (!sameCell(pawn.destinationCell(), job.spot)) this.stop(pawn, job);
      return;
    }
    const here = pawn.currentCell();
    if (pawn.isUsingFurniture || !sameCell(here, job.spot)) return this.stop(pawn, job);
    if (here.x !== mess.x || here.z !== mess.z) pawn.turnToward(messCell(mess));
    pawn.setChore(MESSES[mess.kind].chore);
    this.jobs.set(pawn, { stage: 'cleaning', messId: mess.id, secondsLeft: cleanSecondsFor(mess, this.random) });
  }

  private clean(pawn: Pawn, job: Extract<Job, { stage: 'cleaning' }>, seconds: number) {
    const mess = this.messes.get(job.messId);
    if (!mess || pawn.isWalking || pawn.isUsingFurniture) return this.stop(pawn, job);
    job.secondsLeft -= seconds;
    if (job.secondsLeft > 0) return;
    this.messes.remove(mess.id);
    pawn.setChore(null);
    this.react(pawn, mess);
    const goesTo = MESSES[mess.kind].goesTo;
    if (!goesTo) {
      this.jobs.delete(pawn);
      return;
    }
    pawn.holdItem(this.messes.carriedModel(mess));
    const piece = this.goDispose(pawn, goesTo);
    if (piece) this.jobs.set(pawn, { stage: 'taking', item: mess, pieceId: piece.id });
    else this.putDown(pawn, mess);
  }

  /** A neat pawn cleaning up someone else's mess doesn't think much of them for it. */
  private react(pawn: Pawn, mess: Mess) {
    const maker = mess.madeBy;
    if (maker && maker !== pawn.info.id && pawn.info.tidiness === 'neat') {
      this.relationships.adjust(pawn.info.id, maker, CLEANING_UP_AFTER_SOMEONE);
      pawn.think('😤', REACTION_SECONDS);
      return;
    }
    if (!MESSES[mess.kind].goesTo) pawn.think('✨', REACTION_SECONDS);
  }

  private take(pawn: Pawn, job: Extract<Job, { stage: 'taking' }>) {
    if (pawn.isWalking) {
      if (pawn.furniturePieceId !== job.pieceId) this.stop(pawn, job);
      return;
    }
    if (pawn.settledPiece?.id !== job.pieceId) return this.stop(pawn, job);
    const loads = this.model.allFurniture().some((piece) => piece.id === job.pieceId && getFurnitureDef(piece.type).loadsDishes);
    const { min, max } = DISPOSE_SECONDS[loads ? 'dishwasher' : MESSES[job.item.kind].goesTo!];
    this.jobs.set(pawn, { stage: 'disposing', item: job.item, pieceId: job.pieceId, secondsLeft: min + this.random() * (max - min) });
  }

  private dispose(pawn: Pawn, job: Extract<Job, { stage: 'disposing' }>, seconds: number) {
    if (pawn.settledPiece?.id !== job.pieceId) return this.stop(pawn, job);
    job.secondsLeft -= seconds;
    if (job.secondsLeft > 0) return;
    pawn.holdItem(null);
    this.jobs.delete(pawn);
    pawn.think('✨', REACTION_SECONDS);
    pawn.finishUsingFurniture();
  }

  /** Gives up on the job. Anything it was carrying off gets put down where it is. */
  private stop(pawn: Pawn, job: Job, putDown = true) {
    this.jobs.delete(pawn);
    if (job.stage === 'cleaning') pawn.setChore(null);
    if (job.stage === 'taking' || job.stage === 'disposing') {
      if (putDown) this.putDown(pawn, job.item);
      else pawn.holdItem(null);
    }
  }

  private putDown(pawn: Pawn, item: Mess) {
    pawn.holdItem(null);
    this.jobs.delete(pawn);
    const here = pawn.currentCell();
    const seat = pawn.settledPiece;
    if (seat && pawn.isOnFurniture) {
      const def = getFurnitureDef(seat.type);
      for (let i = 0; i < item.amount; i++) this.messes.add(item.kind, here, { host: seat.id, y: def.holds ?? def.height, madeBy: item.madeBy });
      return;
    }
    this.messes.putBack(item, here);
  }

  /** Bins and sinks this pawn can get to. */
  private disposals(pawn: Pawn, goesTo: 'trash' | 'sink', reachable?: Set<string>): FurniturePiece[] {
    let around = reachable;
    if (!around) {
      const here = pawn.currentCell();
      around = new Set(cellsWithinWalk(this.model, here, CLEAN_WALK_STEPS).map(placeKey));
      around.add(placeKey(here));
    }
    return this.model.allFurniture().filter((piece) => {
      const def = getFurnitureDef(piece.type);
      if (goesTo === 'trash' ? piece.type !== 'trash-can' : !def.washesDishes) return false;
      return getFootprintCells(piece.type, piece.x, piece.z, piece.rotation).some(({ x, z }) =>
        STEPS.some(({ dx, dz }) => around!.has(placeKey({ x: x + dx, z: z + dz, level: piece.level }))),
      );
    });
  }

  /** Heads for the nearest bin, or sink, with a kitchen sink before a bathroom one. */
  private goDispose(pawn: Pawn, goesTo: 'trash' | 'sink'): FurniturePiece | null {
    const here = pawn.currentCell();
    const byDistance = (a: FurniturePiece, b: FurniturePiece) =>
      this.roughWalk(here, a) - this.roughWalk(here, b) + (goesTo === 'sink' ? this.bathroomPenalty(a) - this.bathroomPenalty(b) : 0);
    for (const piece of this.disposals(pawn, goesTo).sort(byDistance)) {
      const spot = this.findSpot(pawn, piece);
      if (!spot) continue;
      pawn.chooseFurniture(spot);
      return piece;
    }
    return null;
  }

  /** About how far it is to walk to a piece: straight across, plus a long way for each floor up or down. */
  private roughWalk(here: Cell, piece: FurniturePiece): number {
    return Math.hypot(piece.x - here.x, piece.z - here.z) + Math.abs(piece.level - here.level) * FLOOR_CHANGE_STEPS;
  }

  private bathroomPenalty(piece: FurniturePiece): number {
    // A dishwasher is worth a few more steps than a sink, and a bathroom sink a lot fewer.
    const def = getFurnitureDef(piece.type);
    return def.loadsDishes ? -4 : def.category === 'kitchen' ? 0 : 20;
  }

  /** Where to stand to clean it up: right on it, if it's on the floor and free, otherwise beside it. The shortest walk wins. */
  private standingSpot(pawn: Pawn, mess: Mess): Cell | null {
    const center = messCell(mess);
    const blocked = this.model.blocked(center.level);
    const taken = this.takenCells(pawn);
    const from = pawn.currentCell();
    const candidates: Cell[] = [];
    if (!mess.host && !blocked.has(cellKey(mess.x, mess.z)) && this.model.standable(center)) candidates.push(center);
    for (const { dx, dz } of STEPS) {
      const cell = { x: mess.x + dx, z: mess.z + dz, level: center.level };
      if (canStep(this.model, center, cell)) candidates.push(cell);
    }
    let best: Cell | null = null;
    let shortest = Infinity;
    for (const cell of candidates) {
      if (taken.has(placeKey(cell))) continue;
      if (sameCell(cell, from)) return cell;
      const { path, reachedGoal } = findPath(this.model, from, cell, taken);
      // On its own square beats beside it, by a step or so.
      const length = path.length + (cell === center ? -1 : 0);
      if (reachedGoal && length < shortest) {
        shortest = length;
        best = cell;
      }
    }
    return best;
  }

  /** Comes in from the yard with muddy feet, and leaves prints for a few steps, unless there's a rug to wipe them on. */
  private trackMud(pawn: Pawn) {
    const here = pawn.currentCell();
    const last = this.lastCell.get(pawn);
    this.lastCell.set(pawn, here);
    if (!last || sameCell(last, here)) return;
    const isInside = this.model.hasFloor(here) || here.level > 0;
    if (!isInside) {
      this.muddySteps.delete(pawn);
      return;
    }
    if (last.level === 0 && !this.model.hasFloor(last) && !this.model.stairStep(last)) this.muddySteps.set(pawn, MUDDY_STEPS);
    const steps = this.muddySteps.get(pawn) ?? 0;
    if (steps <= 0) return;
    if (this.isOnRug(here)) {
      this.muddySteps.delete(pawn);
      return;
    }
    this.muddySteps.set(pawn, steps - 1);
    if (this.random() < TIDINESS_HABITS[pawn.info.tidiness].messChance * MUD_SHARE) {
      this.messes.add('dirt', here, { heading: Math.atan2(here.x - last.x, here.z - last.z), madeBy: pawn.info.id });
    }
  }

  private isOnRug({ x, z, level }: Cell): boolean {
    return this.model
      .allFurniture()
      .some((piece) => piece.level === level && getFurnitureDef(piece.type).onFloor && getFootprintCells(piece.type, piece.x, piece.z, piece.rotation).some((cell) => cell.x === x && cell.z === z));
  }

  /** Getting out of the shower or bath, it drips all over the floor in front. */
  private spillOnGettingOut(pawn: Pawn) {
    const spot = pawn.settledSpot;
    const last = this.lastSpot.get(pawn) ?? null;
    this.lastSpot.set(pawn, spot);
    if (!last || last === spot) return;
    const chance = (SPILLS[last.piece.type] ?? 0) * TIDINESS_HABITS[pawn.info.tidiness].messChance;
    if (this.random() >= chance) return;
    const { approach } = last;
    if (!this.model.hasFloor(approach)) return;
    this.messes.add('puddle', approach, { dx: (this.random() - 0.5) * 0.2, dz: (this.random() - 0.5) * 0.2, madeBy: pawn.info.id });
  }

  /** Off toward the piece it was at, a little way, so scraps land at the foot of the stove rather than under the cook. */
  private offsetToward(here: Cell, piece: FurniturePiece): { dx: number; dz: number } {
    const target = cellToWorld(piece.x, piece.z);
    const from = cellToWorld(here.x, here.z);
    const towards = new THREE.Vector2(target.x - from.x, target.z - from.z).normalize().multiplyScalar(0.28);
    const sideways = (this.random() - 0.5) * 0.3;
    return { dx: towards.x + towards.y * sideways, dz: towards.y - towards.x * sideways };
  }
}

