import { cellToWorld } from '../grid/gridMath';
import { canStep, isInFurniture } from './pathfinding';
import type { Cell } from './pathfinding';
import type { Pawn, ScriptStep } from './pawn';
import type { Relationships } from './relationships';
import { compatibility } from './personality';
import { placeKey } from './world';
import type { World } from './world';

/** The rough-and-tumble ways tenants have of playing with each other, or picking a fight. */
export type RoughKind = 'toss' | 'shove' | 'wrestle' | 'bearhug';

/** How high above its own feet a tenant holds someone it's hoisted overhead, and someone it's hugged off the ground. */
const OVERHEAD = 0.82;
const HUGGED_UP = 0.3;
/** How high a throw goes, and a wrestler toppled over. */
const TOSS_ARC = 1.1;
const TOPPLE_ARC = 0.55;
/** How long a tenant lies there seeing stars before it gets up. */
const DAZED_SECONDS = 1.8;
/** How far a thrown tenant can go, in squares. */
const TOSS_REACH = 2;

/**
 * Tossing, shoving, wrestling and bear hugs. Each one is a pair of scripted
 * moves played side by side, one for each tenant, timed to match: the grab,
 * the lift, the throw, the tumble through the air, the bounce, lying there
 * dazed and getting back up. How it goes down depends on who they are to
 * each other: friends and playful tenants love it, rivals and grouches don't.
 */
export class Roughhousing {
  private world: World;
  private relationships: Relationships;
  /** The squares everyone else is standing on or heading to, so nobody's thrown onto someone. */
  private takenBy: (pawn: Pawn) => Set<string>;
  /** Sends one tenant over to another to have a go back, like a grouch shoving back after being thrown. */
  private sendOver: (actor: Pawn, target: Pawn, kind: RoughKind) => void;
  /** Tenants in the middle of one, so nothing else starts on them meanwhile. */
  private busy = new Set<Pawn>();

  constructor(world: World, relationships: Relationships, takenBy: (pawn: Pawn) => Set<string>, sendOver: (actor: Pawn, target: Pawn, kind: RoughKind) => void) {
    this.world = world;
    this.relationships = relationships;
    this.takenBy = takenBy;
    this.sendOver = sendOver;
  }

  isBusy(pawn: Pawn): boolean {
    return this.busy.has(pawn);
  }

  /** Why one tenant can't roughhouse with another right now, if it can't. */
  blockedReason(actor: Pawn, target: Pawn): string | null {
    for (const [pawn, who] of [
      [target, 'they'],
      [actor, 'you'],
    ] as const) {
      if (this.busy.has(pawn)) return `${who === 'they' ? "They're" : "You're"} in the middle of something`;
      if (pawn.isScripted) return `Not while ${who}'re in the water`;
      if (pawn.isOnFurniture) return `Not while ${who}'re sitting or lying down`;
      if (this.world.stairStep(pawn.currentCell())) return 'Not on the stairs';
    }
    return null;
  }

  /** Whether it goes down well: friends and playful tenants are up for it, rivals and grouches aren't. */
  private welcome(actor: Pawn, target: Pawn): boolean {
    if (this.relationships.areRivals(actor.info.id, target.info.id)) return false;
    if (target.info.temperament === 'grouchy') return this.relationships.areFriends(actor.info.id, target.info.id) && Math.random() < 0.4;
    if (this.relationships.areFriends(actor.info.id, target.info.id) || target.info.temperament === 'playful') return true;
    return compatibility(actor.info, target.info) >= 0 && Math.random() < 0.6;
  }

  /** Starts one off. The two should be standing next to each other. False if it can't happen. */
  start(actor: Pawn, target: Pawn, kind: RoughKind): boolean {
    if (this.blockedReason(actor, target)) return false;
    const a = actor.currentCell();
    const t = target.currentCell();
    // Which way from one to the other, as a step on the grid.
    let dx = Math.sign(t.x - a.x);
    let dz = Math.sign(t.z - a.z);
    if (dx === 0 && dz === 0) dx = 1;
    const plan = { a, t, dx, dz, welcome: this.welcome(actor, target) };
    this.busy.add(actor).add(target);
    if (kind === 'toss') this.toss(actor, target, plan);
    if (kind === 'shove') this.shove(actor, target, plan);
    if (kind === 'wrestle') this.wrestle(actor, target, plan);
    if (kind === 'bearhug') this.bearHug(actor, target, plan);
    return true;
  }

  /**
   * Where someone pushed or thrown from `from`, going `dx`/`dz`, ends up: as
   * far as it'll go, up to `reach` squares, over open floor with nothing and
   * nobody in the way. Null if it can't go anywhere.
   */
  private landing(pawn: Pawn, from: Cell, dx: number, dz: number, reach: number): Cell | null {
    const taken = this.takenBy(pawn);
    let here = from;
    let best: Cell | null = null;
    for (let step = 0; step < reach; step++) {
      const next = { x: here.x + dx, z: here.z + dz, level: here.level };
      if (!canStep(this.world, here, next) || !this.world.standable(next) || isInFurniture(this.world, next) || taken.has(placeKey(next))) break;
      best = next;
      here = next;
    }
    return best;
  }

