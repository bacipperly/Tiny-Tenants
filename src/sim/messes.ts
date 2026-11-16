import * as THREE from 'three';
import { LEVEL_HEIGHT, cellToWorld, isCellInLot } from '../grid/gridMath';
import { cellKey } from '../grid/roomDetection';
import { getFootprintCells, getFurnitureDef } from '../build/furnitureCatalog';
import type { FurnitureCategory } from '../build/furnitureCatalog';
import type { Cell } from './pathfinding';
import type { World } from './world';
import { emojiTexture } from './plate';

export type MessKind = 'puddle' | 'dirt' | 'trash' | 'dishes';

/** Something a pawn left lying about. Kept out of the house, so Undo never tidies it up, but remembered with the household. */
export interface Mess {
  id: string;
  kind: MessKind;
  /** The square it's on, and its floor: the ground floor if left out, as it was before there were more floors. */
  x: number;
  z: number;
  level?: number;
  /** How far from the middle of its square it is, in world units. */
  dx: number;
  dz: number;
  /** The piece it's sitting on, like dishes left on a table, and how high that piece's top is. Left out for something on the floor. */
  host?: string;
  y?: number;
  /** How bad it is: muddy footprints build up, trash piles up and plates stack. */
  amount: number;
  /** Seconds of Live it has been lying there. */
  age: number;
  /** Picks its look, so it's the same after a refresh. */
  seed: number;
  /** Which way footprints point, in radians. */
  heading: number;
  /** The pawn who left it. */
  madeBy?: string;
}

/** The square a mess is on, and its floor. */
export function messCell(mess: Mess): Cell {
  return { x: mess.x, z: mess.z, level: mess.level ?? 0 };
}

export interface MessInfo {
  label: string;
  emoji: string;
  /** How much it spoils somewhere, for a pawn it bothers the usual amount. */
  penalty: number;
  /** What cleaning it up offers, as Environment relief. */
  relief: number;
  /** How a pawn gets it off the floor: mopping where it stands, or bending to pick it up. */
  chore: 'mop' | 'pickup';
  cleanSeconds: { min: number; max: number };
  /** Where it has to go once picked up. */
  goesTo?: 'trash' | 'sink';
  most: number;
}

export const MESSES: Record<MessKind, MessInfo> = {
  puddle: { label: 'Puddle', emoji: '💦', penalty: 8, relief: 35, chore: 'mop', cleanSeconds: { min: 4, max: 6 }, most: 1 },
  dirt: { label: 'Muddy Footprints', emoji: '👣', penalty: 4, relief: 15, chore: 'mop', cleanSeconds: { min: 2.5, max: 3.5 }, most: 3 },
  trash: { label: 'Trash', emoji: '🗑️', penalty: 12, relief: 40, chore: 'pickup', cleanSeconds: { min: 1.2, max: 1.8 }, goesTo: 'trash', most: 3 },
  dishes: { label: 'Dirty Dishes', emoji: '🍽️', penalty: 10, relief: 35, chore: 'pickup', cleanSeconds: { min: 1, max: 1.5 }, goesTo: 'sink', most: 4 },
};

/** Footprints build up, and so does the mopping. */
export function cleanSecondsFor(mess: Mess, random: () => number): number {
  const { min, max } = MESSES[mess.kind].cleanSeconds;
  return (min + random() * (max - min)) * (mess.kind === 'dirt' ? mess.amount : 1);
}

export function reliefOf(mess: Mess): number {
  return MESSES[mess.kind].relief * (mess.kind === 'dirt' ? 0.6 + 0.4 * mess.amount : 1);
}

/** Trash and dirty plates start drawing flies after this long, and get worse for it. */
const FLIES_AFTER_SECONDS = 45;
const FLY_PENALTY = 1.5;
/** A puddle dries up by itself after this long. */
const PUDDLE_DRIES_SECONDS = 240;
/** Fades out over the end of its drying. */
const PUDDLE_FADE_SECONDS = 40;
const MOST_MESSES = 80;

/** How pleasant a bare room is, before decor or mess, and the open air of the yard. */
const ROOM_PLEASANTNESS = 50;
const YARD_PLEASANTNESS = 60;
/** What each piece of decor adds, up to a limit. */
const DECOR_POINTS = 4;
const MOST_DECOR_POINTS = 32;
const NICE_CATEGORIES: ReadonlySet<FurnitureCategory> = new Set(['decor', 'wallart', 'plants', 'lighting', 'pets', 'outdoor']);
/** Out in the yard there are no walls, so anything this many squares away counts as around you. */
const YARD_RANGE = 4;

