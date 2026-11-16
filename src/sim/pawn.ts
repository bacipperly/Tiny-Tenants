import * as THREE from 'three';
import { wallKey } from '../grid/gridModel';
import { CELL_SIZE, LEVEL_HEIGHT, cellToWorld, worldToCell } from '../grid/gridMath';
import { STEPS } from '../grid/roomDetection';
import { ADD_COLOR, DELETE_COLOR, RING_COLOR } from '../build/previewRenderer';
import { HAMMOCK_PIVOT_Y, getFootprintCenterOffset, getFurnitureDef, hammockSwing } from '../build/furnitureCatalog';
import type { Activity, FurnitureUseKind } from '../build/furnitureCatalog';
import { isSpotStillValid, seatHeight, seatKey, seatPiece } from './furnitureUse';
import type { FurnitureSpot } from './furnitureUse';
import { findPath, isInFurniture, nearestFreeCell } from './pathfinding';
import type { Cell } from './pathfinding';
import { heightAlong } from '../build/stairs';
import { placeKey } from './world';
import type { LevelPiece, World } from './world';
import { Bubble } from './bubble';
import type { Advertisement } from './needs';
import { Plate } from './plate';
import { Mind } from './mind';
import { BUFFS } from './personality';
import type { Gesture, PawnTraits } from './personality';

const WALK_SPEED = 2.5; // cells per second
/** How high a pawn hops going up or down each step of the stairs. */
const STAIR_HOP = 0.09;
/** How much slower a pawn goes on the stairs than on the flat. */
const STAIR_SPEED = 0.6;
/** A walk the player didn't ask for has nowhere to be. */
const STROLL_SPEED = 1.5;
const TURN_SPEED = 12;
/** Looking around or turning to someone, with no walk to get on with. */
const IDLE_TURN_SPEED = 3.5;
const BREATH_SPEED = 2.2;
const BREATH_AMOUNT = 0.025;
/** The slow side-to-side lean of someone shifting their weight, in radians. Two speeds, so it doesn't look like a metronome. */
const SWAY_AMOUNT = 0.03;
const SWAY_SPEED = 0.8;
const SWAY_SECOND_SPEED = 1.9;
const SIDESTEP_SPEED = 16;
const POSE_SPEED = 8;

/** How a pawn holds itself on a leg of a scripted move: upright, flat out swimming or diving, or sitting. */
export type ScriptPose = 'stand' | 'tread' | 'swim' | 'dive' | 'sit';

/**
 * One leg of a scripted move, like getting into a pool and swimming about:
 * where it ends up in the world, how high its feet are there, how long it
 * takes to get there, and how the pawn holds itself on the way.
 */
export interface ScriptStep {
  x: number;
  z: number;
  /** The height its feet, or the bottom of it, are at when it gets there. */
  y: number;
  seconds: number;
  pose: ScriptPose;
  /** How high above a straight line it rises in the middle, for a jump. */
  arc?: number;
  /** Which way it faces, in radians, rather than the way it's going. */
  facing?: number;
  /** When it gets there, like a splash as it hits the water. */
  onArrive?: () => void;
}
/** How far below the seat's top a sitting pawn's base sinks, which hides its lower half so it reads as seated. */
const SIT_SINK = 0.2;
/** How far someone standing at a fridge, sink, table or TV leans in, so it reads as using it rather than standing nearby. In radians. */
const STAND_LEAN = 0.14;
const BUBBLE_ABOVE_HEAD = 0.42;
const BODY_RADIUS = 0.2;
const BODY_HEIGHT = 0.9;
const EYE_COLOR = 0x2b2b2b;
const SHADOW_LAYERS = [
  { radius: 0.3, opacity: 0.1 },
  { radius: 0.21, opacity: 0.12 },
];
const MARKER_OPACITY = 0.85;
const MARKER_FADE_SECONDS = 1.2;
const GESTURE_SECONDS = 1.2;
/** Where a held plate sits, relative to the pawn: at chest height, out in front. */
const HELD_PLATE_POSITION = new THREE.Vector3(0, 0.45, BODY_RADIUS + 0.1);
/** How quickly its eyes drift shut as it falls asleep, and open when it wakes. */
const EYE_CLOSE_SPEED = 2.5;
const EAT_NOD_SPEED = 5;
const EAT_NOD_AMOUNT = 0.1;
/** How far someone leans in for each activity, in radians: right in close to peer at the fish, upright to take in a statue. */
const ACTIVITY_LEAN: Record<Activity, number> = {
  admire: 0,
  peer: 0.22,
  warm: 0.05,
  scrub: 0.18,
  stir: 0.12,
  chop: 0.16,
  rummage: 0.12,
  type: 0.12,
  play: 0.1,
  watch: 0,
  browse: 0.08,
  primp: 0,
  shoot: 0.35,
  garden: 0.3,
  mop: 0.32,
  pickup: 0.45,
  ponder: 0.08,
};

/** A short blip once every `period` seconds, for a nod, a tap on the glass or a laugh. */
function blip(time: number, period: number): number {
  return Math.max(0, Math.sin((time / period) * Math.PI * 2)) ** 12;
}