  /** The middle of a square, at its floor's height, nudged `along` a step's way. */
  private spot(cell: Cell, dx = 0, dz = 0, along = 0) {
    const center = cellToWorld(cell.x, cell.z);
    const length = Math.hypot(dx, dz) || 1;
    return { x: center.x + (dx / length) * along, z: center.z + (dz / length) * along, y: this.world.floorHeight(cell) };
  }

  /** Grabbed, hoisted overhead kicking and flailing, and thrown across the room to tumble, bounce and lie there seeing stars. */
  private toss(actor: Pawn, target: Pawn, plan: Plan) {
    const { a, t, dx, dz } = plan;
    const facing = Math.atan2(dx, dz);
    const land = this.landing(target, t, dx, dz, TOSS_REACH) ?? t;
    const from = this.spot(a);
    const overhead = this.spot(a, dx, dz, 0.06);
    const down = this.spot(land);
    const flight = Math.hypot(down.x - overhead.x, down.z - overhead.z);
    actor.react('grin', 3);
    actor.follow(
      [
        { ...from, seconds: 0.35, pose: 'grapple', facing },
        { ...from, seconds: 1, pose: 'lifting', facing },
        { ...from, seconds: 0.45, pose: 'stand', facing, onArrive: () => actor.say(plan.welcome ? '😆' : '😈', 1.6) },
      ],
      { done: () => this.finish(actor) },
    );
    target.follow(
      [
        { ...this.spot(t, -dx, -dz, 0.1), seconds: 0.35, pose: 'stand', facing: facing + Math.PI },
        { ...overhead, y: overhead.y + OVERHEAD, seconds: 0.4, pose: 'carried', facing: facing + Math.PI, onArrive: () => target.react('oh', 3) },
        { ...overhead, y: overhead.y + OVERHEAD, seconds: 0.6, pose: 'carried', facing: facing + Math.PI },
        {
          ...down,
          seconds: 0.45 + flight * 0.12,
          pose: 'flying',
          arc: TOSS_ARC,
          facing: facing + Math.PI,
          onArrive: () => {
            target.thump(1.3);
            target.say('💫', DAZED_SECONDS + 0.8);
          },
        },
        // One bounce, then flat out.
        { ...down, seconds: 0.35, pose: 'flopped', arc: 0.22, facing: facing + Math.PI, onArrive: () => target.thump(0.6) },
        { ...down, seconds: DAZED_SECONDS, pose: 'flopped', facing: facing + Math.PI },
        { ...down, seconds: 0.7, pose: 'getup', facing: facing + Math.PI },
      ],
      { done: () => this.finish(target, () => this.outcome(actor, target, 'toss', plan.welcome)) },
    );
  }

  /** A two-handed push: they stagger back with their arms going, and an unwelcome one can knock them flat. */
  private shove(actor: Pawn, target: Pawn, plan: Plan) {
    const { a, t, dx, dz } = plan;
    const facing = Math.atan2(dx, dz);
    const back = this.landing(target, t, dx, dz, 1);
    const stagger = back ? this.spot(back) : this.spot(t, dx, dz, 0.3);
    const falls = !plan.welcome && (target.info.temperament === 'grouchy' || Math.random() < 0.35);
    actor.react(plan.welcome ? 'grin' : 'frown', 2.5);
    actor.follow(
      [
        { ...this.spot(a), seconds: 0.25, pose: 'stand', facing },
        { ...this.spot(a, dx, dz, 0.2), seconds: 0.18, pose: 'grapple', facing },
        { ...this.spot(a), seconds: 0.4, pose: 'stand', facing },
      ],
      { done: () => this.finish(actor) },
    );
    const steps: ScriptStep[] = [
      // Pushed, it staggers back with its arms going.
      { ...this.spot(t), seconds: 0.43, pose: 'stand', facing: facing + Math.PI, onArrive: () => target.stagger() },
      {
        ...stagger,
        seconds: 0.5,
        pose: 'stand',
        facing: facing + Math.PI,
        onArrive: () => {
          if (!falls) target.thump(0.4);
        },
      },
    ];
    if (falls) {
      steps.push(
        { ...stagger, seconds: 0.3, pose: 'flopped', arc: 0.15, facing: facing + Math.PI, onArrive: () => target.thump(0.9) },
        { ...stagger, seconds: 1.1, pose: 'flopped', facing: facing + Math.PI },
        { ...stagger, seconds: 0.6, pose: 'getup', facing: facing + Math.PI },
      );
    }
    target.react('oh', 1.2);
    target.follow(steps, { done: () => this.finish(target, () => this.outcome(actor, target, 'shove', plan.welcome)) });
  }