/** Just clear of a rug, which is the tallest thing lying on the floor. */
const ABOVE_FLOOR = 0.034;
const FLY_SIZE = 0.14;
/** Trash is drawn a bit bigger than life, so it shows from up where the camera is. */
const TRASH_SCALE = 1.5;

/** The same run of numbers from the same seed, so a mess looks the same each time it's drawn. */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A lumpy round shape lying flat, like a puddle. */
function blobGeometry(radius: number, random: () => number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  const points = 18;
  const bumps = [random(), random(), random()].map((value) => value * Math.PI * 2);
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = radius * (1 + 0.18 * Math.sin(angle * 2 + bumps[0]) + 0.12 * Math.sin(angle * 3 + bumps[1]) + 0.08 * Math.sin(angle * 5 + bumps[2]));
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function flat(color: number, opacity: number, gloss = false): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    roughness: gloss ? 0.08 : 0.9,
    metalness: gloss ? 0.15 : 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function solid(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
}

function puddleModel(random: () => number): THREE.Object3D[] {
  const pool = new THREE.Mesh(blobGeometry(0.2 + random() * 0.06, random), flat(0x7cc4ea, 0.55, true));
  pool.userData.fades = true;
  const drops: THREE.Object3D[] = [pool];
  for (let i = 0; i < 3; i++) {
    const drop = new THREE.Mesh(blobGeometry(0.035 + random() * 0.03, random), flat(0x7cc4ea, 0.5, true));
    const angle = random() * Math.PI * 2;
    drop.position.set(Math.cos(angle) * 0.3, 0.001, Math.sin(angle) * 0.3);
    drop.userData.fades = true;
    drops.push(drop);
  }
  return drops;
}

/** Muddy prints walking in the way the pawn was going, a pair more for each time someone tracked mud through. */
function dirtModel(mess: Mess, random: () => number): THREE.Object3D[] {
  const prints: THREE.Object3D[] = [];
  const material = flat(0x5a3d26, 0.45 + 0.12 * mess.amount);
  const geometry = new THREE.CircleGeometry(1, 12);
  geometry.rotateX(-Math.PI / 2);
  for (let trail = 0; trail < mess.amount; trail++) {
    const heading = mess.heading + (trail === 0 ? 0 : (random() - 0.5) * 1.6);
    const across = (random() - 0.5) * 0.3;
    const forward = { x: Math.sin(heading), z: Math.cos(heading) };
    const side = { x: forward.z, z: -forward.x };
    for (let step = 0; step < 4; step++) {
      const along = -0.33 + step * 0.22;
      const foot = step % 2 === 0 ? -1 : 1;
      const print = new THREE.Mesh(geometry, material);
      print.scale.set(0.05, 1, 0.085);
      print.rotation.y = heading;
      print.position.set(forward.x * along + side.x * (across + foot * 0.06), 0, forward.z * along + side.z * (across + foot * 0.06));
      prints.push(print);
    }
  }
  return prints;
}

function trashBit(random: () => number): THREE.Object3D {
  const which = Math.floor(random() * 4);
  if (which === 0) {
    // A screwed-up ball of paper.
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshStandardMaterial({ color: 0xe8e4da, flatShading: true }));
    ball.position.y = 0.04;
    ball.rotation.set(random() * 3, random() * 3, 0);
    return ball;
  }
  if (which === 1) {
    // A can on its side.
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 10), solid([0xd04a3a, 0x3a7fd0, 0x5cb85c][Math.floor(random() * 3)]));
    can.rotation.set(0, random() * Math.PI, Math.PI / 2);
    can.position.y = 0.03;
    return can;
  }
  if (which === 2) {
    // A banana skin, splayed out.
    const peel = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.1), solid(i === 0 ? 0xe9c43a : 0xf2d14b));
      strip.rotation.y = (i / 3) * Math.PI * 2;
      strip.translateZ(0.04);
      peel.add(strip);
    }
    peel.position.y = 0.008;
    return peel;
  }
  // A crumpled wrapper.
  const wrapper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.014, 0.08), solid([0xf08a3c, 0xc9c9c9, 0xe84a8a][Math.floor(random() * 3)]));
  wrapper.rotation.set((random() - 0.5) * 0.3, random() * Math.PI, (random() - 0.5) * 0.3);
  wrapper.position.y = 0.01;
  return wrapper;
}