/** Moves the gesture rig, which is already back at rest, to show what the pawn is doing at a piece. */
function playActivity(activity: Activity, time: number, rig: THREE.Group) {
  const beat = (speed: number) => Math.abs(Math.sin(time * speed));
  switch (activity) {
    case 'admire':
      // Head tilted one way then the other, with the odd thoughtful nod.
      rig.rotation.z = Math.sin(time * 0.9) * 0.1;
      rig.rotation.x = -0.04 + blip(time, 5) * 0.14;
      break;
    case 'peer':
      // Leaning in for a closer look and back, and every so often a tap on the glass.
      rig.rotation.x = 0.06 + Math.sin(time * 1.2) * 0.06 + blip(time, 3.5) * 0.12;
      rig.rotation.z = Math.sin(time * 0.7) * 0.05;
      break;
    case 'warm':
      // Rubbing its hands in front of the fire, a little hunched, turning now and then to warm a side.
      rig.rotation.z = Math.sin(time * 16) * 0.035;
      rig.rotation.y = Math.sin(time * 0.4) * 0.2;
      rig.scale.y = 0.97;
      break;
    case 'scrub':
      rig.rotation.z = Math.sin(time * 10) * 0.06;
      rig.position.y = beat(10) * 0.008;
      break;
    case 'stir':
      // Round and round.
      rig.rotation.z = Math.sin(time * 4) * 0.05;
      rig.rotation.x = Math.cos(time * 4) * 0.04;
      break;
    case 'chop':
      rig.rotation.x = beat(11) * 0.05;
      rig.position.y = beat(11) * 0.012;
      break;
    case 'rummage':
      // Leaning into the fridge, looking up and down the shelves.
      rig.rotation.x = 0.04 + Math.sin(time * 2.2) * 0.07;
      rig.rotation.y = Math.sin(time * 1.4) * 0.25;
      break;
    case 'type':
      rig.position.y = beat(22) * 0.005;
      rig.rotation.x = Math.sin(time * 0.5) * 0.03;
      break;
    case 'ponder':
      // Chin down over the board, a slow tilt of the head while it thinks, then a quick lean in to make a move.
      rig.rotation.z = Math.sin(time * 0.6) * 0.07;
      rig.rotation.x = 0.05 + blip(time, 7) * 0.2;
      break;
    case 'play':
      // Swaying to the music.
      rig.rotation.z = Math.sin(time * 2.6) * 0.09;
      rig.position.y = beat(5.2) * 0.012;
      break;
    case 'watch': {
      // Settled back, with a laugh at something every so often.
      const laugh = blip(time, 6);
      rig.rotation.x = -0.04;
      rig.position.y = laugh * 0.06;
      rig.rotation.z = laugh * Math.sin(time * 30) * 0.05;
      break;
    }
    case 'browse':
      // Looking along the shelves, and leaning in when something catches its eye.
      rig.rotation.y = Math.sin(time * 0.6) * 0.3;
      rig.rotation.x = blip(time, 4) * 0.1;
      break;
    case 'primp':
      // Checking itself from one side, then the other.
      rig.rotation.y = Math.sin(time * 1.2) * 0.35;
      rig.rotation.z = Math.sin(time * 2.4) * 0.05;
      break;
    case 'shoot':
      // Lining up the shot, then a quick jab with the cue.
      rig.rotation.x = blip(time, 4) * 0.12;
      rig.rotation.y = Math.sin(time * 0.5) * 0.1;
      break;
    case 'garden':
      // Bent over the plants, digging and weeding, moving along the row now and then.
      rig.rotation.x = 0.08 + beat(3.2) * 0.1;
      rig.rotation.y = Math.sin(time * 0.35) * 0.3;
      rig.scale.y = 0.95;
      break;
    case 'mop':
      // Bent over, scrubbing the floor from side to side.
      rig.rotation.y = Math.sin(time * 5) * 0.28;
      rig.rotation.x = 0.06 + beat(5) * 0.05;
      break;
    case 'pickup':
      // A deep bend down to pick something up, and back up.
      rig.rotation.x = Math.sin(Math.min(1, (time % 1.6) / 1.2) * Math.PI) * 0.25;
      break;
  }
}

/** Who a pawn is, as opposed to where it happens to be standing. */
export interface PawnInfo extends PawnTraits {
  id: string;
  name: string;
  /** Hex color (e.g. "#3a86ff"). */
  color: string;
}

/** What a pawn needs to know about everyone else on the lot. */
export interface PawnTraffic {
  /** Squares the other pawns are standing on or heading to. */
  otherPawnCells: () => Set<string>;
  /** Asks to be the one pawn crossing this door. False means someone else is crossing it, so wait. */
  claimDoor: (door: string) => boolean;
}

/**
 * A person who lives on the lot. Kept out of GridModel on purpose: it isn't
 * part of the house, so Undo never moves it and Save doesn't record it.
 */
export class Pawn {
  readonly group = new THREE.Group();
  readonly info: PawnInfo;
  readonly mind: Mind;
  /** The door this pawn is crossing right now, if any. */
  heldDoor: string | null = null;

  private world: World;
  /** The floor it's on. Halfway up the stairs, it's still on the floor they start from until it steps off at the top. */
  private floor = 0;
  private traffic: PawnTraffic;
  /** Where the pawn really is: this decides its square and route. */
  private body = new THREE.Group();
  /** What you see, inside the body, so it can sidestep past someone without changing where the pawn really is. */
  private figure = new THREE.Group();
  /** The tube and eyes, inside the figure, so they can turn, sit and lie down while the shadow and ring stay flat on the floor. */
  private torso = new THREE.Group();
  /** Inside the torso, so a hop or a spin plays on top of whatever pose it's in and always comes back to it. */
  private gestureRig = new THREE.Group();
  private gesture: Gesture | null = null;
  private gestureAge = 0;
  private plate: Plate | null = null;
  private isEating = false;
  /** Something being cleaned up, like a mop at a puddle, done on foot rather than at a piece. */
  private chore: Activity | null = null;
  /** Thoughts for the particular way it's using a piece, in place of the piece's own. */
  private flavorThoughts: string[] | null = null;
  /** Something in its hands that isn't a meal, like a dirty plate or trash on the way to the bin. */
  private heldItem: THREE.Object3D | null = null;
  private sidestepTarget = new THREE.Vector2();
  private furnitureSpot: FurnitureSpot | null = null;
  /** Walking to the piece, sliding onto it, or settled and using it. */
  private furnitureStage: 'approaching' | 'settling' | 'using' = 'approaching';
  private poseTarget = { x: 0, y: 0, z: 0, tilt: 0 };
  /** A scripted move it's in the middle of, like swimming, and what it gets out of it. */
  private script: { steps: ScriptStep[]; from: THREE.Vector3; elapsed: number; advertises: Advertisement | null; done: (finished: boolean) => void } | null = null;
  /** Where it was sent while in the water, to walk to once it's swum out and climbed onto dry ground. */
  private pendingGoal: Cell | null = null;
  /** For a swimmer sent somewhere dry: how to swim to the way out nearest it, and where that leaves it. */
  leaveWater: ((goal: Cell) => { steps: ScriptStep[]; out: Cell } | null) | null = null;
  /** How far it's been swung aside lying in a hammock, on top of its pose, and how much of the swing it's taking yet. */
  private swingOffset = new THREE.Vector3();
  private swingAmount = 0;
  private bodyMaterial = new THREE.MeshStandardMaterial();
  private tube!: THREE.Mesh;
  private eyes: THREE.Mesh[] = [];
  /** How shut its eyes are, from 0 (wide open) to 1 (asleep). */
  private eyesShut = 0;
  private selectionRing!: THREE.Mesh;
  private bubble = new Bubble();
  private marker: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private markerLevel = 0;
  private path: Cell[] = [];
  private goal: Cell | null = null;
  private goalReachable: boolean | null = null;
  /** Getting off a bed or sofa, straight to where it got on, without a route. */
  private slidingOff = false;
  private facing = 0;
  private facingTarget = 0;
  /** A walk this pawn decided on itself: slower, and with no destination marker. */
  private strolling = false;
  /** Starts somewhere different for each pawn, so they don't all breathe in time. */
  private idleClock = Math.random() * 100;

