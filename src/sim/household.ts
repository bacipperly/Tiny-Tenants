import * as THREE from 'three';
import type { Route } from './pathOverlay';
import type { RoomLight } from '../build/roomLighting';
import { getFurnitureDef } from '../build/furnitureCatalog';
import { loadHousehold, saveHousehold } from '../persistence/save';
import type { NeedsPanelView } from '../ui/needsPanel';
import { Chatter } from './chatter';
import { Chores } from './chores';
import { Swimming } from './swimming';
import { Messes, messCell } from './messes';
import { Privacy } from './privacy';
import { findFurnitureSpot } from './furnitureUse';
import { groundMenu, messMenu, pawnMenu, pieceMenu, selfMenu } from './interactions';
import type { InteractionContext, InteractionMenu, SocialKind } from './interactions';
import { canStep, findPath } from './pathfinding';
import { areTogether } from './chatter';
import type { ChatOutcome } from './chatter';
import { compatibility } from './personality';
import type { FurnitureSpot } from './furnitureUse';
import { Meals } from './meals';
import { Pawn } from './pawn';
import type { PawnInfo } from './pawn';
import type { Cell } from './pathfinding';
import { placeKey, sameCell } from './world';
import type { LevelPiece, World } from './world';
import { completeTraits } from './personality';
import type { PawnTraits } from './personality';
import { Relationships } from './relationships';
import { Wanderer } from './wandering';

/** How long it takes to light a fire, or put it out. */
const SWITCH_SECONDS = 2;

const NEW_PAWN_COLORS = ['#3a86ff', '#ff6b6b', '#ffd166', '#06d6a0', '#c77dff', '#ff9f1c', '#f15bb5', '#4a4e69'];

/** Pawns closer than this, when at least one is walking, start drifting apart. */
const SIDESTEP_RANGE = 1.3;
/** By this distance they've drifted all the way. */
const SIDESTEP_FULL_RANGE = 0.7;
/** How far a walker drifts aside as it passes someone. */
const WALKER_NUDGE = 0.18;
/** Someone standing still does more of the moving: between them there's room to pass, and neither touches a wall or furniture. */
const STANDER_NUDGE = 0.26;
/** The little step back a stander takes from a walker coming toward them. */
const STANDER_BACKSTEP = 0.06;
const STANDER_NUDGE_LIMIT = 0.27;
/** A door opening is narrow, so a pawn crossing one barely drifts. */
const SIDESTEP_DISTANCE_IN_DOOR = 0.08;

/**
 * Everyone living on the lot, and which of them the mouse is commanding. Who
 * they are is remembered as soon as it changes, separately from the house, so
 * a new name or color survives a refresh without pressing Save and Undo never
 * touches it. Where they're standing isn't remembered.
 */
export class Household {
  readonly group = new THREE.Group();

  private world: World;
  private pawns: Pawn[] = [];
  private selectedId = '';
  private bubblesVisible = false;
  /** Pawns on floors above this one are hidden, like the floors. */
  private topShownLevel = Infinity;
  private relationships: Relationships;
  private chatter: Chatter;
  private meals: Meals;
  private messes: Messes;
  private chores: Chores;
  /** Swimming, soaking and sitting at the edge of the pool. */
  readonly swimming: Swimming;
  private privacy: Privacy;
  /** Pawns you've sent to switch something on or off, like lighting the fire. */
  private switching = new Map<Pawn, { pieceId: string; turnOn: boolean; secondsLeft: number }>();
  /** Pawns you've sent over to someone, to talk, joke, hug or argue once they get there. */
  private socials = new Map<Pawn, { target: Pawn; kind: SocialKind; spot: Cell | null; tries: number }>();
  /** Called when a menu choice selects a different pawn, so the pawn bar can catch up. */
  onSelectionChange: (() => void) | null = null;
  /** Someone's hit the water, for a splash. */
  onSplash: ((x: number, z: number, size?: number) => void) | null = null;
  private wanderer: Wanderer;
  private wandering = false;
  private clock = 0;
  /** Who's crossing each door. */
  private doorHolders = new Map<string, Pawn>();
  /** Which way each nearby pair is drifting, kept until they've passed: worked out afresh, it would flip as they crossed. */
  private passingPairs = new Map<string, { x: number; z: number }>();
  /** Pairs that have already had their "excuse me", until they've moved apart again. */
  private excusedPairs = new Set<string>();

