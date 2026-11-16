import * as THREE from 'three';
import { LEVEL_HEIGHT, cellToWorld } from '../grid/gridMath';
import { STEPS, cellKey } from '../grid/roomDetection';
import { getFootprintCells, getFurnitureDef } from '../build/furnitureCatalog';
import { areTogether } from './chatter';
import { isPieceStillThere } from './furnitureUse';
import type { FurnitureSpot } from './furnitureUse';
import { cellsWithinWalk } from './pathfinding';
import type { Cell } from './pathfinding';
import { FLOOR_CHANGE_STEPS, placeKey } from './world';
import type { LevelPiece as FurniturePiece, World } from './world';
import type { Pawn } from './pawn';
import { PERSONALITY_TRAITS, TIDINESS_HABITS } from './personality';

/** A pawn nearly full doesn't bother making a plate when it goes to the fridge. */
const MAKES_A_PLATE_BELOW = 90;
/** How far a pawn will carry a plate to find somewhere to eat. */
const CARRY_STEPS = 32;
/** Finding a spot means checking the walk to it, so it only looks properly at the most appealing few. */
const PLACES_CONSIDERED = 4;
const MIN_EATING_SECONDS = 8;
const MAX_EATING_SECONDS = 30;
const REACTION_SECONDS = 2;
/** How far from the middle of a table's square, toward the diner, a plate is set. */
const PLATE_IN_FROM_CENTER = 0.2;

/** How long it takes to wash up a plate. */
const WASHING_SECONDS = { min: 4, max: 7 };
/** How long it takes to put a plate in the dishwasher instead. */
const LOADING_SECONDS = { min: 1.5, max: 2.5 };

/** Where the mess from a meal goes. */
export interface MealMesses {
  /** Scraps from making a plate at this piece. */
  cooked(pawn: Pawn, source: FurniturePiece): void;
  /** A dirty plate left behind, on the table it was eaten at if there was one. */
  leftDishes(pawn: Pawn, onTable: { piece: FurniturePiece; cell: Cell; position: THREE.Vector3 } | null): void;
}

type Meal =
  | { stage: 'preparing'; source: FurniturePiece; secondsLeft: number; rate: number; servings: string[] }
  | { stage: 'carrying'; rate: number }
  | { stage: 'eating'; rate: number; table: { piece: FurniturePiece; cell: Cell; position: THREE.Vector3 } | null; age: number; duration: number }
  | { stage: 'clearing'; sinkId: string | null }
  | { stage: 'washing'; sink: FurniturePiece; secondsLeft: number };

/**
 * The trip from hungry to fed: making a plate at the fridge, stove or counter,
 * carrying it to a seat at a table, setting it down and eating, then taking
 * the empty plate to a sink to wash it up, if there's one nearby. If anything
 * gets in the way, including you sending the pawn somewhere else, it just eats
 * wherever it ends up, because the plate stays with it.
 */
export class Meals {
  private model: World;
  private findSpot: (pawn: Pawn, piece: FurniturePiece) => FurnitureSpot | null;
  private random: () => number;
  private meals = new Map<Pawn, Meal>();
  private messes: MealMesses;

  constructor(model: World, findSpot: (pawn: Pawn, piece: FurniturePiece) => FurnitureSpot | null, messes: MealMesses, random: () => number = Math.random) {
    this.model = model;
    this.findSpot = findSpot;
    this.messes = messes;
    this.random = random;
  }

  isHavingMeal(pawn: Pawn): boolean {
    return this.meals.has(pawn);
  }

  update(seconds: number, pawns: Pawn[]) {
    for (const pawn of pawns) {
      const meal = this.meals.get(pawn);
      if (!meal) this.startMaking(pawn);
      else if (meal.stage === 'preparing') this.prepare(pawn, meal, seconds, pawns);
      else if (meal.stage === 'carrying') this.carry(pawn, meal);
      else if (meal.stage === 'eating') this.eat(pawn, meal, seconds, pawns);
      else if (meal.stage === 'clearing') this.clear(pawn, meal);
      else this.wash(pawn, meal, seconds);
    }
  }

  private startMaking(pawn: Pawn) {
    const source = pawn.settledPiece;
    const food = source && getFurnitureDef(source.type).food;
    if (!source || !food || pawn.mind.needs.hunger >= MAKES_A_PLATE_BELOW) return;
    const secondsLeft = food.prepareSeconds.min + this.random() * (food.prepareSeconds.max - food.prepareSeconds.min);
    this.meals.set(pawn, { stage: 'preparing', source, secondsLeft, rate: food.reliefPerSecond, servings: food.servings });
  }

