import * as THREE from 'three';
import type { PoolCell } from '../grid/gridModel';
import { cellKey } from '../grid/roomDetection';
import { POOL_WATER, SPA_FLOOR, SPA_SEAT, getFurnitureDef, pieceSquare } from '../build/furnitureCatalog';
import { findPath, nearestFreeCell } from './pathfinding';
import type { Advertisement } from './needs';
import type { Pawn, ScriptStep } from './pawn';
import type { Cell, LevelPiece, World } from './world';

/** What there is to do at a pool: swim, soak in a spa, or sit on the edge with your feet in. */
export type PoolActivity = 'swim' | 'soak' | 'edge';

/** What each is worth to a pawn, like what a piece of furniture offers. */
export const POOL_ADVERTISEMENTS: Record<PoolActivity, Advertisement> = {
  swim: { fun: 45, hygiene: 15 },
  soak: { fun: 30, energy: 12, hygiene: 8 },
  edge: { fun: 18 },
};

/** How a pawn gets in: off the edge with a jump, off a diving board, down a ladder or down the pool stairs. */
export type WayIn = 'edge' | 'climb' | 'board' | 'ladder' | 'stairs';

/** A way in or out of the water: the dry square to stand on first, and the square of water it leads to. */
interface Entry {
  way: WayIn;
  stand: Cell;
  water: { x: number; z: number };
  piece?: LevelPiece;
}

/** Where a swimmer's feet are, so it floats with its back just out of the water. */
const SWIM_Y = POOL_WATER - 0.08;
/** Treading water, upright, with its head out. */
const TREAD_Y = POOL_WATER - 0.62;
/** Squares a second, swimming. */
const SWIM_SPEED = 1.1;
const LAPS = { min: 4, max: 7 };
const SOAK_SECONDS = { min: 25, max: 40 };
const EDGE_SECONDS = { min: 18, max: 30 };
/** How far a step of a diving board is from its middle, in its own frame: where you get on, and its tip. */
const BOARD_ON = -0.55;
const BOARD_TIP = 0.85;
const BOARD_TOP = 0.48;

const STEPS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

type Job = { stage: 'walking'; entry: Entry; activity: PoolActivity; plan: () => ScriptStep[] } | { stage: 'in' };

/**
 * Pools, for the pawns: deciding when one would like a swim, a soak or a
 * sit on the edge, walking it to a way in, and then the whole of it as a
 * scripted move: in, about, and out again onto dry ground.
 */
export class Swimming {
  private world: World;
  private jobs = new Map<Pawn, Job>();
  private random = Math.random;
  /** When someone hits the water, for a splash. */
  onSplash: ((x: number, z: number, size?: number) => void) | null = null;

  constructor(world: World) {
    this.world = world;
  }

  private pools(): Map<string, PoolCell> {
    return new Map(this.world.level(0).allPools().map((pool) => [cellKey(pool.x, pool.z), pool]));
  }

  /** Whether it's on its way to the pool, or in it. */
  isBusy(pawn: Pawn): boolean {
    return this.jobs.has(pawn);
  }

  reset() {
    this.jobs.clear();
  }

  /** What it could do at the pool, for a pawn deciding what to do next, each with what it's worth. */
  options(pawn: Pawn, minimum: number): { utility: number; act: () => boolean }[] {
    const pools = this.pools();
    if (pools.size === 0 || this.jobs.has(pawn)) return [];
    const kinds = new Set([...pools.values()].map((pool) => pool.kind));
    const activities: PoolActivity[] = ['edge'];
    if (kinds.has('pool')) activities.push('swim');
    if (kinds.has('spa')) activities.push('soak');
    const here = pawn.currentCell();
    const nearest = [...pools.values()].reduce((best, pool) => Math.min(best, Math.hypot(pool.x - here.x, pool.z - here.z)), Infinity);
    const walk = 30 / (30 + nearest);
    return activities
      .map((activity) => ({ activity, utility: pawn.mind.utilityOf(POOL_ADVERTISEMENTS[activity]) * walk }))
      .filter(({ utility }) => utility >= minimum)
      .map(({ activity, utility }) => ({ utility, act: () => this.start(pawn, activity) }));
  }