function trashModel(mess: Mess, random: () => number): THREE.Object3D[] {
  const bits: THREE.Object3D[] = [];
  for (let i = 0; i < mess.amount + 1; i++) {
    const bit = trashBit(random);
    bit.scale.setScalar(TRASH_SCALE);
    bit.position.multiplyScalar(TRASH_SCALE);
    const angle = random() * Math.PI * 2;
    const reach = i === 0 ? 0 : 0.12 + random() * 0.08;
    bit.position.x += Math.cos(angle) * reach;
    bit.position.z += Math.sin(angle) * reach;
    bits.push(bit);
  }
  return bits;
}

/** One dirty plate, with leftovers smeared on it. */
function dirtyPlate(random: () => number): THREE.Group {
  const plate = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.02, 20), solid(0xf4f4f0));
  dish.position.y = 0.01;
  const smear = new THREE.Mesh(blobGeometry(0.06, random), flat([0xa0522d, 0xc0392b, 0xd4a017][Math.floor(random() * 3)], 0.8));
  smear.position.set((random() - 0.5) * 0.06, 0.021, (random() - 0.5) * 0.06);
  plate.add(dish, smear);
  for (let i = 0; i < 3; i++) {
    const crumb = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.01, 0.015), solid(0x8b5a2b));
    crumb.position.set((random() - 0.5) * 0.16, 0.024, (random() - 0.5) * 0.16);
    plate.add(crumb);
  }
  return plate;
}

function dishesModel(mess: Mess, random: () => number): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  for (let i = 0; i < mess.amount; i++) {
    const plate = dirtyPlate(random);
    // Stacked up, each a little out of line with the one under it.
    plate.position.set((random() - 0.5) * 0.03, i * 0.022, (random() - 0.5) * 0.03);
    plate.rotation.y = random() * Math.PI;
    parts.push(plate);
  }
  if (random() < 0.5) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.08, 14), solid(0xf4f4f0));
    cup.position.set(0.16, 0.04, 0.05);
    parts.push(cup);
  }
  return parts;
}

function messModel(mess: Mess): THREE.Object3D[] {
  const random = seeded(mess.seed);
  if (mess.kind === 'puddle') return puddleModel(random);
  if (mess.kind === 'dirt') return dirtModel(mess, random);
  if (mess.kind === 'trash') return trashModel(mess, random);
  return dishesModel(mess, random);
}

function brighten(object: THREE.Object3D, brightness: number) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material as THREE.MeshStandardMaterial;
    if (!material.userData.baseColor) material.userData.baseColor = material.color.clone();
    material.color.copy(material.userData.baseColor).multiplyScalar(brightness);
  });
}

function dispose(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    } else if (child instanceof THREE.Sprite) child.material.dispose();
  });
}

type Drawn = { model: THREE.Group; hit: THREE.Mesh; fly: THREE.Sprite | null };

/**
 * Everything the pawns have left lying around: puddles, muddy footprints,
 * trash and dirty dishes. They go wherever they were left, on the floor or on
 * top of a table, and anything built over them goes with them.
 */
export class Messes {
  readonly group = new THREE.Group();
  private model: World;
  private messes: Mess[];
  private drawn = new Map<string, Drawn>();
  private onChange: () => void;
  /** Messes on floors above this are hidden, like the floors. */
  private topShownLevel = Infinity;
  private nextId: number;
  private hitMaterial = new THREE.MeshBasicMaterial({ visible: false });

  constructor(model: World, saved: Mess[] | undefined, onChange: () => void) {
    this.model = model;
    this.messes = (saved ?? []).filter((mess) => mess && MESSES[mess.kind]).map((mess) => ({ ...mess }));
    this.onChange = onChange;
    this.nextId = 1 + this.messes.reduce((most, mess) => Math.max(most, Number(mess.id.slice(1)) || 0), 0);
  }

  all(): readonly Mess[] {
    return this.messes;
  }

  get(id: string): Mess | undefined {
    return this.messes.find((mess) => mess.id === id);
  }