  private prepare(pawn: Pawn, meal: Extract<Meal, { stage: 'preparing' }>, seconds: number, pawns: Pawn[]) {
    // Called away before it was ready, so there's no plate yet.
    if (pawn.settledPiece?.id !== meal.source.id) {
      this.meals.delete(pawn);
      return;
    }
    meal.secondsLeft -= seconds;
    if (meal.secondsLeft > 0) return;
    const food = meal.servings[Math.floor(this.random() * meal.servings.length)];
    this.messes.cooked(pawn, meal.source);
    pawn.finishUsingFurniture();
    pawn.holdPlate(food);
    pawn.think(food, REACTION_SECONDS);
    this.meals.set(pawn, { stage: 'carrying', rate: meal.rate });
    this.goSomewhereToEat(pawn, pawns.filter((other) => other !== pawn));
  }

  /** A seat at a table if there is one, then standing at a table, then any comfortable seat. With none of those, it stays put and eats on its feet. */
  private goSomewhereToEat(pawn: Pawn, others: Pawn[]) {
    const here = pawn.currentCell();
    const reachable = new Set(cellsWithinWalk(this.model, here, CARRY_STEPS).map(placeKey));
    reachable.add(placeKey(here));
    const pieces = this.model.allFurniture().filter((piece) => this.canReach(piece, reachable));
    const seats = pieces.filter((piece) => getFurnitureDef(piece.type).mealSeat);
    const tables = pieces.filter((piece) => getFurnitureDef(piece.type).surface === 'table');

    const seatsAtTables = seats.filter((piece) =>
      getFootprintCells(piece.type, piece.x, piece.z, piece.rotation).some(({ x, z }) => this.surfaceBeside({ x, z, level: piece.level })),
    );
    void (
      this.trySpots(pawn, seatsAtTables, others, (spot) => spot.seat !== null && this.surfaceBeside(spot.seat) !== null) ||
      this.trySpots(pawn, tables, others, () => true) ||
      this.trySpots(pawn, seats, others, () => true)
    );
  }

  private canReach(piece: FurniturePiece, reachable: Set<string>): boolean {
    return getFootprintCells(piece.type, piece.x, piece.z, piece.rotation).some(({ x, z }) =>
      STEPS.some(({ dx, dz }) => reachable.has(placeKey({ x: x + dx, z: z + dz, level: piece.level }))),
    );
  }

  /** Goes for the most appealing spot it can actually get to: closer is better, and company counts however this pawn feels about company. */
  private trySpots(pawn: Pawn, pieces: FurniturePiece[], others: Pawn[], isSuitable: (spot: FurnitureSpot) => boolean): boolean {
    const here = pawn.currentCell();
    const { furnitureCrowdPull } = PERSONALITY_TRAITS[pawn.info.personality];
    const appeal = (piece: FurniturePiece) => {
      const company = others.filter((other) => areTogether(this.model, piece, other.destinationCell())).length;
      return (1 + company) ** furnitureCrowdPull / (1 + Math.hypot(piece.x - here.x, piece.z - here.z) + Math.abs(piece.level - here.level) * FLOOR_CHANGE_STEPS);
    };
    const best = [...pieces].sort((a, b) => appeal(b) - appeal(a)).slice(0, PLACES_CONSIDERED);
    for (const piece of best) {
      const spot = this.findSpot(pawn, piece);
      if (!spot || !isSuitable(spot)) continue;
      pawn.chooseFurniture(spot);
      return true;
    }
    return false;
  }

  private carry(pawn: Pawn, meal: Extract<Meal, { stage: 'carrying' }>) {
    if (pawn.isWalking) return;
    const needed = (100 - pawn.mind.needs.hunger) / meal.rate;
    const duration = Math.max(MIN_EATING_SECONDS, Math.min(MAX_EATING_SECONDS, needed));
    const here = pawn.currentCell();
    const table = this.surfaceBeside(here);
    const position = table && this.platePosition(here, table.cell, table.piece);
    if (table && position) {
      pawn.setPlateDown(position);
      pawn.turnToward(table.cell);
    }
    pawn.setEating(true);
    this.meals.set(pawn, { stage: 'eating', rate: meal.rate, table: table && position ? { ...table, position } : null, age: 0, duration });
  }