  /**
   * Sends a pawn to the pool. `near` is a square it was pointed at, in the
   * water or beside it, and `way` how it should get in; it otherwise picks the
   * nearest way in it can reach. False if there's no way to do it.
   */
  start(pawn: Pawn, activity: PoolActivity, options: { near?: { x: number; z: number }; way?: WayIn; piece?: LevelPiece } = {}): boolean {
    const pools = this.pools();
    const here = pawn.currentCell();
    let entries = this.entries(pools, activity);
    if (options.piece) entries = entries.filter((entry) => entry.piece?.id === options.piece!.id);
    // Climbing in is getting in off the edge too, just gently.
    else if (options.way === 'climb') entries = entries.filter((entry) => entry.way === 'edge').map((entry) => ({ ...entry, way: 'climb' as const }));
    else if (options.way) entries = entries.filter((entry) => entry.way === options.way);
    if (options.near) {
      const { x, z } = options.near;
      // Right where it was pointed, from that dry square or into that square of water, if it can; else near there.
      const exact = entries.filter((entry) => (entry.stand.x === x && entry.stand.z === z) || (entry.water.x === x && entry.water.z === z));
      const close = entries.filter((entry) => Math.max(Math.abs(entry.water.x - x), Math.abs(entry.water.z - z)) <= 1 || (entry.stand.x === x && entry.stand.z === z));
      if (exact.length > 0) entries = exact;
      else if (close.length > 0) entries = close;
    }
    const taken = this.takenSpots();
    entries = entries.filter((entry) => activity === 'swim' || !taken.has(`${entry.water.x},${entry.water.z}`));
    // Nearest by how far it is, then whichever can actually be walked to.
    entries.sort((a, b) => Math.hypot(a.stand.x - here.x, a.stand.z - here.z) - Math.hypot(b.stand.x - here.x, b.stand.z - here.z));
    for (const entry of entries.slice(0, 12)) {
      const atIt = here.x === entry.stand.x && here.z === entry.stand.z && here.level === 0;
      if (!atIt && !findPath(this.world, here, entry.stand).reachedGoal) continue;
      const plan = () => this.plan(activity, entry, pools);
      this.jobs.set(pawn, { stage: 'walking', entry, activity, plan });
      if (atIt) this.getIn(pawn);
      else pawn.walkTo(entry.stand);
      return true;
    }
    return false;
  }

  /** Every frame: anyone who's walked to their way in gets in. */
  update() {
    for (const [pawn, job] of this.jobs) {
      if (job.stage !== 'walking') continue;
      if (pawn.isWalking) {
        // Sent somewhere else on the way.
        const to = pawn.destinationCell();
        if (to.x !== job.entry.stand.x || to.z !== job.entry.stand.z) this.jobs.delete(pawn);
        continue;
      }
      const here = pawn.currentCell();
      if (here.x === job.entry.stand.x && here.z === job.entry.stand.z) this.getIn(pawn);
      else this.jobs.delete(pawn);
    }
  }

  private getIn(pawn: Pawn) {
    const job = this.jobs.get(pawn);
    if (!job || job.stage !== 'walking') return;
    const steps = job.plan();
    const activity = job.activity;
    const inJob: Job = { stage: 'in' };
    this.jobs.set(pawn, inJob);
    pawn.think(activity === 'swim' ? '🏊' : activity === 'soak' ? '♨️' : '🦶', 2);
    // Only this swim's own ending ends it: sent off to another, the new one stands.
    pawn.follow(steps, { advertises: POOL_ADVERTISEMENTS[activity], done: () => this.jobs.get(pawn) === inJob && this.jobs.delete(pawn) });
  }

