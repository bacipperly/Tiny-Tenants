import { STEPS } from '../grid/roomDetection';
import { getFootprintCells, getFurnitureDef, isLit } from '../build/furnitureCatalog';
import type { FurnitureUseKind } from '../build/furnitureCatalog';
import { areTogether } from './chatter';
import type { FurnitureSpot } from './furnitureUse';
import type { Advertisement } from './needs';
import { cellsWithinWalk } from './pathfinding';
import type { Cell } from './pathfinding';
import { FLOOR_CHANGE_STEPS, placeKey } from './world';
import { nightfall } from './dayClock';
import type { LevelPiece as FurniturePiece, World } from './world';
import type { Pawn } from './pawn';
import { PERSONALITY_TRAITS, TRAITS, traitsOf } from './personality';
import type { IdleFlavor } from './personality';
import type { Relationships } from './relationships';

const IDLE_BEFORE_STROLL_SECONDS = { min: 5, max: 16 };
const BETWEEN_GLANCES_SECONDS = { min: 2, max: 6 };
/** How far to either side a look around can turn, in radians. */
const GLANCE_ANGLE = { min: 0.5, max: 1.6 };
const STROLL_STEPS = 6;
/** Closer than this isn't worth getting up for. */
const MIN_STROLL_DISTANCE = 2;
/** How far from where it was last sent a pawn will drift, so it stays where you put it instead of slowly leaving the house. */
const HANGOUT_RANGE = 7;
const CHANCE_TO_LEAVE_ROOM = 0.2;
/** How far a pawn will walk for something it needs. Far enough to cross a house and change rooms. */
const FURNITURE_WALK_STEPS = 32;
/** How far a pawn will walk to find someone, or to get away from them. */
const SOCIAL_WALK_STEPS = 24;
/** A pawn you've just sent somewhere stays there this long before its personality takes it off again. */
const LEFT_ALONE_AFTER_ORDER_SECONDS = 30;
/** Outgoing pawns aren't much drawn to someone who'd only leave, so a shy pawn counts for this much of a person. */
const SHY_COMPANY_APPEAL = 0.25;
/** How much a square's closeness matters when choosing who to join, against how many are there. */
const JOIN_DISTANCE_WEIGHT = 0.25;
/** How much better a square is for having a friend at it, or worse for having a rival. */
const FRIEND_APPEAL = 1.5;
const RIVAL_APPEAL = -1.5;
const REACTION_SECONDS = 1.5;
/** Below this, nothing is worth getting up for, and a pawn just idles. */
const WORTH_DOING_UTILITY = 6;
/** Above this, a need is pressing enough to get up even if you only just sent the pawn somewhere. */
const URGENT_UTILITY = 20;
/** A pawn chooses among this many of its best options, so it isn't completely predictable. */
const OPTIONS_CONSIDERED = 3;
/** What other pawns offer, compared to what furniture advertises. */
const COMPANY_ADVERTISEMENT: Advertisement = { social: 40 };
/** How much a walk this many squares long takes off an option's appeal, by half. */
const DISTANCE_HALVES_UTILITY_AT = 30;
/** The piece a pawn just finished with is this much less appealing, so it doesn't keep going back to the same chair. */
const JUST_USED_PIECE_UTILITY = 0.3;
/** With nothing it needs, how often a pawn does something in character rather than go for a stroll. */
const CHANCE_OF_IDLE_FLAVOR = 0.45;
/** A shy pawn this lonely puts up with company. */
const LONELY_ENOUGH_TO_STAY = 30;
const IDLE_FLAVOR_SECONDS = 1.5;
/** Someone you sit or lie down stays at least this long, even if it didn't need much. */
const SENT_TO_STAY_AT_LEAST_SECONDS = 20;
/** Long enough to be getting on with, if a piece only fills a need slowly. */
const USE_SECONDS: Record<FurnitureUseKind, { min: number; max: number }> = {
  sit: { min: 15, max: 35 },
  lie: { min: 25, max: 50 },
  stand: { min: 6, max: 14 },
  inside: { min: 8, max: 18 },
};