  /** Leaves a mess here. The same kind in the same place makes the one there worse instead, so a doorway gets muddier and plates stack up. */
  add(kind: MessKind, cell: Cell, options: { dx?: number; dz?: number; host?: string; y?: number; heading?: number; madeBy?: string } = {}): Mess | null {
    if (!isCellInLot(cell.x, cell.z)) return null;
    const existing = this.messes.find((mess) => mess.kind === kind && mess.x === cell.x && mess.z === cell.z && (mess.level ?? 0) === cell.level && mess.host === options.host);
    if (existing) {
      existing.amount = Math.min(MESSES[kind].most, existing.amount + 1);
      existing.age = Math.min(existing.age, FLIES_AFTER_SECONDS / 2);
      if (options.madeBy) existing.madeBy = options.madeBy;
      this.redraw(existing);
      this.onChange();
      return existing;
    }
    if (this.messes.length >= MOST_MESSES) return null;
    const mess: Mess = {
      id: `m${this.nextId++}`,
      kind,
      x: cell.x,
      z: cell.z,
      ...(cell.level > 0 && { level: cell.level }),
      dx: options.dx ?? 0,
      dz: options.dz ?? 0,
      host: options.host,
      y: options.y,
      amount: 1,
      age: 0,
      seed: Math.floor(Math.random() * 2 ** 31),
      heading: options.heading ?? Math.random() * Math.PI * 2,
      madeBy: options.madeBy,
    };
    this.messes.push(mess);
    this.redraw(mess);
    this.onChange();
    return mess;
  }

  /** Puts back down something that was being carried off, where the pawn carrying it is. */
  putBack(item: Mess, cell: Cell) {
    for (let i = 0; i < item.amount; i++) this.add(item.kind, cell, { heading: item.heading, madeBy: item.madeBy });
  }

  remove(id: string) {
    const index = this.messes.findIndex((mess) => mess.id === id);
    if (index < 0) return;
    this.messes.splice(index, 1);
    this.undraw(id);
    this.onChange();
  }

  clear() {
    for (const mess of this.messes) this.undraw(mess.id);
    this.messes = [];
    this.onChange();
  }

  /** Only Live time counts, so nothing goes off while you're building. Puddles dry up, and old trash draws flies. */
  age(seconds: number) {
    for (const mess of [...this.messes]) {
      const hadFlies = this.hasFlies(mess);
      mess.age += seconds;
      if (mess.kind === 'puddle' && mess.age >= PUDDLE_DRIES_SECONDS) {
        this.remove(mess.id);
        continue;
      }
      if (this.hasFlies(mess) !== hadFlies) this.redraw(mess);
    }
  }