  /** The squares of water someone's already soaking or sitting at, so two don't sit in each other's lap. */
  private takenSpots(): Set<string> {
    const taken = new Set<string>();
    for (const [pawn, job] of this.jobs) {
      if (job.stage === 'walking') taken.add(`${job.entry.water.x},${job.entry.water.z}`);
      else {
        const cell = pawn.currentCell();
        taken.add(`${cell.x},${cell.z}`);
      }
    }
    return taken;
  }

  /** Every way into the water for this: the pool things, and every dry square on the edge. */
  private entries(pools: Map<string, PoolCell>, activity: PoolActivity): Entry[] {
    const wet = (x: number, z: number) => pools.has(cellKey(x, z));
    const kindAt = (x: number, z: number) => pools.get(cellKey(x, z))?.kind;
    const blocked = this.world.blocked(0);
    const dry = (x: number, z: number) => !wet(x, z) && this.world.standable({ x, z, level: 0 }) && !blocked.has(cellKey(x, z));
    const entries: Entry[] = [];
    if (activity === 'swim') {
      for (const piece of this.world.allFurniture()) {
        if (piece.level !== 0) continue;
        const def = getFurnitureDef(piece.type);
        if (!def.pool) continue;
        const square = (i: number, j: number) => pieceSquare(piece.type, piece.x, piece.z, piece.rotation, [i, j]);
        if (def.pool === 'edge') {
          const stand = square(0, 0);
          const water = square(0, 1);
          if (kindAt(water.x, water.z) === 'pool') entries.push({ way: 'ladder', stand: { ...stand, level: 0 }, water, piece });
        } else if (def.pool === 'inside') {
          const stand = square(0, -1);
          const water = square(0, def.footprint.d - 1);
          if (dry(stand.x, stand.z)) entries.push({ way: 'stairs', stand: { ...stand, level: 0 }, water, piece });
        } else if (def.pool === 'over') {
          const stand = square(0, -1);
          const beyond = square(0, def.footprint.d);
          const water = kindAt(beyond.x, beyond.z) === 'pool' ? beyond : square(0, def.footprint.d - 1);
          if (dry(stand.x, stand.z)) entries.push({ way: 'board', stand: { ...stand, level: 0 }, water, piece });
        }
      }
    }
    for (const pool of pools.values()) {
      if (activity === 'swim' && pool.kind !== 'pool') continue;
      if (activity === 'soak' && pool.kind !== 'spa') continue;
      for (const [dx, dz] of STEPS4) {
        const x = pool.x + dx;
        const z = pool.z + dz;
        if (dry(x, z)) entries.push({ way: 'edge', stand: { x, z, level: 0 }, water: { x: pool.x, z: pool.z } });
      }
    }
    return entries;
  }