  constructor(world: World) {
    this.world = world;
    const model = world;
    const saved = loadHousehold();
    this.relationships = new Relationships(saved?.relationships, () => this.remember());
    this.chatter = new Chatter(model, this.relationships);
    this.privacy = new Privacy(model, this.relationships);
    this.messes = new Messes(model, saved?.messes, () => this.remember());
    this.group.add(this.messes.group);
    this.chores = new Chores(
      model,
      this.messes,
      this.relationships,
      (pawn, piece) => this.findSpotByChoice(pawn, piece),
      (pawn) => this.pawnCells(pawn),
    );
    this.chores.isOffLimits = (pawn, cell) => this.privacy.isOffLimits(pawn, cell);
    this.swimming = new Swimming(model);
    this.swimming.onSplash = (x, z, size) => this.onSplash?.(x, z, size);
    this.meals = new Meals(model, (pawn, piece) => this.findSpotByChoice(pawn, piece), {
      cooked: (pawn, source) => this.chores.cooked(pawn, source),
      leftDishes: (pawn, onTable) => this.chores.leftDishes(pawn, onTable),
    });
    this.wanderer = new Wanderer(
      model,
      this.relationships,
      (pawn) => this.chatter.isTalking(pawn),
      (pawn) => this.meals.isHavingMeal(pawn) || this.chores.isBusy(pawn) || this.swimming.isBusy(pawn) || this.switching.has(pawn) || this.socials.has(pawn),
      (pawn) => this.pawnCells(pawn),
      (pawn, piece) => this.findSpotByChoice(pawn, piece),
      (pawn, minimum) => (this.meals.isHavingMeal(pawn) ? [] : [...this.chores.options(pawn, minimum), ...this.swimming.options(pawn, minimum)]),
      (pawn, cell) => this.privacy.isOffLimits(pawn, cell),
    );
    for (const info of saved?.pawns ?? [{ id: 'p1', name: 'Pawn 1', color: NEW_PAWN_COLORS[0] }]) this.addPawn({ ...info, ...completeTraits(info) });
    this.selectedId = this.pawns.some((pawn) => pawn.info.id === saved?.selectedId) ? saved!.selectedId : this.pawns[0].info.id;
    this.updateSelectionRings();
    this.remember();
  }

  get roster(): PawnInfo[] {
    return this.pawns.map((pawn) => pawn.info);
  }

  get selected(): string {
    return this.selectedId;
  }

  placeEveryoneAtStart(houseCenter: THREE.Vector3, cameraDirXZ: THREE.Vector2) {
    const taken = new Set<string>();
    for (const pawn of this.pawns) {
      pawn.placeAtStart(houseCenter, cameraDirXZ, taken);
      taken.add(placeKey(pawn.currentCell()));
    }
  }

  /** A new pawn starts where the first pawn would, on the next free cell, and is selected so it's ready to command. */
  add(houseCenter: THREE.Vector3, cameraDirXZ: THREE.Vector2) {
    const taken = this.pawnCells();
    const pawn = this.addPawn({
      id: this.unusedId(),
      name: this.unusedName(),
      color: NEW_PAWN_COLORS[this.pawns.length % NEW_PAWN_COLORS.length],
      ...completeTraits({}),
    });
    pawn.placeAtStart(houseCenter, cameraDirXZ, taken);
    pawn.onHouseChanged();
    this.select(pawn.info.id);
  }

  /** The lot always keeps at least one pawn. */
  remove(id: string) {
    if (this.pawns.length <= 1) return;
    const pawn = this.pawns.find((candidate) => candidate.info.id === id);
    if (!pawn) return;
    this.group.remove(pawn.group);
    this.pawns = this.pawns.filter((candidate) => candidate !== pawn);
    this.relationships.forget(id);
    if (this.selectedId === id) this.selectedId = this.pawns[0].info.id;
    this.updateSelectionRings();
    this.remember();
  }

  rename(id: string, name: string) {
    const pawn = this.pawns.find((candidate) => candidate.info.id === id);
    if (!pawn) return;
    pawn.info.name = name;
    this.remember();
  }

  recolor(id: string, color: string) {
    const pawn = this.pawns.find((candidate) => candidate.info.id === id);
    if (!pawn) return;
    pawn.info.color = color;
    this.remember();
  }

  setTraits(id: string, traits: PawnTraits) {
    const pawn = this.pawns.find((candidate) => candidate.info.id === id);
    if (!pawn) return;
    Object.assign(pawn.info, traits);
    this.remember();
  }