/** Something a pawn might do, and how much it wants to. `act` sets it off, and is false if it couldn't. */
export type Option = { utility: number; act: () => boolean };

/** About how far apart two squares are: straight across, plus a long way for each floor up or down. */
function distance(a: Cell, b: Cell): number {
  return Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.level - b.level) * FLOOR_CHANGE_STEPS;
}

/** Decides what a pawn with nothing to do gets up to: tending to whatever it needs most, following its personality, or just idling in character. */
export class Wanderer {
  private model: World;
  private relationships: Relationships;
  private isTalking: (pawn: Pawn) => boolean;
  private isHavingMeal: (pawn: Pawn) => boolean;
  private moreOptions: (pawn: Pawn, minimum: number) => Option[];
  private isOffLimits: (pawn: Pawn, cell: Cell) => boolean;
  private takenCells: (pawn: Pawn) => Set<string>;
  private findSpot: (pawn: Pawn, piece: FurniturePiece) => FurnitureSpot | null;
  private random: () => number;
  private nextStroll = new Map<Pawn, number>();
  private nextGlance = new Map<Pawn, number>();
  private leaveFurnitureAt = new Map<Pawn, number>();
  private lastPieceUsed = new Map<Pawn, string>();
  private hangouts = new Map<Pawn, Cell>();
  private leftAloneUntil = new Map<Pawn, number>();
  private clock = 0;

  constructor(
    model: World,
    relationships: Relationships,
    isTalking: (pawn: Pawn) => boolean,
    isHavingMeal: (pawn: Pawn) => boolean,
    takenCells: (pawn: Pawn) => Set<string>,
    findSpot: (pawn: Pawn, piece: FurniturePiece) => FurnitureSpot | null,
    moreOptions: (pawn: Pawn, minimum: number) => Option[] = () => [],
    isOffLimits: (pawn: Pawn, cell: Cell) => boolean = () => false,
    random: () => number = Math.random,
  ) {
    this.moreOptions = moreOptions;
    this.isOffLimits = isOffLimits;
    this.model = model;
    this.relationships = relationships;
    this.isTalking = isTalking;
    this.isHavingMeal = isHavingMeal;
    this.takenCells = takenCells;
    this.findSpot = findSpot;
    this.random = random;
  }

  update(seconds: number, pawns: Pawn[]) {
    this.clock += seconds;
    // Looking over the whole house takes a moment, so only one pawn makes up its mind each frame, and anyone else waits for the next.
    let hasDecided = false;
    for (const pawn of pawns) {
      if (pawn.isWalking && !pawn.isStrolling) {
        this.hangouts.set(pawn, pawn.destinationCell());
        this.leftAloneUntil.set(pawn, this.clock + LEFT_ALONE_AFTER_ORDER_SECONDS);
      }
      this.wrapUpFurniture(pawn);
      if (pawn.isWalking || pawn.isUsingFurniture || this.isTalking(pawn) || this.isHavingMeal(pawn)) {
        // Whatever it was doing, it waits a moment after finishing before doing anything else.
        this.nextStroll.set(pawn, this.clock + this.between(IDLE_BEFORE_STROLL_SECONDS));
        this.nextGlance.set(pawn, this.clock + this.between(BETWEEN_GLANCES_SECONDS));
        continue;
      }
      const strollDue = this.nextStroll.get(pawn);
      if (strollDue === undefined) {
        this.nextStroll.set(pawn, this.clock + this.between(IDLE_BEFORE_STROLL_SECONDS));
      } else if (this.clock >= strollDue && !hasDecided) {
        hasDecided = true;
        this.nextStroll.set(pawn, this.clock + this.between(IDLE_BEFORE_STROLL_SECONDS));
        this.decide(pawn, pawns.filter((other) => other !== pawn));
      }
      const glanceDue = this.nextGlance.get(pawn);
      if (glanceDue === undefined) {
        this.nextGlance.set(pawn, this.clock + this.between(BETWEEN_GLANCES_SECONDS));
      } else if (this.clock >= glanceDue) {
        this.nextGlance.set(pawn, this.clock + this.between(BETWEEN_GLANCES_SECONDS));
        if (!pawn.isWalking) pawn.glance(this.between(GLANCE_ANGLE) * (this.random() < 0.5 ? -1 : 1));
      }
    }
  }