  /** The whole of it, from standing at the way in to standing on dry ground again. */
  private plan(activity: PoolActivity, entry: Entry, pools: Map<string, PoolCell>): ScriptStep[] {
    const stand = { x: entry.stand.x, z: entry.stand.z };
    const water = entry.water;
    const toward = Math.atan2(water.x - stand.x, water.z - stand.z);
    const edge = { x: (stand.x + water.x) / 2, z: (stand.z + water.z) / 2 };
    if (activity === 'edge') {
      // Down on the rim, facing the water, feet dangling in.
      const seat = lerp(stand, water, 0.42);
      return [
        { ...seat, y: 0, seconds: 0.45, pose: 'stand', facing: toward },
        { ...seat, y: -0.32, seconds: 0.5, pose: 'sit', facing: toward },
        { ...seat, y: -0.32, seconds: between(EDGE_SECONDS, this.random), pose: 'sit', facing: toward },
        { ...seat, y: 0, seconds: 0.5, pose: 'stand', facing: toward },
        { ...stand, y: 0, seconds: 0.4, pose: 'stand' },
      ];
    }
    if (activity === 'soak') {
      // Down onto the bench along the wall, facing into the spa.
      const seat = lerp(water, stand, 0.23);
      const away = toward;
      return [
        { ...edge, y: 0, seconds: 0.45, pose: 'stand', facing: toward },
        { ...seat, y: SPA_SEAT - 0.08, seconds: 0.8, pose: 'sit', facing: away, onArrive: () => this.onSplash?.(seat.x, seat.z) },
        { ...seat, y: SPA_SEAT - 0.08, seconds: between(SOAK_SECONDS, this.random), pose: 'sit', facing: away },
        { ...edge, y: 0, seconds: 0.8, pose: 'stand', arc: 0.15 },
        { ...stand, y: 0, seconds: 0.35, pose: 'stand' },
      ];
    }
    const steps = this.wayIn(entry, pools);
    const start = steps.length > 0 ? cellOf(steps[steps.length - 1]) : water;
    // Laps: from spot to spot about the pool, the long way round its corners, with a breather now and then.
    const swimmable = new Set([...pools.values()].filter((pool) => pool.kind === 'pool').map((pool) => cellKey(pool.x, pool.z)));
    const body = connected(start, swimmable);
    let at = start;
    const laps = Math.round(between(LAPS, this.random));
    for (let lap = 0; lap < laps; lap++) {
      const target = body[Math.floor(this.random() * body.length)];
      for (const cell of route(at, target, body)) steps.push({ ...cell, y: SWIM_Y, seconds: 1 / SWIM_SPEED, pose: 'swim' });
      at = target;
      if (this.random() < 0.35) steps.push({ ...at, y: TREAD_Y, seconds: 1.6, pose: 'tread' });
    }
    // Out the nearest way: stairs or a ladder if there's one near, else over the edge.
    const exits = this.entries(pools, 'swim').filter((exit) => exit.way !== 'board' && body.some((cell) => cell.x === exit.water.x && cell.z === exit.water.z));
    exits.sort((a, b) => score(a, at) - score(b, at));
    const exit = exits[0];
    if (!exit) {
      steps.push({ ...stand, y: 0, seconds: 0.8, pose: 'stand', arc: 0.3 });
      return steps;
    }
    for (const cell of route(at, exit.water, body)) steps.push({ ...cell, y: SWIM_Y, seconds: 1 / SWIM_SPEED, pose: 'swim' });
    steps.push(...this.wayOut(exit));
    return steps;
  }

  /** From standing at the way in to being in the water. */
  private wayIn(entry: Entry, pools: Map<string, PoolCell>): ScriptStep[] {
    const stand = { x: entry.stand.x, z: entry.stand.z };
    const water = entry.water;
    const toward = Math.atan2(water.x - stand.x, water.z - stand.z);
    const splash = (at: { x: number; z: number }, size = 1) => () => this.onSplash?.(at.x, at.z, size);
    if (entry.way === 'ladder') {
      const foot = lerp(stand, water, 0.6);
      return [
        { ...lerp(stand, water, 0.35), y: 0, seconds: 0.4, pose: 'stand', facing: toward + Math.PI },
        { ...foot, y: TREAD_Y, seconds: 1.5, pose: 'stand', facing: toward + Math.PI },
        { ...water, y: SWIM_Y, seconds: 0.8, pose: 'swim' },
      ];
    }
    if (entry.way === 'stairs' && entry.piece) {
      const piece = entry.piece;
      const d = getFurnitureDef(piece.type).footprint.d;
      const steps: ScriptStep[] = [];
      for (let j = 0; j < d; j++) {
        const cell = pieceSquare(piece.type, piece.x, piece.z, piece.rotation, [0, j]);
        steps.push({ ...cell, y: -0.3 - j * 0.45, seconds: 0.7, pose: 'stand', facing: toward });
      }
      const past = pieceSquare(piece.type, piece.x, piece.z, piece.rotation, [0, d]);
      if (pools.get(cellKey(past.x, past.z))?.kind === 'pool') steps.push({ ...past, y: SWIM_Y, seconds: 0.9, pose: 'swim' });
      return steps;
    }
    if (entry.way === 'board' && entry.piece) {
      const piece = entry.piece;
      const on = boardPoint(piece, BOARD_ON);
      const tip = boardPoint(piece, BOARD_TIP);
      return [
        { ...on, y: BOARD_TOP, seconds: 0.5, pose: 'stand', facing: toward },
        { ...tip, y: BOARD_TOP, seconds: 0.9, pose: 'stand', facing: toward },
        { ...tip, y: BOARD_TOP + 0.05, seconds: 0.45, pose: 'stand', arc: 0.3, facing: toward },
        { ...water, y: SWIM_Y, seconds: 0.85, pose: 'dive', arc: 1.1, facing: toward, onArrive: splash(water, 2.2) },
      ];
    }
    if (entry.way === 'climb') {
      // Sits on the rim, then lowers itself in.
      const rim = lerp(stand, water, 0.42);
      return [
        { ...rim, y: 0, seconds: 0.4, pose: 'stand', facing: toward },
        { ...rim, y: -0.32, seconds: 0.45, pose: 'sit', facing: toward },
        { ...lerp(stand, water, 0.75), y: TREAD_Y, seconds: 0.9, pose: 'stand', facing: toward },
        { ...water, y: SWIM_Y, seconds: 0.6, pose: 'swim', facing: toward },
      ];
    }
    // Off the edge: a step to the rim and a jump in, feet first.
    return [
      { ...lerp(stand, water, 0.35), y: 0, seconds: 0.35, pose: 'stand', facing: toward },
      { ...water, y: TREAD_Y, seconds: 0.6, pose: 'stand', arc: 0.55, facing: toward, onArrive: splash(water) },
      { ...water, y: SWIM_Y, seconds: 0.5, pose: 'swim', facing: toward },
    ];
  }