  /** How the selected pawn is doing, for the needs panel. */
  selectedView(): NeedsPanelView | null {
    const pawn = this.selectedPawn();
    if (!pawn) return null;
    const others = this.pawns.filter((other) => other !== pawn);
    return {
      name: pawn.info.name,
      traits: pawn.info,
      needs: pawn.mind.needs,
      mood: pawn.mind.mood,
      friends: others.filter((other) => this.relationships.areFriends(pawn.info.id, other.info.id)).map((other) => other.info.name),
      rivals: others.filter((other) => this.relationships.areRivals(pawn.info.id, other.info.id)).map((other) => other.info.name),
    };
  }

  /** Sandbox (the band layout's Live panel): everyone else, and how the selected pawn feels about each of them, from -100 to 100. */
  selectedRelationships(): { id: string; name: string; color: string; score: number }[] {
    const id = this.selectedId;
    return this.pawns
      .filter((other) => other.info.id !== id)
      .map(({ info }) => ({ id: info.id, name: info.name, color: info.color, score: this.relationships.get(id, info.id) }));
  }

  select(id: string) {
    this.selectedId = id;
    this.updateSelectionRings();
    this.remember();
  }

  setBubblesVisible(visible: boolean) {
    this.bubblesVisible = visible;
    for (const pawn of this.pawns) pawn.setBubbleVisible(visible);
  }

  /** Pawns only wander in Live: nothing should wander off while you're building around them. */
  setWandering(wandering: boolean) {
    this.wandering = wandering;
  }

  /** A pawn out for a stroll gives up its destination if that's where you've just sent someone. */
  walkSelectedTo(cell: Cell) {
    for (const pawn of this.pawns) {
      if (pawn.info.id !== this.selectedId && pawn.isStrolling && sameCell(pawn.destinationCell(), cell)) pawn.stepAside();
    }
    this.selectedPawn()?.walkTo(cell);
    this.replanOthers();
  }

  /**
   * Sends the selected pawn to use a piece. If every seat is taken or nothing can
   * be reached, it walks as close as it can and the marker goes red, the same as
   * clicking anywhere else it can't get to. A pawn only strolling over to that
   * piece gives way, but one already settled on a seat keeps it.
   */
  useFurnitureWithSelected(piece: LevelPiece) {
    const pawn = this.selectedPawn();
    if (!pawn) return;
    for (const other of this.pawns) {
      if (other !== pawn && other.isStrolling && other.claimedSeat && other.furniturePieceId === piece.id) other.stepAside();
    }
    const spot = this.findSpotFor(pawn, piece);
    if (spot) pawn.useFurniture(spot);
    // Every spot taken: it says so rather than wandering off to stand behind the headboard.
    else if (findFurnitureSpot(this.world, piece, pawn.currentCell(), new Set(), new Set())) pawn.think('🤷', 2);
    else pawn.walkTo({ x: piece.x, z: piece.z, level: piece.level });
    this.replanOthers();
  }

  /** The pie menu for a piece clicked in Live, or null if there's nothing to do with it. */
  menuForPiece(piece: LevelPiece): InteractionMenu | null {
    return pieceMenu(this.interactions, piece);
  }

  /** The pie menu for a spot on the floor or in the yard. */
  menuForGround(cell: Cell): InteractionMenu | null {
    return groundMenu(this.interactions, cell);
  }

  menuForMess(id: string): InteractionMenu | null {
    const mess = this.messes.get(id);
    return mess ? messMenu(this.interactions, mess) : null;
  }

  /** Clicking the pawn you're controlling gives things to do on the spot; clicking anyone else, things to do with them. */
  menuForPawn(id: string): InteractionMenu | null {
    const target = this.pawns.find((pawn) => pawn.info.id === id);
    const selected = this.selectedPawn();
    if (!target || !selected) return null;
    return target === selected ? selfMenu(this.interactions, target) : pawnMenu(this.interactions, target);
  }