  private eat(pawn: Pawn, meal: Extract<Meal, { stage: 'eating' }>, seconds: number, pawns: Pawn[]) {
    // Sent off mid-meal, it takes the plate along and finishes when it stops.
    if (pawn.isWalking) {
      pawn.setEating(false);
      pawn.takePlateBack();
      this.meals.set(pawn, { stage: 'carrying', rate: meal.rate });
      return;
    }
    if (meal.table && !isPieceStillThere(this.model, meal.table.piece)) {
      pawn.takePlateBack();
      meal.table = null;
    }
    meal.age += seconds;
    pawn.mind.fill('hunger', meal.rate * seconds);
    pawn.setFoodLeft(Math.max(0, 1 - meal.age / meal.duration));
    if (meal.age < meal.duration) return;
    pawn.setEating(false);
    // Someone you sat down stays put, so the plate stays too. Anyone else takes it to the sink, unless it can't be bothered.
    const canGetUp = !pawn.isUsingFurniture || pawn.leavesFurnitureOnItsOwn;
    const leavesIt = this.random() < TIDINESS_HABITS[pawn.info.tidiness].leavesDishes;
    if (canGetUp && !leavesIt) {
      pawn.takePlateBack();
      if (this.goWashUp(pawn, pawns.filter((other) => other !== pawn))) {
        this.meals.set(pawn, { stage: 'clearing', sinkId: pawn.furniturePieceId });
        return;
      }
    }
    // With no sink to get to, the plate stays where it was eaten off, too.
    this.messes.leftDishes(pawn, meal.table);
    this.finishMeal(pawn);
    if (pawn.leavesFurnitureOnItsOwn) pawn.finishUsingFurniture();
  }

  private finishMeal(pawn: Pawn) {
    pawn.clearPlate();
    this.meals.delete(pawn);
  }

  /** Heads for the nearest dishwasher or sink it can get to with the empty plate. A dishwasher beats a kitchen sink, which beats one in the bathroom. False if there's none. */
  private goWashUp(pawn: Pawn, others: Pawn[]): boolean {
    const here = pawn.currentCell();
    const reachable = new Set(cellsWithinWalk(this.model, here, CARRY_STEPS).map(placeKey));
    reachable.add(placeKey(here));
    const sinks = this.model.allFurniture().filter((piece) => getFurnitureDef(piece.type).washesDishes && this.canReach(piece, reachable));
    const dishwashers = sinks.filter((piece) => getFurnitureDef(piece.type).loadsDishes);
    const kitchen = sinks.filter((piece) => getFurnitureDef(piece.type).category === 'kitchen');
    return this.trySpots(pawn, dishwashers, others, () => true) || this.trySpots(pawn, kitchen, others, () => true) || this.trySpots(pawn, sinks, others, () => true);
  }

  /** On the way to the sink. If it ends up anywhere else, it doesn't bother, and the plate goes. */
  private clear(pawn: Pawn, meal: Extract<Meal, { stage: 'clearing' }>) {
    if (pawn.isWalking) return;
    const sink = pawn.settledPiece;
    if (!sink || sink.id !== meal.sinkId) {
      // Ended up somewhere else, so the plate gets put down there.
      this.messes.leftDishes(pawn, null);
      this.finishMeal(pawn);
      return;
    }
    const { min, max } = getFurnitureDef(sink.type).loadsDishes ? LOADING_SECONDS : WASHING_SECONDS;
    this.meals.set(pawn, { stage: 'washing', sink, secondsLeft: min + this.random() * (max - min) });
  }

  private wash(pawn: Pawn, meal: Extract<Meal, { stage: 'washing' }>, seconds: number) {
    if (pawn.settledPiece?.id !== meal.sink.id) {
      this.messes.leftDishes(pawn, null);
      this.finishMeal(pawn);
      return;
    }
    meal.secondsLeft -= seconds;
    if (meal.secondsLeft > 0) return;
    this.finishMeal(pawn);
    pawn.think('✨', REACTION_SECONDS);
    pawn.finishUsingFurniture();
  }

  /** A table or counter directly next to this square with no wall between, if any. */
  private surfaceBeside({ x, z, level }: Cell): { piece: FurniturePiece; cell: Cell } | null {
    for (const piece of this.model.allFurniture()) {
      if (piece.level !== level || !getFurnitureDef(piece.type).surface) continue;
      const footprint = new Set(getFootprintCells(piece.type, piece.x, piece.z, piece.rotation).map((cell) => cellKey(cell.x, cell.z)));
      for (const { dx, dz, dir } of STEPS) {
        if (footprint.has(cellKey(x + dx, z + dz)) && !this.model.level(level).hasWall(x, z, dir)) return { piece, cell: { x: x + dx, z: z + dz, level } };
      }
    }
    return null;
  }

  private platePosition(diner: Cell, tableCell: Cell, table: FurniturePiece): THREE.Vector3 {
    const { x, z } = cellToWorld(tableCell.x, tableCell.z);
    const towardDiner = cellToWorld(diner.x, diner.z);
    return new THREE.Vector3(
      x + Math.sign(towardDiner.x - x) * PLATE_IN_FROM_CENTER,
      table.level * LEVEL_HEIGHT + getFurnitureDef(table.type).height,
      z + Math.sign(towardDiner.z - z) * PLATE_IN_FROM_CENTER,
    );
  }
}