  /**
   * For a pawn in the water that's been sent somewhere dry: the way out
   * nearest where it's going, the swim there, the climb out, and the dry square
   * it ends up on to walk on from. Out of the water already, like sitting on
   * the edge or up on a diving board, it just steps off onto dry ground.
   */
  leaveToward(pawn: Pawn, goal: { x: number; z: number }): { steps: ScriptStep[]; out: Cell } | null {
    return this.leave(pawn, (exits, here, body) => {
      // Swimming further is worth it to come out nearer where it's going.
      const cost = (exit: Entry) => route(here, exit.water, body).length + Math.hypot(exit.stand.x - goal.x, exit.stand.z - goal.z);
      return exits.reduce((best, other) => (cost(other) < cost(best) ? other : best));
    });
  }

  /** Whether it's in the water right now, swimming or soaking, rather than on the way or sitting on the edge. */
  isInWater(pawn: Pawn): boolean {
    return pawn.isScripted && this.world.level(0).hasPool(Math.round(pawn.position.x), Math.round(pawn.position.z));
  }

  /**
   * Gets a pawn out of the water by a particular way: up a ladder or the pool
   * stairs, or over the edge onto a dry square it was pointed at. It swims
   * there first, and stays standing on dry ground. False if that way out
   * isn't in the water it's in.
   */
  leaveBy(pawn: Pawn, by: { piece?: LevelPiece; near?: { x: number; z: number } }): boolean {
    if (!this.isInWater(pawn)) return false;
    const plan = this.leave(pawn, (exits) => {
      if (by.piece) return exits.find((exit) => exit.piece?.id === by.piece!.id) ?? null;
      const near = by.near;
      if (!near) return null;
      // Onto that dry square, or out of that square of water onto whichever dry square beside it is nearest.
      const onto = exits.filter((exit) => exit.stand.x === near.x && exit.stand.z === near.z);
      const from = exits.filter((exit) => exit.water.x === near.x && exit.water.z === near.z);
      const here = onto.length > 0 ? onto : from;
      return here.find((exit) => exit.way !== 'edge') ?? here[0] ?? null;
    });
    if (!plan) return false;
    pawn.follow(plan.steps);
    return true;
  }