  /** They grapple, swaying and shoving at each other, until one of them goes over. */
  private wrestle(actor: Pawn, target: Pawn, plan: Plan) {
    const { a, t, dx, dz } = plan;
    const facing = Math.atan2(dx, dz);
    const strength = (pawn: Pawn) => (pawn.info.temperament === 'playful' ? 0.15 : pawn.info.temperament === 'grouchy' ? 0.1 : 0);
    const actorWins = Math.random() < 0.5 + strength(actor) - strength(target);
    const loser = actorWins ? target : actor;
    const pairs = new Map<Pawn, { cell: Cell; face: number; away: { dx: number; dz: number } }>([
      [actor, { cell: a, face: facing, away: { dx: -dx, dz: -dz } }],
      [target, { cell: t, face: facing + Math.PI, away: { dx, dz } }],
    ]);
    // Sideways, for both of them swaying together.
    const side = { dx: dz, dz: -dx };
    for (const [pawn, me] of pairs) {
      const close = (sway: number) => {
        const toward = this.spot(me.cell, -me.away.dx, -me.away.dz, 0.22);
        const length = Math.hypot(side.dx, side.dz) || 1;
        return { ...toward, x: toward.x + (side.dx / length) * sway, z: toward.z + (side.dz / length) * sway };
      };
      const steps: ScriptStep[] = [{ ...close(0), seconds: 0.3, pose: 'grapple', facing: me.face }];
      for (const sway of [0.14, -0.12, 0.16, -0.1, 0]) steps.push({ ...close(sway), seconds: 0.32, pose: 'grapple', facing: me.face });
      if (pawn === loser) {
        const land = this.landing(pawn, me.cell, me.away.dx, me.away.dz, 1) ?? me.cell;
        const down = this.spot(land);
        steps.push(
          {
            ...down,
            seconds: 0.5,
            pose: 'flying',
            arc: TOPPLE_ARC,
            facing: me.face,
            onArrive: () => {
              pawn.thump(1.1);
              pawn.say('💫', 2.2);
            },
          },
          { ...down, seconds: 0.3, pose: 'flopped', arc: 0.15, facing: me.face },
          { ...down, seconds: 1.4, pose: 'flopped', facing: me.face },
          { ...down, seconds: 0.7, pose: 'getup', facing: me.face },
        );
      } else {
        steps.push({ ...this.spot(me.cell), seconds: 0.5, pose: 'stand', facing: me.face, onArrive: () => pawn.say('💪', 1.8) });
      }
      pawn.react('frown', 2.2);
      pawn.follow(steps, {
        done: () =>
          this.finish(pawn, () => {
            if (pawn === loser) this.outcome(actor, target, 'wrestle', plan.welcome);
            else {
              pawn.playGesture('hop');
              pawn.react('grin', 2);
            }
          }),
      });
    }
  }

  /** A great big squeeze, lifting them right off their feet. */
  private bearHug(actor: Pawn, target: Pawn, plan: Plan) {
    const { a, t, dx, dz } = plan;
    const facing = Math.atan2(dx, dz);
    const held = this.spot(a, dx, dz, 0.32);
    actor.react('grin', 3);
    actor.follow(
      [
        { ...this.spot(a), seconds: 0.3, pose: 'grapple', facing },
        { ...this.spot(a), seconds: 1.5, pose: 'grapple', facing },
        { ...this.spot(a), seconds: 0.3, pose: 'stand', facing },
      ],
      { done: () => this.finish(actor) },
    );
    target.follow(
      [
        { ...this.spot(t, -dx, -dz, 0.2), seconds: 0.3, pose: 'stand', facing: facing + Math.PI },
        { ...held, y: held.y + HUGGED_UP, seconds: 0.35, pose: 'carried', facing: facing + Math.PI, onArrive: () => target.react(plan.welcome ? 'grin' : 'oh', 2) },
        { ...held, y: held.y + HUGGED_UP, seconds: 1.15, pose: 'carried', facing: facing + Math.PI },
        { ...this.spot(t), seconds: 0.3, pose: 'stand', facing: facing + Math.PI, onArrive: () => target.thump(0.5) },
      ],
      { done: () => this.finish(target) },
    );
  }

  private finish(pawn: Pawn, then?: () => void) {
    this.busy.delete(pawn);
    then?.();
  }

  /** How it went down: a laugh and a bit closer, or a scowl, a grudge, and maybe a shove back. */
  private outcome(actor: Pawn, target: Pawn, kind: Exclude<RoughKind, 'bearhug'>, welcome: boolean) {
    const fun = kind === 'shove' ? 5 : 12;
    if (welcome) {
      actor.mind.fill('fun', fun);
      target.mind.fill('fun', fun);
      this.relationships.adjust(actor.info.id, target.info.id, kind === 'shove' ? 1 : 4);
      target.say('🤣', 2);
      target.react('grin', 3);
      actor.react('grin', 3);
      return;
    }
    actor.mind.fill('fun', fun / 2);
    this.relationships.adjust(actor.info.id, target.info.id, kind === 'shove' ? -4 : -7);
    target.say('😠', 2.4);
    target.react('frown', 5);
    // A grouch gives as good as it got.
    if (target.info.temperament === 'grouchy' && Math.random() < 0.5) this.sendOver(target, actor, 'shove');
  }
}

interface Plan {
  a: Cell;
  t: Cell;
  dx: number;
  dz: number;
  welcome: boolean;
}