  /** Needs come first. With none worth getting up for, personality takes over, and failing that it idles. */
  private decide(pawn: Pawn, others: Pawn[]) {
    if (this.tendToNeeds(pawn, others)) return;
    if (this.followPersonality(pawn, others)) return;
    if (this.random() < CHANCE_OF_IDLE_FLAVOR && this.doSomethingInCharacter(pawn)) return;
    this.stroll(pawn, others);
  }

  /** A pawn in the middle of a conversation finishes it before getting up. It's done when the piece has filled what it came for, or it has been long enough. */
  private wrapUpFurniture(pawn: Pawn) {
    // One you sent to bed or to sit down gets up once it's had what it came for, after a while at least, so nobody's left lying there forever.
    if (pawn.staysUntilDone && !this.isHavingMeal(pawn)) {
      const due = this.leaveFurnitureAt.get(pawn);
      if (due === undefined) this.leaveFurnitureAt.set(pawn, this.clock + SENT_TO_STAY_AT_LEAST_SECONDS);
      else if (this.clock >= due && pawn.isSatisfiedByFurniture && !this.isTalking(pawn)) {
        this.leaveFurnitureAt.delete(pawn);
        pawn.finishUsingFurniture();
      }
      return;
    }
    if (!pawn.leavesFurnitureOnItsOwn || this.isHavingMeal(pawn)) {
      this.leaveFurnitureAt.delete(pawn);
      return;
    }
    const due = this.leaveFurnitureAt.get(pawn);
    if (due === undefined) {
      this.leaveFurnitureAt.set(pawn, this.clock + this.between(USE_SECONDS[pawn.settledUse!]));
    } else if ((this.clock >= due || pawn.isSatisfiedByFurniture) && !this.isTalking(pawn)) {
      // Asleep in bed at night, it stays there until morning.
      if (pawn.settledUse === 'lie' && nightfall() > 0.5) return;
      this.leaveFurnitureAt.delete(pawn);
      pawn.finishUsingFurniture();
    }
  }

  /** Scores each piece and the company of others by what they offer this pawn right now, then picks from the best. True if it set off. */
  private tendToNeeds(pawn: Pawn, others: Pawn[]): boolean {
    const minimum = this.wasJustSent(pawn) ? URGENT_UTILITY : WORTH_DOING_UTILITY;
    const here = pawn.currentCell();
    const options: Option[] = [];
    // A fire that's out isn't worth sitting by. Lighting it is up to you.
    const worthwhile = this.model.allFurniture().filter((piece) => isLit(piece) && pawn.mind.utilityOf(getFurnitureDef(piece.type).advertises) >= minimum);
    if (worthwhile.length > 0) {
      const reachable = new Set(cellsWithinWalk(this.model, here, FURNITURE_WALK_STEPS).map(placeKey));
      reachable.add(placeKey(here));
      for (const piece of worthwhile) {
        const canReach = getFootprintCells(piece.type, piece.x, piece.z, piece.rotation).some(({ x, z }) =>
          STEPS.some(({ dx, dz }) => reachable.has(placeKey({ x: x + dx, z: z + dz, level: piece.level }))),
        );
        if (!canReach) continue;
        options.push({ utility: this.furnitureUtility(pawn, piece, others), act: () => this.goUseFurniture(pawn, piece) });
      }
    }
    // Other things it could get on with, like cleaning up a mess.
    options.push(...this.moreOptions(pawn, minimum));
    const companyUtility = pawn.mind.utilityOf(COMPANY_ADVERTISEMENT);
    if (companyUtility >= minimum && this.companyAt(here, others) === 0) options.push({ utility: companyUtility, act: () => this.goFindCompany(pawn, others) });

    options.sort((a, b) => b.utility - a.utility);
    const best = options.slice(0, OPTIONS_CONSIDERED);
    while (best.length > 0) {
      const [option] = best.splice(this.rollIndex(best.map(({ utility }) => utility)), 1);
      if (option.act()) return true;
    }
    return false;
  }