  /** Swims to the way out `pick` chooses, and climbs out there. */
  private leave(
    pawn: Pawn,
    pick: (exits: Entry[], here: { x: number; z: number }, body: { x: number; z: number }[]) => Entry | null,
  ): { steps: ScriptStep[]; out: Cell } | null {
    const pools = this.pools();
    const here = { x: Math.round(pawn.position.x), z: Math.round(pawn.position.z) };
    const pool = pools.get(cellKey(here.x, here.z));
    if (!pool) {
      const out = this.world.standable({ ...here, level: 0 }) ? { ...here, level: 0 } : nearestFreeCell(this.world, { ...here, level: 0 }, () => true);
      if (!out) return null;
      return { steps: [{ x: out.x, z: out.z, y: 0, seconds: 0.5, pose: 'stand' }], out };
    }
    const spa = pool.kind === 'spa';
    const same = new Set([...pools.values()].filter((other) => other.kind === pool.kind).map((other) => cellKey(other.x, other.z)));
    const body = connected(here, same);
    const inBody = new Set(body.map((cell) => cellKey(cell.x, cell.z)));
    const exits = this.entries(pools, spa ? 'soak' : 'swim').filter((exit) => exit.way !== 'board' && inBody.has(cellKey(exit.water.x, exit.water.z)));
    if (exits.length === 0) return null;
    const exit = pick(exits, here, body);
    if (!exit) return null;
    const y = spa ? SPA_FLOOR : SWIM_Y;
    const pose = spa ? 'stand' : 'swim';
    const seconds = spa ? 0.7 : 1 / SWIM_SPEED;
    const steps: ScriptStep[] = [{ ...here, y, seconds: 0.5, pose }];
    for (const cell of route(here, exit.water, body)) steps.push({ ...cell, y, seconds, pose });
    steps.push(...this.wayOut(exit, spa));
    return { steps, out: exit.stand };
  }

  /** From the water at a way out to standing on dry ground. Out of a spa, it's a step up rather than a climb. */
  private wayOut(exit: Entry, spa = false): ScriptStep[] {
    const stand = { x: exit.stand.x, z: exit.stand.z };
    const water = exit.water;
    const toLand = Math.atan2(stand.x - water.x, stand.z - water.z);
    if (exit.way === 'ladder') {
      const foot = lerp(stand, water, 0.6);
      return [
        { ...foot, y: TREAD_Y, seconds: 0.6, pose: 'tread', facing: toLand },
        { ...foot, y: 0, seconds: 1.4, pose: 'stand', facing: toLand },
        { ...stand, y: 0, seconds: 0.45, pose: 'stand' },
      ];
    }
    if (exit.way === 'stairs' && exit.piece) {
      const piece = exit.piece;
      const d = getFurnitureDef(piece.type).footprint.d;
      const steps: ScriptStep[] = [];
      for (let j = d - 1; j >= 0; j--) {
        const cell = pieceSquare(piece.type, piece.x, piece.z, piece.rotation, [0, j]);
        steps.push({ ...cell, y: -0.3 - j * 0.45, seconds: 0.7, pose: 'stand', facing: toLand });
      }
      steps.push({ ...stand, y: 0, seconds: 0.6, pose: 'stand' });
      return steps;
    }
    // Over the edge: up onto the rim and out.
    return [
      { ...lerp(water, stand, 0.25), y: spa ? SPA_FLOOR : TREAD_Y, seconds: 0.5, pose: spa ? 'stand' : 'tread', facing: toLand },
      { ...lerp(water, stand, 0.6), y: 0, seconds: 0.8, pose: 'stand', arc: 0.25, facing: toLand },
      { ...stand, y: 0, seconds: 0.35, pose: 'stand' },
    ];
  }

  /** Whether this square is water, and which kind, and whether it's a dry square right beside some. */
  poolAt(cell: { x: number; z: number }): { water: PoolCell | null; edge: boolean; besideSpa: boolean; besidePool: boolean; waterAtEdge: boolean } {
    const pools = this.pools();
    const water = pools.get(cellKey(cell.x, cell.z)) ?? null;
    const around = STEPS4.map(([dx, dz]) => ({ x: cell.x + dx, z: cell.z + dz }));
    const beside = water ? [] : around.map((next) => pools.get(cellKey(next.x, next.z))).filter((pool) => pool !== undefined);
    const blocked = this.world.blocked(0);
    // A square of water with somewhere dry right beside it to climb out onto.
    const waterAtEdge = water !== null && around.some((next) => !pools.has(cellKey(next.x, next.z)) && this.world.standable({ ...next, level: 0 }) && !blocked.has(cellKey(next.x, next.z)));
    return { water, edge: beside.length > 0, besideSpa: beside.some((pool) => pool.kind === 'spa'), besidePool: beside.some((pool) => pool.kind === 'pool'), waterAtEdge };
  }