  constructor(world: World, info: PawnInfo, traffic: PawnTraffic) {
    this.world = world;
    this.info = info;
    this.mind = new Mind(info);
    this.traffic = traffic;
    this.torso.rotation.order = 'YXZ';
    this.torso.add(this.gestureRig);
    this.figure.add(this.torso);
    this.body.add(this.figure);
    this.buildBody();
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(CELL_SIZE * 0.3, CELL_SIZE * 0.4, 32),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false }),
    );
    this.marker.renderOrder = 10;
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.group.add(this.body, this.marker);
  }

  /** Starts outside any room, so a house with no door can't trap it on load, and on the camera's side, so the back walls don't hide it. */
  placeAtStart(houseCenter: THREE.Vector3, cameraDirXZ: THREE.Vector2, taken: Set<string>) {
    const center = { ...worldToCell(houseCenter.x, houseCenter.z), level: 0 };
    const isOutside = (cell: Cell) => this.world.roomAt(cell) === 0 && !taken.has(placeKey(cell));
    const isOnCameraSide = ({ x, z }: Cell) => (x - center.x) * cameraDirXZ.x + (z - center.z) * cameraDirXZ.y > 0;
    const cell =
      nearestFreeCell(this.world, center, (candidate) => isOutside(candidate) && isOnCameraSide(candidate)) ??
      nearestFreeCell(this.world, center, isOutside) ??
      center;
    // Out of any pool it was in, for a house it's just arrived at.
    this.script = null;
    this.poseTarget = { x: 0, y: 0, z: 0, tilt: 0 };
    this.standAt(cell);
    this.stopWalking();
  }

  /** A plain walk. If the pawn is sitting or lying down, this is also how it gets up. */
  walkTo(cell: Cell) {
    this.leaveFurniture();
    this.strolling = false;
    this.setGoal(cell);
  }

  /** Walks to the piece, then sits, lies down or stands at it. */
  useFurniture(spot: FurnitureSpot) {
    this.leaveFurniture();
    this.strolling = false;
    this.furnitureSpot = spot;
    this.furnitureStage = 'approaching';
    this.setGoal(spot.approach);
  }

  /** Uses a piece because it felt like it, so it goes at a stroll with no destination marker. */
  chooseFurniture(spot: FurnitureSpot) {
    this.leaveFurniture();
    this.strolling = true;
    this.marker.visible = false;
    this.furnitureSpot = spot;
    this.furnitureStage = 'approaching';
    this.setGoal(spot.approach);
  }

  /** Done with the piece: gets up and steps off it, or just stops leaning in. */
  finishUsingFurniture() {
    const spot = this.furnitureSpot?.seat ? this.furnitureSpot : null;
    this.leaveFurniture();
    if (spot) this.slideOff(spot.approach, spot.via);
  }

  /**
   * Gets off a bed or sofa the way it got on: straight back to where it
   * stepped up from. Finding a route instead could fail from a pillow wedged
   * between a wall and two nightstands, leaving it stuck standing in the bed.
   */
  private slideOff(approach: Cell, via: Cell[] = []) {
    if (this.chore) this.setChore(null);
    this.strolling = true;
    this.marker.visible = false;
    this.goal = approach;
    this.goalReachable = true;
    // Back along a booth or sectional the way it slid in.
    this.path = [...[...via].reverse(), approach];
    this.slidingOff = true;
  }

  /** The piece this pawn is using or heading for. */
  get furniturePieceId(): string | null {
    return this.furnitureSpot?.piece.id ?? null;
  }

  /** How it's using a piece, once it has settled in. */
  get settledUse(): FurnitureUseKind | null {
    return this.furnitureSpot && this.furnitureStage === 'using' ? this.furnitureSpot.kind : null;
  }

  /** Someone sent to sit or lie down stays until told otherwise. Anything else, it wraps up by itself. */
  /** Sent to sit or lie down by you, so it stays until whatever it's there for is done, rather than for a set while. */
  get staysUntilDone(): boolean {
    return this.settledUse !== null && !this.leavesFurnitureOnItsOwn;
  }

  get leavesFurnitureOnItsOwn(): boolean {
    return this.settledUse !== null && (this.strolling || this.settledUse === 'stand' || this.settledUse === 'inside');
  }

  /** Which seat this pawn is on or heading for, so nobody else takes it. */
  get claimedSeat(): string | null {
    return this.furnitureSpot?.seat ? seatKey(seatPiece(this.furnitureSpot), this.furnitureSpot.seat) : null;
  }

  /** The chair it's sitting in to use something else, like at a desk, if it is. */
  get settledChairId(): string | null {
    return this.furnitureSpot && this.furnitureStage === 'using' ? this.furnitureSpot.chair?.id ?? null : null;
  }

  /** What this pawn is thinking about, if it's using a piece of furniture. */
  get furnitureThoughts(): string[] | null {
    if (this.plate && this.isEating) return [this.plate.food, '😋', '🍽️'];
    if (!this.furnitureSpot || this.furnitureStage !== 'using') return null;
    return this.flavorThoughts ?? getFurnitureDef(this.furnitureSpot.piece.type).thoughts;
  }

  /** What it'll think about at the piece it's on its way to, for a particular way of using it, like a comedy on the TV. */
  setFlavor(thoughts: string[] | null) {
    this.flavorThoughts = thoughts;
  }

  get isOnFurniture(): boolean {
    return this.furnitureSpot?.seat != null && this.furnitureStage !== 'approaching';
  }

  /** Whether the piece it's settled on has given it all it has to give. */
  get isSatisfiedByFurniture(): boolean {
    return this.settledAdvertisement !== null && this.mind.isSatisfiedBy(this.settledAdvertisement);
  }

  private get settledAdvertisement(): Advertisement | null {
    if (this.script) return this.script.advertises;
    return this.furnitureSpot && this.furnitureStage === 'using' ? getFurnitureDef(this.furnitureSpot.piece.type).advertises : null;
  }

  /** Runs needs down or fills them from its furniture. Only happens in Live, so nobody gets hungry while you're building. A fridge only makes the food, though: it's eating that fills you up. */
  updateMind(seconds: number) {
    const makesFood = this.settledPiece && getFurnitureDef(this.settledPiece.type).food;
    const started = this.mind.update(seconds, makesFood ? null : this.settledAdvertisement);
    if (started) this.think(BUFFS[started].emoji, 2);
  }

  /** How it's using the piece it has settled in at, including where it stepped up to it from. */
  get settledSpot(): FurnitureSpot | null {
    return this.furnitureSpot && this.furnitureStage === 'using' ? this.furnitureSpot : null;
  }

  /** Carries something in front of it, like a plate to wash or trash for the bin. Null puts it away. */
  holdItem(item: THREE.Object3D | null) {
    this.heldItem?.removeFromParent();
    this.heldItem = item;
    if (!item) return;
    item.position.copy(HELD_PLATE_POSITION);
    this.gestureRig.add(item);
  }

  get isHoldingItem(): boolean {
    return this.heldItem !== null;
  }

  /** Gets on with a chore where it stands, like mopping, leaning into it. Null stands it back up. */
  setChore(chore: Activity | null) {
    this.chore = chore;
    if (this.furnitureSpot) return;
    this.poseTarget = { x: 0, y: 0, z: 0, tilt: chore ? ACTIVITY_LEAN[chore] : 0 };
  }

  get choreActivity(): Activity | null {
    return this.chore;
  }

  /** The piece it has settled in at, as opposed to one it's still on the way to. */
  get settledPiece(): LevelPiece | null {
    return this.furnitureSpot && this.furnitureStage === 'using' ? this.furnitureSpot.piece : null;
  }

  holdPlate(food: string) {
    this.clearPlate();
    this.plate = new Plate(food);
    this.takePlateBack();
  }

  /** Back in its hands, from wherever the plate was. */
  takePlateBack() {
    if (!this.plate) return;
    this.plate.group.position.copy(HELD_PLATE_POSITION);
    this.gestureRig.add(this.plate.group);
  }

  /** Puts the plate on a table. Takes a position in the world, because it stays put whatever the pawn's doing. */
  setPlateDown(position: THREE.Vector3) {
    if (!this.plate) return;
    this.plate.group.position.copy(position);
    this.group.add(this.plate.group);
  }

  setFoodLeft(fraction: number) {
    this.plate?.setFoodLeft(fraction);
  }

  clearPlate() {
    if (!this.plate) return;
    this.plate.group.removeFromParent();
    this.plate.dispose();
    this.plate = null;
  }

  setEating(eating: boolean) {
    this.isEating = eating;
    if (!eating && !this.gesture) this.gestureRig.rotation.x = 0;
  }

  /** Looks at something next to it, even from a seat that faces another way. */
  turnToward(cell: Cell) {
    const here = this.currentCell();
    this.facingTarget = Math.atan2(cell.x - here.x, cell.z - here.z);
  }

  /** Sitting, lying down or standing at a piece, or on the way to one. */
  get isUsingFurniture(): boolean {
    return this.furnitureSpot !== null;
  }

  /** Works out the route again, for when another pawn's plans have changed. */
  replan() {
    this.planRoute();
  }

  /** Walks to the nearest open square, preferring one in the same room, for when this pawn has ended up sharing a square. */
  stepAside() {
    const here = this.currentCell();
    const others = this.traffic.otherPawnCells();
    const room = this.world.roomAt(here);
    const isOpen = (cell: Cell) => !others.has(placeKey(cell));
    const open =
      nearestFreeCell(this.world, here, (cell) => isOpen(cell) && this.world.roomAt(cell) === room) ??
      nearestFreeCell(this.world, here, isOpen);
    if (open) this.strollTo(open);
  }

  /** A short walk the player didn't ask for, so it doesn't mark a destination. */
  strollTo(cell: Cell) {
    this.leaveFurniture();
    this.strolling = true;
    this.marker.visible = false;
    this.setGoal(cell);
  }

  /** On its way somewhere, or in the middle of a scripted move like a swim, which is as busy as walking. */
  get isWalking(): boolean {
    return this.goal !== null || this.script !== null;
  }

  /** In the middle of a scripted move, like a swim. */
  get isScripted(): boolean {
    return this.script !== null;
  }

  /**
   * Goes through a scripted move, leg by leg, from where it is now, like
   * jumping into a pool, swimming about and climbing out. `advertises` is what
   * it gets out of it meanwhile. `done` is told whether it got to the end, or
   * was sent off somewhere else first.
   */
  follow(steps: ScriptStep[], options: { advertises?: Advertisement; done?: (finished: boolean) => void } = {}) {
    this.endScript(false);
    this.stopWalking();
    this.script = { steps: [...steps], from: this.body.position.clone(), elapsed: 0, advertises: options.advertises ?? null, done: options.done ?? (() => {}) };
  }

  /** Stops a scripted move. Sent somewhere else partway, it climbs out onto the nearest dry square first. */
  private endScript(finished: boolean) {
    const script = this.script;
    if (!script) return;
    this.script = null;
    this.poseTarget = { x: 0, y: 0, z: 0, tilt: 0 };
    if (!finished && !this.world.standable(this.currentCell())) {
      const out = nearestFreeCell(this.world, this.currentCell(), () => true);
      if (out) this.standAt(out);
    }
    script.done(finished);
  }

  /** Moves along the scripted move: along a straight line, or an arc for a jump, holding itself as each leg says. */
  private updateScript(seconds: number) {
    const script = this.script;
    if (!script) return;
    const step = script.steps[0];
    if (!step) {
      this.endScript(true);
      return;
    }
    script.elapsed += seconds;
    const t = Math.min(1, script.elapsed / Math.max(0.01, step.seconds));
    const { from } = script;
    const dx = step.x - from.x;
    const dz = step.z - from.z;
    this.body.position.set(from.x + dx * t, from.y + (step.y - from.y) * t + (step.arc ?? 0) * 4 * t * (1 - t), from.z + dz * t);
    if (step.facing !== undefined) this.facingTarget = step.facing;
    else if (Math.hypot(dx, dz) > 0.05) this.facingTarget = Math.atan2(dx, dz);
    this.poseFor(step.pose);
    if (t < 1) return;
    script.from = new THREE.Vector3(step.x, step.y, step.z);
    script.elapsed = 0;
    script.steps.shift();
    step.onArrive?.();
    if (script.steps.length === 0) this.endScript(true);
  }

  /** Where its torso goes for a scripted pose, from where its feet are. Swimming, it lies flat at the water line and bobs. */
  private poseFor(pose: ScriptPose) {
    const yaw = this.facing;
    const base = this.body.position.y - this.floor * LEVEL_HEIGHT;
    const bob = pose === 'swim' || pose === 'tread' ? Math.sin(this.idleClock * 2.6) * 0.025 : 0;
    if (pose === 'swim' || pose === 'dive') {
      // Head first: the body tips forward and is centered on where it is.
      this.poseTarget = { x: -Math.sin(yaw) * (BODY_HEIGHT / 2), y: base + bob, z: -Math.cos(yaw) * (BODY_HEIGHT / 2), tilt: Math.PI / 2 };
    } else {
      this.poseTarget = { x: 0, y: base + bob, z: 0, tilt: 0 };
    }
  }

  get isStrolling(): boolean {
    return this.isWalking && this.strolling;
  }

  /** Turns to look somewhere else, by this many radians. */
  glance(angle: number) {
    this.facingTarget += angle;
  }

  /** The squares still ahead on this pawn's route, nearest first. */
  get route(): readonly Cell[] {
    return this.path;
  }

  /** Where the pawn really is, whichever way its figure has sidestepped. */
  get position(): THREE.Vector3 {
    return this.body.position;
  }

  /** The offset the visible figure should drift to, in world units. */
  setSidestep(x: number, z: number) {
    this.sidestepTarget.set(x, z);
  }

  /** The square this pawn will end up on: the end of its route, or where it's standing. */
  destinationCell(): Cell {
    return this.path[this.path.length - 1] ?? this.pendingGoal ?? this.currentCell();
  }

  think(emoji: string, seconds: number) {
    this.bubble.show(emoji, seconds, 'thought');
  }

  say(emoji: string, seconds: number) {
    this.bubble.show(emoji, seconds, 'speech');
  }

  /** Something in character. Someone on the move or using furniture is busy. */
  playGesture(gesture: Gesture) {
    if (this.goal || this.furnitureSpot) return;
    this.gesture = gesture;
    this.gestureAge = 0;
  }

  setBubbleVisible(visible: boolean) {
    this.bubble.group.visible = visible;
  }

  faceToward(cell: Cell) {
    // Someone sitting or lying down stays facing the way the furniture does.
    if (this.isOnFurniture) return;
    const here = this.currentCell();
    this.facingTarget = Math.atan2(cell.x - here.x, cell.z - here.z);
  }

  setSelected(selected: boolean) {
    this.selectionRing.visible = selected;
  }

  /** The solid part of the pawn, for checking whether a click landed on it. */
  get clickTarget(): THREE.Object3D {
    return this.tube;
  }

  /** Call whenever the house changes, in case that blocked the route or dropped furniture on the pawn. */
  onHouseChanged() {
    if (this.furnitureSpot && !isSpotStillValid(this.world, this.furnitureSpot)) {
      // Mid-slide onto a piece that's gone, there's no route to finish, so it just stops here.
      if (this.furnitureStage === 'settling') this.stopWalking();
      this.leaveFurniture();
    }
    let here = this.currentCell();
    // The floor or the stairs gone from under it: down to the floor below, as near as it can get to where it was.
    if (!this.world.standable(here) && !this.world.stairStep(here)) {
      while (here.level > 0 && !this.world.standable(here)) here = { ...here, level: here.level - 1 };
      const free = nearestFreeCell(this.world, here);
      if (free) {
        this.stopWalking();
        this.standAt(free);
        here = free;
      }
    }
    if (!this.isOnFurniture && isInFurniture(this.world, here)) {
      const room = this.world.roomAt(here);
      const free = nearestFreeCell(this.world, here, (cell) => this.world.roomAt(cell) === room) ?? nearestFreeCell(this.world, here);
      if (free) this.standAt(free);
    }
    if (this.goal) this.planRoute();
  }

  update(seconds: number) {
    // Slower on the stairs, a hop at a time.
    const onStairs = this.world.stairStep(this.currentCell()) !== undefined;
    if (this.script) this.updateScript(seconds);
    else this.walk((this.strolling ? STROLL_SPEED : WALK_SPEED) * (onStairs ? STAIR_SPEED : 1) * CELL_SIZE * seconds);
    this.updateFacing(seconds);
    this.updateSidestep(seconds);
    this.updateMarker(seconds);
    this.bubble.update(seconds);
    const here = this.currentCell();
    if (!this.script) this.body.position.y = this.standingHeight(here);
    this.updatePose(seconds);
    this.updateIdleMotion(seconds);
    this.updateGesture(seconds);
    this.updateEyes(seconds);
    this.plate?.setBrightness(this.world.lightAt(here));
    this.bodyMaterial.color.set(this.info.color).multiplyScalar(this.world.lightAt(here));
  }

  private setGoal(cell: Cell) {
    // Sent somewhere dry in the middle of a swim: it swims to the nearest way out, climbs out, then goes on.
    if (this.script) {
      const exit = this.leaveWater?.(cell) ?? null;
      const swim = this.script;
      this.script = null;
      swim.done(false);
      if (exit) {
        this.pendingGoal = cell;
        this.script = {
          steps: exit.steps,
          from: this.body.position.clone(),
          elapsed: 0,
          advertises: null,
          done: (finished) => {
            const next = this.pendingGoal;
            this.pendingGoal = null;
            if (finished && next) this.setGoal(next);
          },
        };
        return;
      }
      this.poseTarget = { x: 0, y: 0, z: 0, tilt: 0 };
      if (!this.world.standable(this.currentCell())) {
        const out = nearestFreeCell(this.world, this.currentCell(), () => true);
        if (out) this.standAt(out);
      }
    }
    this.slidingOff = false;
    // Setting off anywhere puts down whatever chore it was in the middle of.
    if (this.chore) this.setChore(null);
    this.goal = cell;
    this.goalReachable = null;
    this.planRoute();
  }

  private leaveFurniture() {
    this.furnitureSpot = null;
    this.flavorThoughts = null;
    this.poseTarget = { x: 0, y: 0, z: 0, tilt: 0 };
  }

  /** Arrived next to the piece. Slides onto it to sit or lie down, or just stands there using it. */
  private arriveAtFurniture(spot: FurnitureSpot) {
    const here = this.currentCell();
    if (here.x !== spot.approach.x || here.z !== spot.approach.z) {
      // Something got in the way, so it never made it.
      this.leaveFurniture();
      this.goal = null;
      return;
    }
    if (spot.seat) {
      this.furnitureStage = 'settling';
      this.goal = spot.seat;
      // Along the booth or sectional first, if it's sliding in from another seat.
      this.path = [...(spot.via ?? []), spot.seat];
      return;
    }
    const offset = getFootprintCenterOffset(spot.piece.type, spot.piece.rotation);
    this.facingTarget = getFurnitureDef(spot.piece.type).onWall
      ? // Standing under a painting, it turns to the wall it hangs on.
        THREE.MathUtils.degToRad(spot.piece.rotation) + Math.PI
      : Math.atan2(spot.piece.x + offset.dx - here.x, spot.piece.z + offset.dz - here.z);
    this.settle(spot);
  }

  /** Settled in. Faces the way the furniture does and takes up its pose. */
  private settle(spot: FurnitureSpot) {
    this.goal = null;
    this.furnitureStage = 'using';
    const def = getFurnitureDef(spot.piece.type);
    this.think(def.thoughts[0], 2);
    if (!spot.seat) {
      this.poseTarget = { x: 0, y: 0, z: 0, tilt: def.activity ? ACTIVITY_LEAN[def.activity] : STAND_LEAN };
      return;
    }

    if (spot.chair) {
      // In a chair pulled up to something: sitting at the chair's height, turned to face what it's using, and leaning in a little.
      const offset = getFootprintCenterOffset(spot.piece.type, spot.piece.rotation);
      this.facingTarget = Math.atan2(spot.piece.x + offset.dx - spot.seat.x, spot.piece.z + offset.dz - spot.seat.z);
      const lean = def.activity ? ACTIVITY_LEAN[def.activity] / 2 : 0;
      this.poseTarget = { x: 0, y: getFurnitureDef(spot.chair.type).height - SIT_SINK, z: 0, tilt: lean };
      return;
    }
    const yaw = THREE.MathUtils.degToRad(spot.piece.rotation);
    this.facingTarget = yaw;
    if (spot.kind === 'inside') {
      this.poseTarget = { x: 0, y: 0, z: 0, tilt: 0 };
      return;
    }
    if (spot.kind === 'sit') {
      this.poseTarget = { x: 0, y: def.height - SIT_SINK, z: 0, tilt: 0 };
      return;
    }
    // Lying back along the bed. The pawn pivots at its feet, so they go one half-length past the bed's middle,
    // and on a big bed it keeps to its own side.
    const offset = getFootprintCenterOffset(spot.piece.type, spot.piece.rotation);
    const seatX = spot.seat.x - spot.piece.x;
    const seatZ = spot.seat.z - spot.piece.z;
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const side = (seatX - offset.dx) * right.x + (seatZ - offset.dz) * right.z;
    this.poseTarget = {
      x: offset.dx + Math.sin(yaw) * (BODY_HEIGHT / 2) + right.x * side - seatX,
      y: seatHeight(def.type, spot.seat) + BODY_RADIUS,
      z: offset.dz + Math.cos(yaw) * (BODY_HEIGHT / 2) + right.z * side - seatZ,
      tilt: -Math.PI / 2,
    };
  }

  private planRoute() {
    if (!this.goal || this.slidingOff || (this.furnitureSpot && this.furnitureStage === 'settling')) return;
    const here = this.currentCell();
    const others = this.traffic.otherPawnCells();
    let { path, reachedGoal } = findPath(this.world, here, this.goal, others);
    // Somehow standing inside a piece, with no way out from here: it steps out to the nearest open square first, rather than freezing.
    if (!reachedGoal && isInFurniture(this.world, here)) {
      const out = nearestFreeCell(this.world, here, (cell) => !others.has(placeKey(cell)));
      if (out) {
        const onward = findPath(this.world, out, this.goal, others);
        path = [here, ...onward.path];
        reachedGoal = onward.reachedGoal;
      }
    }
    // Skips the center of the current cell, which it may be past already. The next cell is
    // always a clear step, so a straight line there from anywhere in this cell can't hit a wall.
    this.path = path.length > 1 ? path.slice(1) : path;
    if (reachedGoal !== this.goalReachable) {
      this.goalReachable = reachedGoal;
      if (!this.strolling) this.showMarker(this.goal, reachedGoal);
    }
  }

  private walk(distance: number) {
    let remaining = distance;
    while (remaining > 0 && this.path.length > 0) {
      const door = this.doorOnNextStep();
      if (door && door !== this.heldDoor) {
        if (!this.traffic.claimDoor(door)) break;
        this.heldDoor = door;
      }
      const target = cellToWorld(this.path[0].x, this.path[0].z);
      const dx = target.x - this.body.position.x;
      const dz = target.z - this.body.position.z;
      const gap = Math.hypot(dx, dz);
      if (gap > 0) this.facingTarget = Math.atan2(dx, dz);
      if (gap <= remaining) {
        this.body.position.x = target.x;
        this.body.position.z = target.z;
        this.floor = this.path[0].level;
        this.path.shift();
        // Still on the stairs, it keeps them until it's off.
        this.heldDoor = this.stairsClaim(this.currentCell());
        remaining -= gap;
      } else {
        this.body.position.x += (dx / gap) * remaining;
        this.body.position.z += (dz / gap) * remaining;
        remaining = 0;
        // Into the next square, it's on that square's floor: past the top step, it's upstairs.
        const now = worldToCell(this.body.position.x, this.body.position.z);
        if (now.x === this.path[0].x && now.z === this.path[0].z) this.floor = this.path[0].level;
      }
    }
    if (this.goal && this.path.length === 0) {
      this.slidingOff = false;
      // A marker for a spot it couldn't reach stays long enough to finish fading.
      if (this.goalReachable) this.marker.visible = false;
      this.goal = null;
      if (this.furnitureSpot) {
        if (this.furnitureStage === 'settling') this.settle(this.furnitureSpot);
        else this.arriveAtFurniture(this.furnitureSpot);
      }
    }
  }

  /** The stairs, as something only one pawn uses at a time, if this square is on them. */
  private stairsClaim(cell: Cell): string | null {
    const step = this.world.stairStep(cell);
    return step ? `stairs:${step.flight.id}` : null;
  }

  /** How high it stands here: on the floor, or partway up the stairs by how far along them it is, hopping up or down onto each step. */
  private standingHeight(here: Cell): number {
    const step = this.world.stairStep(here);
    if (!step) return this.world.floorHeight(here);
    const { bottom, steps, top, profile } = step.flight;
    const i = step.index;
    const middle = steps[i];
    const before = i === 0 ? bottom : steps[i - 1];
    const after = i === steps.length - 1 ? top : steps[i + 1];
    // How far past the middle of this square it is toward the next, or short of it coming from the last.
    const offset = (to: { x: number; z: number }, from: { x: number; z: number }) =>
      (this.body.position.x - middle.x) * (to.x - from.x) + (this.body.position.z - middle.z) * (to.z - from.z);
    const ahead = offset(after, middle);
    const along = i + 0.5 + (ahead > 0 ? ahead : offset(middle, before));
    return here.level * LEVEL_HEIGHT + heightAlong(profile, along, STAIR_HOP / LEVEL_HEIGHT) * LEVEL_HEIGHT;
  }

  /**
   * Where it's walking, for the paths view: where it is now, then the middle
   * of each square ahead on its route, at the height of the floor or the
   * stairs there. Empty when it isn't going anywhere.
   */
  routeAhead(): THREE.Vector3[] {
    if (this.path.length === 0) return [];
    return [
      this.body.position.clone(),
      ...this.path.map((cell) => {
        const { x, z } = cellToWorld(cell.x, cell.z);
        const step = this.world.stairStep(cell);
        // Partway up the flight, by which step of it this is.
        const y = step ? (cell.level + (step.index + 0.5) / step.flight.profile.length) * LEVEL_HEIGHT : this.world.floorHeight(cell);
        return new THREE.Vector3(x, y, z);
      }),
    ];
  }

  /** The floor it's on. */
  get level(): number {
    return this.floor;
  }

  /** The door between this pawn's square and the next one on its route, if there is one, or the stairs it's about to go up or down. */
  private doorOnNextStep(): string | null {
    const here = this.currentCell();
    const next = this.path[0];
    const stairs = this.stairsClaim(next) ?? this.stairsClaim(here);
    if (stairs) return stairs;
    if (next.level !== here.level) return null;
    const step = STEPS.find(({ dx, dz }) => dx === next.x - here.x && dz === next.z - here.z);
    if (!step || this.world.level(here.level).getAperture(here.x, here.z, step.dir)?.kind !== 'door') return null;
    return `${here.level}|${wallKey(here.x, here.z, step.dir)}`;
  }

  private updateFacing(seconds: number) {
    const turn = THREE.MathUtils.euclideanModulo(this.facingTarget - this.facing + Math.PI, Math.PI * 2) - Math.PI;
    this.facing += turn * Math.min(1, (this.goal ? TURN_SPEED : IDLE_TURN_SPEED) * seconds);
    this.torso.rotation.y = this.facing;
  }

  /** Breathing and shifting weight, always going, so nobody ever stands completely still. Someone lying down only breathes. */
  private updateIdleMotion(seconds: number) {
    this.idleClock += seconds;
    const breath = Math.sin(this.idleClock * BREATH_SPEED) * BREATH_AMOUNT;
    this.torso.scale.set(1 - breath / 2, 1 + breath, 1 - breath / 2);
    const sway = Math.sin(this.idleClock * SWAY_SPEED) + Math.sin(this.idleClock * SWAY_SECOND_SPEED) / 2;
    this.torso.rotation.z = this.poseTarget.tilt < 0 ? 0 : sway * SWAY_AMOUNT;
  }

  /** Lying down on something it sleeps on, like a bed, as opposed to having a soak in the bath. */
  private get isAsleep(): boolean {
    const piece = this.settledPiece;
    return this.settledUse === 'lie' && piece !== null && (getFurnitureDef(piece.type).advertises.energy ?? 0) > 0;
  }

  /** Closes its eyes to sleepy slits once it's settled into bed, and opens them again on getting up. */
  private updateEyes(seconds: number) {
    const target = this.isAsleep ? 1 : 0;
    this.eyesShut += (target - this.eyesShut) * Math.min(1, EYE_CLOSE_SPEED * seconds);
    const shut = this.eyesShut;
    // Flattened to a thin line, and a touch wider, like eyes closed in contentment.
    for (const eye of this.eyes) eye.scale.set(1 + 0.5 * shut, 1 - 0.85 * shut, 1 - 0.3 * shut);
  }

  /** What it's doing at the piece it's standing at, if that piece gives it something to do. */
  private get activity(): Activity | null {
    if (this.chore && !this.furnitureSpot && !this.goal) return this.chore;
    // Typing at a computer from a desk chair counts as using the computer, seated.
    if (!this.furnitureSpot || this.furnitureStage !== 'using' || (this.furnitureSpot.kind !== 'stand' && !this.furnitureSpot.chair)) return null;
    return getFurnitureDef(this.furnitureSpot.piece.type).activity ?? null;
  }

  private updateGesture(seconds: number) {
    if (!this.gesture) {
      const rig = this.gestureRig;
      rig.position.y = 0;
      rig.rotation.set(0, 0, 0);
      rig.scale.y = 1;
      const activity = this.activity;
      if (this.isEating) rig.rotation.x = Math.max(0, Math.sin(this.idleClock * EAT_NOD_SPEED)) * EAT_NOD_AMOUNT;
      else if (activity) playActivity(activity, this.idleClock, rig);
      return;
    }
    this.gestureAge += seconds;
    const progress = this.gestureAge / GESTURE_SECONDS;
    const rig = this.gestureRig;
    rig.position.y = 0;
    rig.rotation.set(0, 0, 0);
    rig.scale.y = 1;
    // Called off if it gets up to something else part-way through.
    if (progress >= 1 || this.goal || this.furnitureSpot) {
      this.gesture = null;
      return;
    }
    const swell = Math.sin(progress * Math.PI);
    if (this.gesture === 'hop') rig.position.y = Math.abs(Math.sin(progress * Math.PI * 3)) * 0.25 * swell;
    if (this.gesture === 'spin') rig.rotation.y = progress * Math.PI * 2;
    if (this.gesture === 'wiggle') rig.rotation.z = Math.sin(progress * Math.PI * 6) * 0.2 * swell;
    if (this.gesture === 'bow') rig.rotation.x = swell * 0.4;
    if (this.gesture === 'slump') {
      rig.rotation.x = swell * 0.15;
      rig.scale.y = 1 - swell * 0.12;
    }
    if (this.gesture === 'stomp') rig.position.y = Math.abs(Math.sin(progress * Math.PI * 8)) * 0.04;
  }

  /** Eases into sitting, lying down or standing back up. Heights in the pose are above the ground, whatever the floor adds. */
  private updatePose(seconds: number) {
    const ease = Math.min(1, POSE_SPEED * seconds);
    const { x, y, z, tilt } = this.poseTarget;
    // The pose's height is from the floor the pawn is on, as the furniture's is.
    const height = y === 0 ? 0 : y - (this.body.position.y - this.floor * LEVEL_HEIGHT);
    this.torso.position.sub(this.swingOffset);
    this.torso.position.x += (x - this.torso.position.x) * ease;
    this.torso.position.y += (height - this.torso.position.y) * ease;
    this.torso.position.z += (z - this.torso.position.z) * ease;
    this.torso.rotation.x += (tilt - this.torso.rotation.x) * ease;
    this.updateSwing(seconds);

    // A lying pawn's head is only just above the bed, so its bubble doesn't need to float as high.
    const topOfPawn = tilt < 0 ? BODY_RADIUS : BODY_HEIGHT;
    this.bubble.group.position.x = this.torso.position.x;
    this.bubble.group.position.y = this.torso.position.y + topOfPawn + BUBBLE_ABOVE_HEAD;
    this.bubble.group.position.z = this.torso.position.z;
  }

  /** Lying in a hammock, it sways with the hammock: side to side round the ropes, in time with it. */
  private updateSwing(seconds: number) {
    const piece = this.settledPiece;
    const def = piece && this.settledUse === 'lie' ? getFurnitureDef(piece.type) : null;
    this.swingAmount += ((def?.swings ? 1 : 0) - this.swingAmount) * Math.min(1, 1.5 * seconds);
    if (!piece || this.swingAmount < 0.001) {
      this.swingOffset.set(0, 0, 0);
      return;
    }
    const angle = this.swingAmount * hammockSwing(performance.now() / 1000);
    const below = HAMMOCK_PIVOT_Y - (seatHeight(piece.type, this.furnitureSpot?.seat ?? null) + BODY_RADIUS);
    const yaw = THREE.MathUtils.degToRad(piece.rotation);
    const side = below * Math.sin(angle);
    this.swingOffset.set(Math.cos(yaw) * side, below * (1 - Math.cos(angle)), -Math.sin(yaw) * side);
    this.torso.position.add(this.swingOffset);
  }

  private updateSidestep(seconds: number) {
    const ease = Math.min(1, SIDESTEP_SPEED * seconds);
    this.figure.position.x += (this.sidestepTarget.x - this.figure.position.x) * ease;
    this.figure.position.z += (this.sidestepTarget.y - this.figure.position.z) * ease;
  }

  /** Shows this pawn only if its floor is showing, and its destination marker only if that floor is. */
  showLevelsUpTo(level: number) {
    this.group.visible = this.floor <= level;
    this.marker.material.visible = this.markerLevel <= level;
  }

  private showMarker(cell: Cell, reachable: boolean) {
    this.markerLevel = cell.level;
    const position = cellToWorld(cell.x, cell.z);
    this.marker.position.set(position.x, this.world.floorHeight(cell) + 0.01, position.z);
    this.marker.material.color.setHex(reachable ? ADD_COLOR : DELETE_COLOR);
    this.marker.material.opacity = MARKER_OPACITY;
    this.marker.visible = true;
  }

  private updateMarker(seconds: number) {
    if (!this.marker.visible || this.goalReachable) return;
    this.marker.material.opacity -= (MARKER_OPACITY / MARKER_FADE_SECONDS) * seconds;
    if (this.marker.material.opacity <= 0) this.marker.visible = false;
  }

  private stopWalking() {
    this.path = [];
    this.goal = null;
    this.heldDoor = null;
    this.marker.visible = false;
    this.leaveFurniture();
  }

  private standAt(cell: Cell) {
    const position = cellToWorld(cell.x, cell.z);
    this.body.position.x = position.x;
    this.body.position.z = position.z;
    this.floor = cell.level;
    this.heldDoor = null;
  }

  currentCell(): Cell {
    return { ...worldToCell(this.body.position.x, this.body.position.z), level: this.floor };
  }

  private buildBody() {
    const tube = new THREE.Mesh(new THREE.CapsuleGeometry(BODY_RADIUS, BODY_HEIGHT - BODY_RADIUS * 2, 8, 24), this.bodyMaterial);
    tube.position.y = BODY_HEIGHT / 2;
    this.tube = tube;

    // Depth-tested, so the pawn stands on it rather than the ring showing through its body.
    // High enough to clear a rug, which is the tallest thing lying on the floor.
    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(CELL_SIZE * 0.3, CELL_SIZE * 0.38, 32),
      new THREE.MeshBasicMaterial({ color: RING_COLOR, depthWrite: false, transparent: true }),
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.03;
    this.selectionRing.visible = false;
    this.figure.add(this.selectionRing);

    this.bubble.group.position.y = BODY_HEIGHT + BUBBLE_ABOVE_HEAD;
    this.figure.add(this.bubble.group);

    const eyeGeometry = new THREE.SphereGeometry(0.024, 12, 8);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: EYE_COLOR });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(side * 0.07, 0.68, BODY_RADIUS * 0.94);
      this.gestureRig.add(eye);
      this.eyes.push(eye);
    }
    this.gestureRig.add(tube);

    SHADOW_LAYERS.forEach(({ radius, opacity }, layer) => {
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 32),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.004 + layer * 0.001;
      this.figure.add(shadow);
    });
  }
}