  /** The flies buzz about and puddles fade as they dry. */
  animate(time: number) {
    for (const mess of this.messes) {
      const drawn = this.drawn.get(mess.id);
      if (!drawn) continue;
      if (drawn.fly) {
        const t = time * 3.1 + mess.seed;
        drawn.fly.position.set(Math.cos(t) * 0.2 + Math.sin(t * 2.7) * 0.05, 0.32 + Math.sin(t * 1.9) * 0.08, Math.sin(t) * 0.2);
      }
      if (mess.kind === 'puddle') {
        const left = Math.min(1, (PUDDLE_DRIES_SECONDS - mess.age) / PUDDLE_FADE_SECONDS);
        drawn.model.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.fades) (child.material as THREE.MeshStandardMaterial).opacity = 0.55 * Math.max(0, left);
        });
      }
    }
  }

  /** Call whenever the house changes. A mess covered by new furniture is gone, and dishes on a table that was moved end up on the floor. */
  onHouseChanged() {
    const pieces = this.model.allFurniture();
    let changed = false;
    for (const mess of [...this.messes]) {
      if (mess.host) {
        const host = pieces.find((piece) => piece.id === mess.host && piece.level === (mess.level ?? 0));
        const stillUnder = host && getFootprintCells(host.type, host.x, host.z, host.rotation).some(({ x, z }) => x === mess.x && z === mess.z);
        if (host && stillUnder) {
          const def = getFurnitureDef(host.type);
          mess.y = def.holds ?? def.height;
        } else {
          mess.host = undefined;
          mess.y = undefined;
          changed = true;
        }
      }
      const cell = messCell(mess);
      const isGone =
        !this.model.standable(cell) ||
        (!mess.host && this.model.blocked(cell.level).has(cellKey(mess.x, mess.z))) ||
        ((mess.kind === 'puddle' || mess.kind === 'dirt') && !this.model.hasFloor(cell));
      if (isGone) {
        this.messes.splice(this.messes.indexOf(mess), 1);
        changed = true;
      }
    }
    for (const id of [...this.drawn.keys()]) this.undraw(id);
    for (const mess of this.messes) this.redraw(mess);
    if (changed) this.onChange();
  }

  /**
   * How pleasant it is to be on this square, from 0 to 100: a bare room is so-so,
   * decor makes it nicer, and every mess in the room makes it worse, by however
   * much mess bothers this pawn. Out in the yard, it's what's nearby that counts.
   */
  pleasantnessAt(cell: Cell, bothered: number): number {
    const room = this.model.roomAt(cell);
    const isAround = (other: Cell) =>
      other.level === cell.level &&
      (room === 0 ? this.model.roomAt(other) === 0 && Math.hypot(other.x - cell.x, other.z - cell.z) <= YARD_RANGE : this.model.roomAt(other) === room);
    let decor = 0;
    for (const piece of this.model.allFurniture()) {
      if (NICE_CATEGORIES.has(getFurnitureDef(piece.type).category) && isAround(piece)) decor += DECOR_POINTS;
    }
    let mess = 0;
    for (const item of this.messes) {
      if (isAround(messCell(item))) mess += this.penaltyOf(item);
    }
    return (room === 0 ? YARD_PLEASANTNESS : ROOM_PLEASANTNESS) + Math.min(MOST_DECOR_POINTS, decor) - mess * bothered;
  }

  penaltyOf(mess: Mess): number {
    return MESSES[mess.kind].penalty * mess.amount * (this.hasFlies(mess) ? FLY_PENALTY : 1);
  }

  /** The mess under the cursor and how far away it is, if there is one. */
  pick(raycaster: THREE.Raycaster): { id: string; distance: number } | null {
    this.group.updateWorldMatrix(true, true);
    const shown = [...this.drawn.values()].filter(({ model }) => model.visible);
    const hit = raycaster.intersectObjects(shown.map(({ hit }) => hit), false)[0];
    return hit ? { id: hit.object.userData.messId as string, distance: hit.distance } : null;
  }

  /** What a pawn carries off to the bin or the sink: the trash itself, or the stack of dirty plates. */
  carriedModel(mess: Mess): THREE.Object3D {
    const group = new THREE.Group();
    group.add(...messModel(mess));
    group.scale.setScalar(0.85);
    return group;
  }

  /** Where the middle of a mess is in the world, at the height it lies at. */
  positionOf(mess: Mess): THREE.Vector3 {
    const { x, z } = cellToWorld(mess.x, mess.z);
    const cell = messCell(mess);
    const y = mess.y !== undefined ? cell.level * LEVEL_HEIGHT + mess.y : this.model.floorHeight(cell);
    return new THREE.Vector3(x + mess.dx, y, z + mess.dz);
  }

  /** Shows the messes on this floor and below, and hides the ones above. */
  showLevelsUpTo(level: number) {
    if (level === this.topShownLevel) return;
    this.topShownLevel = level;
    for (const mess of this.messes) {
      const drawn = this.drawn.get(mess.id);
      if (drawn) drawn.model.visible = (mess.level ?? 0) <= level;
    }
  }

  toJSON(): Mess[] {
    return this.messes.map((mess) => ({ ...mess, age: Math.round(mess.age) }));
  }

  private hasFlies(mess: Mess): boolean {
    return (mess.kind === 'trash' || mess.kind === 'dishes') && mess.age >= FLIES_AFTER_SECONDS;
  }

  private redraw(mess: Mess) {
    this.undraw(mess.id);
    const model = new THREE.Group();
    model.add(...messModel(mess));
    model.position.copy(this.positionOf(mess));
    // Flat ones lie just clear of a rug. Anything with some height to it sits on what's under it.
    if (!mess.host) model.position.y += mess.kind === 'puddle' || mess.kind === 'dirt' ? ABOVE_FLOOR : 0.004;
    brighten(model, this.model.lightAt(messCell(mess)));
    model.visible = (mess.level ?? 0) <= this.topShownLevel;
    // Something easy to click on: footprints alone are small.
    const hit = new THREE.Mesh(mess.host ? new THREE.BoxGeometry(0.42, 0.14, 0.42) : new THREE.BoxGeometry(0.7, 0.06, 0.7), this.hitMaterial);
    hit.position.y = mess.host ? 0.07 : 0.03;
    hit.userData.messId = mess.id;
    model.add(hit);
    let fly: THREE.Sprite | null = null;
    if (this.hasFlies(mess)) {
      fly = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('🪰'), transparent: true }));
      fly.scale.set(FLY_SIZE, FLY_SIZE, 1);
      model.add(fly);
    }
    this.group.add(model);
    this.drawn.set(mess.id, { model, hit, fly });
  }

  private undraw(id: string) {
    const drawn = this.drawn.get(id);
    if (!drawn) return;
    drawn.model.removeFromParent();
    drawn.hit.geometry.dispose();
    drawn.model.remove(drawn.hit);
    dispose(drawn.model);
    this.drawn.delete(id);
  }
}