  private get interactions(): InteractionContext {
    return {
      selected: this.selectedPawn() ?? null,
      useBlocked: (pawn, piece) => {
        if (this.findSpotFor(pawn, piece)) return null;
        const ignoringOthers = findFurnitureSpot(this.world, piece, pawn.currentCell(), new Set(), new Set());
        return ignoringOthers ? 'Someone’s already using it' : 'Can’t get there';
      },
      isHavingMeal: (pawn) => this.meals.isHavingMeal(pawn),
      walkBlocked: (pawn, cell) => {
        // A swimmer gets out first, so it's from where it would climb out.
        const here = (pawn.isScripted ? this.swimming.leaveToward(pawn, cell)?.out : null) ?? pawn.currentCell();
        if (sameCell(here, cell)) return 'Already here';
        return findPath(this.world, here, cell, this.pawnCells(pawn)).reachedGoal ? null : 'Can’t get there';
      },
      walk: (cell) => this.walkSelectedTo(cell),
      messes: () => this.messes.all(),
      cleanBlocked: (mess) => {
        const pieces = this.world.allFurniture();
        if (mess.kind === 'trash' && !pieces.some((piece) => piece.type === 'trash-can')) return 'Needs a trash can';
        if (mess.kind === 'dishes' && !pieces.some((piece) => getFurnitureDef(piece.type).washesDishes)) return 'Needs a sink or dishwasher';
        return null;
      },
      areFriends: (a, b) => this.relationships.areFriends(a.info.id, b.info.id),
      areRivals: (a, b) => this.relationships.areRivals(a.info.id, b.info.id),
      reachBlocked: (pawn, target) => {
        if (this.privacy.isOffLimits(pawn, target.currentCell())) return 'They need some privacy';
        return this.isNear(pawn, target) || this.spotBeside(pawn, target) ? null : 'Can’t get to them';
      },
      use: (piece, thoughts) => {
        this.useFurnitureWithSelected(piece);
        if (thoughts) this.selectedPawn()?.setFlavor(thoughts);
      },
      switchTo: (piece, on) => this.switchWithSelected(piece, on),
      pool: (activity, options) => {
        const pawn = this.selectedPawn();
        if (pawn && !this.swimming.start(pawn, activity, options)) pawn.think('🤷', 2);
      },
      poolAt: (cell) => this.swimming.poolAt(cell),
      inWater: (pawn) => this.swimming.isInWater(pawn),
      leavePool: (by) => {
        const pawn = this.selectedPawn();
        if (pawn && !this.swimming.leaveBy(pawn, by)) pawn.think('🤷', 2);
      },
      clean: (messId) => this.cleanWithSelected(messId),
      social: (target, kind) => this.socialWithSelected(target, kind),
      gesture: (gesture, emoji) => {
        const pawn = this.selectedPawn();
        if (!pawn) return;
        pawn.playGesture(gesture);
        pawn.say(emoji, 1.6);
      },
      select: (id) => {
        this.select(id);
        this.onSelectionChange?.();
      },
    };
  }

  /** Sends the selected pawn over to someone to talk, joke, hug or argue. A wave works from wherever it is. */
  socialWithSelected(target: Pawn, kind: SocialKind) {
    const actor = this.selectedPawn();
    if (!actor || actor === target) return;
    if (kind === 'wave') {
      const rivals = this.relationships.areRivals(actor.info.id, target.info.id);
      actor.faceToward(target.currentCell());
      actor.playGesture('wiggle');
      actor.say('👋', 1.6);
      target.faceToward(actor.currentCell());
      target.say(rivals ? '🙄' : '👋', 1.6);
      if (!rivals) this.relationships.adjust(actor.info.id, target.info.id, 1);
      return;
    }
    const job = { target, kind, spot: null as Cell | null, tries: 0 };
    this.socials.set(actor, job);
    if (!this.isNear(actor, target)) this.headOver(actor, job);
  }

  private updateSocials() {
    for (const [actor, job] of this.socials) {
      const { target } = job;
      if (!this.pawns.includes(actor) || !this.pawns.includes(target)) {
        this.socials.delete(actor);
        continue;
      }
      if (actor.isWalking) {
        // Sent somewhere else on the way.
        if (!job.spot || !sameCell(actor.destinationCell(), job.spot)) this.socials.delete(actor);
        continue;
      }
      if (this.isNear(actor, target)) {
        // Someone just wandering stops to listen. Someone you've sent somewhere is waited for.
        if (target.isStrolling) target.strollTo(target.currentCell());
        if (target.isWalking) continue;
        this.socials.delete(actor);
        this.startSocial(actor, target, job.kind);
        continue;
      }
      if (++job.tries > 3 || !this.headOver(actor, job)) {
        this.socials.delete(actor);
        actor.think('🤷', 1.6);
      }
    }
  }

  private headOver(actor: Pawn, job: { target: Pawn; spot: Cell | null }): boolean {
    const spot = this.spotBeside(actor, job.target);
    if (!spot) return false;
    job.spot = spot;
    actor.walkTo(spot);
    return true;
  }