  /** What a piece is worth after personality and distance: a shy pawn is put off by people near it and an outgoing one drawn to them. */
  private furnitureUtility(pawn: Pawn, piece: FurniturePiece, others: Pawn[]): number {
    const def = getFurnitureDef(piece.type);
    const crowd = (1 + this.companyAt(piece, others)) ** PERSONALITY_TRAITS[pawn.info.personality].furnitureCrowdPull;
    const walk = DISTANCE_HALVES_UTILITY_AT / (DISTANCE_HALVES_UTILITY_AT + distance(pawn.currentCell(), piece));
    const freshness = piece.id === this.lastPieceUsed.get(pawn) ? JUST_USED_PIECE_UTILITY : 1;
    return pawn.mind.utilityOf(def.advertises) * crowd * walk * freshness;
  }

  /** A shy pawn with company leaves, unless it's lonely, and an outgoing one on its own goes to find some. True if it set off. */
  private followPersonality(pawn: Pawn, others: Pawn[]): boolean {
    if (this.wasJustSent(pawn)) return false;
    const traits = PERSONALITY_TRAITS[pawn.info.personality];
    const company = this.companyAt(pawn.currentCell(), others);
    if (traits.avoidsCompany) return company > 0 && pawn.mind.needs.social > LONELY_ENOUGH_TO_STAY && this.getAwayFrom(pawn, others, company);
    return company === 0 && this.random() < traits.chanceToSeekCompany && this.goFindCompany(pawn, others);
  }

  /** A roll against everything this pawn's traits might do when it's got nothing on. False if its traits don't do anything in particular. */
  private doSomethingInCharacter(pawn: Pawn): boolean {
    const flavors: IdleFlavor[] = traitsOf(pawn.info).flatMap((trait) => TRAITS[trait].idleFlavors ?? []);
    if (flavors.length === 0) return false;
    const { emoji, bubble, gesture } = flavors[Math.floor(this.random() * flavors.length)];
    pawn[bubble](emoji, IDLE_FLAVOR_SECONDS);
    pawn.playGesture(gesture);
    return true;
  }

  private wasJustSent(pawn: Pawn): boolean {
    return this.clock < (this.leftAloneUntil.get(pawn) ?? 0);
  }

  /** How many others are, or are about to be, close enough to this square to count as company. */
  private companyAt(cell: Cell, others: Pawn[]): number {
    return others.filter((other) => areTogether(this.model, cell, other.destinationCell())).length;
  }

  /** Heads over to the best company in reach: more people is better, friends are better still, and not too far is better. */
  private goFindCompany(pawn: Pawn, others: Pawn[]): boolean {
    const here = pawn.currentCell();
    const taken = this.takenCells(pawn);
    let best: Cell | null = null;
    let bestScore = -Infinity;
    for (const cell of cellsWithinWalk(this.model, here, SOCIAL_WALK_STEPS)) {
      if (taken.has(placeKey(cell)) || this.isOffLimits(pawn, cell)) continue;
      let isCompany = false;
      const appeal = others.reduce((sum, other) => {
        if (!areTogether(this.model, cell, other.destinationCell())) return sum;
        isCompany = true;
        return sum + this.appealOf(pawn, other);
      }, 0);
      if (!isCompany) continue;
      const score = appeal - distance(cell, here) * JOIN_DISTANCE_WEIGHT + this.random();
      if (score > bestScore) {
        best = cell;
        bestScore = score;
      }
    }
    if (!best) return false;
    pawn.say('👋', REACTION_SECONDS);
    pawn.strollTo(best);
    this.hangouts.set(pawn, best);
    return true;
  }

  private appealOf(pawn: Pawn, other: Pawn): number {
    const base = other.info.personality === 'shy' ? SHY_COMPANY_APPEAL : 1;
    if (this.relationships.areFriends(pawn.info.id, other.info.id)) return base + FRIEND_APPEAL;
    if (this.relationships.areRivals(pawn.info.id, other.info.id)) return base + RIVAL_APPEAL;
    return base;
  }