  /** Who's in a pool or spa right now, by where they are, for anyone wondering whether to join them. */
  swimmers(): Pawn[] {
    return [...this.jobs.entries()].filter(([, job]) => job.stage === 'in').map(([pawn]) => pawn);
  }
}

function lerp(a: { x: number; z: number }, b: { x: number; z: number }, t: number): { x: number; z: number } {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function between(range: { min: number; max: number }, random: () => number): number {
  return range.min + random() * (range.max - range.min);
}

function cellOf(step: ScriptStep): { x: number; z: number } {
  return { x: Math.round(step.x), z: Math.round(step.z) };
}

/** A way out is better for being near, and better still for being stairs or a ladder. */
function score(exit: Entry, from: { x: number; z: number }): number {
  const far = Math.abs(exit.water.x - from.x) + Math.abs(exit.water.z - from.z);
  return far + (exit.way === 'edge' ? 3 : 0);
}

/** The squares of water that join up with this one, side to side. */
function connected(start: { x: number; z: number }, water: Set<string>): { x: number; z: number }[] {
  const found = new Map<string, { x: number; z: number }>([[cellKey(start.x, start.z), start]]);
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.shift()!;
    for (const [dx, dz] of STEPS4) {
      const next = { x: cell.x + dx, z: cell.z + dz };
      const key = cellKey(next.x, next.z);
      if (water.has(key) && !found.has(key)) {
        found.set(key, next);
        queue.push(next);
      }
    }
  }
  return [...found.values()];
}

/** The squares to swim through from one square to another, round the corners of the pool, not counting where it starts. */
function route(from: { x: number; z: number }, to: { x: number; z: number }, body: { x: number; z: number }[]): { x: number; z: number }[] {
  const inside = new Set(body.map((cell) => cellKey(cell.x, cell.z)));
  const cameFrom = new Map<string, string | null>([[cellKey(from.x, from.z), null]]);
  const queue = [from];
  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (cell.x === to.x && cell.z === to.z) break;
    for (const [dx, dz] of STEPS4) {
      const next = { x: cell.x + dx, z: cell.z + dz };
      const key = cellKey(next.x, next.z);
      if (!inside.has(key) || cameFrom.has(key)) continue;
      cameFrom.set(key, cellKey(cell.x, cell.z));
      queue.push(next);
    }
  }
  const path: { x: number; z: number }[] = [];
  for (let key: string | null | undefined = cellKey(to.x, to.z); key && cameFrom.has(key); key = cameFrom.get(key)) {
    const [x, z] = key.split(',').map(Number);
    if (x === from.x && z === from.z) break;
    path.unshift({ x, z });
  }
  return path;
}

/** A point along the middle of a diving board, `along` from its middle in its own frame, in the world. */
function boardPoint(piece: LevelPiece, along: number): { x: number; z: number } {
  const angle = THREE.MathUtils.degToRad(piece.rotation);
  const middle = { x: (pieceSquare(piece.type, piece.x, piece.z, piece.rotation, [0, 0]).x + pieceSquare(piece.type, piece.x, piece.z, piece.rotation, [0, 1]).x) / 2, z: (pieceSquare(piece.type, piece.x, piece.z, piece.rotation, [0, 0]).z + pieceSquare(piece.type, piece.x, piece.z, piece.rotation, [0, 1]).z) / 2 };
  return { x: middle.x + Math.sin(angle) * along, z: middle.z + Math.cos(angle) * along };
}