  /** Right next to someone, in the same room, close enough to talk without moving. */
  private isNear(a: Pawn, b: Pawn): boolean {
    const here = a.currentCell();
    const there = b.currentCell();
    return Math.max(Math.abs(here.x - there.x), Math.abs(here.z - there.z)) <= 1 && areTogether(this.world, here, there);
  }

  /** A free square next to someone, with no wall between, that this pawn can walk to. The shortest walk wins. */
  private spotBeside(pawn: Pawn, target: Pawn): Cell | null {
    const there = target.currentCell();
    const taken = this.pawnCells(pawn);
    let best: Cell | null = null;
    let shortest = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = { x: there.x + dx, z: there.z + dz, level: there.level };
        if ((dx === 0 && dz === 0) || taken.has(placeKey(cell)) || !canStep(this.world, there, cell)) continue;
        const { path, reachedGoal } = findPath(this.world, pawn.currentCell(), cell, taken);
        if (reachedGoal && path.length < shortest) {
          shortest = path.length;
          best = cell;
        }
      }
    }
    return best;
  }

  /** The exchange itself, and how it's likely to go: jokes land with playful pawns and fall flat with grouchy ones, and an argument always ends badly. */
  private startSocial(actor: Pawn, target: Pawn, kind: SocialKind) {
    const fit = compatibility(actor.info, target.info);
    const scripts: Record<Exclude<SocialKind, 'wave'>, { lines: string[]; outcome?: ChatOutcome }> = {
      chat: { lines: this.chatter.randomTopic(4) },
      joke: {
        lines: ['😏', '🤔', '🤡'],
        outcome: {
          chance: 0.6 + fit * 0.08 + (target.info.temperament === 'playful' ? 0.2 : target.info.temperament === 'grouchy' ? -0.3 : 0),
          good: 7,
          bad: -4,
          goodReply: '🤣',
          badReply: '😒',
        },
      },
      compliment: { lines: ['😊', '😳', '👍'], outcome: { chance: 0.85 + fit * 0.05, good: 6, bad: -3, goodReply: '🥰', badReply: '🙄' } },
      gossip: { lines: ['🤫', '👀', '😮', '🤭'], outcome: { chance: 0.8, good: 6, bad: -5, goodReply: '🤭', badReply: '😬' } },
      hug: { lines: ['🤗', '🤗'], outcome: { chance: target.info.personality === 'shy' ? 0.7 : 0.9, good: 8, bad: -6, goodReply: '💕', badReply: '😖' } },
      argue: { lines: ['😤', '💢', '😠', '😡'], outcome: { chance: 0, good: 0, bad: -10, goodReply: '', badReply: '💢', badMood: 'cranky' } },
    };
    if (kind === 'wave') return;
    const { lines, outcome } = scripts[kind];
    this.chatter.startWith(actor, target, lines, outcome);
  }

  /** Sends the selected pawn to switch something on or off, like lighting the fire. It walks over, takes a moment, and then it's done. Lighting a fire, it stays to warm up. */
  switchWithSelected(piece: LevelPiece, turnOn: boolean) {
    const pawn = this.selectedPawn();
    if (!pawn) return;
    const spot = this.findSpotFor(pawn, piece);
    if (!spot) {
      pawn.walkTo({ x: piece.x, z: piece.z, level: piece.level });
      return;
    }
    pawn.useFurniture(spot);
    this.switching.set(pawn, { pieceId: piece.id, turnOn, secondsLeft: SWITCH_SECONDS });
    this.replanOthers();
  }

  private updateSwitching(seconds: number) {
    for (const [pawn, job] of this.switching) {
      // Sent somewhere else on the way, or gone.
      if (!this.pawns.includes(pawn) || pawn.furniturePieceId !== job.pieceId) {
        this.switching.delete(pawn);
        continue;
      }
      if (pawn.settledPiece?.id !== job.pieceId) continue;
      job.secondsLeft -= seconds;
      if (job.secondsLeft > 0) continue;
      this.switching.delete(pawn);
      const piece = pawn.settledPiece;
      const switchable = getFurnitureDef(piece.type).switchable;
      this.world.level(piece.level).setFurnitureLit(job.pieceId, job.turnOn);
      if (switchable) pawn.think(job.turnOn ? switchable.on.emoji : switchable.off.emoji, 2);
      if (!job.turnOn) pawn.finishUsingFurniture();
    }
  }

  /** Sends the selected pawn to clean up a mess, whatever it thinks of cleaning. One in the middle of a meal finishes it first. */
  cleanWithSelected(messId: string) {
    const pawn = this.selectedPawn();
    if (!pawn) return;
    if (this.meals.isHavingMeal(pawn)) {
      pawn.think('🍽️', 2);
      return;
    }
    this.chores.cleanUp(pawn, messId, true);
    this.replanOthers();
  }

  /** The mess under the cursor, unless a wall or furniture is in front of it. */
  messAt(ndc: THREE.Vector2, camera: THREE.Camera, inTheWay: THREE.Object3D[] = []): string | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const hit = this.messes.pick(raycaster);
    if (!hit) return null;
    const mess = this.messes.get(hit.id);
    for (const root of inTheWay) root.updateWorldMatrix(true, true);
    const blocked = raycaster
      .intersectObjects(inTheWay, true)
      .some(({ object, distance }) => distance < hit.distance && isShown(object) && !object.userData.overhead && object.userData.furnitureId !== mess?.host);
    return blocked ? null : hit.id;
  }

  /** Where a mess is lying, if it's still there. */
  messCellOf(id: string): Cell | null {
    const mess = this.messes.get(id);
    return mess ? messCell(mess) : null;
  }

  /** Every mess on this floor inside these squares. */
  messesIn(level: number, bounds: { loX: number; hiX: number; loZ: number; hiZ: number }): string[] {
    return this.messes
      .all()
      .filter((mess) => (mess.level ?? 0) === level && mess.x >= bounds.loX && mess.x <= bounds.hiX && mess.z >= bounds.loZ && mess.z <= bounds.hiZ)
      .map((mess) => mess.id);
  }

  /** Takes a mess away at once, as the Delete tool does, rather than having someone clean it up. */
  removeMess(id: string) {
    this.messes.remove(id);
  }

  /** For a house that's been cleared or loaded: whatever was lying around in the old one is gone. */
  clearMesses() {
    this.chores.reset();
    this.swimming.reset();
    this.messes.clear();
  }

  /** Where a pawn would use a piece it chose for itself, which minds other people's privacy. One you send there goes anyway. */
  private findSpotByChoice(pawn: Pawn, piece: LevelPiece): FurnitureSpot | null {
    return this.privacy.keepsOut(pawn, piece, this.pawns) ? null : this.findSpotFor(pawn, piece);
  }

  private findSpotFor(pawn: Pawn, piece: LevelPiece): FurnitureSpot | null {
    const takenSeats = new Set(this.pawns.filter((other) => other !== pawn && other.claimedSeat).map((other) => other.claimedSeat!));
    return findFurnitureSpot(this.world, piece, pawn.currentCell(), this.pawnCells(pawn), takenSeats);
  }

  private selectedPawn(): Pawn | undefined {
    return this.pawns.find((pawn) => pawn.info.id === this.selectedId);
  }

  /** Their routes might cross the square the selected pawn is now heading to. */
  private replanOthers() {
    for (const pawn of this.pawns) {
      if (pawn.info.id !== this.selectedId) pawn.replan();
    }
  }

  /** Every pawn's route ahead, on the floors being shown, for the paths view. */
  routes(): Route[] {
    return this.pawns
      .filter((pawn) => pawn.level <= this.topShownLevel)
      .map((pawn) => ({ color: pawn.info.color, points: pawn.routeAhead(), selected: pawn.info.id === this.selectedId }))
      .filter((route) => route.points.length > 1);
  }

  /** Where everyone on this floor is right now, for its doors to open as they come through. */
  pawnPositions(level: number): THREE.Vector3[] {
    return this.pawns.filter((pawn) => pawn.level === level).map((pawn) => pawn.position);
  }

  /** Where this pawn is right now, for pointing the camera at it. */
  positionOf(id: string): THREE.Vector3 | undefined {
    return this.pawns.find((pawn) => pawn.info.id === id)?.position;
  }

  /** The floor this pawn is on. */
  levelOf(id: string): number | undefined {
    return this.pawns.find((pawn) => pawn.info.id === id)?.level;
  }

  /** Shows the pawns on this floor and the ones below, and hides the ones above, like the floors themselves. */
  showLevelsUpTo(level: number) {
    this.topShownLevel = level;
    this.updateVisibility();
  }

  private updateVisibility() {
    for (const pawn of this.pawns) pawn.showLevelsUpTo(this.topShownLevel);
    this.messes.showLevelsUpTo(this.topShownLevel);
  }

  /** The id of the pawn under the cursor, if there is one. */
  /**
   * The pawn under the cursor. Pass what can stand in the way, like the walls
   * and furniture, so a pawn hidden behind a wall or a bookshelf isn't picked
   * through it. The piece a pawn is sitting or lying on never hides it.
   */
  pawnAt(ndc: THREE.Vector2, camera: THREE.Camera, inTheWay: THREE.Object3D[] = []): string | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(this.pawns.filter((pawn) => pawn.group.visible).map((pawn) => pawn.clickTarget), false)[0];
    const pawn = this.pawns.find((candidate) => candidate.clickTarget === hit?.object);
    if (!hit || !pawn) return null;
    // The piece it's sitting on, or the chair it's sitting in to use something, never hides it.
    const own = new Set([pawn.settledPiece?.id, pawn.settledChairId].filter((id): id is string => Boolean(id)));
    for (const root of inTheWay) root.updateWorldMatrix(true, true);
    const blocked = raycaster
      .intersectObjects(inTheWay, true)
      .some(({ object, distance }) => distance < hit.distance && isShown(object) && !object.userData.overhead && !own.has(object.userData.furnitureId));
    return blocked ? null : pawn.info.id;
  }

  /** Every floor's light, ground floor first. */
  onHouseChanged(lights: RoomLight[]) {
    this.world.setLights(lights);
    this.messes.onHouseChanged();
    for (const pawn of this.pawns) pawn.onHouseChanged();
  }

  /** The pieces someone is settled at right now, so a fridge can open, a burner glow or a TV come on. */
  piecesInUse(): Set<string> {
    const inUse = new Set<string>();
    for (const pawn of this.pawns) {
      const piece = pawn.settledPiece;
      if (piece) inUse.add(piece.id);
    }
    return inUse;
  }

  update(seconds: number) {
    this.releaseDoors();
    for (const pawn of this.pawns) pawn.update(seconds);
    this.swimming.update();
    this.updateVisibility();
    this.updateSwitching(seconds);
    this.updateSocials();
    this.separateSharedSquares();
    this.excuseWalkersPassingThrough();
    this.updateSidesteps();
    this.chatter.update(seconds, this.pawns);
    this.clock += seconds;
    this.messes.animate(this.clock);
    if (this.wandering) {
      for (const pawn of this.pawns) pawn.updateMind(seconds);
      this.privacy.update(seconds, this.pawns);
      this.meals.update(seconds, this.pawns);
      this.chores.update(seconds, this.pawns);
      this.messes.age(seconds);
      this.wanderer.update(seconds, this.pawns);
    }
  }

  private releaseDoors() {
    for (const [door, holder] of this.doorHolders) {
      if (holder.heldDoor !== door || !this.pawns.includes(holder)) this.doorHolders.delete(door);
    }
  }

  /** A door is free to whoever asks first. Once crossing, a pawn never waits, so two pawns can't end up waiting on each other. */
  private claimDoor(pawn: Pawn, door: string): boolean {
    const holder = this.doorHolders.get(door);
    if (holder && holder !== pawn) return false;
    this.doorHolders.set(door, pawn);
    return true;
  }

  /** A walker about to pass through someone's square says "excuse me" once. The other pawn doesn't give up its square, it just nudges aside as they pass. */
  private excuseWalkersPassingThrough() {
    for (const walker of this.pawns) {
      const next = walker.route[0];
      if (!walker.isWalking || !next) continue;
      const stander = this.pawns.find((pawn) => pawn !== walker && !pawn.isWalking && sameCell(pawn.currentCell(), next));
      if (!stander) continue;
      const pair = `${walker.info.id}|${stander.info.id}`;
      if (this.excusedPairs.has(pair)) continue;
      this.excusedPairs.add(pair);
      this.chatter.excuseMe(walker, stander);
    }
  }

  /**
   * As pawns near each other, each one's figure drifts aside and then settles
   * back, so they brush past instead of walking through each other. Someone
   * standing still does most of the moving, with a little step back from the
   * walker, and returns to the middle of its square once the walker has gone.
   */
  private updateSidesteps() {
    const offsets = new Map<Pawn, { x: number; z: number }>(this.pawns.map((pawn) => [pawn, { x: 0, z: 0 }]));
    for (let i = 0; i < this.pawns.length; i++) {
      for (let j = i + 1; j < this.pawns.length; j++) {
        const first = this.pawns[i];
        const second = this.pawns[j];
        const pair = `${first.info.id}|${second.info.id}`;
        const dx = second.position.x - first.position.x;
        const dz = second.position.z - first.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= SIDESTEP_RANGE || (!first.isWalking && !second.isWalking) || first.level !== second.level) {
          this.passingPairs.delete(pair);
          this.excusedPairs.delete(pair);
          this.excusedPairs.delete(`${second.info.id}|${first.info.id}`);
          continue;
        }
        let right = this.passingPairs.get(pair);
        if (!right) {
          // Right, for the first pawn facing the second. Facing back, the second's right is the opposite way.
          right = distance > 0 ? { x: -dz / distance, z: dx / distance } : { x: 0, z: 1 };
          this.passingPairs.set(pair, right);
        }
        const closeness = 1 - THREE.MathUtils.smoothstep(distance, SIDESTEP_FULL_RANGE, SIDESTEP_RANGE);
        const away = distance > 0 ? { x: dx / distance, z: dz / distance } : { x: 0, z: 0 };
        this.nudge(offsets.get(first)!, first, second, right, 1, away, -1, closeness);
        this.nudge(offsets.get(second)!, second, first, right, -1, away, 1, closeness);
      }
    }
    for (const [pawn, { x, z }] of offsets) {
      const limit = pawn.heldDoor ? SIDESTEP_DISTANCE_IN_DOOR : pawn.isWalking ? WALKER_NUDGE : STANDER_NUDGE_LIMIT;
      const scale = Math.min(1, limit / (Math.hypot(x, z) || 1));
      pawn.setSidestep(x * scale, z * scale);
    }
  }

  /** Adds one pawn's share of moving out of the other's way. Someone sitting or lying down stays put. */
  private nudge(
    offset: { x: number; z: number },
    pawn: Pawn,
    other: Pawn,
    right: { x: number; z: number },
    rightSign: number,
    away: { x: number; z: number },
    awaySign: number,
    closeness: number,
  ) {
    if (pawn.isOnFurniture) return;
    const isStander = !pawn.isWalking && other.isWalking;
    const aside = (isStander ? STANDER_NUDGE : WALKER_NUDGE) * closeness * rightSign;
    const back = (isStander ? STANDER_BACKSTEP : 0) * closeness * awaySign;
    offset.x += right.x * aside + away.x * back;
    offset.z += right.z * aside + away.z * back;
  }

  /** Routes keep pawns from choosing the same square, but a wall going up mid-walk or furniture landing on a pawn can still leave two sharing one. */
  private separateSharedSquares() {
    const standing = new Set<string>();
    for (const pawn of this.pawns) {
      if (pawn.isWalking) continue;
      // Two pawns can share a square when each has its own place on a piece there, like the two bunks of a bunk bed.
      const here = pawn.isOnFurniture && pawn.claimedSeat ? `seat|${pawn.claimedSeat}` : placeKey(pawn.currentCell());
      if (standing.has(here)) pawn.stepAside();
      else standing.add(here);
    }
  }

  /** Where every pawn is standing or heading to, optionally leaving one out. */
  private pawnCells(except?: Pawn): Set<string> {
    const cells = new Set<string>();
    for (const pawn of this.pawns) {
      if (pawn === except) continue;
      cells.add(placeKey(pawn.destinationCell()));
    }
    return cells;
  }

  private addPawn(info: PawnInfo): Pawn {
    const pawn: Pawn = new Pawn(this.world, info, {
      otherPawnCells: () => this.pawnCells(pawn),
      claimDoor: (door) => this.claimDoor(pawn, door),
    });
    pawn.setBubbleVisible(this.bubblesVisible);
    pawn.leaveWater = (goal) => this.swimming.leaveToward(pawn, goal);
    this.pawns.push(pawn);
    this.group.add(pawn.group);
    return pawn;
  }

  private updateSelectionRings() {
    for (const pawn of this.pawns) pawn.setSelected(pawn.info.id === this.selectedId);
  }

  private remember() {
    saveHousehold({ pawns: this.roster, selectedId: this.selectedId, relationships: this.relationships.toJSON(), messes: this.messes?.toJSON() });
  }

  private unusedId(): string {
    let number = 1;
    while (this.pawns.some((pawn) => pawn.info.id === `p${number}`)) number++;
    return `p${number}`;
  }

  private unusedName(): string {
    let number = 1;
    while (this.pawns.some((pawn) => pawn.info.name === `Pawn ${number}`)) number++;
    return `Pawn ${number}`;
  }
}

/** Whether something is actually drawn: it and everything it's part of are visible. */
function isShown(object: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}