  /** Heads for the quietest square in reach, if there's anywhere quieter than here: fewest people close by, then fewest in the room. */
  private getAwayFrom(pawn: Pawn, others: Pawn[], companyHere: number): boolean {
    const here = pawn.currentCell();
    const taken = this.takenCells(pawn);
    let best: Cell | null = null;
    let bestCompany = companyHere;
    let bestScore = Infinity;
    for (const cell of cellsWithinWalk(this.model, here, SOCIAL_WALK_STEPS)) {
      if (taken.has(placeKey(cell)) || this.isOffLimits(pawn, cell)) continue;
      const company = this.companyAt(cell, others);
      if (company > bestCompany) continue;
      const room = this.model.roomAt(cell);
      const score = others.filter((other) => this.model.roomAt(other.destinationCell()) === room).length + this.random();
      if (company < bestCompany || score < bestScore) {
        best = cell;
        bestCompany = company;
        bestScore = score;
      }
    }
    if (!best || bestCompany >= companyHere) return false;
    pawn.think('😳', REACTION_SECONDS);
    pawn.strollTo(best);
    this.hangouts.set(pawn, best);
    return true;
  }

  /** Its hangout moves there too, so a pawn that came in for the sofa stays in that part of the house. False if every spot on the piece is taken or out of reach. */
  private goUseFurniture(pawn: Pawn, piece: FurniturePiece): boolean {
    const spot = this.findSpot(pawn, piece);
    if (!spot) return false;
    pawn.chooseFurniture(spot);
    this.lastPieceUsed.set(pawn, piece.id);
    this.hangouts.set(pawn, spot.approach);
    return true;
  }

  /** Picks a free square a short walk away, usually in the same room. With nowhere to go, the pawn just stays put. */
  private stroll(pawn: Pawn, others: Pawn[]) {
    const here = pawn.currentCell();
    const hangout = this.hangoutOf(pawn, here);
    const taken = this.takenCells(pawn);
    const open = cellsWithinWalk(this.model, here, STROLL_STEPS).filter(
      (cell) => !taken.has(placeKey(cell)) && !this.isOffLimits(pawn, cell) && distance(cell, here) >= MIN_STROLL_DISTANCE && distance(cell, hangout) <= HANGOUT_RANGE,
    );
    const places = this.wasJustSent(pawn) ? open : this.placesToSuit(pawn, open, others);
    const room = this.model.roomAt(here);
    const inRoom = places.filter((cell) => this.model.roomAt(cell) === room);
    const elsewhere = places.filter((cell) => this.model.roomAt(cell) !== room);
    const choices = elsewhere.length > 0 && (inRoom.length === 0 || this.random() < CHANCE_TO_LEAVE_ROOM) ? elsewhere : inRoom;
    if (choices.length > 0) pawn.strollTo(choices[Math.floor(this.random() * choices.length)]);
  }

  /** A shy pawn strolls where nobody is, and an outgoing one stays with the people it's with. If there's no such place, anywhere will do. */
  private placesToSuit(pawn: Pawn, places: Cell[], others: Pawn[]): Cell[] {
    const { avoidsCompany, staysWithCompany } = PERSONALITY_TRAITS[pawn.info.personality];
    if (avoidsCompany) {
      const quiet = places.filter((cell) => this.companyAt(cell, others) === 0);
      return quiet.length > 0 ? quiet : places;
    }
    if (staysWithCompany && this.companyAt(pawn.currentCell(), others) > 0) {
      const lively = places.filter((cell) => this.companyAt(cell, others) > 0);
      return lively.length > 0 ? lively : places;
    }
    return places;
  }

  /** A pawn that's ended up far from its hangout, say by furniture landing on it, makes wherever it is the new one. */
  private hangoutOf(pawn: Pawn, here: Cell): Cell {
    const hangout = this.hangouts.get(pawn);
    if (hangout && distance(hangout, here) <= HANGOUT_RANGE) return hangout;
    this.hangouts.set(pawn, here);
    return here;
  }

  /** Picks an index at random, in proportion to its weight. */
  private rollIndex(weights: number[]): number {
    let roll = this.random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll < 0) return i;
    }
    return weights.length - 1;
  }

  private between({ min, max }: { min: number; max: number }): number {
    return min + this.random() * (max - min);
  }
}
