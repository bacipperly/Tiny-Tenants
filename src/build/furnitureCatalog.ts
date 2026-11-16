import * as THREE from 'three';
import { STAIR_DEFS } from './stairs';
import type { StairShape } from './stairs';
import type { Advertisement } from '../sim/needs';
import type { FurniturePiece } from '../grid/gridModel';
import { wallKey } from '../grid/gridModel';

/** How a pawn uses a piece: sits on it, lies on it, stands next to it, or steps inside it. */
export type FurnitureUseKind = 'sit' | 'lie' | 'stand' | 'inside';

export type FurnitureCategory =
  | 'seating'
  | 'tables'
  | 'beds'
  | 'storage'
  | 'kitchen'
  | 'bathroom'
  | 'lighting'
  | 'electronics'
  | 'hobbies'
  | 'kids'
  | 'pets'
  | 'plants'
  | 'decor'
  | 'wallart'
  | 'outdoor';

/** The palette's tabs, by what a thing is rather than which room it goes in: every light in one place, every animal in another. */
export const FURNITURE_CATEGORIES: { id: FurnitureCategory; label: string; emoji: string }[] = [
  { id: 'seating', label: 'Seating', emoji: '🪑' },
  { id: 'tables', label: 'Tables', emoji: '🍽️' },
  { id: 'beds', label: 'Beds', emoji: '🛏️' },
  { id: 'storage', label: 'Storage', emoji: '🗄️' },
  { id: 'kitchen', label: 'Kitchen', emoji: '🍳' },
  { id: 'bathroom', label: 'Bathroom', emoji: '🛁' },
  { id: 'lighting', label: 'Lighting', emoji: '💡' },
  { id: 'electronics', label: 'Electronics', emoji: '📺' },
  { id: 'hobbies', label: 'Hobbies', emoji: '🎱' },
  { id: 'kids', label: 'Kids', emoji: '🧸' },
  { id: 'pets', label: 'Pets', emoji: '🐾' },
  { id: 'plants', label: 'Plants', emoji: '🪴' },
  { id: 'decor', label: 'Decor', emoji: '🗿' },
  { id: 'wallart', label: 'Wall Art', emoji: '🎨' },
  { id: 'outdoor', label: 'Outdoor', emoji: '🌳' },
];

/** One box of a piece's shape. Sizes and positions are in cells, measured from the middle of the footprint, with `y` being the box's underside. */
export interface FurniturePart {
  size: [number, number, number];
  at: [number, number, number];
  /** The piece's own color if left out. */
  color?: number;
  /** Solid if left out. */
  opacity?: number;
  /** Gives off its own light, so it stays bright in a dark room. */
  glow?: boolean;
  /** Keeps moving once placed: a fish swims, a bubble rises, a flame flickers. */
  motion?: PartMotion;
  /** What a spinning part turns around, in the same units as `at`. */
  pivot?: [number, number, number];
  /** A turn around the piece's front-to-back axis, in radians. */
  tilt?: number;
  /** A turn around the upright axis, in radians, like a step of a spiral staircase. */
  turn?: number;
  /** A parrot's wing, which flaps out to this side: -1 is left, 1 is right. */
  wing?: number;
  /** How far round the track a toy train's car starts, from 0 to 1. */
  along?: number;
  /** Takes the color picked for the piece, like a sofa's fabric, this much lighter or darker (1 is the same), instead of its own color. */
  follows?: number;
}

/**
 * How a part moves. The first few keep going all the time. The rest only
 * happen while a pawn is using the piece: a door swings open on its hinge,
 * a burner glows, a screen comes on, water runs, a shower rains down and a
 * bath fills up with suds on top.
 */
export type PartMotion = 'swim' | 'bubble' | 'flicker' | 'spin' | 'gerbil' | 'parrot' | 'drift' | 'door' | 'burner' | 'screen' | 'water' | 'rain' | 'fill' | 'suds' | 'ripple' | 'lizard' | 'tongue' | 'sway' | 'chest-lid' | 'chest-bubble' | 'gecko' | 'gecko2' | 'twirl' | 'hour-hand' | 'minute-hand' | 'lid' | 'door-right' | 'fan' | 'rock' | 'train' | 'drop-door' | 'firefly' | 'snake' | 'snake-tongue' | 'swing';

/** What a pawn standing at a piece looks like it's doing there. */
export type Activity = 'admire' | 'peer' | 'warm' | 'scrub' | 'stir' | 'chop' | 'rummage' | 'type' | 'play' | 'watch' | 'browse' | 'primp' | 'shoot' | 'garden' | 'mop' | 'pickup' | 'ponder';

export interface FurnitureDef {
  type: string;
  label: string;
  emoji: string;
  category: FurnitureCategory;
  footprint: { w: number; d: number }; // in grid cells
  color: number;
  /** Where a pawn sits or lies: the top of the seat or mattress, not necessarily the top of the piece. */
  height: number;
  /** A bunk bed: the top of its upper mattress, where a second sleeper lies above the first. */
  bunk?: number;
  /** Swings gently from side to side while someone lies in it, like a hammock, and they swing with it. */
  swings?: boolean;
  use: FurnitureUseKind;
  /** What a pawn thinks about while using it. */
  thoughts: string[];
  /** What it offers a pawn who uses it. */
  advertises: Advertisement;
  /** Makes a plate of food rather than filling a pawn up by itself. */
  food?: { prepareSeconds: { min: number; max: number }; reliefPerSecond: number; servings: string[] };
  /** Somewhere a plate can go. A pawn with nowhere to sit will stand at a table, but not a counter. */
  surface?: 'table' | 'counter';
  /** Somewhere a pawn would happily sit to eat. */
  mealSeat?: boolean;
  /** Runs into the pieces of the same kind beside it, turning into a corner piece where two runs meet: counters (with the stove, sink and dishwasher), booth seats, or sectional sofa seats. */
  joins?: JoinKind;
  /** Lies flat on the floor, like a rug: pawns walk over it and other pieces can stand on it. */
  onFloor?: boolean;
  /** How high its top is, if small things can be set on it, like a table, counter or dresser. */
  holds?: number;
  /** A small thing that's set on top of a piece that `holds` things, like a lamp on a table, rather than on the floor. */
  onTop?: boolean;
  /** Hangs on the wall behind its squares, like a painting: it needs a wall there, and pawns walk underneath it. */
  onWall?: boolean;
  /** Hangs from the ceiling, like a pendant light: it needs to be indoors, and pawns walk underneath it. */
  onCeiling?: boolean;
  /** Has to be switched on, like a fire that needs lighting, with what a pawn does to switch it on and off. Its glowing parts, and its light, only show while it's on. */
  switchable?: { on: { label: string; emoji: string }; off: { label: string; emoji: string }; use: { label: string; emoji: string } };
  /** Somewhere nobody wants company, like a toilet or shower. Walking in on someone using it causes a scene. */
  private?: boolean;
  /** What a pawn does while standing at it. Leaning in is all it does if left out. */
  activity?: Activity;
  /** Which sides a pawn can use it from: only in front, like a fridge or a TV, or anywhere but behind, like a bed's headboard. Any side if left out, like a dining chair you pull out from behind. */
  approach?: 'front' | 'not-back';
  /** Somewhere to wash up a plate after eating. */
  washesDishes?: boolean;
  /** Takes dirty plates quicker than washing them by hand, like a dishwasher, so pawns go for it first. */
  loadsDishes?: boolean;
  /** Gives off light, like a lamp or a fire. */
  light?: LightSource;
  /** Placed with its own Build tool, like the stairs, so it's left out of Furnish's palette and search. */
  buildTool?: boolean;
  /** A flight of stairs up to the floor above, and the way up it. */
  stairs?: StairShape;
  /** Goes with a pool: on the edge facing the water, like a ladder; down in the water, like pool stairs; or reaching out over it, like a diving board. */
  pool?: 'edge' | 'inside' | 'over';
  /** A piece faces +z, so a seat's back goes on the -z side, and a bed's head too. */
  parts: FurniturePart[];
}

/** The light a lamp or fire gives off. */
export interface LightSource {
  color: number;
  /** Where the light comes from, in the piece's own frame, like a part's `at`. */
  at: [number, number, number];
  /** How bright the light itself is. */
  strength: number;
  /** How far the pool of light on the floor spreads, in cells. */
  pool: number;
  /** How big the glow around the bulb or flames is. */
  halo: number;
  /** Dances like firelight. */
  flicker?: boolean;
}

/** The kinds of piece that run together into one long piece, like counters into a worktop. */
export type JoinKind = 'counters' | 'booth' | 'sectional';

/** Which sides of a counter carry on into the next one, in the piece's own frame: left is -x, front is +z. */
export interface CounterJoins {
  left: boolean;
  right: boolean;
  front: boolean;
  back: boolean;
  /**
   * For a seat at the corner of an L: which side the other run's back is on,
   * -1 for left and 1 for right, so the corner seat's back turns that way too.
   */
  bend?: -1 | 1;
}

const WOOD = 0x8a6a45;
const DARK_WOOD = 0x5f4630;
const WHITE = 0xf2f2f2;
const STEEL = 0x8e9aa1;
const NEAR_BLACK = 0x2b2b2b;
const GLASS = 0xbfe3ee;
const WATER = 0x8fd3f5;
/** How deep a bath fills: up to about the middle of a pawn lying in it. */
const BATH_WATER_DEPTH = 0.18;
/** How far a shower's drops fall, from the head to the floor of the stall. */
const SHOWER_FALL = 1.14;
const BARK = 0x6b4a2e;
const SOIL = 0x5a3d26;
const APPLE_RED = 0xd83a32;
/** A screen that's switched off, and a burner that's cold. */
const SCREEN_OFF = 0x15191c;
const BURNER_OFF = 0x4a2a24;
/** The fridge door's hinge, down its left edge at the front. */
const FRIDGE_HINGE: [number, number, number] = [-0.4, 0, 0.335];
/** The trash can lid's hinge, along its back edge. */
const TRASH_LID_HINGE: [number, number, number] = [0, 0.57, -0.21];

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, color?: number, opacity?: number): FurniturePart {
  return { size: [w, h, d], at: [x, y, z], color, opacity };
}

function glowingBox(w: number, h: number, d: number, x: number, y: number, z: number, color: number): FurniturePart {
  return { ...box(w, h, d, x, y, z, color), glow: true };
}

/** A part that takes the color picked for the piece, `shade` times as light, rather than its own: a seam or border a little darker than the fabric, say. */
function following(part: FurniturePart, shade = 1): FurniturePart {
  return { ...part, follows: shade };
}

function moving(part: FurniturePart, motion: PartMotion): FurniturePart {
  return { ...part, motion };
}

// The gerbil cage, which sits on its pedestal with the cage floor at this height.
const CAGE_FLOOR = 0.78;
const CAGE_HALF_W = 0.38;
const CAGE_HALF_D = 0.25;
const CAGE_HEIGHT = 0.42;
const WIRE = 0xc9ced1;
/** The middle of the exercise wheel, which turns around the piece's front-to-back axis. */
const WHEEL_CENTER: [number, number, number] = [0.2, CAGE_FLOOR + 0.17, -0.05];
const WHEEL_RADIUS = 0.15;
/** Where the gerbil's body sits when it's built, before it starts running about. */
const GERBIL_HOME: [number, number, number] = [0.07, CAGE_FLOOR, 0.08];

/** Thin wire bars on all four sides of a cage and across its top, with a frame around the top edge. */
function cageBars(halfW: number, halfD: number, floor: number, height: number, color = WIRE): FurniturePart[] {
  const bars: FurniturePart[] = [];
  const top = floor + height;
  const across = Math.round((halfW * 2) / 0.095);
  for (let i = 0; i <= across; i++) {
    const x = -halfW + (i * halfW * 2) / across;
    bars.push(box(0.012, height, 0.012, x, floor, halfD, color), box(0.012, height, 0.012, x, floor, -halfD, color));
    bars.push(box(0.012, 0.012, halfD * 2, x, top, 0, color));
  }
  const deep = Math.round((halfD * 2) / 0.1);
  for (let i = 1; i < deep; i++) {
    const z = -halfD + (i * halfD * 2) / deep;
    bars.push(box(0.012, height, 0.012, halfW, floor, z, color), box(0.012, height, 0.012, -halfW, floor, z, color));
  }
  bars.push(box(halfW * 2, 0.02, 0.02, 0, top, halfD, color), box(halfW * 2, 0.02, 0.02, 0, top, -halfD, color));
  bars.push(box(0.02, 0.02, halfD * 2, halfW, top, 0, color), box(0.02, 0.02, halfD * 2, -halfW, top, 0, color));
  return bars;
}

// The parrot cage, a square wire cage up on a stand like a lamp's.
const PARROT_FLOOR = 0.98;
const PARROT_HALF = 0.23;
const PARROT_CAGE_HEIGHT = 0.5;
const BRASS = 0xd4a93c;
/** Where the parrot sits on its perch when it's built, before it starts moving about. */
const PARROT_HOME: [number, number, number] = [-0.08, PARROT_FLOOR + 0.2, 0];

/** A red macaw with blue wings, facing the front of the piece. */
function parrotParts(): FurniturePart[] {
  const [x, y, z] = PARROT_HOME;
  const red = 0xe2433b;
  const blue = 0x2f6fd0;
  return [
    moving(box(0.08, 0.13, 0.09, x, y, z, red), 'parrot'),
    moving(box(0.08, 0.08, 0.08, x, y + 0.13, z + 0.01, red), 'parrot'),
    moving(box(0.035, 0.045, 0.04, x, y + 0.14, z + 0.065, 0xf3e2b8), 'parrot'),
    moving(box(0.014, 0.014, 0.014, x - 0.035, y + 0.175, z + 0.03, NEAR_BLACK), 'parrot'),
    moving(box(0.014, 0.014, 0.014, x + 0.035, y + 0.175, z + 0.03, NEAR_BLACK), 'parrot'),
    moving(box(0.05, 0.16, 0.025, x, y - 0.1, z - 0.05, blue), 'parrot'),
    { ...moving(box(0.02, 0.11, 0.075, x - 0.05, y + 0.015, z - 0.005, blue), 'parrot'), wing: -1 },
    { ...moving(box(0.02, 0.11, 0.075, x + 0.05, y + 0.015, z - 0.005, blue), 'parrot'), wing: 1 },
    // A flash of yellow at each shoulder.
    moving(box(0.022, 0.03, 0.05, x - 0.05, y + 0.1, z, 0xf6d04d), 'parrot'),
    moving(box(0.022, 0.03, 0.05, x + 0.05, y + 0.1, z, 0xf6d04d), 'parrot'),
  ];
}

/** An eight-sided wheel with a cross of spokes, all of it turning around its middle. */
function exerciseWheel(): FurniturePart[] {
  const [cx, cy, cz] = WHEEL_CENTER;
  const parts: FurniturePart[] = [];
  const side = 2 * WHEEL_RADIUS * Math.tan(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const x = cx + WHEEL_RADIUS * Math.cos(angle);
    // The box's `y` is its underside, so drop it by half its thickness to center it on the rim.
    const y = cy + WHEEL_RADIUS * Math.sin(angle) - 0.008;
    parts.push({ ...box(side, 0.016, 0.09, x, y, cz, 0x8fd16a), motion: 'spin', pivot: WHEEL_CENTER, tilt: angle + Math.PI / 2 });
  }
  for (const tilt of [0, Math.PI / 2]) {
    parts.push({ ...box(WHEEL_RADIUS * 2, 0.012, 0.012, cx, cy - 0.006, cz - 0.045, 0x6fb84a), motion: 'spin', pivot: WHEEL_CENTER, tilt });
  }
  // The stand it turns on, which doesn't.
  parts.push(box(0.025, 0.17, 0.025, cx, CAGE_FLOOR, cz - 0.07, 0x6fb84a));
  return parts;
}

/** A body, head, ears and eyes, all moving together as one gerbil. */
function gerbilParts(): FurniturePart[] {
  const [x, y, z] = GERBIL_HOME;
  const fur = 0xd99a5b;
  return [
    moving(box(0.13, 0.075, 0.075, x, y, z, fur), 'gerbil'),
    moving(box(0.06, 0.06, 0.06, x + 0.085, y + 0.025, z, fur), 'gerbil'),
    moving(box(0.02, 0.03, 0.02, x + 0.08, y + 0.085, z - 0.02, 0xf0b9b0), 'gerbil'),
    moving(box(0.02, 0.03, 0.02, x + 0.08, y + 0.085, z + 0.02, 0xf0b9b0), 'gerbil'),
    moving(box(0.012, 0.012, 0.012, x + 0.117, y + 0.05, z - 0.015, NEAR_BLACK), 'gerbil'),
    moving(box(0.012, 0.012, 0.012, x + 0.117, y + 0.05, z + 0.015, NEAR_BLACK), 'gerbil'),
  ];
}

// The lizard tank: a glass tank on a stand like the fish tank, with sand on the bottom at this height.
const TERRARIUM_SAND = 0.77;
/** The flat rock under the basking lamp, where the lizard spends most of its time. */
const BASKING_ROCK = { x: 0.4, z: 0, top: TERRARIUM_SAND + 0.1 };
/** Where the lizard's body sits when it's built, lying on the rock and facing +x. */
const LIZARD_HOME: [number, number, number] = [BASKING_ROCK.x, BASKING_ROCK.top, BASKING_ROCK.z];
const LIZARD_GREEN = 0x6fae3a;

/** A body with darker spots down its back, a head with eyes, a two-piece tail, four legs, and a tongue that flicks out now and then. */
function lizardParts(): FurniturePart[] {
  const [x, y, z] = LIZARD_HOME;
  const legs = 0x5a9330;
  const part = (w: number, h: number, d: number, dx: number, dy: number, dz: number, color: number) => moving(box(w, h, d, x + dx, y + dy, z + dz, color), 'lizard');
  return [
    part(0.16, 0.045, 0.065, 0, 0.012, 0, LIZARD_GREEN),
    part(0.03, 0.006, 0.03, -0.035, 0.057, 0, 0x4f8a28),
    part(0.03, 0.006, 0.03, 0.035, 0.057, 0, 0x4f8a28),
    part(0.07, 0.04, 0.055, 0.11, 0.015, 0, 0x7cbf45),
    part(0.012, 0.012, 0.012, 0.125, 0.04, -0.028, NEAR_BLACK),
    part(0.012, 0.012, 0.012, 0.125, 0.04, 0.028, NEAR_BLACK),
    part(0.1, 0.03, 0.04, -0.13, 0.017, 0, LIZARD_GREEN),
    part(0.09, 0.018, 0.022, -0.22, 0.02, 0, LIZARD_GREEN),
    part(0.025, 0.02, 0.025, 0.05, 0, -0.045, legs),
    part(0.025, 0.02, 0.025, 0.05, 0, 0.045, legs),
    part(0.025, 0.02, 0.025, -0.05, 0, -0.045, legs),
    part(0.025, 0.02, 0.025, -0.05, 0, 0.045, legs),
    moving(box(0.045, 0.006, 0.01, x + 0.165, y + 0.025, z, 0xe8556b), 'tongue'),
  ];
}

// The snake terrarium: a wooden vivarium with a glass front, bark chips on the floor at this height.
const SNAKE_FLOOR = 0.66;
/** How many pieces the snake's body is made of, head first. */
const SNAKE_SEGMENTS = 20;
/** Laps a second, on average: it stops now and then, then carries on. */
const SNAKE_SPEED = 0.035;
const CORN_ORANGE = 0xe0763a;
const CORN_RED = 0xb8432c;

/**
 * The snake's winding loop round the floor of the tank, as points evenly
 * spaced along it. The loop wiggles in and out as it goes, and every piece of
 * the body follows the same path, so the body bends the way a snake's does,
 * through the curves the head made.
 */
const SNAKE_PATH = (() => {
  // A running track: straight along the front and back, round at each end, with an S-bend every so often across it.
  const steps = 720;
  const half = 0.42;
  const radius = 0.12;
  const base = 4 * half + 2 * Math.PI * radius;
  const raw = Array.from({ length: steps + 1 }, (_, step) => {
    let d = (step / steps) * base;
    let point: { x: number; z: number; nx: number; nz: number };
    if (d < 2 * half) point = { x: -half + d, z: radius, nx: 0, nz: 1 };
    else if ((d -= 2 * half) < Math.PI * radius) {
      const angle = Math.PI / 2 - d / radius;
      point = { x: half + radius * Math.cos(angle), z: radius * Math.sin(angle), nx: Math.cos(angle), nz: Math.sin(angle) };
    } else if ((d -= Math.PI * radius) < 2 * half) point = { x: half - d, z: -radius, nx: 0, nz: -1 };
    else {
      const angle = -Math.PI / 2 - (d - 2 * half) / radius;
      point = { x: -half + radius * Math.cos(angle), z: radius * Math.sin(angle), nx: Math.cos(angle), nz: Math.sin(angle) };
    }
    // Eight whole bends round the loop, so it joins up where it started.
    const wiggle = 0.035 * Math.sin((step / steps) * Math.PI * 2 * 8);
    return { x: point.x + point.nx * wiggle, z: point.z + point.nz * wiggle };
  });
  // How far along the loop each point is, so a lap can be measured in distance rather than angle.
  const distances = [0];
  for (let step = 1; step <= steps; step++) distances.push(distances[step - 1] + Math.hypot(raw[step].x - raw[step - 1].x, raw[step].z - raw[step - 1].z));
  const length = distances[steps];
  const evenly: { x: number; z: number }[] = [];
  let step = 0;
  for (let index = 0; index < steps; index++) {
    const wanted = (index / steps) * length;
    while (distances[step + 1] < wanted) step++;
    const f = (wanted - distances[step]) / (distances[step + 1] - distances[step]);
    evenly.push({ x: raw[step].x + (raw[step + 1].x - raw[step].x) * f, z: raw[step].z + (raw[step + 1].z - raw[step].z) * f });
  }
  return { points: evenly, length };
})();
/** How far apart the pieces of the body are along the path, in laps: a little less than a piece is long, so they overlap. */
const SNAKE_SPACING = 0.042 / SNAKE_PATH.length;

/** Where along its loop the snake's body is, `lap` laps round, and which way it's facing there. */
function snakePathAt(lap: number): { x: number; z: number; heading: number } {
  const { points } = SNAKE_PATH;
  const at = (((lap % 1) + 1) % 1) * points.length;
  const index = Math.floor(at) % points.length;
  const here = points[index];
  const next = points[(index + 1) % points.length];
  const f = at - Math.floor(at);
  return { x: here.x + (next.x - here.x) * f, z: here.z + (next.z - here.z) * f, heading: Math.atan2(next.x - here.x, next.z - here.z) };
}

/** How far round its loop the snake's head has got: it creeps along, rests a while, then sets off again. */
function snakeLap(time: number): number {
  return SNAKE_SPEED * (time - Math.sin(time * 0.35) / 0.35);
}

/** A corn snake: orange with red saddles, tapering to the tail, with a head, eyes and a tongue that flicks out. */
function snakeParts(): FurniturePart[] {
  const parts: FurniturePart[] = [];
  for (let index = 0; index < SNAKE_SEGMENTS; index++) {
    const head = index === 0;
    // Thickest a third of the way back, thinning to a point at the tail.
    const along = index / (SNAKE_SEGMENTS - 1);
    const thickness = head ? 0.05 : 0.026 + 0.026 * Math.sin(Math.min(1, along * 1.5 + 0.15) * Math.PI) * (1 - along * 0.4);
    const color = head ? CORN_ORANGE : index % 3 === 1 ? CORN_RED : CORN_ORANGE;
    parts.push({ ...box(thickness, head ? 0.03 : thickness * 0.7, head ? 0.07 : 0.05, 0, SNAKE_FLOOR, 0, color), motion: 'snake', along: -index * SNAKE_SPACING });
  }
  // Eyes either side of the head, and the tongue in front of it.
  parts.push({ ...box(0.056, 0.012, 0.012, 0, SNAKE_FLOOR + 0.022, 0.012, NEAR_BLACK), motion: 'snake', along: 0 });
  parts.push({ ...box(0.008, 0.005, 0.05, 0, SNAKE_FLOOR + 0.01, 0.05, 0xd8344a), motion: 'snake-tongue', along: 0 });
  return parts;
}

/** Where a hammock's ropes are tied on, which it swings from. */
export const HAMMOCK_PIVOT_Y = 1.08;

/** How far a hammock has swung to one side at this moment, in radians: a slow, lazy sway, never quite the same twice. */
export function hammockSwing(time: number): number {
  return Math.sin(time * 1.4) * 0.06 + Math.sin(time * 0.53 + 1) * 0.02;
}

/** How far below the ground a pool's water and its floor are, and a spa's. */
export const POOL_WATER = -0.12;
export const POOL_FLOOR = -1.2;
export const SPA_FLOOR = -0.65;
/** The top of a spa's bench, round the inside, a step down from the edge. */
export const SPA_SEAT = -0.38;

/** The fish tank's sand, which its plants and treasure chest stand on. */
const AQUARIUM_SAND = 0.75;
/** The treasure chest in the fish tank, and the back edge of its lid, which it opens on. */
const CHEST = { x: -0.32, z: 0.06, top: AQUARIUM_SAND + 0.08 };

/** A water plant built from stacked pieces that sway more the higher they are. */
function waterPlant(x: number, z: number, heights: number[], width: number, color: number): FurniturePart[] {
  let y = AQUARIUM_SAND;
  return heights.map((height, i) => {
    const piece = moving(box(width * (1 - i * 0.12), height, 0.03, x, y, z, color), 'sway');
    y += height;
    return piece;
  });
}

/** A little treasure chest whose lid creaks open every so often to let out a stream of bubbles, with gold inside. */
function treasureChest(): FurniturePart[] {
  const { x, z, top } = CHEST;
  const gold = 0xd9a832;
  const hinge: [number, number, number] = [x, top, z - 0.06];
  const bubbles: FurniturePart[] = [];
  for (let i = 0; i < 6; i++) bubbles.push(moving(box(0.03, 0.03, 0.03, x + (i % 3 - 1) * 0.03, top + 0.02, z + 0.01, WHITE, 0.85), 'chest-bubble'));
  return [
    box(0.17, 0.08, 0.12, x, AQUARIUM_SAND, z, 0x8b5a2b),
    box(0.175, 0.015, 0.125, x, AQUARIUM_SAND + 0.035, z, gold),
    box(0.03, 0.03, 0.012, x, AQUARIUM_SAND + 0.035, z + 0.062, gold),
    box(0.14, 0.008, 0.09, x, top - 0.006, z, 0xf2c94c),
    { ...box(0.17, 0.04, 0.12, x, top, z, 0x9a6634), motion: 'chest-lid', pivot: hinge },
    { ...box(0.175, 0.012, 0.125, x, top + 0.035, z, gold), motion: 'chest-lid', pivot: hinge },
    ...bubbles,
  ];
}

// The gecko tank: a tall, narrow glass tank on a small stand, with its floor at this height.
const GECKO_FLOOR = 0.62;
/** The inside faces of the front and right-hand glass, where the geckos cling. */
const GECKO_FRONT_GLASS = 0.232;
const GECKO_SIDE_GLASS = 0.292;
/** Where a gecko is built, lying flat and facing +x, before it starts climbing about. */
const GECKO_HOME: [number, number, number] = [0, GECKO_FLOOR, 0];

/** A small gecko: body, head and eyes, a tail, four legs splayed out and sticky toe pads, all moving together. */
function geckoParts(motion: 'gecko' | 'gecko2', colors: { body: number; head: number; spots: number; pads: number }): FurniturePart[] {
  const [x, y, z] = GECKO_HOME;
  const part = (w: number, h: number, d: number, dx: number, dy: number, dz: number, color: number) => moving(box(w, h, d, x + dx, y + dy, z + dz, color), motion);
  const parts = [
    part(0.075, 0.022, 0.04, 0, 0.008, 0, colors.body),
    part(0.038, 0.022, 0.034, 0.052, 0.008, 0, colors.head),
    part(0.01, 0.01, 0.01, 0.062, 0.022, -0.016, NEAR_BLACK),
    part(0.01, 0.01, 0.01, 0.062, 0.022, 0.016, NEAR_BLACK),
    part(0.05, 0.016, 0.022, -0.06, 0.01, 0, colors.body),
    part(0.04, 0.012, 0.014, -0.103, 0.011, 0, colors.body),
    part(0.014, 0.004, 0.014, -0.015, 0.03, 0, colors.spots),
    part(0.014, 0.004, 0.014, 0.018, 0.03, 0, colors.spots),
  ];
  for (const dx of [-0.025, 0.025]) {
    for (const side of [-1, 1]) {
      parts.push(part(0.014, 0.008, 0.03, dx, 0.002, side * 0.032, colors.body));
      parts.push(part(0.018, 0.005, 0.018, dx + 0.004, 0, side * 0.05, colors.pads));
    }
  }
  return parts;
}

/** Book colors, muted like spines on a real shelf. */
const BOOK_COLORS = [0xc0504d, 0x4f81bd, 0x9bbb59, 0xf0c94d, 0x8064a2, 0x2f6f6a, 0xd98b4a, 0x7a3b3b, 0x3d5a80, 0xe8dcc0, 0x5b8c5a, 0xb5485f, 0x34495e, 0xc9a66b];

/**
 * A shelf's worth of books standing side by side, each its own tall strip of
 * color, with a gap here and there and a short stack lying flat. The same
 * `seed` always gives the same row, so a shelf doesn't reshuffle itself.
 */
function bookRow(fromX: number, toX: number, shelfY: number, room: number, seed: number): FurniturePart[] {
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const books: FurniturePart[] = [];
  const depth = 0.22;
  const z = -0.06;
  let x = fromX;
  // Somewhere along the row, a few books lie flat in a stack instead.
  const stackAt = fromX + (toX - fromX) * (0.2 + random() * 0.6);
  let stacked = false;
  while (x < toX) {
    if (!stacked && x >= stackAt && x + 0.26 < toX) {
      stacked = true;
      let top = shelfY;
      for (let i = 0; i < 3 + Math.floor(random() * 2); i++) {
        const thick = 0.035 + random() * 0.02;
        books.push(box(0.2 + random() * 0.05, thick, depth - 0.02, x + 0.13 + (random() - 0.5) * 0.02, top, z, BOOK_COLORS[Math.floor(random() * BOOK_COLORS.length)]));
        top += thick;
      }
      x += 0.29;
      continue;
    }
    // Now and then, a gap where a book's been taken out.
    if (random() < 0.06) {
      x += 0.05 + random() * 0.05;
      continue;
    }
    const width = 0.03 + random() * 0.035;
    if (x + width > toX) break;
    const height = room * (0.62 + random() * 0.3);
    books.push(box(width - 0.004, height, depth, x + width / 2, shelfY, z, BOOK_COLORS[Math.floor(random() * BOOK_COLORS.length)]));
    x += width;
  }
  return books;
}

/** The floor's top surface, which a rug lies on. */
const FLOOR_TOP = 0.06;

/** Streaks of water spread under a shower head, each falling from the head to the floor at its own moment. */
function showerRain(): FurniturePart[] {
  const drops: FurniturePart[] = [];
  for (let i = 0; i < 22; i++) {
    // Scattered around under the head, nearer the middle than the edge.
    const angle = i * 2.4;
    const reach = 0.04 + ((i * 7) % 6) * 0.035;
    drops.push(moving(box(0.024, 0.2, 0.024, Math.cos(angle) * reach, 0.08 + SHOWER_FALL - 0.2, -0.1 + Math.sin(angle) * reach, 0x5ab8f0, 0.9), 'rain'));
  }
  return drops;
}

/** A pale ring on a bath's surface around the pawn lying in it, where the water meets them. */
function rippleRing(y: number): FurniturePart[] {
  const halfW = 0.25;
  const halfD = 0.58;
  const ring = (w: number, d: number, x: number, z: number) => moving(box(w, 0.006, d, x, y, z, 0xe6f6ff, 0.8), 'ripple');
  return [ring(halfW * 2, 0.03, 0, -halfD), ring(halfW * 2, 0.03, 0, halfD), ring(0.03, halfD * 2, -halfW, 0), ring(0.03, halfD * 2, halfW, 0)];
}

/** A row of flowers on stems along a flower bed, one for each color, at this depth across the bed. */
function flowerRow(z: number, colors: number[]): FurniturePart[] {
  return colors.flatMap((color, i) => {
    const x = -0.75 + (i * 1.5) / (colors.length - 1);
    return [box(0.025, 0.12, 0.025, x, 0.14, z, 0x5aa83a), box(0.09, 0.07, 0.09, x, 0.26, z, color)];
  });
}

/** A rug this big: a border with a lighter middle. */
function rugParts(w: number, d: number, middle: number): FurniturePart[] {
  // With a color picked, the middle takes it and the border goes a shade darker.
  return [following(box(w, 0.015, d, 0, FLOOR_TOP), 0.7), following(box(w - 0.24, 0.02, d - 0.24, 0, FLOOR_TOP, 0, middle))];
}

/** Four legs at the corners of a top this wide and deep, reaching up to `height`. */
function legs(w: number, d: number, height: number, color?: number): FurniturePart[] {
  const x = w / 2 - 0.05;
  const z = d / 2 - 0.05;
  return [box(0.07, height, 0.07, -x, 0, -z, color), box(0.07, height, 0.07, x, 0, -z, color), box(0.07, height, 0.07, -x, 0, z, color), box(0.07, height, 0.07, x, 0, z, color)];
}

/** A table top on four legs. */
function tableParts(w: number, d: number, height: number): FurniturePart[] {
  return [box(w, 0.06, d, 0, height - 0.06), ...legs(w, d, height - 0.06)];
}

const COUNTER_WOOD = 0xa98a64;
const COUNTER_TOP = 0xe6e0d4;
/** Half the depth of a counter's cabinet, and of its top, which hangs over a little. */
const CABINET_HALF_DEPTH = 0.36;
const TOP_HALF_DEPTH = 0.4;

/**
 * A counter's shape, worked out from what it joins. On its own or in a
 * straight run it's a full cell wide. Where another run meets it from the
 * front or back it's the corner: it reaches out to meet that run, and stops
 * short on any side with nothing beyond, so the outside edges of both runs
 * line up.
 */
/** What's built into a stretch of counter: nothing, a sink, or a stove with an oven under it. */
type CounterKind = 'counter' | 'sink' | 'stove' | 'dishwasher';

/** Which kind of counter a piece is, for the pieces that join into a run of counters. */
function counterKind(type: string): CounterKind {
  return type === 'counter-sink' ? 'sink' : type === 'stove' ? 'stove' : type === 'dishwasher' ? 'dishwasher' : 'counter';
}

function counterParts(joins: CounterJoins, kind: CounterKind): FurniturePart[] {
  const corner = joins.front || joins.back;
  const left = !corner || joins.left;
  const right = !corner || joins.right;

  /** One layer of the counter, `half` deep either side of the middle. */
  const layer = (half: number, y: number, h: number, color?: number): FurniturePart[] => {
    const from = left ? -0.5 : -half;
    const to = right ? 0.5 : half;
    const reach = 0.5 - half;
    const parts = [box(to - from, h, half * 2, (from + to) / 2, y, 0, color)];
    if (joins.front) parts.push(box(half * 2, h, reach, 0, y, half + reach / 2, color));
    if (joins.back) parts.push(box(half * 2, h, reach, 0, y, -half - reach / 2, color));
    return parts;
  };

  // A stove's body is its own steel, with a black cooktop where the counter top would be.
  // A sink's bowl is sunk through the top into the cabinet, so both are built round it instead of over it.
  const [cabinet, ...cabinetJoins] = layer(CABINET_HALF_DEPTH, 0, 0.75);
  const [top, ...topJoins] = layer(TOP_HALF_DEPTH, 0.75, 0.06, kind === 'stove' ? NEAR_BLACK : COUNTER_TOP);
  const parts = kind === 'sink' ? [...cabinetJoins, ...topJoins] : [cabinet, ...cabinetJoins, top, ...topJoins];
  if (kind === 'sink') {
    const across = { w: cabinet.size[0], x: cabinet.at[0] };
    const bowl = { w: 0.5, d: 0.4, z: 0.03 };
    parts.push({ ...box(across.w, 0.6, CABINET_HALF_DEPTH * 2, across.x, 0, 0) });
    parts.push(...sunkBasin({ w: across.w, d: CABINET_HALF_DEPTH * 2, z: 0, x: across.x }, bowl, 0.6, 0.75));
    parts.push(...sunkBasin({ w: top.size[0], d: TOP_HALF_DEPTH * 2, z: 0, x: top.at[0] }, bowl, 0.75, 0.81, COUNTER_TOP));
  }
  // The drawer line, which a corner leaves off since its front is mostly hidden.
  if (!joins.front && kind === 'counter') parts.push(box(0.8, 0.02, 0.02, 0, 0.5, CABINET_HALF_DEPTH, DARK_WOOD));
  if (kind === 'dishwasher' && !joins.front) parts.push(...dishwasherFront());
  if (kind === 'stove') parts.push(...stoveTop(), ...(joins.front ? [] : ovenFront()));
  if (kind === 'sink') {
    parts.push(
      // A steel lip round the bowl, steel walls down inside it, and its floor with a drain.
      ...sunkBasin({ w: 0.58, d: 0.48, z: 0.03 }, { w: 0.5, d: 0.4, z: 0.03 }, 0.81, 0.818, STEEL),
      ...basinLining({ w: 0.5, d: 0.4, z: 0.03 }, 0.6, 0.81, 0x9aa5ab),
      box(0.5, 0.012, 0.4, 0, 0.6, 0.03, 0x6f7a80),
      box(0.06, 0.004, 0.06, 0, 0.612, 0.05, 0x3a4044),
      box(0.05, 0.28, 0.05, 0, 0.81, -0.3, STEEL),
      box(0.04, 0.04, 0.16, 0, 1.05, -0.24, STEEL),
      moving(box(0.025, 0.44, 0.025, 0, 0.61, -0.165, WATER, 0.75), 'water'),
    );
  }
  return parts;
}

const LONE_COUNTER: CounterJoins = { left: false, right: false, front: false, back: false };

/** A slab from `y` up to `top`, `outer` wide and deep, with a `hole` cut through it for a bowl: the four pieces round the hole. */
function sunkBasin(outer: { w: number; d: number; z: number; x?: number }, hole: { w: number; d: number; z: number }, y: number, top: number, color?: number): FurniturePart[] {
  const h = top - y;
  const ox = outer.x ?? 0;
  const [left, right] = [ox - outer.w / 2, ox + outer.w / 2];
  const [back, front] = [outer.z - outer.d / 2, outer.z + outer.d / 2];
  const [holeLeft, holeRight] = [-hole.w / 2, hole.w / 2];
  const [holeBack, holeFront] = [hole.z - hole.d / 2, hole.z + hole.d / 2];
  const piece = (x0: number, x1: number, z0: number, z1: number) => box(x1 - x0, h, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, color);
  return [
    piece(left, right, back, holeBack),
    piece(left, right, holeFront, front),
    piece(left, holeLeft, holeBack, holeFront),
    piece(holeRight, right, holeBack, holeFront),
  ];
}

/** Thin walls lining the inside of a bowl, from `y` up to `top`. */
function basinLining(hole: { w: number; d: number; z: number }, y: number, top: number, color: number): FurniturePart[] {
  const h = top - y;
  const t = 0.012;
  return [
    box(hole.w, h, t, 0, y, hole.z - hole.d / 2 + t / 2, color),
    box(hole.w, h, t, 0, y, hole.z + hole.d / 2 - t / 2, color),
    box(t, h, hole.d, -hole.w / 2 + t / 2, y, hole.z, color),
    box(t, h, hole.d, hole.w / 2 - t / 2, y, hole.z, color),
  ];
}

/** A counter, booth seat or sectional seat, shaped to the pieces of its kind it runs into. */
function joinedParts(kind: JoinKind, joins: CounterJoins, type: string): FurniturePart[] {
  if (kind === 'booth') return boothParts(joins);
  if (kind === 'sectional') return sectionalParts(joins);
  return counterParts(joins, counterKind(type));
}

/** A span from one edge to the other, as a box's width and middle. */
function span(from: number, to: number): [number, number] {
  return [to - from, (from + to) / 2];
}

const BOOTH_WOOD = 0x6b4a2e;
const BOOTH_VINYL = 0xb8453c;
const BOOTH_SEAM = 0x8f3029;
/** A booth's back is flush with the back of its square, so two booths back to back make one tall divider. */
const BOOTH_BACK = -0.5;
const BOOTH_BACK_DEPTH = 0.2;
const BOOTH_SEAT_FRONT = 0.3;
const BOOTH_SEAT = 0.45;
const BOOTH_TOP = 1.2;

/**
 * A diner booth seat: a padded bench with a tall back. Its ends are open, so
 * a pawn can slide along it, and only the back gets a wooden end cap. Where a
 * run turns a corner, the corner seat gets a back down the outside of the L
 * too, meeting the other run's back.
 */
function boothParts(joins: CounterJoins): FurniturePart[] {
  const corner = joins.front;
  const innerBack = BOOTH_BACK + BOOTH_BACK_DEPTH;
  // The seat runs right up to a joined side, so the cushions meet, and up to the side back round a corner.
  const left = joins.left ? -0.5 : corner && joins.bend === -1 ? innerBack : -0.46;
  const right = joins.right ? 0.5 : corner && joins.bend === 1 ? -innerBack : 0.46;
  const parts: FurniturePart[] = [];
  /** The wooden base and the cushion on it, over this stretch of the seat. */
  const seat = (from: number, to: number, back: number, front: number) => {
    const [w, x] = span(from, to);
    const [d, z] = span(back, front);
    parts.push(box(w, BOOTH_SEAT - 0.1, d - 0.04, x, 0, z - 0.02, BOOTH_WOOD), following(box(w, 0.1, d, x, BOOTH_SEAT - 0.1, z, BOOTH_VINYL)));
  };
  seat(left, right, innerBack, BOOTH_SEAT_FRONT);
  // Round a corner, the seat carries on forward to meet the other run's.
  if (corner) seat(-BOOTH_SEAT_FRONT, BOOTH_SEAT_FRONT, BOOTH_SEAT_FRONT, 0.5);
  const backFrom = joins.left ? -0.5 : -0.46;
  const backTo = joins.right ? 0.5 : 0.46;
  /** A tall back along one edge: wood behind, a padded face, and a cap along the top. */
  const back = (alongX: boolean, from: number, to: number, at: number, facing: number): FurniturePart[] => {
    const [length, middle] = span(from, to);
    const sized = (thickness: number, offset: number, y: number, h: number, color: number) =>
      alongX ? box(length, h, thickness, middle, y, at + offset * facing, color) : box(thickness, h, length, at + offset * facing, y, middle, color);
    return [
      sized(BOOTH_BACK_DEPTH - 0.08, 0, 0, BOOTH_TOP, BOOTH_WOOD),
      following(sized(0.1, (BOOTH_BACK_DEPTH - 0.08) / 2 + 0.05, BOOTH_SEAT, BOOTH_TOP - BOOTH_SEAT - 0.08, BOOTH_VINYL)),
      following(sized(0.02, (BOOTH_BACK_DEPTH - 0.08) / 2 + 0.1, BOOTH_SEAT + 0.32, 0.03, BOOTH_SEAM), 0.78),
      sized(BOOTH_BACK_DEPTH + 0.02, 0.04, BOOTH_TOP, 0.05, BOOTH_WOOD),
    ];
  };
  const backMiddle = BOOTH_BACK + (BOOTH_BACK_DEPTH - 0.08) / 2;
  parts.push(...back(true, backFrom, backTo, backMiddle, 1));
  if (corner && joins.bend) parts.push(...back(false, BOOTH_BACK, 0.5, joins.bend * -backMiddle, -joins.bend));
  // Wooden caps on the ends of the back that don't carry on into another booth.
  for (const side of [-1, 1] as const) {
    const joined = side < 0 ? joins.left : joins.right;
    if (joined || (corner && joins.bend === side)) continue;
    parts.push(box(0.05, BOOTH_TOP + 0.05, BOOTH_BACK_DEPTH + 0.06, side * 0.475, 0, BOOTH_BACK + (BOOTH_BACK_DEPTH + 0.06) / 2, BOOTH_WOOD));
  }
  return parts;
}

const SECTIONAL = 0x8c9c8a;
const SECTIONAL_BASE = 0x6f7d6d;
const SECTIONAL_PILLOW = 0xe3d7bf;
const SECTIONAL_EDGE = 0.42;
const SECTIONAL_BACK_DEPTH = 0.22;
const SECTIONAL_SEAT = 0.5;
const SECTIONAL_TOP = 0.88;

/**
 * One seat of a sectional sofa. Seats side by side make a long sofa, with
 * arms only at the two ends, and a seat in front of the end of a row,
 * turned to face along it, turns the corner into an L. The corner seat then
 * has backs on two sides and a cushion in the corner.
 */
function sectionalParts(joins: CounterJoins): FurniturePart[] {
  const corner = joins.front;
  const back = -SECTIONAL_EDGE;
  const innerBack = back + SECTIONAL_BACK_DEPTH;
  const edge = (side: -1 | 1) => ((side < 0 ? joins.left : joins.right) ? side * 0.5 : side * SECTIONAL_EDGE);
  const [w, x] = span(edge(-1), edge(1));
  const [d, z] = span(back, SECTIONAL_EDGE);
  const parts: FurniturePart[] = [
    following(box(w, 0.2, d, x, 0.04, z, SECTIONAL_BASE), 0.8),
    box(0.05, 0.04, 0.05, edge(-1) * 0.9, 0, back + 0.06, NEAR_BLACK),
    box(0.05, 0.04, 0.05, edge(1) * 0.9, 0, back + 0.06, NEAR_BLACK),
  ];
  // The seat cushion, a little short of the edges so neighboring cushions show a seam.
  const cushionFrom = (corner && joins.bend === -1 ? -SECTIONAL_EDGE + SECTIONAL_BACK_DEPTH : edge(-1)) + 0.01;
  const cushionTo = (corner && joins.bend === 1 ? SECTIONAL_EDGE - SECTIONAL_BACK_DEPTH : edge(1)) - 0.01;
  const [cw, cx] = span(cushionFrom, cushionTo);
  const [cd, cz] = span(innerBack, SECTIONAL_EDGE - 0.01);
  parts.push(box(cw, SECTIONAL_SEAT - 0.24, cd, cx, 0.24, cz));
  if (corner) {
    // Round a corner, the seat carries on forward to meet the other run's.
    const [ew, ex] = span(-SECTIONAL_EDGE, SECTIONAL_EDGE);
    const [ed, ez] = span(SECTIONAL_EDGE, 0.5);
    parts.push(following(box(ew, 0.2, ed, ex, 0.04, ez, SECTIONAL_BASE), 0.8), box(ew - 0.02, SECTIONAL_SEAT - 0.24, ed + 0.01, ex, 0.24, ez - 0.005));
  }
  // The back along the back edge, and round the outside of the corner.
  parts.push(box(w, SECTIONAL_TOP - 0.24, SECTIONAL_BACK_DEPTH, x, 0.24, back + SECTIONAL_BACK_DEPTH / 2));
  if (corner && joins.bend) {
    const [sd, sz] = span(back, 0.5);
    parts.push(box(SECTIONAL_BACK_DEPTH, SECTIONAL_TOP - 0.24, sd, joins.bend * (SECTIONAL_EDGE - SECTIONAL_BACK_DEPTH / 2), 0.24, sz));
    // A cushion propped in the corner.
    parts.push({ ...box(0.3, 0.26, 0.15, joins.bend * 0.1, SECTIONAL_SEAT, innerBack + 0.1, SECTIONAL_PILLOW), turn: (-joins.bend * Math.PI) / 4 });
  }
  // Arms on the ends that don't carry on into another seat.
  for (const side of [-1, 1] as const) {
    const joined = side < 0 ? joins.left : joins.right;
    if (joined || (corner && joins.bend === side)) continue;
    parts.push(box(0.16, SECTIONAL_SEAT + 0.2 - 0.24, d, side * (SECTIONAL_EDGE - 0.08), 0.24, z));
  }
  return parts;
}

/** Two burners on the cooktop, which glow while someone's cooking, and a pot on the back one. */
function stoveTop(): FurniturePart[] {
  return [
    moving(box(0.28, 0.012, 0.28, -0.2, 0.81, -0.12, BURNER_OFF), 'burner'),
    moving(box(0.22, 0.012, 0.22, 0.2, 0.81, 0.15, BURNER_OFF), 'burner'),
    box(0.2, 0.14, 0.2, -0.2, 0.822, -0.12, STEEL),
    box(0.12, 0.025, 0.03, -0.03, 0.93, -0.12, NEAR_BLACK),
  ];
}

/** The hinge along the bottom of a dishwasher's door, which drops open toward you. */
const DISHWASHER_HINGE: [number, number, number] = [0, 0.04, CABINET_HALF_DEPTH + 0.015];

/** A steel dishwasher door with a handle and a control strip, and behind it, racks of plates and cups that show when it drops open. */
function dishwasherFront(): FurniturePart[] {
  const front = CABINET_HALF_DEPTH;
  const dropping = (part: FurniturePart): FurniturePart => ({ ...part, motion: 'drop-door', pivot: DISHWASHER_HINGE });
  const inside: FurniturePart[] = [
    box(0.76, 0.64, 0.004, 0, 0.05, front + 0.002, 0x3a3f44),
    box(0.72, 0.012, 0.006, 0, 0.1, front + 0.006, 0x9aa3a8),
    box(0.72, 0.012, 0.006, 0, 0.38, front + 0.006, 0x9aa3a8),
    ...[-0.28, -0.2, -0.12, -0.04, 0.04, 0.12, 0.2, 0.28].map((x) => box(0.018, 0.16, 0.006, x, 0.11, front + 0.008, WHITE)),
    ...[-0.24, -0.08, 0.08, 0.24].map((x, i) => box(0.08, 0.08, 0.006, x, 0.4, front + 0.008, [0xe8556b, WHITE, 0x8fc3e0, WHITE][i])),
  ];
  return [
    ...inside,
    box(0.78, 0.05, 0.012, 0, 0.7, front + 0.006, NEAR_BLACK),
    glowingBox(0.03, 0.015, 0.004, 0.3, 0.717, front + 0.013, 0x6fdc8c),
    dropping(box(0.78, 0.64, 0.03, 0, 0.04, front + 0.015, 0xc5ccd0)),
    dropping(box(0.5, 0.025, 0.03, 0, 0.6, front + 0.045, STEEL)),
  ];
}

/** The oven door with its window and handle, and the knobs above it. */
function ovenFront(): FurniturePart[] {
  const front = CABINET_HALF_DEPTH;
  return [
    box(0.66, 0.42, 0.02, 0, 0.12, front + 0.01, NEAR_BLACK),
    box(0.42, 0.2, 0.012, 0, 0.22, front + 0.022, 0x3a3f44),
    box(0.5, 0.025, 0.035, 0, 0.5, front + 0.03, STEEL),
    ...[-0.3, -0.1, 0.1, 0.3].map((x) => box(0.05, 0.05, 0.03, x, 0.63, front + 0.015, NEAR_BLACK)),
  ];
}

/** The axis a counter runs along: across its front. */
function runAxis(rotation: number): 'x' | 'z' {
  return rotation === 90 || rotation === 270 ? 'z' : 'x';
}

type Placed = { type: string; x: number; z: number; rotation: number };

/** A step in a piece's own frame, turned the way the piece is, the same turn its mesh gets. */
function turnStep(rotation: number, localX: number, localZ: number): { dx: number; dz: number } {
  const angle = THREE.MathUtils.degToRad(rotation);
  return { dx: Math.round(localX * Math.cos(angle) + localZ * Math.sin(angle)) + 0, dz: Math.round(-localX * Math.sin(angle) + localZ * Math.cos(angle)) + 0 };
}

/** The other way: a step in the lot, as a step in the piece's own frame. */
function unturnStep(rotation: number, dx: number, dz: number): { x: number; z: number } {
  const angle = THREE.MathUtils.degToRad(rotation);
  return { x: Math.round(dx * Math.cos(angle) - dz * Math.sin(angle)) + 0, z: Math.round(dx * Math.sin(angle) + dz * Math.cos(angle)) + 0 };
}

/**
 * The piece one step from this one, in its own frame, if the two run into
 * each other. Pieces side by side always join. One in front or behind joins
 * only if it runs toward this one, which is what makes an L; two rows back to
 * back stay apart. Seats never join from behind, since that's their back, and
 * two seats side by side join only if they face the same way, or one is the
 * corner of an L.
 */
function joinedNeighbor<T extends Placed>(piece: Placed, others: readonly T[], localX: number, localZ: number): T | undefined {
  const kind = getFurnitureDef(piece.type).joins;
  if (!kind) return undefined;
  const seat = kind !== 'counters';
  if (seat && localZ < 0) return undefined;
  const { dx, dz } = turnStep(piece.rotation, localX, localZ);
  // These are all one square, so a neighbor sits right where it's anchored. A rug could be anchored there too.
  const neighbor = others.find((other) => other.x === piece.x + dx && other.z === piece.z + dz && getFurnitureDef(other.type).joins === kind);
  if (!neighbor) return undefined;
  const axis = dx !== 0 ? 'x' : 'z';
  if (runAxis(piece.rotation) !== axis && runAxis(neighbor.rotation) !== axis) return undefined;
  if (seat && localX !== 0 && Math.abs(piece.rotation - neighbor.rotation) === 180) return undefined;
  return neighbor;
}

/** Which sides of a counter, booth seat or sectional seat at this spot join the pieces of its kind around it. */
export function counterJoins(piece: Placed, others: readonly Placed[]): CounterJoins {
  const front = joinedNeighbor(piece, others, 0, 1);
  const joins: CounterJoins = {
    left: joinedNeighbor(piece, others, -1, 0) !== undefined,
    right: joinedNeighbor(piece, others, 1, 0) !== undefined,
    front: front !== undefined,
    back: joinedNeighbor(piece, others, 0, -1) !== undefined,
  };
  if (front && getFurnitureDef(piece.type).joins !== 'counters') {
    // The way the other run's back faces, in this seat's frame.
    const forward = turnStep(front.rotation, 0, 1);
    const back = unturnStep(piece.rotation, -forward.dx, -forward.dz);
    if (back.x !== 0) joins.bend = back.x < 0 ? -1 : 1;
  }
  return joins;
}

/** Every piece this one runs into, all the way along the run and round any corner, itself included. */
export function joinedRun<T extends Placed>(piece: T, others: readonly T[]): T[] {
  const run = [piece];
  for (let i = 0; i < run.length; i++) {
    for (const [localX, localZ] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
      const neighbor = joinedNeighbor(run[i], others, localX, localZ);
      if (neighbor && !run.includes(neighbor)) run.push(neighbor);
    }
  }
  return run;
}

/** The steps out from a seat in a run that a pawn can get onto it from, in the seat's own frame. */
export function seatEntrances(piece: Placed, others: readonly Placed[]): { x: number; z: number }[] {
  const def = getFurnitureDef(piece.type);
  const joins = counterJoins(piece, others);
  const entrances: { x: number; z: number }[] = [];
  if (!joins.front) entrances.push({ x: 0, z: 1 });
  // A booth is slid into from the open end of its bench, past the table.
  if (def.joins === 'booth') {
    if (!joins.left && joins.bend !== -1) entrances.push({ x: -1, z: 0 });
    if (!joins.right && joins.bend !== 1) entrances.push({ x: 1, z: 0 });
  }
  return entrances.map(({ x, z }) => {
    const { dx, dz } = turnStep(piece.rotation, x, z);
    return { x: dx, z: dz };
  });
}

/** The face of the wall behind a square, in the piece's own frame, where wall art hangs. */
const WALL_FACE = -0.5 + 0.04;
/** How deep a picture frame stands out from the wall. */
const FRAME_DEPTH = 0.035;

/** A picture frame hung on the wall, `w` wide and `h` tall, with its underside at `y`. */
function frame(w: number, h: number, x: number, y: number, color: number, depth = FRAME_DEPTH): FurniturePart {
  return box(w, h, depth, x, y, WALL_FACE + depth / 2, color);
}

/** A patch of paint on a canvas hung on the wall. Higher `layer`s sit just in front of lower ones, so shapes can overlap without flickering. */
function paint(w: number, h: number, x: number, y: number, color: number, layer = 0, depth = FRAME_DEPTH): FurniturePart {
  return box(w, h, 0.004, x, y, WALL_FACE + depth + 0.002 + layer * 0.004, color);
}

/** A picture, poster or clock that hangs on the wall, `w` squares wide. Spread into the catalog. */
function wallArt(type: string, label: string, emoji: string, w: number, color: number, parts: FurniturePart[], thoughts = ['🤔', '🎨', '😌']): FurnitureDef[] {
  return [{ type, label, emoji, category: 'wallart', footprint: { w, d: 1 }, color, height: 1.4, use: 'stand', thoughts, advertises: { fun: 6 }, activity: 'admire', approach: 'front', onWall: true, parts }];
}

/** A row of framed photos and prints of different sizes, hung together. */
function collageParts(): FurniturePart[] {
  const pieces: [number, number, number, number, number, number, number][] = [
    // width, height, x, bottom, frame color, photo color, accent color
    [0.34, 0.44, -0.62, 1.0, DARK_WOOD, 0x8fc3e0, 0x6aa84f],
    [0.26, 0.2, -0.62, 1.5, WHITE, 0xf4a261, 0xffe08a],
    [0.42, 0.3, -0.18, 1.32, 0x2b2b2b, 0xe8dcc0, 0xc0504d],
    [0.24, 0.3, -0.24, 0.92, 0xc9a24d, 0x3b5a40, 0xf1c27d],
    [0.2, 0.2, 0.06, 0.98, WHITE, 0xb39ddb, 0xffffff],
    [0.32, 0.42, 0.36, 1.12, DARK_WOOD, 0x2a6f97, 0xe8f4f8],
    [0.22, 0.18, 0.08, 1.7 - 0.18, 0xc9a24d, 0xf5d0dc, 0xe8556b],
    [0.2, 0.26, 0.66, 1.42, 0x2b2b2b, 0xf0c94d, 0x34495e],
    [0.2, 0.2, 0.68, 1.06, WHITE, 0x9bbb59, 0x5b8c5a],
  ];
  return pieces.flatMap(([w, h, x, y, rim, photo, accent]) => [
    frame(w, h, x, y, rim, 0.025),
    paint(w - 0.05, h - 0.05, x, y + 0.025, photo, 0, 0.025),
    paint((w - 0.05) * 0.45, (h - 0.05) * 0.4, x + (w - 0.05) * 0.12, y + 0.04, accent, 1, 0.025),
  ]);
}

/** A ginger cat sitting up, painted on a canvas, with its middle at `x` and its paws at `y`. Layers start at `layer`. */
function paintedCat(x: number, y: number, layer = 2, fur = 0xf0a04b, stripes = 0xc9772c): FurniturePart[] {
  return [
    // Tail curling up beside it.
    paint(0.04, 0.14, x + 0.14, y + 0.02, fur, layer),
    paint(0.07, 0.04, x + 0.15, y + 0.14, fur, layer),
    paint(0.24, 0.2, x, y, fur, layer),
    paint(0.18, 0.15, x, y + 0.19, fur, layer),
    paint(0.05, 0.06, x - 0.06, y + 0.33, fur, layer),
    paint(0.05, 0.06, x + 0.06, y + 0.33, fur, layer),
    paint(0.022, 0.03, x - 0.06, y + 0.34, 0xf5b5c8, layer + 1),
    paint(0.022, 0.03, x + 0.06, y + 0.34, 0xf5b5c8, layer + 1),
    paint(0.08, 0.1, x, y + 0.02, 0xfbf3e4, layer + 1),
    paint(0.06, 0.018, x - 0.07, y + 0.13, stripes, layer + 1),
    paint(0.06, 0.018, x + 0.07, y + 0.08, stripes, layer + 1),
    paint(0.06, 0.016, x, y + 0.31, stripes, layer + 1),
    paint(0.032, 0.032, x - 0.042, y + 0.26, 0x3c9a5f, layer + 1),
    paint(0.032, 0.032, x + 0.042, y + 0.26, 0x3c9a5f, layer + 1),
    paint(0.012, 0.024, x - 0.042, y + 0.264, NEAR_BLACK, layer + 2),
    paint(0.012, 0.024, x + 0.042, y + 0.264, NEAR_BLACK, layer + 2),
    paint(0.024, 0.016, x, y + 0.23, 0xe8556b, layer + 1),
    paint(0.07, 0.005, x - 0.09, y + 0.235, WHITE, layer + 1),
    paint(0.07, 0.005, x + 0.09, y + 0.235, WHITE, layer + 1),
    paint(0.05, 0.03, x - 0.06, y, fur, layer + 1),
    paint(0.05, 0.03, x + 0.06, y, fur, layer + 1),
  ];
}

/** A brown dog's head and shoulders, floppy ears and tongue out, with its chin at `y`. */
function paintedDog(x: number, y: number, layer = 2, coat = 0x9a6b44, ears = 0x5a3d26): FurniturePart[] {
  return [
    paint(0.3, 0.12, x, y - 0.12, coat, layer),
    paint(0.22, 0.03, x, y - 0.02, 0xc0504d, layer + 1),
    paint(0.035, 0.035, x, y - 0.05, 0xf2c230, layer + 2),
    paint(0.22, 0.22, x, y, coat, layer),
    paint(0.065, 0.17, x - 0.135, y + 0.03, ears, layer + 1),
    paint(0.065, 0.17, x + 0.135, y + 0.03, ears, layer + 1),
    paint(0.13, 0.09, x, y + 0.02, 0xf2e6d0, layer + 1),
    paint(0.045, 0.03, x, y + 0.085, NEAR_BLACK, layer + 2),
    paint(0.035, 0.05, x, y - 0.015, 0xe8556b, layer + 2),
    paint(0.032, 0.032, x - 0.05, y + 0.14, NEAR_BLACK, layer + 1),
    paint(0.032, 0.032, x + 0.05, y + 0.14, NEAR_BLACK, layer + 1),
    paint(0.012, 0.012, x - 0.045, y + 0.155, WHITE, layer + 2),
    paint(0.012, 0.012, x + 0.055, y + 0.155, WHITE, layer + 2),
    paint(0.08, 0.06, x + 0.05, y + 0.15, 0xf2e6d0, layer + 1),
  ];
}

/** A round-ish clock face on the wall, with hands that tell the real time. */
const CLOCK_CENTER: [number, number, number] = [0, 1.5, WALL_FACE + FRAME_DEPTH + 0.012];
function wallClockParts(): FurniturePart[] {
  const [, cy, cz] = CLOCK_CENTER;
  const ticks: FurniturePart[] = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    const long = i % 3 === 0;
    ticks.push(paint(long ? 0.025 : 0.014, long ? 0.025 : 0.014, Math.sin(angle) * 0.13, cy + Math.cos(angle) * 0.13 - 0.01, NEAR_BLACK, 1));
  }
  return [
    // An eight-sided rim, built from a square and a diamond's worth of corners cut off.
    frame(0.4, 0.24, 0, cy - 0.12, 0x6b4a2e),
    frame(0.24, 0.4, 0, cy - 0.2, 0x6b4a2e),
    frame(0.34, 0.34, 0, cy - 0.17, 0x6b4a2e),
    paint(0.3, 0.3, 0, cy - 0.15, 0xfbf6ea),
    paint(0.36, 0.18, 0, cy - 0.09, 0xfbf6ea),
    paint(0.18, 0.36, 0, cy - 0.18, 0xfbf6ea),
    ...ticks,
    { ...box(0.022, 0.09, 0.006, 0, cy, cz, NEAR_BLACK), motion: 'hour-hand', pivot: CLOCK_CENTER },
    { ...box(0.014, 0.13, 0.006, 0, cy, cz + 0.006, NEAR_BLACK), motion: 'minute-hand', pivot: CLOCK_CENTER },
    paint(0.03, 0.03, 0, cy - 0.015, 0xc9a24d, 4),
  ];
}

/** Which tab each small thing for tables goes in. Anything not listed is decor. */
const TABLETOP_CATEGORY: Record<string, FurnitureCategory> = {
  'table-lamp': 'lighting',
  'desk-lamp': 'lighting',
  candles: 'lighting',
  'coffee-maker': 'kitchen',
  toaster: 'kitchen',
  microwave: 'kitchen',
  kettle: 'kitchen',
  'cookie-jar': 'kitchen',
  'fruit-bowl': 'kitchen',
  bowl: 'kitchen',
  cake: 'kitchen',
  'tea-set': 'kitchen',
  laptop: 'electronics',
  radio: 'electronics',
  'alarm-clock': 'electronics',
  vase: 'plants',
  succulent: 'plants',
  cactus: 'plants',
  globe: 'hobbies',
  'teddy-bear': 'kids',
};

/** A small thing that sits on top of a table, counter or other piece that holds things, one square big. Spread into the catalog. */
function tabletop(type: string, label: string, emoji: string, color: number, parts: FurniturePart[], light?: LightSource): FurnitureDef[] {
  return [{ type, label, emoji, category: TABLETOP_CATEGORY[type] ?? 'decor', footprint: { w: 1, d: 1 }, color, height: 0.2, use: 'stand', thoughts: [emoji], advertises: {}, onTop: true, light, parts }];
}

/** What pawns get out of the small things they do something with, like a laptop. */
const TABLETOP_USES: Record<string, Partial<FurnitureDef>> = {
  laptop: { thoughts: ['💻', '😂', '🎮'], advertises: { fun: 20 }, activity: 'type', approach: 'front' },
  radio: { thoughts: ['📻', '🎶', '💃'], advertises: { fun: 12 }, activity: 'play' },
  'teddy-bear': { thoughts: ['🧸', '🥰'], advertises: { fun: 5 }, activity: 'admire' },
};

/** A small thing for a table that pawns use, not just look at. */
function usableTabletop(type: string, label: string, emoji: string, color: number, parts: FurniturePart[]): FurnitureDef[] {
  return tabletop(type, label, emoji, color, parts).map((def) => ({ ...def, ...TABLETOP_USES[type] }));
}

/** The globe that sits on a stand on a desk or shelf, with green land on its sides, turning slowly about its middle. */
const GLOBE_CENTER: [number, number, number] = [0, 0.18, 0];
function globeParts(): FurniturePart[] {
  const [, cy] = GLOBE_CENTER;
  const turning = (part: FurniturePart): FurniturePart => ({ ...part, motion: 'twirl', pivot: GLOBE_CENTER });
  const land = 0x6ab04c;
  return [
    turning(box(0.17, 0.17, 0.17, 0, cy - 0.085, 0, 0x4f81bd)),
    turning(box(0.07, 0.06, 0.006, 0.02, cy - 0.01, 0.086, land)),
    turning(box(0.006, 0.07, 0.08, 0.086, cy - 0.04, -0.02, land)),
    turning(box(0.06, 0.05, 0.006, -0.03, cy - 0.05, -0.086, land)),
    turning(box(0.006, 0.05, 0.06, -0.086, cy - 0.01, 0.03, land)),
    turning(box(0.08, 0.006, 0.07, 0, cy + 0.085, 0, WHITE)),
  ];
}

/** Half the side of a toy train's square of track, and how quickly the train goes round it, in laps a second. */
const TRAIN_HALF = 0.62;
const TRAIN_SPEED = 0.08;

/** Where along the square track a train car is, `lap` laps round from the front-right corner, and which way it's facing. */
function trainTrackAt(lap: number): { x: number; z: number; heading: number } {
  const t = (((lap % 1) + 1) % 1) * 4;
  const side = Math.floor(t);
  const f = (t - side) * 2 - 1;
  const h = TRAIN_HALF;
  // Each side in turn, going round anticlockwise seen from above.
  if (side === 0) return { x: h, z: -f * h, heading: Math.PI };
  if (side === 1) return { x: -f * h, z: -h, heading: -Math.PI / 2 };
  if (side === 2) return { x: -h, z: f * h, heading: 0 };
  return { x: f * h, z: h, heading: Math.PI / 2 };
}

/** The body of a wardrobe, open at the front, `w` wide and `h` tall, with a dark inside that shows when its door swings open. */
function wardrobeShell(w: number, h: number, y = 0): FurniturePart[] {
  return [
    box(w, h, 0.5, 0, y, -0.1),
    box(0.04, h, 0.15, -w / 2 + 0.02, y, 0.225),
    box(0.04, h, 0.15, w / 2 - 0.02, y, 0.225),
    box(w, 0.05, 0.15, 0, y + h - 0.05, 0.225),
    box(w, 0.05, 0.15, 0, y, 0.225),
    box(w - 0.08, h - 0.1, 0.005, 0, y + 0.05, 0.152, 0x3a2a1c),
  ];
}

/** A rail of clothes on hangers between `fromX` and `toX`, hanging down `length`, at depth `z`. */
function hangingClothes(fromX: number, toX: number, length: number, colors: number[], z = 0.2, rail = 1.45): FurniturePart[] {
  const parts: FurniturePart[] = [box(toX - fromX + 0.04, 0.02, 0.02, (fromX + toX) / 2, rail, z, STEEL)];
  const gap = (toX - fromX) / Math.max(1, colors.length - 1);
  colors.forEach((color, i) => {
    const drop = length * (0.75 + ((i * 37) % 10) / 40);
    parts.push(box(0.035, drop, 0.2, fromX + gap * i, rail - drop - 0.02, z, color));
  });
  return parts;
}

/** Lifts small things meant to lie on the floor up to the top of the floor, so they aren't half sunk into it. */
function onTheFloor(parts: FurniturePart[]): FurniturePart[] {
  return parts.map((part) => ({ ...part, at: [part.at[0], part.at[1] + FLOOR_TOP, part.at[2]] }));
}

/** A painted rocking horse on its rockers, facing forward, that rocks about the middle of its rockers. */
function rockingHorseParts(): FurniturePart[] {
  const rocking = (part: FurniturePart): FurniturePart => ({ ...part, motion: 'rock', pivot: [0, 0, 0] });
  const red = 0xc0504d;
  return [
    box(0.04, 0.04, 0.8, -0.16, 0, 0, red),
    box(0.04, 0.04, 0.8, 0.16, 0, 0, red),
    box(0.04, 0.03, 0.12, -0.16, 0.02, 0.4, red),
    box(0.04, 0.03, 0.12, 0.16, 0.02, -0.4, red),
    box(0.06, 0.25, 0.06, -0.12, 0.04, 0.22, 0xd9a35f),
    box(0.06, 0.25, 0.06, 0.12, 0.04, 0.22, 0xd9a35f),
    box(0.06, 0.25, 0.06, -0.12, 0.04, -0.22, 0xd9a35f),
    box(0.06, 0.25, 0.06, 0.12, 0.04, -0.22, 0xd9a35f),
    box(0.22, 0.16, 0.56, 0, 0.27, 0),
    box(0.24, 0.03, 0.22, 0, 0.42, -0.04, red),
    box(0.14, 0.26, 0.14, 0, 0.38, 0.25),
    box(0.14, 0.13, 0.26, 0, 0.6, 0.32),
    box(0.04, 0.24, 0.16, 0, 0.47, 0.18, DARK_WOOD),
    box(0.04, 0.16, 0.06, 0, 0.3, -0.3, DARK_WOOD),
    box(0.03, 0.03, 0.01, -0.06, 0.66, 0.42, NEAR_BLACK),
    box(0.03, 0.03, 0.01, 0.06, 0.66, 0.42, NEAR_BLACK),
    box(0.04, 0.06, 0.04, -0.05, 0.73, 0.25, 0xd9a35f),
    box(0.04, 0.06, 0.04, 0.05, 0.73, 0.25, 0xd9a35f),
  ].map(rocking);
}

/** A square of toy track on a green mat, with a little station and tree, and a train of an engine and two cars going round it. */
function trainSetParts(): FurniturePart[] {
  const h = TRAIN_HALF;
  const rail = 0x6b4a2e;
  const parts: FurniturePart[] = [
    box(1.85, 0.02, 1.85, 0, 0, 0),
    box(2 * h + 0.1, 0.02, 0.1, 0, 0.02, h, rail),
    box(2 * h + 0.1, 0.02, 0.1, 0, 0.02, -h, rail),
    box(0.1, 0.02, 2 * h + 0.1, h, 0.02, 0, rail),
    box(0.1, 0.02, 2 * h + 0.1, -h, 0.02, 0, rail),
    box(0.3, 0.16, 0.2, -0.15, 0.02, -0.1, 0xf5d0dc),
    box(0.36, 0.04, 0.26, -0.15, 0.18, -0.1, 0xc0504d),
    box(0.06, 0.12, 0.06, 0.25, 0.02, 0.2, DARK_WOOD),
    box(0.18, 0.18, 0.18, 0.25, 0.14, 0.2, 0x4f9a45),
  ];
  const train = (along: number, w: number, hgt: number, d: number, y: number, color: number): FurniturePart => ({ ...box(w, hgt, d, h, y, 0, color), motion: 'train', along });
  parts.push(train(0, 0.12, 0.1, 0.2, 0.04, 0xd8453a), train(0, 0.05, 0.08, 0.05, 0.14, NEAR_BLACK));
  parts.push(train(-0.06, 0.12, 0.08, 0.16, 0.04, 0x4f81bd), train(-0.115, 0.12, 0.08, 0.16, 0.04, 0xf0c94d));
  return onTheFloor(parts);
}

/** A straight rod from one point to another, like a tripod leg, a stem or a branch, `thickness` square. */
function rod(from: [number, number, number], to: [number, number, number], thickness: number, color: number): FurniturePart {
  const [dx, dy, dz] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const flat = Math.hypot(dx, dz);
  const length = Math.hypot(flat, dy);
  const middle: [number, number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  // Laid along x, tipped up, then turned to point the right way round.
  return { size: [length, thickness, thickness], at: [middle[0], middle[1] - thickness / 2, middle[2]], color, tilt: Math.atan2(dy, flat), turn: Math.atan2(-dz, dx) };
}

/** A point `distance` along a direction given by its turn and tilt, like `rod` uses, from `from`. */
function along(from: [number, number, number], turn: number, tilt: number, distance: number): [number, number, number] {
  return [from[0] + Math.cos(turn) * Math.cos(tilt) * distance, from[1] + Math.sin(tilt) * distance, from[2] - Math.sin(turn) * Math.cos(tilt) * distance];
}

const CHESS_LIGHT = 0xe8d9b5;
const CHESS_DARK = 0x3b2a1e;
const CHESS_WHITE = 0xf4efe2;
const CHESS_BLACK = 0x2a2522;
const CHESS_TOP = 0.74;
const CHESS_SQUARE = 0.0625;

/** A round pedestal table with a board on top and a game halfway through. */
function chessTableParts(): FurniturePart[] {
  const parts: FurniturePart[] = [
    box(0.42, 0.06, 0.42, 0, 0, 0, DARK_WOOD),
    box(0.1, 0.62, 0.1, 0, 0.06, 0, DARK_WOOD),
    box(0.72, 0.05, 0.72, 0, CHESS_TOP - 0.06),
    // The board, dark underneath with the light squares laid on it.
    box(0.54, 0.012, 0.54, 0, CHESS_TOP - 0.01, 0, CHESS_DARK),
  ];
  const square = (column: number): number => -0.25 + (column + 0.5) * CHESS_SQUARE;
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) if ((row + column) % 2 === 0) parts.push(box(CHESS_SQUARE, 0.014, CHESS_SQUARE, square(column), CHESS_TOP - 0.01, square(row), CHESS_LIGHT));
  }
  /** A piece on a square: its height and width say what it is. A crown or a cross on top makes a queen or a king. */
  const piece = (column: number, row: number, height: number, white: boolean, top?: 'crown' | 'cross') => {
    const color = white ? CHESS_WHITE : CHESS_BLACK;
    const [x, z] = [square(column), square(row)];
    const y = CHESS_TOP + 0.004;
    parts.push(box(0.04, 0.012, 0.04, x, y, z, color), box(0.026, height, 0.026, x, y + 0.012, z, color));
    if (top === 'crown') parts.push(box(0.034, 0.014, 0.034, x, y + 0.012 + height, z, color));
    if (top === 'cross') parts.push(box(0.012, 0.03, 0.012, x, y + 0.012 + height, z, color), box(0.03, 0.01, 0.01, x, y + 0.022 + height, z, color));
  };
  // White's side faces the front.
  piece(4, 7, 0.08, true, 'cross');
  piece(3, 5, 0.07, true, 'crown');
  piece(0, 7, 0.045, true);
  piece(6, 5, 0.05, true);
  for (const column of [0, 1, 5, 6, 7]) piece(column, 6, 0.028, true);
  piece(4, 3, 0.028, true);
  piece(4, 0, 0.08, false, 'cross');
  piece(2, 2, 0.07, false, 'crown');
  piece(7, 0, 0.045, false);
  piece(1, 0, 0.05, false);
  for (const column of [0, 1, 2, 6, 7]) piece(column, 1, 0.028, false);
  piece(4, 4, 0.028, false);
  // A taken piece of each color off the side of the board.
  piece(-1.6, 6, 0.028, false);
  piece(8.6, 1, 0.028, true);
  return parts;
}

const TELESCOPE_BLUE = 0x2f4a6b;
const TELESCOPE_MOUNT: [number, number, number] = [0, 1.02, -0.02];
const TELESCOPE_TILT = 0.62;
/** It points up and over the back, so a pawn stands at the eyepiece in front. */
const TELESCOPE_TURN = Math.PI / 2;

/** A brass-ringed telescope on a wooden tripod, pointing up at the sky. */
function telescopeParts(): FurniturePart[] {
  const [mx, my, mz] = TELESCOPE_MOUNT;
  const tube = (from: number, to: number, thickness: number, color: number) =>
    rod(along(TELESCOPE_MOUNT, TELESCOPE_TURN, TELESCOPE_TILT, from), along(TELESCOPE_MOUNT, TELESCOPE_TURN, TELESCOPE_TILT, to), thickness, color);
  return [
    // Three legs splayed out from the mount, and a tray between them.
    rod([-0.3, 0, 0.18], [mx - 0.03, my - 0.05, mz], 0.04, WOOD),
    rod([0.3, 0, 0.18], [mx + 0.03, my - 0.05, mz], 0.04, WOOD),
    rod([0, 0, -0.34], [mx, my - 0.05, mz - 0.03], 0.04, WOOD),
    box(0.2, 0.02, 0.2, 0, 0.42, -0.02, DARK_WOOD),
    box(0.1, 0.1, 0.1, mx, my - 0.07, mz, NEAR_BLACK),
    // The tube, wider at the far end, with brass rings, a finder scope on top and the eyepiece at the near end.
    tube(-0.32, 0.5, 0.11, TELESCOPE_BLUE),
    tube(0.36, 0.56, 0.14, TELESCOPE_BLUE),
    tube(0.5, 0.53, 0.15, BRASS),
    tube(-0.06, 0.02, 0.125, BRASS),
    tube(-0.34, -0.3, 0.12, BRASS),
    rod(along([mx, my + 0.1, mz], TELESCOPE_TURN, TELESCOPE_TILT, -0.1), along([mx, my + 0.1, mz], TELESCOPE_TURN, TELESCOPE_TILT, 0.15), 0.035, NEAR_BLACK),
    tube(-0.44, -0.34, 0.045, NEAR_BLACK),
    // The glass at the far end, catching the light.
    { ...tube(0.56, 0.565, 0.12, 0xa8d8f0), glow: true },
  ];
}

const BUG_CAGE_FLOOR = 0.56;
const BUG_CAGE_HALF = 0.2;
const BUG_CAGE_HEIGHT = 0.4;
const FIREFLY = 0xd8ff6a;

/** A wooden-framed mesh box on a little stand, with twigs, leaves and fireflies blinking inside. */
function bugCageParts(): FurniturePart[] {
  const h = BUG_CAGE_HALF;
  const floor = BUG_CAGE_FLOOR;
  const top = floor + BUG_CAGE_HEIGHT;
  const mesh = 0xd9e4d0;
  const parts: FurniturePart[] = [
    // A little stand for it to sit on.
    box(0.5, 0.04, 0.5, 0, floor - 0.06, 0, WOOD),
    ...legs(0.44, 0.44, floor - 0.06, DARK_WOOD),
    // The frame: a base, a lid with a knob, and posts up the corners.
    box(h * 2 + 0.04, 0.04, h * 2 + 0.04, 0, floor - 0.02, 0, DARK_WOOD),
    box(h * 2 + 0.04, 0.03, h * 2 + 0.04, 0, top, 0, DARK_WOOD),
    box(0.06, 0.03, 0.06, 0, top + 0.03, 0, BRASS),
    ...[[-h, -h], [h, -h], [-h, h], [h, h]].map(([x, z]) => box(0.03, BUG_CAGE_HEIGHT, 0.03, x, floor, z, DARK_WOOD)),
    // Grass on the floor, a twig to climb, and a couple of leaves.
    box(h * 2 - 0.02, 0.02, h * 2 - 0.02, 0, floor + 0.02, 0, 0x6aa84f),
    rod([-0.12, floor + 0.04, 0.08], [0.1, floor + 0.3, -0.1], 0.02, BARK),
    rod([0.02, floor + 0.18, -0.02], [0.13, floor + 0.22, 0.1], 0.015, BARK),
    { ...box(0.09, 0.008, 0.06, 0.12, floor + 0.21, 0.1, 0x5aa83a), turn: 0.5 },
    { ...box(0.08, 0.008, 0.05, -0.05, floor + 0.12, 0.04, 0x4f9a3a), turn: -0.7 },
    // A ladybird on the top leaf.
    box(0.03, 0.018, 0.03, 0.12, floor + 0.215, 0.1, 0xd8312a),
    box(0.012, 0.012, 0.012, 0.12, floor + 0.233, 0.1, NEAR_BLACK),
    // The fine mesh, which you can see through.
    box(h * 2, BUG_CAGE_HEIGHT, 0.006, 0, floor, h, mesh, 0.28),
    box(h * 2, BUG_CAGE_HEIGHT, 0.006, 0, floor, -h, mesh, 0.28),
    box(0.006, BUG_CAGE_HEIGHT, h * 2, h, floor, 0, mesh, 0.28),
    box(0.006, BUG_CAGE_HEIGHT, h * 2, -h, floor, 0, mesh, 0.28),
  ];
  // Fireflies, wandering about and blinking, each in its own time.
  for (const [x, y, z] of [[-0.06, 0.2, 0.05], [0.07, 0.27, -0.06], [0, 0.14, -0.08], [0.05, 0.31, 0.07]]) {
    parts.push(moving(glowingBox(0.018, 0.018, 0.018, x, floor + y, z, FIREFLY), 'firefly'));
  }
  return parts;
}

const MONSTERA = 0x2f7a3c;
const MONSTERA_YOUNG = 0x4c9a4a;
const MONSTERA_POT = 0xece6da;
const MONSTERA_SOIL_TOP = 0.36;

/**
 * One split leaf of a monstera: a rib down the middle, with lobes either side
 * and gaps between them, held out at the end of its stem, `turn` round and
 * tipped `tilt` up from level.
 */
function monsteraLeaf(base: [number, number, number], turn: number, tilt: number, size: number, color: number): FurniturePart[] {
  const parts: FurniturePart[] = [];
  /** A flat piece of the leaf, `u` along it from the stem and `v` across. */
  const piece = (u: number, v: number, length: number, width: number, shade = color): FurniturePart => {
    const [x, y, z] = along(base, turn, tilt, u * size);
    // Across the leaf is at right angles to the way it points, and stays level.
    const across: [number, number] = [Math.sin(turn), Math.cos(turn)];
    return { size: [length * size, 0.012, width * size], at: [x + across[0] * v * size, y - 0.006, z + across[1] * v * size], color: shade, tilt, turn };
  };
  parts.push(piece(0.5, 0, 1, 0.06, MONSTERA_YOUNG));
  const lobes: [number, number, number][] = [
    // Where along the leaf, how long, and how far across.
    [0.12, 0.16, 0.34],
    [0.33, 0.17, 0.42],
    [0.56, 0.17, 0.4],
    [0.8, 0.18, 0.26],
  ];
  for (const [u, length, width] of lobes) {
    for (const side of [-1, 1]) parts.push(piece(u, side * (0.03 + width / 2), length, width));
  }
  return parts;
}

/** A big potted monstera with its split leaves held out on long stems. */
function monsteraParts(): FurniturePart[] {
  const parts: FurniturePart[] = [
    box(0.42, 0.32, 0.42, 0, 0, 0, MONSTERA_POT),
    box(0.46, 0.04, 0.46, 0, 0.3, 0, MONSTERA_POT),
    box(0.38, 0.02, 0.38, 0, MONSTERA_SOIL_TOP - 0.02, 0, SOIL),
    // A mossy pole it climbs.
    box(0.05, 1.05, 0.05, 0.04, MONSTERA_SOIL_TOP, -0.06, 0x6d5a3a),
  ];
  // Where each stem goes, how big its leaf is, and whether it's a new one, still paler.
  const leaves: { turn: number; reach: number; height: number; tilt: number; size: number; young?: boolean }[] = [
    { turn: 0.3, reach: 0.18, height: 0.95, tilt: -0.35, size: 0.46 },
    { turn: 1.6, reach: 0.2, height: 0.8, tilt: -0.5, size: 0.42 },
    { turn: 2.9, reach: 0.2, height: 1.05, tilt: -0.3, size: 0.44 },
    { turn: 4.1, reach: 0.18, height: 0.72, tilt: -0.55, size: 0.4 },
    { turn: 5.2, reach: 0.16, height: 1.2, tilt: -0.15, size: 0.38 },
    { turn: 0.95, reach: 0.06, height: 1.38, tilt: 0.25, size: 0.3, young: true },
  ];
  for (const { turn, reach, height, tilt, size, young } of leaves) {
    const base: [number, number, number] = [Math.cos(turn) * reach, height, -Math.sin(turn) * reach];
    parts.push(rod([0, MONSTERA_SOIL_TOP, 0], base, 0.025, 0x4f8a3e));
    parts.push(...monsteraLeaf(base, turn, tilt, size, young ? MONSTERA_YOUNG : MONSTERA));
  }
  return parts;
}

const ESPALIER_LEAF = 0x3f7f3a;
const ESPALIER_LEAF_LIGHT = 0x5a9a46;
const PEAR = 0xc9c25a;
/** The heights of the wires it's trained along, one tier of branches to each. */
const ESPALIER_TIERS = [0.5, 0.9, 1.3];
const ESPALIER_BACK = -0.3;

/**
 * A pear tree trained flat against a frame of posts and wires, its branches
 * running out level either side in tiers, with leaves along them and pears
 * hanging under. It stands at the back of its squares, so it can go along a
 * wall or a fence.
 */
function espalierParts(): FurniturePart[] {
  const z = ESPALIER_BACK;
  const parts: FurniturePart[] = [
    box(0.06, 1.55, 0.06, -0.92, 0, z, WOOD),
    box(0.06, 1.55, 0.06, 0.92, 0, z, WOOD),
    ...ESPALIER_TIERS.map((y) => box(1.84, 0.012, 0.012, 0, y + 0.03, z - 0.03, STEEL)),
    // A bed of mulch, and the trunk up the middle.
    box(1.7, 0.04, 0.34, 0, 0, z + 0.05, SOIL),
    box(0.07, ESPALIER_TIERS[2] + 0.14, 0.07, 0, 0.04, z, BARK),
  ];
  ESPALIER_TIERS.forEach((y, tier) => {
    for (const side of [-1, 1]) {
      // Each branch bends up out of the trunk, then runs out level along its wire.
      const elbow: [number, number, number] = [side * 0.14, y, z];
      parts.push(rod([0, y - 0.12, z], elbow, 0.04, BARK), rod(elbow, [side * 0.86, y, z], 0.035, BARK));
      for (let i = 0; i < 6; i++) {
        const x = side * (0.2 + i * 0.12);
        const up = (i + tier) % 2 === 0;
        parts.push(box(0.11, 0.07, 0.1, x, y + (up ? 0.02 : -0.04), z + (up ? 0.03 : -0.02), (i + tier) % 3 === 0 ? ESPALIER_LEAF_LIGHT : ESPALIER_LEAF));
      }
      // A couple of pears under each branch.
      for (const at of [0.36 + tier * 0.06, 0.66 - tier * 0.04]) {
        parts.push(box(0.012, 0.03, 0.012, side * at, y - 0.06, z + 0.04, BARK), box(0.055, 0.07, 0.055, side * at, y - 0.13, z + 0.04, PEAR));
      }
    }
  });
  // A leafy top where the trunk stops.
  parts.push(box(0.2, 0.12, 0.12, 0, ESPALIER_TIERS[2] + 0.14, z, ESPALIER_LEAF_LIGHT));
  return parts;
}

export const FURNITURE_CATALOG: FurnitureDef[] = [
  ...STAIR_DEFS,
  // Bedroom
  {
    type: 'bed', label: 'Bed', emoji: '🛏️', category: 'beds', footprint: { w: 1, d: 2 }, color: 0xe8a0b0, height: 0.5, use: 'lie',
    thoughts: ['😴', '💤', '🌙'], advertises: { energy: 30 }, approach: 'not-back',
    parts: [box(0.85, 0.15, 1.7, 0, 0, 0, WOOD), box(0.81, 0.35, 1.62, 0, 0.15, 0), box(0.6, 0.07, 0.3, 0, 0.5, -0.6, WHITE), box(0.85, 0.75, 0.07, 0, 0, -0.85, WOOD)],
  },
  {
    type: 'double-bed', label: 'Big Bed', emoji: '🛌', category: 'beds', footprint: { w: 2, d: 2 }, color: 0x9bb4d6, height: 0.5, use: 'lie',
    thoughts: ['😴', '💤', '🌙'], advertises: { energy: 35 }, approach: 'not-back',
    parts: [box(1.7, 0.15, 1.7, 0, 0, 0, WOOD), box(1.64, 0.35, 1.62, 0, 0.15, 0), box(0.65, 0.07, 0.3, -0.42, 0.5, -0.6, WHITE), box(0.65, 0.07, 0.3, 0.42, 0.5, -0.6, WHITE), box(1.7, 0.8, 0.07, 0, 0, -0.85, WOOD)],
  },
  // More beds. The bedding is whatever's left in the piece's own color, so Bedding color changes just that.
  {
    type: 'canopy-bed', label: 'Canopy Bed', emoji: '👑', category: 'beds', footprint: { w: 2, d: 2 }, color: 0xc7a3cf, height: 0.5, use: 'lie',
    thoughts: ['😴', '👑', '💤', '🌙'], advertises: { energy: 40 }, approach: 'not-back',
    parts: [
      box(1.8, 0.18, 1.8, 0, 0, 0, DARK_WOOD),
      box(1.72, 0.32, 1.7, 0, 0.18, 0),
      box(0.65, 0.08, 0.3, -0.42, 0.5, -0.62, WHITE),
      box(0.65, 0.08, 0.3, 0.42, 0.5, -0.62, WHITE),
      box(1.8, 0.95, 0.07, 0, 0, -0.9, DARK_WOOD),
      // Four tall posts, joined round the top, with a sheer canopy over and drapes tied back at the corners.
      box(0.08, 1.75, 0.08, -0.87, 0, -0.87, DARK_WOOD),
      box(0.08, 1.75, 0.08, 0.87, 0, -0.87, DARK_WOOD),
      box(0.08, 1.75, 0.08, -0.87, 0, 0.87, DARK_WOOD),
      box(0.08, 1.75, 0.08, 0.87, 0, 0.87, DARK_WOOD),
      box(1.82, 0.06, 0.06, 0, 1.72, -0.87, DARK_WOOD),
      box(1.82, 0.06, 0.06, 0, 1.72, 0.87, DARK_WOOD),
      box(0.06, 0.06, 1.82, -0.87, 1.72, 0, DARK_WOOD),
      box(0.06, 0.06, 1.82, 0.87, 1.72, 0, DARK_WOOD),
      box(1.76, 0.02, 1.76, 0, 1.76, 0, 0xf4efe6, 0.5),
      box(0.22, 1.2, 0.03, -0.74, 0.52, 0.85, 0xf4efe6, 0.75),
      box(0.22, 1.2, 0.03, 0.74, 0.52, 0.85, 0xf4efe6, 0.75),
      box(0.03, 1.2, 0.22, -0.85, 0.52, -0.74, 0xf4efe6, 0.75),
      box(0.03, 1.2, 0.22, 0.85, 0.52, -0.74, 0xf4efe6, 0.75),
    ],
  },
  {
    type: 'daybed', label: 'Daybed', emoji: '🛋️', category: 'beds', footprint: { w: 1, d: 2 }, color: 0x8fb3a3, height: 0.48, use: 'lie',
    thoughts: ['😴', '📖', '☀️'], advertises: { energy: 25, fun: 5 }, approach: 'not-back',
    parts: [
      // Like a sofa you can lie full length on: a back down one long side, and arms at the ends.
      box(0.85, 0.3, 1.8, 0, 0, 0, 0xece6da),
      box(0.76, 0.18, 1.72, 0.03, 0.3, 0),
      box(0.07, 0.6, 1.84, -0.4, 0.28, 0, 0xece6da),
      box(0.86, 0.45, 0.07, 0, 0.28, -0.89, 0xece6da),
      box(0.86, 0.45, 0.07, 0, 0.28, 0.89, 0xece6da),
      box(0.5, 0.08, 0.28, 0.06, 0.48, -0.66, WHITE),
      box(0.12, 0.3, 0.42, -0.3, 0.48, -0.2, 0xe3c56b),
      box(0.12, 0.3, 0.42, -0.3, 0.48, 0.35, 0xd97a5b),
    ],
  },
  {
    type: 'futon', label: 'Futon', emoji: '🟫', category: 'beds', footprint: { w: 2, d: 2 }, color: 0x4f6c8c, height: 0.3, use: 'lie',
    thoughts: ['😴', '💤', '🍵'], advertises: { energy: 28 }, approach: 'not-back',
    parts: [
      // A thick mattress on a low slatted base, tufted, with flat pillows.
      box(1.8, 0.1, 1.8, 0, 0, 0, 0xb8946a),
      box(1.74, 0.2, 1.74, 0, 0.1, 0),
      ...[-0.55, 0, 0.55].flatMap((x) => [-0.25, 0.35].map((z) => box(0.05, 0.012, 0.05, x, 0.3, z, 0x2f3f52))),
      box(0.7, 0.06, 0.32, -0.43, 0.3, -0.64, WHITE),
      box(0.7, 0.06, 0.32, 0.43, 0.3, -0.64, WHITE),
    ],
  },
  {
    type: 'hammock', label: 'Hammock', emoji: '🌴', category: 'beds', footprint: { w: 1, d: 2 }, color: 0xe0a33a, height: 0.42, use: 'lie',
    thoughts: ['😌', '☀️', '💤', '🌴'], advertises: { energy: 18, fun: 10 }, approach: 'not-back', swings: true,
    parts: [
      // A wooden stand: a long foot, and an upright at each end.
      box(0.12, 0.06, 1.96, 0, 0, 0, WOOD),
      box(0.5, 0.06, 0.1, 0, 0, -0.93, WOOD),
      box(0.5, 0.06, 0.1, 0, 0, 0.93, WOOD),
      box(0.08, 1.05, 0.08, 0, 0.06, -0.93, WOOD),
      box(0.08, 1.05, 0.08, 0, 0.06, 0.93, WOOD),
      // Ropes down from the tops to the ends of the sling, which sags in the middle.
      rod([0, 1.08, -0.93], [0, 0.56, -0.7], 0.02, 0xd8cdb0),
      rod([0, 1.08, 0.93], [0, 0.56, 0.7], 0.02, 0xd8cdb0),
      // The sling, its stripes and the pillow sway together while someone's lying in it.
      moving(box(0.62, 0.03, 0.42, 0, 0.5, -0.55), 'swing'),
      moving(box(0.66, 0.03, 0.62, 0, 0.4, 0), 'swing'),
      moving(box(0.62, 0.03, 0.42, 0, 0.5, 0.55), 'swing'),
      moving(box(0.66, 0.031, 0.06, 0, 0.4, -0.12, 0xf3ead6), 'swing'),
      moving(box(0.66, 0.031, 0.06, 0, 0.4, 0.12, 0xf3ead6), 'swing'),
      moving(box(0.4, 0.08, 0.22, 0, 0.53, -0.6, WHITE), 'swing'),
    ],
  },
  {
    type: 'car-bed', label: 'Race Car Bed', emoji: '🏎️', category: 'beds', footprint: { w: 1, d: 2 }, color: 0x7fb0e0, height: 0.45, use: 'lie',
    thoughts: ['😴', '🏎️', '🏁', '💤'], advertises: { energy: 28, fun: 8 }, approach: 'not-back',
    parts: [
      // A red car with the mattress set in it, nose at the foot, a spoiler behind the pillow.
      box(0.9, 0.35, 1.95, 0, 0.08, 0, 0xd8453a),
      box(0.9, 0.18, 0.42, 0, 0.43, 0.76, 0xd8453a),
      box(0.12, 0.012, 0.42, 0, 0.61, 0.76, WHITE),
      box(0.8, 0.06, 0.12, 0, 0.72, -0.94, 0xd8453a),
      box(0.05, 0.3, 0.05, -0.32, 0.43, -0.94, NEAR_BLACK),
      box(0.05, 0.3, 0.05, 0.32, 0.43, -0.94, NEAR_BLACK),
      box(0.76, 0.12, 1.25, 0, 0.33, -0.28),
      box(0.42, 0.07, 0.24, 0, 0.45, -0.72, WHITE),
      ...[-0.6, 0.6].flatMap((z) => [-0.47, 0.47].flatMap((x) => [box(0.06, 0.32, 0.32, x, 0, z, NEAR_BLACK), box(0.065, 0.12, 0.12, x, 0.1, z, 0xc9ced1)])),
      glowingBox(0.14, 0.06, 0.02, -0.28, 0.32, 0.98, 0xfff2b0),
      glowingBox(0.14, 0.06, 0.02, 0.28, 0.32, 0.98, 0xfff2b0),
    ],
  },
  {
    type: 'camp-bed', label: 'Camp Bed', emoji: '⛺', category: 'beds', footprint: { w: 1, d: 2 }, color: 0x6f8450, height: 0.44, use: 'lie',
    thoughts: ['😴', '⛺', '🌲'], advertises: { energy: 20 }, approach: 'not-back',
    parts: [
      // A canvas sling stretched between two rails on folding legs, with a rolled-up blanket.
      ...[-0.85, 0, 0.85].flatMap((z) => [-0.36, 0.36].map((x) => box(0.04, 0.4, 0.04, x, 0, z, STEEL))),
      box(0.04, 0.04, 1.9, -0.36, 0.4, 0, STEEL),
      box(0.04, 0.04, 1.9, 0.36, 0.4, 0, STEEL),
      box(0.7, 0.03, 1.86, 0, 0.41, 0),
      box(0.62, 0.12, 0.16, 0, 0.44, 0.7, 0xa8543c),
      box(0.4, 0.06, 0.24, 0, 0.44, -0.66, 0xe8e2d2),
    ],
  },
  {
    type: 'round-bed', label: 'Round Bed', emoji: '⭕', category: 'beds', footprint: { w: 2, d: 2 }, color: 0xd98fa6, height: 0.48, use: 'lie',
    thoughts: ['😴', '😎', '💤', '✨'], advertises: { energy: 38 }, approach: 'not-back',
    parts: [
      // Built up in overlapping slabs so it reads as round, on a white base, with a curved headboard.
      box(1.9, 0.2, 1.1, 0, 0, 0, 0xeeeae2),
      box(1.62, 0.2, 1.62, 0, 0, 0, 0xeeeae2),
      box(1.1, 0.2, 1.9, 0, 0, 0, 0xeeeae2),
      box(1.82, 0.28, 1.0, 0, 0.2, 0),
      box(1.54, 0.28, 1.54, 0, 0.2, 0),
      box(1.0, 0.28, 1.82, 0, 0.2, 0),
      box(1.0, 0.95, 0.08, 0, 0, -0.95, 0xeeeae2),
      { ...box(0.6, 0.85, 0.08, -0.68, 0, -0.72, 0xeeeae2), turn: 0.75 },
      { ...box(0.6, 0.85, 0.08, 0.68, 0, -0.72, 0xeeeae2), turn: -0.75 },
      box(0.6, 0.08, 0.28, -0.36, 0.48, -0.58, WHITE),
      box(0.6, 0.08, 0.28, 0.36, 0.48, -0.58, WHITE),
    ],
  },
  {
    type: 'bunk-bed', label: 'Bunk Bed', emoji: '🪜', category: 'beds', footprint: { w: 1, d: 2 }, color: 0x6fa8dc, height: 0.42, bunk: 1.22, use: 'lie',
    thoughts: ['😴', '💤', '🌙', '🪜'], advertises: { energy: 30 }, approach: 'not-back',
    parts: [
      // A post at each corner, all the way up.
      ...[-0.92, 0.92].flatMap((z) => [-0.42, 0.42].map((x) => box(0.08, 1.75, 0.08, x, 0, z, WOOD))),
      // The bottom bunk.
      box(0.84, 0.12, 1.84, 0, 0.18, 0, WOOD),
      box(0.78, 0.12, 1.78, 0, 0.3, 0),
      box(0.5, 0.07, 0.26, 0, 0.42, -0.68, WHITE),
      box(0.84, 0.32, 0.05, 0, 0.1, -0.93, WOOD),
      box(0.84, 0.22, 0.05, 0, 0.1, 0.93, WOOD),
      // The top bunk, with a guard rail round it, left open at the foot of one side where the ladder comes up.
      box(0.84, 0.12, 1.84, 0, 0.98, 0, WOOD),
      box(0.78, 0.12, 1.78, 0, 1.1, 0),
      box(0.5, 0.07, 0.26, 0, 1.22, -0.68, WHITE),
      box(0.84, 0.42, 0.05, 0, 1.1, -0.93, WOOD),
      box(0.84, 0.36, 0.05, 0, 1.1, 0.93, WOOD),
      box(0.04, 0.06, 1.84, -0.42, 1.4, 0, WOOD),
      box(0.04, 0.06, 1.1, 0.42, 1.4, -0.37, WOOD),
      box(0.04, 0.24, 0.04, 0.42, 1.18, 0.18, WOOD),
      // The ladder, up the side by the foot.
      box(0.03, 1.32, 0.03, 0.47, 0, 0.3, DARK_WOOD),
      box(0.03, 1.32, 0.03, 0.47, 0, 0.84, DARK_WOOD),
      ...[0.26, 0.52, 0.78, 1.04, 1.28].map((y) => box(0.03, 0.025, 0.54, 0.47, y, 0.57, DARK_WOOD)),
    ],
  },
  // Pool things, placed with the Pool tool. A pool's water is POOL_WATER below the ground and its floor POOL_FLOOR.
  {
    type: 'pool-ladder', label: 'Pool Ladder', emoji: '🪜', category: 'outdoor', footprint: { w: 1, d: 1 }, color: 0xd9dee2, height: 0, use: 'stand',
    thoughts: ['🏊'], advertises: {}, approach: 'not-back', buildTool: true, pool: 'edge',
    parts: [
      // Two rails up from the edge, over the coping, and down into the water, with rungs under the surface.
      ...[-0.22, 0.22].flatMap((x) => [
        box(0.045, 0.85, 0.045, x, 0, 0.3),
        box(0.045, 0.045, 0.32, x, 0.82, 0.44),
        box(0.045, 2.05, 0.045, x, POOL_FLOOR + 0.04, 0.6),
      ]),
      ...[-0.25, -0.55, -0.85].map((y) => box(0.44, 0.03, 0.08, 0, y, 0.6)),
    ],
  },
  {
    type: 'pool-stairs', label: 'Pool Stairs', emoji: '🛝', category: 'outdoor', footprint: { w: 1, d: 2 }, color: 0xeef4f6, height: 0, use: 'stand',
    thoughts: ['🏊'], advertises: {}, approach: 'not-back', buildTool: true, pool: 'inside',
    parts: [
      // Wide steps from just under the water at the edge, down to the floor, with a rail down one side.
      ...[0, 1, 2, 3].map((step) => box(0.96, -POOL_FLOOR - 0.3 - step * 0.22, 0.5, 0, POOL_FLOOR, -0.75 + step * 0.5)),
      ...[0, 1, 2, 3].map((step) => box(0.96, 0.02, 0.06, 0, -0.3 - step * 0.22, -0.53 + step * 0.5, 0x7fb6d1)),
      rod([0.42, 0.85, -1.0], [0.42, 0.05, 0.85], 0.045, 0xd9dee2),
      box(0.045, 0.85, 0.045, 0.42, 0, -1.0, 0xd9dee2),
    ],
  },
  {
    type: 'diving-board', label: 'Diving Board', emoji: '🤸', category: 'outdoor', footprint: { w: 1, d: 2 }, color: 0x2f7fbf, height: 0, use: 'stand',
    thoughts: ['🤸', '🌊'], advertises: {}, approach: 'not-back', buildTool: true, pool: 'over',
    parts: [
      // A stand on the edge, and a springy board out over the water.
      box(0.5, 0.32, 0.6, 0, 0, -0.62, 0x9a9690),
      box(0.12, 0.12, 0.3, -0.16, 0.32, -0.5, 0xd9dee2),
      box(0.12, 0.12, 0.3, 0.16, 0.32, -0.5, 0xd9dee2),
      box(0.46, 0.06, 1.75, 0, 0.42, 0.08),
      box(0.46, 0.061, 0.08, 0, 0.42, 0.9, 0xf2f2f2),
    ],
  },
  {
    type: 'dresser', label: 'Dresser', emoji: '🗄️', category: 'storage', footprint: { w: 2, d: 1 }, color: 0xb08a5c, height: 0.85, use: 'stand',
    thoughts: ['👕', '🧦', '🪞'], advertises: { hygiene: 15 }, activity: 'browse', approach: 'front', holds: 0.85,
    parts: [box(1.7, 0.85, 0.7), box(1.55, 0.02, 0.02, 0, 0.3, 0.35, DARK_WOOD), box(1.55, 0.02, 0.02, 0, 0.58, 0.35, DARK_WOOD)],
  },
  {
    type: 'wardrobe', label: 'Wardrobe', emoji: '🧥', category: 'storage', footprint: { w: 2, d: 1 }, color: 0x9a7650, height: 1.5, use: 'stand',
    thoughts: ['👗', '👔', '🧥'], advertises: { hygiene: 15, fun: 5 }, activity: 'browse', approach: 'front',
    parts: [box(1.7, 1.5, 0.75), box(0.02, 1.4, 0.02, 0, 0.05, 0.38, DARK_WOOD)],
  },

  // Bathroom
  {
    type: 'toilet', label: 'Toilet', emoji: '🚽', category: 'bathroom', footprint: { w: 1, d: 1 }, color: WHITE, height: 0.4, use: 'sit',
    thoughts: ['😳', '📰', '🧻'], advertises: { bladder: 100 }, approach: 'front', private: true,
    parts: [box(0.5, 0.4, 0.6, 0, 0, 0.05), box(0.55, 0.4, 0.2, 0, 0.3, -0.32)],
  },
  {
    type: 'sink', label: 'Sink', emoji: '🚰', category: 'bathroom', footprint: { w: 1, d: 1 }, color: 0xcfd8dc, height: 0.8, use: 'stand',
    thoughts: ['🧼', '💧', '🫧'], advertises: { hygiene: 60 }, activity: 'scrub', approach: 'front', washesDishes: true,
    parts: [
      box(0.2, 0.6, 0.2),
      // The top, built round a bowl sunk into it: a rim on all four sides, and the bowl's floor well below.
      box(0.7, 0.07, 0.6, 0, 0.6),
      ...sunkBasin({ w: 0.7, d: 0.6, z: 0 }, { w: 0.46, d: 0.34, z: 0.04 }, 0.67, 0.8),
      box(0.46, 0.012, 0.34, 0, 0.67, 0.04, 0xb4c4cb),
      box(0.05, 0.004, 0.05, 0, 0.682, 0.06, STEEL),
      box(0.06, 0.14, 0.06, 0, 0.8, -0.2, STEEL),
      box(0.04, 0.03, 0.09, 0, 0.91, -0.15, STEEL),
      moving(box(0.025, 0.24, 0.025, 0, 0.68, -0.115, WATER, 0.75), 'water'),
    ],
  },
  {
    type: 'shower', label: 'Shower', emoji: '🚿', category: 'bathroom', footprint: { w: 1, d: 1 }, color: 0xdfeef2, height: 0, use: 'inside',
    thoughts: ['🚿', '🎶', '🫧'], advertises: { hygiene: 90 }, approach: 'front', private: true,
    parts: [
      box(0.9, 0.05, 0.9),
      box(0.9, 1.35, 0.06, 0, 0.05, -0.42),
      box(0.04, 1.35, 0.9, -0.43, 0.05, 0, GLASS, 0.3),
      box(0.04, 1.35, 0.9, 0.43, 0.05, 0, GLASS, 0.3),
      box(0.05, 0.05, 0.3, 0, 1.25, -0.27, STEEL),
      box(0.16, 0.03, 0.16, 0, 1.22, -0.12, STEEL),
      // While someone's in it: a faint sheet of spray, and streaks falling like rain.
      moving(box(0.32, 1.14, 0.32, 0, 0.08, -0.1, WATER, 0.24), 'water'),
      moving(box(0.6, 0.012, 0.6, 0, 0.05, -0.05, 0x7fc8f0, 0.6), 'fill'),
      ...showerRain(),
    ],
  },
  {
    type: 'bathtub', label: 'Bathtub', emoji: '🛁', category: 'bathroom', footprint: { w: 1, d: 2 }, color: WHITE, height: 0.3, use: 'lie',
    thoughts: ['🛁', '🦆', '🫧'], advertises: { hygiene: 50, fun: 10 }, private: true,
    parts: [
      box(0.85, 0.3, 1.7),
      box(0.08, 0.55, 1.7, -0.39),
      box(0.08, 0.55, 1.7, 0.39),
      box(0.85, 0.55, 0.08, 0, 0, -0.81),
      box(0.85, 0.55, 0.08, 0, 0, 0.81),
      box(0.06, 0.12, 0.2, 0, 0.5, 0.72, STEEL),
      // Fills while someone's soaking, to about their middle, so they float in it with the rest of them showing.
      moving(box(0.7, BATH_WATER_DEPTH, 1.54, 0, 0.3, 0, 0x3fa3e0, 0.68), 'fill'),
      ...rippleRing(0.3 + BATH_WATER_DEPTH),
      moving(box(0.1, 0.03, 0.1, -0.2, 0.3 + BATH_WATER_DEPTH, 0.5, WHITE), 'suds'),
      moving(box(0.08, 0.03, 0.08, 0.22, 0.3 + BATH_WATER_DEPTH, 0.3, WHITE), 'suds'),
      moving(box(0.12, 0.03, 0.12, 0.18, 0.3 + BATH_WATER_DEPTH, -0.45, WHITE), 'suds'),
      moving(box(0.07, 0.03, 0.07, -0.24, 0.3 + BATH_WATER_DEPTH, -0.2, WHITE), 'suds'),
    ],
  },

  // Kitchen
  {
    type: 'fridge', label: 'Fridge', emoji: '🧊', category: 'kitchen', footprint: { w: 1, d: 1 }, color: 0xb0bec5, height: 1.5, use: 'stand',
    thoughts: ['🍎', '🥛', '🧀'], advertises: { hunger: 50 }, activity: 'rummage', approach: 'front',
    food: { prepareSeconds: { min: 3, max: 5 }, reliefPerSecond: 5, servings: ['🥪', '🥗', '🍎', '🧀'] },
    parts: [
      box(0.8, 1.5, 0.71, 0, 0, -0.02),
      // The lit inside and some food, hidden behind the door until it opens.
      glowingBox(0.7, 0.9, 0.01, 0, 0.06, 0.336, 0xfff4d6),
      box(0.14, 0.12, 0.012, -0.2, 0.7, 0.343, 0xe86a4a),
      box(0.1, 0.18, 0.012, 0.05, 0.62, 0.343, WHITE),
      box(0.16, 0.08, 0.012, 0.2, 0.35, 0.343, 0xf0c94d),
      box(0.12, 0.1, 0.012, -0.15, 0.2, 0.343, 0x6aa84f),
      // The freezer door, which stays shut, and the main door, hinged on the left.
      box(0.8, 0.47, 0.04, 0, 1.01, 0.355),
      box(0.04, 0.2, 0.04, 0.3, 1.1, 0.395, STEEL),
      box(0.78, 0.02, 0.02, 0, 1, 0.38, STEEL),
      { ...box(0.8, 0.98, 0.04, 0, 0.02, 0.355), motion: 'door', pivot: FRIDGE_HINGE },
      { ...box(0.04, 0.3, 0.04, 0.3, 0.6, 0.395, STEEL), motion: 'door', pivot: FRIDGE_HINGE },
    ],
  },
  {
    // Shaped like a counter, so it runs into the counters beside it and can turn a corner like one.
    type: 'stove', label: 'Stove', emoji: '🍳', category: 'kitchen', footprint: { w: 1, d: 1 }, color: 0xd5d9dc, height: 0.8, use: 'stand',
    thoughts: ['🍳', '🥘', '🔥'], advertises: { hunger: 70 }, activity: 'stir', approach: 'front', joins: 'counters',
    food: { prepareSeconds: { min: 8, max: 12 }, reliefPerSecond: 7, servings: ['🍝', '🍲', '🍳', '🥘', '🍕'] },
    parts: counterParts(LONE_COUNTER, 'stove'),
  },
  {
    // Exactly one cell wide, so a row of them makes one long counter.
    type: 'counter', label: 'Counter', emoji: '🥣', category: 'kitchen', footprint: { w: 1, d: 1 }, color: COUNTER_WOOD, height: 0.8, use: 'stand',
    thoughts: ['🥪', '🔪', '🥕'], advertises: { hunger: 35 }, surface: 'counter', joins: 'counters', activity: 'chop', approach: 'front', holds: 0.81,
    food: { prepareSeconds: { min: 5, max: 8 }, reliefPerSecond: 4, servings: ['🥪', '🥣', '🥕', '🍌'] },
    parts: counterParts(LONE_COUNTER, 'counter'),
  },
  {
    type: 'counter-sink', label: 'Counter Sink', emoji: '🧽', category: 'kitchen', footprint: { w: 1, d: 1 }, color: COUNTER_WOOD, height: 0.8, use: 'stand',
    thoughts: ['🧽', '🍽️', '🫧'], advertises: { hygiene: 40 }, joins: 'counters', activity: 'scrub', approach: 'front', washesDishes: true,
    parts: counterParts(LONE_COUNTER, 'sink'),
  },
  {
    // Fits into a run of counters like the stove does. Loading it is quicker than washing up by hand.
    type: 'dishwasher', label: 'Dishwasher', emoji: '🫧', category: 'kitchen', footprint: { w: 1, d: 1 }, color: COUNTER_WOOD, height: 0.8, use: 'stand',
    thoughts: ['🍽️', '🫧', '✨'], advertises: {}, joins: 'counters', activity: 'pickup', approach: 'front', washesDishes: true, loadsDishes: true, holds: 0.81,
    parts: counterParts(LONE_COUNTER, 'dishwasher'),
  },
  {
    // Where cooking scraps and other trash go. Nobody uses it for its own sake: pawns come to it when they're tidying up.
    type: 'trash-can', label: 'Trash Can', emoji: '🗑️', category: 'kitchen', footprint: { w: 1, d: 1 }, color: 0x9aa3a8, height: 0.62, use: 'stand',
    thoughts: ['🗑️'], advertises: {}, approach: 'not-back',
    parts: [
      box(0.42, 0.56, 0.4, 0, 0, 0),
      // A black bag folded over the rim.
      box(0.43, 0.04, 0.41, 0, 0.53, 0, NEAR_BLACK),
      box(0.36, 0.02, 0.34, 0, 0.56, 0, 0x3a3a3a),
      { ...box(0.44, 0.04, 0.42, 0, 0.57, 0, 0xb3bcc1), motion: 'lid', pivot: TRASH_LID_HINGE },
      { ...box(0.1, 0.02, 0.03, 0, 0.6, 0.12, STEEL), motion: 'lid', pivot: TRASH_LID_HINGE },
      // The pedal at the front, and a band round the middle.
      box(0.16, 0.03, 0.08, 0, 0.03, 0.22, STEEL),
      box(0.43, 0.03, 0.41, 0, 0.3, 0, 0x88918f),
    ],
  },

  // Dining
  {
    type: 'chair', label: 'Chair', emoji: '🪑', category: 'seating', footprint: { w: 1, d: 1 }, color: 0xc99a5b, height: 0.45, use: 'sit',
    thoughts: ['😌', '📖', '☕'], advertises: { energy: 8, fun: 5 }, mealSeat: true,
    parts: [box(0.6, 0.27, 0.6, 0, 0.18), ...legs(0.6, 0.6, 0.18), box(0.6, 0.5, 0.08, 0, 0.45, -0.26)],
  },
  {
    // An office chair on casters, to pull up to a desk.
    type: 'desk-chair', label: 'Desk Chair', emoji: '💺', category: 'seating', footprint: { w: 1, d: 1 }, color: 0x2f4858, height: 0.48, use: 'sit',
    thoughts: ['💻', '😌', '🤔'], advertises: { energy: 6, fun: 4 }, mealSeat: true,
    parts: [
      // A star of feet on casters, and the gas lift up to the seat.
      box(0.56, 0.04, 0.06, 0, 0.05, 0, NEAR_BLACK),
      box(0.06, 0.04, 0.56, 0, 0.05, 0, NEAR_BLACK),
      ...[[0.26, 0], [-0.26, 0], [0, 0.26], [0, -0.26]].map(([x, z]) => box(0.06, 0.05, 0.06, x, 0, z, 0x1f1f1f)),
      box(0.06, 0.3, 0.06, 0, 0.09, 0, STEEL),
      box(0.18, 0.04, 0.18, 0, 0.36, 0, NEAR_BLACK),
      box(0.52, 0.09, 0.5, 0, 0.39, 0.02),
      // The back on its stem, and armrests either side.
      box(0.06, 0.16, 0.04, 0, 0.42, -0.25, NEAR_BLACK),
      box(0.48, 0.52, 0.07, 0, 0.56, -0.25),
      box(0.4, 0.04, 0.02, 0, 0.92, -0.215, 0x3d6178),
      box(0.04, 0.14, 0.04, -0.26, 0.48, 0.02, NEAR_BLACK),
      box(0.04, 0.14, 0.04, 0.26, 0.48, 0.02, NEAR_BLACK),
      box(0.06, 0.03, 0.28, -0.26, 0.62, 0.02, NEAR_BLACK),
      box(0.06, 0.03, 0.28, 0.26, 0.62, 0.02, NEAR_BLACK),
    ],
  },
  {
    type: 'stool', label: 'Stool', emoji: '🍄', category: 'seating', footprint: { w: 1, d: 1 }, color: 0xb9854f, height: 0.6, use: 'sit',
    thoughts: ['😌', '☕', '🥤'], advertises: { energy: 5, fun: 3 }, mealSeat: true,
    parts: [box(0.5, 0.22, 0.5, 0, 0.38), ...legs(0.45, 0.45, 0.38)],
  },
  {
    type: 'bench', label: 'Bench', emoji: '🪵', category: 'seating', footprint: { w: 2, d: 1 }, color: 0xb18a5a, height: 0.45, use: 'sit',
    thoughts: ['😌', '☕', '🍃'], advertises: { energy: 6, fun: 3 }, mealSeat: true,
    parts: [box(1.7, 0.27, 0.6, 0, 0.18), ...legs(1.7, 0.6, 0.18)],
  },
  {
    type: 'small-table', label: 'Small Table', emoji: '🫖', category: 'tables', footprint: { w: 1, d: 1 }, color: 0xa97c50, height: 0.75, use: 'stand',
    thoughts: ['☕', '🍪', '🥪'], advertises: {}, surface: 'table', holds: 0.75,
    parts: tableParts(0.85, 0.85, 0.75),
  },
  {
    type: 'table', label: 'Table', emoji: '🍽️', category: 'tables', footprint: { w: 2, d: 1 }, color: 0xa97c50, height: 0.75, use: 'stand',
    thoughts: ['🍽️', '😋', '🥪'], advertises: {}, surface: 'table', holds: 0.75,
    parts: tableParts(1.7, 0.85, 0.75),
  },
  {
    type: 'big-table', label: 'Big Table', emoji: '🍱', category: 'tables', footprint: { w: 3, d: 2 }, color: 0x96693f, height: 0.75, use: 'stand',
    thoughts: ['🍽️', '🍝', '🎂'], advertises: {}, surface: 'table', holds: 0.75,
    parts: tableParts(2.7, 1.7, 0.75),
  },

  // Living
  {
    type: 'sofa', label: 'Sofa', emoji: '🛋️', category: 'seating', footprint: { w: 2, d: 1 }, color: 0x7695c4, height: 0.5, use: 'sit',
    thoughts: ['😌', '🍿', '📺'], advertises: { energy: 12, fun: 15 }, mealSeat: true, approach: 'front',
    parts: [box(1.7, 0.5, 0.8), box(1.7, 0.4, 0.2, 0, 0.45, -0.3), box(0.14, 0.2, 0.8, -0.78, 0.45), box(0.14, 0.2, 0.8, 0.78, 0.45)],
  },
  {
    type: 'armchair', label: 'Armchair', emoji: '💺', category: 'seating', footprint: { w: 1, d: 1 }, color: 0xb86f6f, height: 0.5, use: 'sit',
    thoughts: ['😌', '📖', '🍵'], advertises: { energy: 12, fun: 10 }, mealSeat: true, approach: 'front',
    parts: [box(0.85, 0.5, 0.8), box(0.85, 0.4, 0.2, 0, 0.45, -0.3), box(0.13, 0.2, 0.8, -0.36, 0.45), box(0.13, 0.2, 0.8, 0.36, 0.45)],
  },
  {
    // One seat of a sofa that's as long as you like: a row makes a long sofa with arms at the ends, and a seat set in front of the end of the row, facing along it, turns the corner into an L.
    type: 'sectional', label: 'Sectional Sofa', emoji: '🛋️', category: 'seating', footprint: { w: 1, d: 1 }, color: SECTIONAL, height: SECTIONAL_SEAT, use: 'sit',
    thoughts: ['😌', '🍿', '📺', '🛋️'], advertises: { energy: 13, fun: 16 }, mealSeat: true, approach: 'front', joins: 'sectional',
    parts: sectionalParts(LONE_COUNTER),
  },
  {
    // A diner booth seat. Booths run together and turn corners like counters do, so a row of them round a table makes a booth, and a pawn slides in from the open end.
    type: 'booth', label: 'Booth Seat', emoji: '🍔', category: 'seating', footprint: { w: 1, d: 1 }, color: BOOTH_VINYL, height: BOOTH_SEAT, use: 'sit',
    thoughts: ['🍔', '🥤', '😋', '🍟'], advertises: { energy: 8, fun: 8 }, mealSeat: true, approach: 'front', joins: 'booth',
    parts: boothParts(LONE_COUNTER),
  },
  {
    type: 'coffee-table', label: 'Coffee Table', emoji: '☕', category: 'tables', footprint: { w: 2, d: 1 }, color: 0x8f6b48, height: 0.35, use: 'stand',
    thoughts: ['☕', '📰', '🍪'], advertises: { fun: 8 }, surface: 'table', holds: 0.35,
    parts: tableParts(1.6, 0.7, 0.35),
  },
  {
    type: 'nightstand', label: 'Nightstand', emoji: '🕯️', category: 'tables', footprint: { w: 1, d: 1 }, color: WOOD, height: 0.5, use: 'stand',
    thoughts: ['📖', '🕯️', '⏰'], advertises: { fun: 5 }, activity: 'browse', holds: 0.5,
    parts: [box(0.6, 0.5, 0.6), box(0.5, 0.02, 0.02, 0, 0.33, 0.3, DARK_WOOD)],
  },
  {
    type: 'tv', label: 'TV', emoji: '📺', category: 'electronics', footprint: { w: 1, d: 1 }, color: 0x37474f, height: 0.9, use: 'stand',
    thoughts: ['📺', '😄', '🎬'], advertises: { fun: 40 }, activity: 'watch', approach: 'front',
    parts: [
      box(0.85, 0.35, 0.5, 0, 0, 0, DARK_WOOD),
      box(0.85, 0.5, 0.07, 0, 0.4),
      box(0.2, 0.05, 0.2, 0, 0.35),
      moving(box(0.76, 0.42, 0.012, 0, 0.44, 0.04, SCREEN_OFF), 'screen'),
    ],
  },
  {
    // A wide screen on a low media console, two squares across.
    type: 'big-tv', label: 'Big Screen TV', emoji: '🎬', category: 'electronics', footprint: { w: 2, d: 1 }, color: NEAR_BLACK, height: 1.45, use: 'stand',
    thoughts: ['📺', '🍿', '🏈'], advertises: { fun: 55 }, activity: 'watch', approach: 'front',
    parts: [
      box(1.8, 0.4, 0.5, 0, 0, -0.05, DARK_WOOD),
      box(0.02, 0.32, 0.02, -0.3, 0.04, 0.2, 0x4a3524),
      box(0.02, 0.32, 0.02, 0.3, 0.04, 0.2, 0x4a3524),
      box(0.08, 0.03, 0.02, -0.45, 0.2, 0.21, BRASS),
      box(0.08, 0.03, 0.02, 0.45, 0.2, 0.21, BRASS),
      box(0.3, 0.06, 0.18, 0, 0.4, -0.12, NEAR_BLACK),
      box(0.06, 0.12, 0.04, 0, 0.42, -0.17, NEAR_BLACK),
      box(1.72, 0.96, 0.05, 0, 0.5, -0.17, NEAR_BLACK),
      moving(box(1.64, 0.88, 0.012, 0, 0.54, -0.14, SCREEN_OFF), 'screen'),
      // A soundbar in front, and a little red standby light.
      box(0.9, 0.06, 0.08, 0, 0.4, 0.08, 0x2b2b2b),
      glowingBox(0.02, 0.012, 0.004, 0.78, 0.515, -0.143, 0xff4a3a),
    ],
  },
  {
    type: 'bookshelf', label: 'Bookshelf', emoji: '📚', category: 'storage', footprint: { w: 2, d: 1 }, color: 0x8a6a45, height: 1.4, use: 'stand',
    thoughts: ['📚', '📖', '🤓'], advertises: { fun: 25 }, activity: 'browse', approach: 'front', holds: 1.4,
    parts: [
      // An open case: a darker back, the two sides, top and bottom, and two shelves between.
      box(1.7, 1.4, 0.03, 0, 0, -0.255, DARK_WOOD),
      box(0.05, 1.4, 0.35, -0.825, 0, -0.1),
      box(0.05, 1.4, 0.35, 0.825, 0, -0.1),
      box(1.7, 0.05, 0.35, 0, 1.35, -0.1),
      box(1.7, 0.08, 0.35, 0, 0, -0.1),
      box(1.6, 0.04, 0.33, 0, 0.45, -0.1),
      box(1.6, 0.04, 0.33, 0, 0.9, -0.1),
      ...bookRow(-0.79, 0.79, 0.08, 0.37, 11),
      ...bookRow(-0.79, 0.79, 0.49, 0.41, 29),
      ...bookRow(-0.79, 0.79, 0.94, 0.41, 47),
    ],
  },

  // Fun
  {
    type: 'desk', label: 'Desk', emoji: '🗂️', category: 'tables', footprint: { w: 2, d: 1 }, color: 0xb39367, height: 0.75, use: 'stand',
    thoughts: ['📝', '✏️', '🤔'], advertises: {}, holds: 0.75,
    parts: [...tableParts(1.6, 0.7, 0.75), box(0.42, 0.55, 0.62, 0.55, 0.14, 0), box(0.3, 0.02, 0.02, 0.55, 0.45, 0.31, DARK_WOOD), box(0.3, 0.02, 0.02, 0.55, 0.28, 0.31, DARK_WOOD)],
  },
  {
    type: 'piano', label: 'Piano', emoji: '🎹', category: 'hobbies', footprint: { w: 2, d: 1 }, color: NEAR_BLACK, height: 1, use: 'stand',
    thoughts: ['🎹', '🎵', '🎶'], advertises: { fun: 45 }, activity: 'play', approach: 'front',
    parts: [box(1.7, 1.05, 0.45, 0, 0, -0.18), box(1.5, 0.1, 0.3, 0, 0.6, 0.2), box(1.45, 0.02, 0.26, 0, 0.7, 0.2, WHITE), ...legs(1.5, 0.3, 0.6).slice(2)],
  },
  {
    type: 'pool-table', label: 'Pool Table', emoji: '🎱', category: 'hobbies', footprint: { w: 3, d: 2 }, color: 0x6b4426, height: 0.75, use: 'stand',
    thoughts: ['🎱', '🎯', '😎'], advertises: { fun: 50 }, activity: 'shoot',
    parts: [box(2.7, 0.2, 1.7, 0, 0.5), box(2.5, 0.02, 1.5, 0, 0.7, 0, 0x2f8a55), ...legs(2.6, 1.6, 0.5), box(0.08, 0.04, 0.08, 0.5, 0.72, 0.2, WHITE), box(0.08, 0.04, 0.08, -0.4, 0.72, -0.3, 0xc0504d)],
  },
  {
    // Pull a chair up to it, or two, one either side.
    type: 'chess-table', label: 'Chess Table', emoji: '♟️', category: 'hobbies', footprint: { w: 1, d: 1 }, color: WOOD, height: CHESS_TOP, use: 'stand',
    thoughts: ['♟️', '🤔', '👑', '🧠'], advertises: { fun: 35 }, activity: 'ponder',
    parts: chessTableParts(),
  },
  {
    // Looked through from the eyepiece end, at the front.
    type: 'telescope', label: 'Telescope', emoji: '🔭', category: 'hobbies', footprint: { w: 1, d: 1 }, color: TELESCOPE_BLUE, height: 1.3, use: 'stand',
    thoughts: ['🔭', '🌙', '⭐', '🪐', '🌠'], advertises: { fun: 30 }, activity: 'peer', approach: 'front',
    parts: telescopeParts(),
  },

  // Decor: mostly just nice to have around. Pawns stop to admire the odd one.
  {
    type: 'plant', label: 'Plant', emoji: '🪴', category: 'plants', footprint: { w: 1, d: 1 }, color: 0x5d9c59, height: 0.9, use: 'stand',
    thoughts: ['🪴', '🌿', '🌸'], advertises: { fun: 3 }, activity: 'admire',
    parts: [box(0.35, 0.3, 0.35, 0, 0, 0, 0xc06f45), box(0.5, 0.3, 0.5, 0, 0.3), box(0.35, 0.3, 0.35, 0, 0.6, 0, 0x74b56f)],
  },
  {
    type: 'potted-tree', label: 'Potted Tree', emoji: '🌳', category: 'plants', footprint: { w: 1, d: 1 }, color: 0x4f8f4a, height: 1.6, use: 'stand',
    thoughts: ['🌳', '🍃', '🐦'], advertises: { fun: 3 }, activity: 'admire',
    parts: [box(0.45, 0.35, 0.45, 0, 0, 0, 0xb7663f), box(0.08, 0.6, 0.08, 0, 0.35, 0, DARK_WOOD), box(0.7, 0.45, 0.7, 0, 0.8), box(0.5, 0.3, 0.5, 0, 1.25, 0, 0x6aae63)],
  },
  {
    type: 'monstera', label: 'Monstera', emoji: '🌿', category: 'plants', footprint: { w: 1, d: 1 }, color: MONSTERA, height: 1.5, use: 'stand',
    thoughts: ['🌿', '🪴', '💚'], advertises: { fun: 4 }, activity: 'admire',
    parts: monsteraParts(),
  },
  {
    type: 'flowers', label: 'Flower Vase', emoji: '💐', category: 'plants', footprint: { w: 1, d: 1 }, color: 0xe9e4da, height: 0.9, use: 'stand',
    thoughts: ['💐', '🌷', '😊'], advertises: { fun: 4 }, activity: 'admire',
    parts: [
      box(0.4, 0.7, 0.4),
      box(0.18, 0.25, 0.18, 0, 0.7, 0, 0x5f8fbf),
      box(0.04, 0.15, 0.04, 0, 0.95, 0, 0x5d9c59),
      box(0.1, 0.08, 0.1, -0.06, 1.08, 0, 0xe86a92),
      box(0.1, 0.08, 0.1, 0.07, 1.04, 0.04, 0xf0c94d),
      box(0.1, 0.08, 0.1, 0.02, 1.1, -0.07, 0xc77dd6),
    ],
  },
  {
    type: 'floor-lamp', label: 'Floor Lamp', emoji: '💡', category: 'lighting', footprint: { w: 1, d: 1 }, color: 0x3d3d3d, height: 1.5, use: 'stand',
    thoughts: ['💡', '✨', '🌙'], advertises: {},
    light: { color: 0xffd38a, at: [0, 1.35, 0], strength: 5, pool: 2.2, halo: 0.9 },
    parts: [box(0.35, 0.04, 0.35), box(0.04, 1.2, 0.04, 0, 0.04), glowingBox(0.4, 0.3, 0.4, 0, 1.2, 0, 0xffe7a8)],
  },
  {
    type: 'rug', label: 'Rug', emoji: '🟥', category: 'decor', footprint: { w: 2, d: 2 }, color: 0xb04a4a, height: 0, use: 'stand',
    thoughts: ['🧶'], advertises: {}, onFloor: true,
    parts: rugParts(1.9, 1.9, 0xe0b25c),
  },
  {
    type: 'runner', label: 'Long Rug', emoji: '🟦', category: 'decor', footprint: { w: 1, d: 3 }, color: 0x3f6aa0, height: 0, use: 'stand',
    thoughts: ['🧶'], advertises: {}, onFloor: true,
    parts: rugParts(0.9, 2.9, 0xd9e3ee),
  },
  {
    type: 'painting', label: 'Easel Painting', emoji: '🖼️', category: 'decor', footprint: { w: 1, d: 1 }, color: DARK_WOOD, height: 1.4, use: 'stand',
    thoughts: ['🤔', '🖼️', '🎨'], advertises: { fun: 10 }, activity: 'admire', approach: 'front',
    parts: [
      box(0.05, 1.3, 0.05, -0.25, 0, 0.1),
      box(0.05, 1.3, 0.05, 0.25, 0, 0.1),
      box(0.05, 1.4, 0.05, 0, 0, -0.25),
      box(0.7, 0.55, 0.05, 0, 0.75, 0.08, 0xc9a24d),
      box(0.6, 0.45, 0.02, 0, 0.8, 0.115, 0x7fb3d5),
      box(0.6, 0.15, 0.022, 0, 0.8, 0.115, 0x6aa84f),
      box(0.12, 0.12, 0.024, 0.15, 1.08, 0.115, 0xf6d04d),
    ],
  },
  {
    type: 'statue', label: 'Statue', emoji: '🗿', category: 'decor', footprint: { w: 1, d: 1 }, color: 0xd8d4cc, height: 1.6, use: 'stand',
    thoughts: ['🤔', '🗿', '💭'], advertises: { fun: 8 }, activity: 'admire',
    parts: [box(0.55, 0.6, 0.55, 0, 0, 0, 0xbab4aa), box(0.3, 0.6, 0.22, 0, 0.6), box(0.2, 0.22, 0.2, 0, 1.2), box(0.08, 0.35, 0.08, 0.2, 0.85)],
  },
  {
    type: 'clock', label: 'Grandfather Clock', emoji: '🕰️', category: 'decor', footprint: { w: 1, d: 1 }, color: 0x6b4a2e, height: 1.9, use: 'stand',
    thoughts: ['🕰️', '⏰', '🔔'], advertises: { fun: 2 }, activity: 'admire', approach: 'front',
    parts: [box(0.5, 1.9, 0.35, 0, 0, -0.1), box(0.36, 0.36, 0.02, 0, 1.4, 0.08, WHITE), box(0.06, 0.4, 0.02, 0, 0.6, 0.08, 0xd4a93c)],
  },
  {
    type: 'mirror', label: 'Mirror', emoji: '🪞', category: 'decor', footprint: { w: 1, d: 1 }, color: 0xc9a24d, height: 1.6, use: 'stand',
    thoughts: ['🪞', '💇', '😎'], advertises: { hygiene: 8, fun: 4 }, activity: 'primp', approach: 'front',
    parts: [box(0.5, 0.06, 0.3), box(0.55, 1.5, 0.06, 0, 0.06, -0.05), box(0.45, 1.38, 0.02, 0, 0.12, -0.01, 0xd9eef3)],
  },
  {
    // Hangs on the wall, so it leaves the floor free, and pawns stand under it to check themselves.
    type: 'wall-mirror', label: 'Wall Mirror', emoji: '🪞', category: 'decor', footprint: { w: 1, d: 1 }, color: 0xc9a24d, height: 1.4, use: 'stand',
    thoughts: ['🪞', '💇', '😎'], advertises: { hygiene: 8, fun: 4 }, activity: 'primp', approach: 'front', onWall: true,
    parts: [
      frame(0.52, 0.82, 0, 0.92, 0xc9a24d),
      paint(0.44, 0.74, 0, 0.96, 0xd9eef3),
      // Light catching the glass.
      paint(0.05, 0.42, -0.11, 1.2, 0xf4fbfd, 1),
      paint(0.03, 0.2, -0.05, 1.36, 0xf4fbfd, 1),
    ],
  },
  {
    // Floor to nearly the ceiling, for checking the whole outfit.
    type: 'tall-wall-mirror', label: 'Tall Wall Mirror', emoji: '🧍', category: 'decor', footprint: { w: 1, d: 1 }, color: DARK_WOOD, height: 1.4, use: 'stand',
    thoughts: ['🪞', '👗', '😎'], advertises: { hygiene: 10, fun: 6 }, activity: 'primp', approach: 'front', onWall: true,
    parts: [
      frame(0.54, 1.74, 0, 0.1, DARK_WOOD),
      paint(0.46, 1.66, 0, 0.14, 0xd9eef3),
      // Light catching the glass.
      paint(0.05, 0.9, -0.12, 0.7, 0xf4fbfd, 1),
      paint(0.03, 0.4, -0.05, 1.2, 0xf4fbfd, 1),
    ],
  },
  {
    type: 'aquarium', label: 'Fish Tank', emoji: '🐠', category: 'pets', footprint: { w: 2, d: 1 }, color: DARK_WOOD, height: 1.3, use: 'stand',
    thoughts: ['🐠', '😮', '🫧'], advertises: { fun: 20 }, activity: 'peer', approach: 'front',
    // A dim, cool light from the bar across the top, just enough to make the water glow.
    light: { color: 0x9fdcff, at: [0, 1.12, 0], strength: 1.2, pool: 1.3, halo: 0.4 },
    parts: [
      box(1.6, 0.7, 0.55),
      box(1.5, 0.45, 0.45, 0, 0.72, 0, 0x4aa3d8, 0.55),
      // Just a rim on top, so the fish show from above.
      box(1.6, 0.04, 0.05, 0, 1.17, 0.25, NEAR_BLACK),
      box(1.6, 0.04, 0.05, 0, 1.17, -0.25, NEAR_BLACK),
      box(0.05, 0.04, 0.55, 0.78, 1.17, 0, NEAR_BLACK),
      box(0.05, 0.04, 0.55, -0.78, 1.17, 0, NEAR_BLACK),
      // The light bar, lying across the middle of the rim and glowing a soft blue-white.
      glowingBox(1.5, 0.025, 0.05, 0, 1.17, 0, 0xcdeeff),
      box(1.5, 0.05, 0.45, 0, 0.7, 0, 0xe0c890),
      moving(box(0.15, 0.09, 0.04, -0.35, 0.95, 0.05, 0xff8c2a), 'swim'),
      moving(box(0.13, 0.08, 0.04, 0.3, 0.85, -0.08, 0xffd23f), 'swim'),
      moving(box(0.11, 0.07, 0.04, 0, 1.02, -0.02, 0xe8556b), 'swim'),
      box(0.04, 0.3, 0.04, 0.55, 0.75, 0.1, 0x5d9c59),
      box(0.04, 0.2, 0.04, 0.6, 0.75, -0.05, 0x74b56f),
      // More plants along the back, swaying in the water, and a few pebbles.
      ...waterPlant(-0.63, -0.12, [0.12, 0.12, 0.1], 0.05, 0x3f8f4a),
      ...waterPlant(-0.55, -0.16, [0.1, 0.09], 0.045, 0x4fa35a),
      ...waterPlant(-0.13, -0.17, [0.08], 0.018, 0x6cc06a),
      ...waterPlant(-0.1, -0.15, [0.1], 0.018, 0x6cc06a),
      ...waterPlant(-0.07, -0.17, [0.07], 0.018, 0x6cc06a),
      ...waterPlant(0.2, -0.15, [0.07, 0.08], 0.08, 0x2f7d3f),
      ...waterPlant(0.34, -0.12, [0.06, 0.05], 0.04, 0xb5485f),
      box(0.06, 0.03, 0.05, 0.05, AQUARIUM_SAND, 0.12, 0x9a9a9a),
      box(0.04, 0.025, 0.04, 0.12, AQUARIUM_SAND, 0.1, 0x7d7d7d),
      box(0.05, 0.02, 0.04, -0.45, AQUARIUM_SAND, -0.02, 0xa89a88),
      ...treasureChest(),
      moving(box(0.035, 0.035, 0.035, 0.5, 0.78, 0.05, WHITE), 'bubble'),
      moving(box(0.03, 0.03, 0.03, 0.52, 0.78, -0.02, WHITE), 'bubble'),
      moving(box(0.025, 0.025, 0.025, 0.47, 0.78, 0.02, WHITE), 'bubble'),
    ],
  },
  {
    type: 'gerbil-cage', label: 'Gerbil Cage', emoji: '🐹', category: 'pets', footprint: { w: 1, d: 1 }, color: DARK_WOOD, height: 1.2, use: 'stand',
    thoughts: ['🐹', '🥕', '😍'], advertises: { fun: 18 }, activity: 'peer',
    parts: [
      // The pedestal.
      box(0.6, 0.66, 0.45),
      box(0.7, 0.04, 0.55, 0, 0.66),
      // The tray, bedding and a little hideout in the back corner.
      box(CAGE_HALF_W * 2 + 0.02, 0.06, CAGE_HALF_D * 2 + 0.02, 0, 0.7, 0, 0x4f9fd8),
      box(CAGE_HALF_W * 2 - 0.02, 0.02, CAGE_HALF_D * 2 - 0.02, 0, 0.76, 0, 0xe8d6a8),
      box(0.16, 0.11, 0.14, -0.28, CAGE_FLOOR, -0.15, 0xf28fb0),
      box(0.06, 0.06, 0.01, -0.28, CAGE_FLOOR, -0.075, NEAR_BLACK),
      // A water bottle hung on the side, and a food bowl.
      box(0.05, 0.16, 0.05, -CAGE_HALF_W + 0.04, CAGE_FLOOR + 0.12, 0.12, 0xbfe3ee, 0.6),
      box(0.012, 0.06, 0.012, -CAGE_HALF_W + 0.04, CAGE_FLOOR + 0.06, 0.12, STEEL),
      // Off to the side, clear of the gerbil's laps.
      box(0.09, 0.03, 0.09, 0.27, CAGE_FLOOR, 0.15, 0xe86a4a),
      ...cageBars(CAGE_HALF_W, CAGE_HALF_D, CAGE_FLOOR, CAGE_HEIGHT),
      ...exerciseWheel(),
      ...gerbilParts(),
    ],
  },
  {
    type: 'gecko-tank', label: 'Gecko Tank', emoji: '🦎', category: 'pets', footprint: { w: 1, d: 1 }, color: DARK_WOOD, height: 1.35, use: 'stand',
    thoughts: ['🦎', '😍', '👀'], advertises: { fun: 18 }, activity: 'peer', approach: 'front',
    // A dim plant light in the lid.
    light: { color: 0xe6ffe0, at: [0, 1.28, 0], strength: 0.9, pool: 1, halo: 0.3 },
    parts: [
      // The stand, a base frame, and the soil.
      box(0.62, 0.55, 0.5),
      box(0.64, 0.04, 0.52, 0, 0.55, 0, NEAR_BLACK),
      box(0.6, 0.03, 0.48, 0, 0.59, 0, SOIL),
      // The glass, with posts up the corners, a frame and mesh lid on top, and the light bar in it.
      box(0.6, 0.72, 0.48, 0, 0.59, 0, GLASS, 0.28),
      box(0.025, 0.74, 0.025, 0.29, 0.59, 0.23, NEAR_BLACK),
      box(0.025, 0.74, 0.025, -0.29, 0.59, 0.23, NEAR_BLACK),
      box(0.025, 0.74, 0.025, 0.29, 0.59, -0.23, NEAR_BLACK),
      box(0.025, 0.74, 0.025, -0.29, 0.59, -0.23, NEAR_BLACK),
      box(0.62, 0.03, 0.03, 0, 1.31, 0.235, NEAR_BLACK),
      box(0.62, 0.03, 0.03, 0, 1.31, -0.235, NEAR_BLACK),
      box(0.03, 0.03, 0.5, 0.295, 1.31, 0, NEAR_BLACK),
      box(0.03, 0.03, 0.5, -0.295, 1.31, 0, NEAR_BLACK),
      box(0.6, 0.008, 0.48, 0, 1.32, 0, 0x3a3a3a, 0.35),
      glowingBox(0.46, 0.015, 0.04, 0, 1.33, 0, 0xeaffea),
      // A slab of cork bark up the back, a branch across, a couple of plants and a water dish.
      box(0.32, 0.5, 0.03, -0.1, GECKO_FLOOR, -0.215, 0x8b6b4a),
      box(0.3, 0.03, 0.03, -0.05, 0.95, -0.17, BARK),
      box(0.03, 0.2, 0.03, -0.19, GECKO_FLOOR, -0.17, BARK),
      box(0.04, 0.18, 0.04, -0.23, GECKO_FLOOR, 0.1, 0x5d9c59),
      box(0.12, 0.03, 0.04, -0.21, GECKO_FLOOR + 0.12, 0.1, 0x74b56f),
      box(0.04, 0.03, 0.1, -0.23, GECKO_FLOOR + 0.07, 0.11, 0x74b56f),
      box(0.03, 0.12, 0.03, 0.18, GECKO_FLOOR, -0.17, 0x4fa35a),
      box(0.08, 0.025, 0.03, 0.18, GECKO_FLOOR + 0.1, -0.16, 0x6cc06a),
      box(0.1, 0.025, 0.1, 0.17, GECKO_FLOOR, -0.06, 0x7f8a90),
      box(0.075, 0.008, 0.075, 0.17, GECKO_FLOOR + 0.02, -0.06, WATER),
      // Two geckos: a tan crested gecko and a green day gecko.
      ...geckoParts('gecko', { body: 0xd9894a, head: 0xe09a5a, spots: 0xa8622e, pads: 0xf0c08a }),
      ...geckoParts('gecko2', { body: 0x9ee03a, head: 0xb4ea52, spots: 0xe0402e, pads: 0xe6f7a0 }),
    ],
  },
  {
    type: 'lizard-tank', label: 'Lizard Tank', emoji: '🦎', category: 'pets', footprint: { w: 2, d: 1 }, color: DARK_WOOD, height: 1.3, use: 'stand',
    thoughts: ['🦎', '👀', '😮'], advertises: { fun: 18 }, activity: 'peer', approach: 'front',
    // A warm basking lamp, kept dim.
    light: { color: 0xffb35a, at: [BASKING_ROCK.x, 1.12, BASKING_ROCK.z], strength: 1.4, pool: 1.2, halo: 0.4 },
    parts: [
      // The stand, then the glass, with a dark frame and a mesh lid you can see through.
      box(1.6, 0.7, 0.55),
      box(1.5, 0.45, 0.45, 0, 0.72, 0, GLASS, 0.3),
      // Dark posts up the corners, so the glass reads as a tank.
      box(0.03, 0.47, 0.03, 0.765, 0.7, 0.235, NEAR_BLACK),
      box(0.03, 0.47, 0.03, -0.765, 0.7, 0.235, NEAR_BLACK),
      box(0.03, 0.47, 0.03, 0.765, 0.7, -0.235, NEAR_BLACK),
      box(0.03, 0.47, 0.03, -0.765, 0.7, -0.235, NEAR_BLACK),
      box(1.6, 0.04, 0.05, 0, 1.17, 0.25, NEAR_BLACK),
      box(1.6, 0.04, 0.05, 0, 1.17, -0.25, NEAR_BLACK),
      box(0.05, 0.04, 0.55, 0.78, 1.17, 0, NEAR_BLACK),
      box(0.05, 0.04, 0.55, -0.78, 1.17, 0, NEAR_BLACK),
      box(1.5, 0.01, 0.45, 0, 1.18, 0, 0x3a3a3a, 0.35),
      // The basking lamp on the lid, over the rock, with its bulb glowing through.
      box(0.18, 0.08, 0.18, BASKING_ROCK.x, 1.19, BASKING_ROCK.z, NEAR_BLACK),
      glowingBox(0.1, 0.03, 0.1, BASKING_ROCK.x, 1.15, BASKING_ROCK.z, 0xffc070),
      // Sand, the flat rock, a log to hide under, a water dish and a plant.
      box(1.5, 0.05, 0.45, 0, 0.72, 0, 0xd9b77a),
      box(0.3, 0.1, 0.26, BASKING_ROCK.x, TERRARIUM_SAND, BASKING_ROCK.z, 0x8a8178),
      box(0.22, 0.03, 0.18, BASKING_ROCK.x - 0.02, TERRARIUM_SAND + 0.1 - 0.03, BASKING_ROCK.z, 0x9c948a),
      box(0.4, 0.07, 0.1, -0.15, TERRARIUM_SAND, -0.15, BARK),
      box(0.4, 0.02, 0.06, -0.15, TERRARIUM_SAND + 0.07, -0.15, 0x7d5a3a),
      box(0.14, 0.03, 0.14, -0.55, TERRARIUM_SAND, 0.08, 0x7f8a90),
      box(0.11, 0.01, 0.11, -0.55, TERRARIUM_SAND + 0.025, 0.08, WATER),
      box(0.04, 0.22, 0.04, -0.62, TERRARIUM_SAND, -0.14, 0x5d9c59),
      box(0.12, 0.03, 0.04, -0.6, TERRARIUM_SAND + 0.14, -0.14, 0x74b56f),
      box(0.04, 0.03, 0.12, -0.63, TERRARIUM_SAND + 0.09, -0.12, 0x74b56f),
      ...lizardParts(),
    ],
  },
  {
    type: 'snake-terrarium', label: 'Snake Terrarium', emoji: '🐍', category: 'pets', footprint: { w: 2, d: 1 }, color: DARK_WOOD, height: 1.3, use: 'stand',
    thoughts: ['🐍', '👀', '😮', '😍'], advertises: { fun: 18 }, activity: 'peer', approach: 'front',
    // A warm heat lamp at one end, kept dim.
    light: { color: 0xffb35a, at: [0.55, 1.12, -0.05], strength: 1.3, pool: 1.2, halo: 0.4 },
    parts: [
      // A low cabinet, then the vivarium on top: wooden back, sides and roof, and a glass front.
      box(1.6, 0.58, 0.55),
      box(1.62, 0.04, 0.57, 0, 0.58, 0, NEAR_BLACK),
      box(1.56, 0.03, 0.5, 0, 0.62, 0, 0x4a3524),
      box(1.56, 0.5, 0.03, 0, 0.62, -0.25, DARK_WOOD),
      box(0.03, 0.5, 0.5, -0.78, 0.62, 0, DARK_WOOD),
      box(0.03, 0.5, 0.5, 0.78, 0.62, 0, DARK_WOOD),
      box(1.56, 0.46, 0.012, 0, 0.64, 0.245, GLASS, 0.28),
      box(1.6, 0.04, 0.04, 0, 0.6, 0.25, NEAR_BLACK),
      box(1.6, 0.04, 0.04, 0, 1.1, 0.25, NEAR_BLACK),
      // A mesh panel in the roof, so it can be seen into from above, with a wooden rim round it.
      box(1.6, 0.03, 0.06, 0, 1.12, -0.25, DARK_WOOD),
      box(0.06, 0.03, 0.5, -0.78, 1.12, 0, DARK_WOOD),
      box(0.06, 0.03, 0.5, 0.78, 1.12, 0, DARK_WOOD),
      box(1.52, 0.01, 0.46, 0, 1.13, 0, 0x6a6a6a, 0.14),
      // The heat lamp in the roof, with its bulb glowing through.
      box(0.16, 0.07, 0.16, 0.55, 1.14, -0.05, NEAR_BLACK),
      glowingBox(0.09, 0.03, 0.09, 0.55, 1.11, -0.05, 0xffc070),
      // Bark chips, a hollow log to hide in, a branch to climb, a water bowl and a plant.
      box(1.54, 0.04, 0.48, 0, SNAKE_FLOOR - 0.04, 0, 0xb08a5c),
      box(0.26, 0.09, 0.12, -0.32, SNAKE_FLOOR, -0.17, BARK),
      box(0.22, 0.05, 0.08, -0.32, SNAKE_FLOOR + 0.02, -0.17, 0x3a2a1c),
      { ...box(0.03, 0.03, 0.62, 0.2, SNAKE_FLOOR + 0.2, -0.16, BARK), turn: Math.PI / 2 + 0.25, tilt: 0.35 },
      box(0.03, 0.22, 0.03, -0.05, SNAKE_FLOOR, -0.2, BARK),
      box(0.15, 0.04, 0.15, -0.66, SNAKE_FLOOR, 0.12, 0x7f8a90),
      box(0.11, 0.01, 0.11, -0.66, SNAKE_FLOOR + 0.035, 0.12, WATER),
      box(0.04, 0.24, 0.04, 0.68, SNAKE_FLOOR, -0.17, 0x5d9c59),
      box(0.13, 0.03, 0.04, 0.66, SNAKE_FLOOR + 0.16, -0.16, 0x74b56f),
      box(0.04, 0.03, 0.12, 0.69, SNAKE_FLOOR + 0.1, -0.14, 0x74b56f),
      ...snakeParts(),
    ],
  },
  {
    type: 'parrot-cage', label: 'Parrot Cage', emoji: '🦜', category: 'pets', footprint: { w: 1, d: 1 }, color: BRASS, height: 1.6, use: 'stand',
    thoughts: ['🦜', '💬', '😂'], advertises: { fun: 18 }, activity: 'peer',
    parts: [
      // The stand: a round-ish base, a pole, and a dish the cage sits in.
      box(0.42, 0.04, 0.42, 0, 0, 0, 0x3d3d3d),
      box(0.05, PARROT_FLOOR - 0.08, 0.05, 0, 0.04),
      box(0.56, 0.04, 0.56, 0, PARROT_FLOOR - 0.04),
      box(PARROT_HALF * 2, 0.02, PARROT_HALF * 2, 0, PARROT_FLOOR, 0, 0xe8d6a8),
      ...cageBars(PARROT_HALF, PARROT_HALF, PARROT_FLOOR, PARROT_CAGE_HEIGHT, BRASS),
      // A stepped dome, with a ring on top.
      box(PARROT_HALF * 1.6, 0.06, PARROT_HALF * 1.6, 0, PARROT_FLOOR + PARROT_CAGE_HEIGHT),
      box(PARROT_HALF * 1.0, 0.06, PARROT_HALF * 1.0, 0, PARROT_FLOOR + PARROT_CAGE_HEIGHT + 0.06),
      box(0.03, 0.08, 0.03, 0, PARROT_FLOOR + PARROT_CAGE_HEIGHT + 0.12),
      box(0.1, 0.03, 0.03, 0, PARROT_FLOOR + PARROT_CAGE_HEIGHT + 0.2),
      // The perch, side to side, and a food cup.
      box(PARROT_HALF * 2, 0.025, 0.025, 0, PARROT_FLOOR + 0.175, 0, 0x9a7650),
      box(0.08, 0.05, 0.06, 0.15, PARROT_FLOOR + 0.1, -PARROT_HALF + 0.04, 0x5fa8d3),
      ...parrotParts(),
    ],
  },
  {
    type: 'bug-cage', label: 'Bug Cage', emoji: '🐛', category: 'pets', footprint: { w: 1, d: 1 }, color: DARK_WOOD, height: 1, use: 'stand',
    thoughts: ['🐛', '✨', '🐞', '😍'], advertises: { fun: 16 }, activity: 'peer',
    // The fireflies' glow, faint but enough to see by in the dark.
    light: { color: FIREFLY, at: [0, BUG_CAGE_FLOOR + 0.22, 0], strength: 0.7, pool: 0.9, halo: 0.35, flicker: true },
    parts: bugCageParts(),
  },
  {
    type: 'fireplace', label: 'Fireplace', emoji: '🔥', category: 'decor', footprint: { w: 2, d: 1 }, color: 0xa65a46, height: 1.2, use: 'stand',
    thoughts: ['🔥', '😌', '🧣'], advertises: { fun: 15 }, activity: 'warm', approach: 'front',
    switchable: { on: { label: 'Light the fire', emoji: '🔥' }, off: { label: 'Put out the fire', emoji: '🧯' }, use: { label: 'Warm up by it', emoji: '🧣' } },
    light: { color: 0xff8a3a, at: [0, 0.35, 0.3], strength: 6, pool: 2.6, halo: 1.1, flicker: true },
    parts: [
      // Logs in the grate, which are all that's left when the fire's out.
      box(0.34, 0.07, 0.09, -0.03, 0.08, 0.04, 0x5a3d26),
      box(0.3, 0.07, 0.09, 0.05, 0.08, -0.06, DARK_WOOD),
      box(0.26, 0.06, 0.08, 0, 0.15, -0.01, 0x6b4a2e),
      box(0.45, 1.1, 0.6, -0.6, 0, -0.1),
      box(0.45, 1.1, 0.6, 0.6, 0, -0.1),
      box(0.75, 0.35, 0.6, 0, 0.75, -0.1),
      box(0.75, 0.75, 0.3, 0, 0, -0.25, NEAR_BLACK),
      box(1.8, 0.08, 0.7, 0, 1.1, -0.08, DARK_WOOD),
      box(0.5, 0.08, 0.1, 0, 0, 0.05, DARK_WOOD),
      glowingBox(0.42, 0.04, 0.16, 0, 0.08, 0.02, 0xc0392b),
      moving(glowingBox(0.4, 0.2, 0.2, 0, 0.08, 0.02, 0xff8a2a), 'flicker'),
      moving(glowingBox(0.12, 0.22, 0.1, -0.12, 0.12, 0.03, 0xff6a1a), 'flicker'),
      moving(glowingBox(0.2, 0.14, 0.12, 0.03, 0.28, 0.02, 0xffd04a), 'flicker'),
    ],
  },

  // Outdoor: trees, plants, a pond and gardens, for the yard. A tree's leaves spread wider than its square.
  // Wall art: pictures, posters and a clock that hang on the wall behind their squares.
  ...wallArt('small-painting', 'Small Painting', '🌅', 1, 0xc9a24d, [
    frame(0.42, 0.34, 0, 1.3, 0xc9a24d),
    paint(0.36, 0.28, 0, 1.33, 0xf4a261),
    paint(0.36, 0.09, 0, 1.33, 0x2a6f97, 1),
    paint(0.09, 0.09, 0.07, 1.44, 0xffe08a, 1),
    paint(0.36, 0.015, 0, 1.42, 0xf7c59f, 2),
  ]),
  ...wallArt('landscape-painting', 'Landscape', '🏞️', 1, DARK_WOOD, [
    frame(0.74, 0.54, 0, 1.08, DARK_WOOD),
    paint(0.66, 0.46, 0, 1.12, 0x8fc3e0),
    paint(0.66, 0.14, 0, 1.12, 0x6aa84f, 1),
    paint(0.34, 0.1, -0.16, 1.24, 0x4f8a3a, 1),
    paint(0.18, 0.06, -0.16, 1.34, 0x4f8a3a, 2),
    paint(0.08, 0.08, 0.2, 1.44, 0xf6d04d, 1),
    paint(0.025, 0.1, 0.14, 1.24, 0x6b4a2e, 2),
    paint(0.1, 0.1, 0.14, 1.32, 0x2f7d3f, 3),
    paint(0.14, 0.04, -0.05, 1.47, WHITE, 1),
  ]),
  ...wallArt('tall-painting', 'Tall Portrait', '🧑‍🎨', 1, 0xc9a24d, [
    frame(0.48, 1.02, 0, 0.74, 0xc9a24d),
    paint(0.4, 0.94, 0, 0.78, 0x3b5a40),
    paint(0.24, 0.42, 0, 0.84, 0x7a3b3b, 1),
    paint(0.12, 0.08, 0, 1.24, 0xf1c27d, 1),
    paint(0.13, 0.14, 0, 1.3, 0xf1c27d, 1),
    paint(0.15, 0.05, 0, 1.42, 0x4a2f1b, 2),
    paint(0.025, 0.025, -0.03, 1.37, NEAR_BLACK, 2),
    paint(0.025, 0.025, 0.03, 1.37, NEAR_BLACK, 2),
    paint(0.1, 0.06, 0, 1.18, WHITE, 2),
  ]),
  ...wallArt('wide-painting', 'Wide Painting', '🏔️', 2, DARK_WOOD, [
    frame(1.62, 0.56, 0, 1.08, DARK_WOOD),
    paint(1.54, 0.48, 0, 1.12, 0xbfe3ee),
    paint(1.54, 0.1, 0, 1.12, 0x2a6f97, 2),
    paint(0.6, 0.16, -0.42, 1.2, 0x7a8ca3, 1),
    paint(0.36, 0.1, -0.42, 1.36, 0x7a8ca3, 1),
    paint(0.14, 0.07, -0.42, 1.46, WHITE, 1),
    paint(0.7, 0.14, 0.28, 1.2, 0x5d6d85, 1),
    paint(0.44, 0.1, 0.28, 1.34, 0x5d6d85, 1),
    paint(0.18, 0.08, 0.28, 1.44, WHITE, 1),
    paint(0.5, 0.08, 0.6, 1.2, 0x6aa84f, 2),
    paint(0.08, 0.08, -0.05, 1.48, 0xffe08a, 1),
  ]),
  ...wallArt('collage', 'Photo Collage', '📸', 2, DARK_WOOD, collageParts(), ['📸', '🥹', '😊']),
  ...wallArt('triptych', 'Three Panels', '🎆', 2, 0x2f4858, [
    ...[-0.52, 0, 0.52].flatMap((x, i) => [
      frame(0.44, 0.64, x, 1.02, 0x2f4858, 0.03),
      paint(0.44, 0.22, x, 1.02, [0xf26419, 0xf6ae2d, 0x86bbd8][i], 0, 0.03),
      paint(0.44, 0.1, x, 1.24 + i * 0.06, 0xf6ae2d, 1, 0.03),
      paint(0.12, 0.12, x + (i - 1) * 0.08, 1.42 - i * 0.04, WHITE, 1, 0.03),
    ]),
  ]),
  ...wallArt('abstract-painting', 'Abstract', '🟥', 1, WHITE, [
    frame(0.62, 0.62, 0, 1.08, WHITE),
    paint(0.56, 0.56, 0, 1.11, 0xf2efe6),
    paint(0.3, 0.3, -0.13, 1.37, 0xd63c2f, 1),
    paint(0.18, 0.16, 0.19, 1.11, 0x2b59a8, 1),
    paint(0.14, 0.12, 0.21, 1.47, 0xf2c230, 1),
    paint(0.02, 0.56, 0.1, 1.11, NEAR_BLACK, 2),
    paint(0.56, 0.02, 0, 1.35, NEAR_BLACK, 2),
    paint(0.18, 0.02, 0.19, 1.27, NEAR_BLACK, 2),
  ]),
  ...wallArt('poster', 'Poster', '🎸', 1, 0x2d3047, [
    paint(0.46, 0.64, 0, 1.0, 0x2d3047, 0, 0.004),
    paint(0.3, 0.3, 0, 1.24, 0xf28f3b, 1, 0.004),
    paint(0.18, 0.18, 0, 1.3, 0xffd166, 2, 0.004),
    paint(0.34, 0.035, 0, 1.12, WHITE, 1, 0.004),
    paint(0.24, 0.02, 0, 1.07, 0x9aa5b1, 1, 0.004),
    paint(0.03, 0.03, -0.2, 1.6, 0xd63c2f, 1, 0.004),
    paint(0.03, 0.03, 0.2, 1.6, 0xd63c2f, 1, 0.004),
  ], ['🎸', '🤘', '😎']),
  ...wallArt('pinboard', 'Pinboard', '📌', 1, 0x8f6b48, [
    frame(0.62, 0.46, 0, 1.12, 0x8f6b48),
    paint(0.56, 0.4, 0, 1.15, 0xc8a06a),
    paint(0.12, 0.12, -0.17, 1.37, 0xfff3a0, 1),
    paint(0.14, 0.1, 0.02, 1.4, 0xf8c8dc, 1),
    paint(0.12, 0.16, 0.18, 1.2, WHITE, 1),
    paint(0.1, 0.08, 0.18, 1.26, 0x8fc3e0, 2),
    paint(0.16, 0.11, -0.12, 1.18, 0xbfe3ee, 1),
    paint(0.1, 0.012, -0.12, 1.25, 0x4f81bd, 2),
    paint(0.08, 0.012, -0.13, 1.22, 0x4f81bd, 2),
    paint(0.02, 0.02, -0.17, 1.47, 0xd63c2f, 2),
    paint(0.02, 0.02, 0.02, 1.48, 0x3c9a5f, 2),
    paint(0.02, 0.02, 0.18, 1.34, 0xf2c230, 3),
    paint(0.02, 0.02, -0.12, 1.27, 0xd63c2f, 2),
  ], ['📌', '📝', '🤔']),
  ...wallArt('cat-painting', 'Cat Portrait', '🐱', 1, DARK_WOOD, [
    frame(0.58, 0.72, 0, 0.94, DARK_WOOD),
    paint(0.5, 0.64, 0, 0.98, 0xbfd8e8),
    paint(0.5, 0.12, 0, 0.98, 0xe8b4c8, 1),
    paint(0.46, 0.03, 0, 1.08, 0xd98ba8, 1),
    ...paintedCat(-0.02, 1.08),
  ], ['🐱', '😻', '🥰']),
  ...wallArt('dog-painting', 'Dog Portrait', '🐶', 1, 0xc9a24d, [
    frame(0.58, 0.72, 0, 0.94, 0xc9a24d),
    paint(0.5, 0.64, 0, 0.98, 0x8fc3e0),
    paint(0.5, 0.26, 0, 0.98, 0x9bbb59, 1),
    paint(0.12, 0.08, -0.15, 1.5, WHITE, 1),
    paint(0.1, 0.06, -0.09, 1.53, WHITE, 1),
    paint(0.07, 0.07, 0.17, 1.52, 0xffd166, 1),
    ...paintedDog(0, 1.2),
  ], ['🐶', '🥰', '🐾']),
  ...wallArt('pets-painting', 'Cat and Dog', '🐾', 2, DARK_WOOD, [
    frame(1.3, 0.72, 0, 0.94, DARK_WOOD),
    paint(1.22, 0.64, 0, 0.98, 0xf3e2b8),
    // A window behind them, and the sofa they've taken over.
    paint(0.36, 0.26, 0.38, 1.3, 0x8fc3e0, 1),
    paint(0.36, 0.02, 0.38, 1.42, WHITE, 2),
    paint(0.02, 0.26, 0.38, 1.3, WHITE, 2),
    paint(1.0, 0.22, 0, 1.0, 0x7695c4, 1),
    paint(1.0, 0.1, 0, 1.2, 0x5b7bab, 1),
    paint(0.08, 0.2, -0.5, 1.02, 0x5b7bab, 2),
    paint(0.08, 0.2, 0.5, 1.02, 0x5b7bab, 2),
    ...paintedCat(-0.26, 1.16, 3, 0x6b6b6b, 0x3f3f3f),
    ...paintedDog(0.2, 1.24, 3, 0xd9a35f, 0x9a6b44),
  ], ['🐱', '🐶', '🥰']),
  ...wallArt('wall-clock', 'Wall Clock', '🕒', 1, 0x6b4a2e, wallClockParts(), ['🕒', '⏰', '😮']),

  // Tabletop: small things set on a table, counter, dresser, nightstand, desk or bookshelf.
  ...tabletop('table-lamp', 'Table Lamp', '💡', 0xe8dcc0, [
    box(0.16, 0.03, 0.16, 0, 0, 0, 0x8f6b48),
    box(0.03, 0.27, 0.03, 0, 0.03, 0, BRASS),
    glowingBox(0.26, 0.17, 0.26, 0, 0.3, 0, 0xfff1c9),
  ], { color: 0xffd38a, at: [0, 0.38, 0], strength: 2.4, pool: 1.4, halo: 0.45 }),
  ...tabletop('desk-lamp', 'Desk Lamp', '🔦', 0x3c7a8a, [
    box(0.14, 0.025, 0.12, 0, 0, 0, NEAR_BLACK),
    box(0.025, 0.24, 0.025, -0.04, 0.025, 0, NEAR_BLACK),
    box(0.17, 0.025, 0.025, 0.035, 0.24, 0, NEAR_BLACK),
    box(0.1, 0.06, 0.1, 0.12, 0.2, 0),
    glowingBox(0.07, 0.01, 0.07, 0.12, 0.195, 0, 0xfff1c9),
  ], { color: 0xfff0c8, at: [0.12, 0.18, 0], strength: 1.6, pool: 1, halo: 0.3 }),
  ...tabletop('candles', 'Candles', '🕯️', 0xf6efe0, [
    box(0.26, 0.015, 0.12, 0, 0, 0, BRASS),
    box(0.045, 0.14, 0.045, -0.08, 0.015, 0),
    box(0.045, 0.1, 0.045, 0, 0.015, 0),
    box(0.045, 0.18, 0.045, 0.08, 0.015, 0),
    moving(glowingBox(0.02, 0.04, 0.02, -0.08, 0.155, 0, 0xffb347), 'flicker'),
    moving(glowingBox(0.02, 0.04, 0.02, 0, 0.115, 0, 0xffb347), 'flicker'),
    moving(glowingBox(0.02, 0.04, 0.02, 0.08, 0.195, 0, 0xffb347), 'flicker'),
  ], { color: 0xff9a40, at: [0, 0.22, 0], strength: 1.1, pool: 1, halo: 0.3, flicker: true }),
  ...tabletop('fruit-bowl', 'Fruit Bowl', '🍎', 0xd8cbb0, [
    box(0.18, 0.025, 0.18, 0, 0, 0),
    box(0.28, 0.05, 0.28, 0, 0.025, 0),
    box(0.07, 0.07, 0.07, -0.06, 0.06, 0.04, APPLE_RED),
    box(0.075, 0.075, 0.075, 0.05, 0.06, -0.01, 0xf39c32),
    box(0.065, 0.065, 0.065, -0.02, 0.06, -0.07, 0x9bd35a),
    box(0.17, 0.035, 0.05, 0.01, 0.12, 0.05, 0xf4d03f),
  ]),
  ...tabletop('bowl', 'Bowl', '🥣', 0x5aa3c7, [
    box(0.12, 0.02, 0.12, 0, 0, 0),
    box(0.22, 0.05, 0.22, 0, 0.02, 0),
    box(0.18, 0.01, 0.18, 0, 0.065, 0, 0xe8c46a),
    box(0.02, 0.015, 0.16, 0.06, 0.07, 0.02, STEEL),
  ]),
  ...tabletop('vase', 'Vase of Flowers', '💐', 0x4f81bd, [
    box(0.11, 0.2, 0.11, 0, 0, 0),
    box(0.07, 0.04, 0.07, 0, 0.2, 0),
    box(0.012, 0.14, 0.012, -0.03, 0.24, 0, 0x5d9c59),
    box(0.012, 0.18, 0.012, 0.01, 0.24, 0.02, 0x5d9c59),
    box(0.012, 0.12, 0.012, 0.03, 0.24, -0.03, 0x5d9c59),
    box(0.06, 0.05, 0.06, -0.04, 0.37, 0, 0xe8556b),
    box(0.06, 0.05, 0.06, 0.01, 0.41, 0.02, 0xf4d03f),
    box(0.06, 0.05, 0.06, 0.04, 0.35, -0.04, 0xb39ddb),
  ]),
  ...tabletop('succulent', 'Succulent', '🪴', 0xc8794a, [
    box(0.13, 0.09, 0.13, 0, 0, 0),
    box(0.11, 0.01, 0.11, 0, 0.09, 0, SOIL),
    box(0.1, 0.04, 0.04, 0, 0.1, 0, 0x7fb77e),
    box(0.04, 0.04, 0.1, 0, 0.1, 0, 0x7fb77e),
    box(0.06, 0.05, 0.06, 0, 0.12, 0, 0x93c992),
  ]),
  ...tabletop('cactus', 'Cactus', '🌵', 0xd98b4a, [
    box(0.12, 0.08, 0.12, 0, 0, 0),
    box(0.06, 0.22, 0.06, 0, 0.08, 0, 0x4f9a5a),
    box(0.06, 0.03, 0.03, 0.05, 0.16, 0, 0x4f9a5a),
    box(0.03, 0.07, 0.03, 0.07, 0.19, 0, 0x4f9a5a),
    box(0.03, 0.03, 0.03, 0, 0.3, 0, 0xe8556b),
  ]),
  ...tabletop('book-stack', 'Stack of Books', '📚', 0x4f81bd, [
    box(0.24, 0.05, 0.17, 0, 0, 0, 0x7a3b3b),
    box(0.21, 0.04, 0.15, 0.01, 0.05, 0.01, 0x4f81bd),
    box(0.22, 0.045, 0.16, -0.01, 0.09, 0, 0x9bbb59),
    box(0.16, 0.03, 0.12, 0, 0.135, 0, 0xf0c94d),
  ]),
  ...tabletop('picture-frame', 'Picture Frame', '🖼️', DARK_WOOD, [
    box(0.2, 0.24, 0.025, 0, 0, 0),
    box(0.16, 0.12, 0.005, 0, 0.1, 0.014, 0x8fc3e0),
    box(0.16, 0.06, 0.005, 0, 0.04, 0.014, 0x7fb77e),
    box(0.04, 0.04, 0.006, 0.03, 0.17, 0.016, 0xfff1c9),
    box(0.03, 0.18, 0.08, 0, 0, -0.05),
  ]),
  ...tabletop('alarm-clock', 'Alarm Clock', '⏰', 0xd8453a, [
    box(0.15, 0.11, 0.08, 0, 0.02, 0),
    box(0.03, 0.02, 0.03, -0.05, 0, 0, NEAR_BLACK),
    box(0.03, 0.02, 0.03, 0.05, 0, 0, NEAR_BLACK),
    box(0.11, 0.08, 0.005, 0, 0.035, 0.041, WHITE),
    box(0.006, 0.03, 0.006, 0, 0.07, 0.045, NEAR_BLACK),
    box(0.025, 0.006, 0.006, 0.012, 0.075, 0.045, NEAR_BLACK),
    box(0.05, 0.03, 0.05, -0.045, 0.13, 0),
    box(0.05, 0.03, 0.05, 0.045, 0.13, 0),
  ]),
  ...tabletop('coffee-maker', 'Coffee Maker', '☕', NEAR_BLACK, [
    box(0.22, 0.03, 0.22, 0, 0, 0),
    box(0.22, 0.34, 0.08, 0, 0, -0.07),
    box(0.22, 0.06, 0.22, 0, 0.3, 0),
    box(0.13, 0.13, 0.12, 0, 0.03, 0.04, GLASS, 0.5),
    box(0.11, 0.06, 0.1, 0, 0.035, 0.04, 0x5a3a22),
    glowingBox(0.02, 0.02, 0.005, 0.07, 0.32, 0.111, 0xff5a3a),
  ]),
  ...tabletop('toaster', 'Toaster', '🍞', STEEL, [
    box(0.26, 0.15, 0.15, 0, 0, 0),
    box(0.17, 0.006, 0.025, 0, 0.15, -0.03, NEAR_BLACK),
    box(0.17, 0.006, 0.025, 0, 0.15, 0.03, NEAR_BLACK),
    box(0.15, 0.04, 0.02, 0, 0.13, -0.03, 0xd9a35f),
    box(0.02, 0.03, 0.03, 0.135, 0.09, 0, NEAR_BLACK),
  ]),
  ...tabletop('microwave', 'Microwave', '📦', 0xe8e8e8, [
    box(0.48, 0.27, 0.34, 0, 0, -0.02),
    box(0.29, 0.19, 0.005, -0.07, 0.04, 0.151, NEAR_BLACK),
    box(0.09, 0.21, 0.005, 0.17, 0.03, 0.151, 0x7f8a90),
    glowingBox(0.06, 0.02, 0.004, 0.17, 0.2, 0.155, 0x6fdc8c),
  ]),
  ...tabletop('kettle', 'Kettle', '🫖', 0xd8453a, [
    box(0.17, 0.02, 0.17, 0, 0, 0, NEAR_BLACK),
    box(0.15, 0.16, 0.13, 0, 0.02, 0),
    box(0.07, 0.03, 0.03, 0.1, 0.12, 0),
    box(0.03, 0.06, 0.03, -0.085, 0.1, 0, NEAR_BLACK),
    box(0.1, 0.025, 0.03, -0.04, 0.18, 0, NEAR_BLACK),
    box(0.03, 0.02, 0.03, 0.02, 0.18, 0, NEAR_BLACK),
  ]),
  ...tabletop('cookie-jar', 'Cookie Jar', '🍪', 0xc0504d, [
    box(0.15, 0.17, 0.15, 0, 0, 0, GLASS, 0.5),
    box(0.11, 0.1, 0.11, 0, 0.01, 0, 0xc68642),
    box(0.16, 0.03, 0.16, 0, 0.17, 0),
    box(0.04, 0.03, 0.04, 0, 0.2, 0),
  ]),
  ...usableTabletop('laptop', 'Laptop', '💻', 0xb0b8bf, [
    box(0.32, 0.015, 0.21, 0, 0, 0.03),
    box(0.27, 0.004, 0.1, 0, 0.015, 0.04, 0x55606a),
    box(0.32, 0.21, 0.012, 0, 0.015, -0.08),
    glowingBox(0.28, 0.17, 0.004, 0, 0.035, -0.072, 0x6fa8dc),
  ]),
  ...usableTabletop('radio', 'Radio', '📻', 0x8b5a2b, [
    box(0.28, 0.15, 0.11, 0, 0, 0),
    box(0.11, 0.1, 0.005, -0.065, 0.025, 0.056, 0x3a3a3a),
    box(0.09, 0.04, 0.005, 0.07, 0.08, 0.056, 0xf2e6c4),
    box(0.025, 0.025, 0.02, 0.05, 0.03, 0.06, NEAR_BLACK),
    box(0.025, 0.025, 0.02, 0.095, 0.03, 0.06, NEAR_BLACK),
    box(0.008, 0.2, 0.008, 0.11, 0.15, -0.03, STEEL),
  ]),
  ...tabletop('globe', 'Globe', '🌍', 0x4f81bd, [
    box(0.13, 0.02, 0.13, 0, 0, 0, DARK_WOOD),
    box(0.02, 0.08, 0.02, 0, 0.02, 0, BRASS),
    ...globeParts(),
  ]),
  ...tabletop('cake', 'Cake', '🎂', 0xf5d0dc, [
    box(0.14, 0.012, 0.14, 0, 0, 0, WHITE),
    box(0.04, 0.06, 0.04, 0, 0.012, 0, WHITE),
    box(0.27, 0.015, 0.27, 0, 0.072, 0, WHITE),
    box(0.21, 0.12, 0.21, 0, 0.087, 0),
    box(0.22, 0.02, 0.22, 0, 0.2, 0, WHITE),
    box(0.03, 0.03, 0.03, -0.05, 0.22, 0.05, APPLE_RED),
    box(0.03, 0.03, 0.03, 0.05, 0.22, -0.04, APPLE_RED),
    box(0.03, 0.03, 0.03, 0.04, 0.22, 0.06, APPLE_RED),
  ]),
  ...tabletop('tea-set', 'Tea Set', '🍵', WHITE, [
    box(0.14, 0.11, 0.12, -0.06, 0, 0),
    box(0.08, 0.02, 0.08, -0.06, 0.11, 0),
    box(0.025, 0.02, 0.025, -0.06, 0.13, 0, 0x4f81bd),
    box(0.06, 0.025, 0.025, 0.03, 0.06, 0),
    box(0.025, 0.07, 0.025, -0.145, 0.025, 0),
    box(0.06, 0.008, 0.06, 0.13, 0, 0.07, 0x4f81bd),
    box(0.045, 0.04, 0.045, 0.13, 0.008, 0.07),
    box(0.06, 0.008, 0.06, 0.13, 0, -0.07, 0x4f81bd),
    box(0.045, 0.04, 0.045, 0.13, 0.008, -0.07),
  ]),

  {
    type: 'oak-tree', label: 'Oak Tree', emoji: '🌳', category: 'outdoor', footprint: { w: 1, d: 1 }, color: 0x4f8f3a, height: 2, use: 'stand',
    thoughts: ['🌳', '🍃', '🐿️'], advertises: { fun: 4 }, activity: 'admire',
    parts: [box(0.24, 0.95, 0.24, 0, 0, 0, BARK), box(1.4, 0.7, 1.4, 0, 0.85), box(1.05, 0.5, 1.05, 0.1, 1.5, -0.05, 0x5fa047), box(0.8, 0.4, 0.8, -0.35, 1.1, 0.35, 0x4a8636)],
  },
  {
    type: 'pine-tree', label: 'Pine Tree', emoji: '🌲', category: 'outdoor', footprint: { w: 1, d: 1 }, color: 0x2f6b3f, height: 2, use: 'stand',
    thoughts: ['🌲', '🦉', '❄️'], advertises: { fun: 4 }, activity: 'admire',
    parts: [
      box(0.16, 0.5, 0.16, 0, 0, 0, BARK),
      box(1.15, 0.45, 1.15, 0, 0.4),
      box(0.85, 0.45, 0.85, 0, 0.8, 0, 0x37784a),
      box(0.55, 0.45, 0.55, 0, 1.2, 0, 0x3f8552),
      box(0.24, 0.35, 0.24, 0, 1.6, 0, 0x46905a),
    ],
  },
  {
    type: 'birch-tree', label: 'Birch Tree', emoji: '🌿', category: 'outdoor', footprint: { w: 1, d: 1 }, color: 0x8fc45a, height: 2, use: 'stand',
    thoughts: ['🌿', '🍃', '🐦'], advertises: { fun: 4 }, activity: 'admire',
    parts: [
      box(0.14, 1.3, 0.14, 0, 0, 0, 0xeeeae0),
      box(0.15, 0.03, 0.15, 0, 0.35, 0, NEAR_BLACK),
      box(0.15, 0.03, 0.15, 0, 0.75, 0, NEAR_BLACK),
      box(0.85, 0.6, 0.85, 0, 1.05),
      box(0.6, 0.4, 0.6, 0.05, 1.6, 0, 0xa3d16b),
    ],
  },
  {
    // Pawns pick an apple here when they're peckish, same as making a snack at the fridge.
    type: 'apple-tree', label: 'Apple Tree', emoji: '🍎', category: 'outdoor', footprint: { w: 1, d: 1 }, color: 0x5a9a40, height: 1.8, use: 'stand',
    thoughts: ['🍎', '😋', '🌳'], advertises: { hunger: 30, fun: 4 }, activity: 'admire',
    food: { prepareSeconds: { min: 2, max: 3 }, reliefPerSecond: 4, servings: ['🍎'] },
    parts: [
      box(0.2, 0.75, 0.2, 0, 0, 0, BARK),
      box(1.15, 0.75, 1.15, 0, 0.65),
      box(0.8, 0.35, 0.8, 0, 1.4, 0, 0x6aae4d),
      box(0.09, 0.09, 0.09, 0.35, 0.9, 0.58, APPLE_RED),
      box(0.09, 0.09, 0.09, -0.3, 1.1, 0.58, APPLE_RED),
      box(0.09, 0.09, 0.09, 0.58, 1.15, -0.1, APPLE_RED),
      box(0.09, 0.09, 0.09, -0.58, 0.85, 0.2, APPLE_RED),
      box(0.09, 0.09, 0.09, 0.15, 1.5, 0.41, APPLE_RED),
      box(0.09, 0.09, 0.09, 0.58, 0.8, 0.35, APPLE_RED),
    ],
  },
  {
    type: 'bush', label: 'Bush', emoji: '🌳', category: 'outdoor', footprint: { w: 1, d: 1 }, color: 0x4f9a45, height: 0.7, use: 'stand',
    thoughts: ['🌿', '🐝', '🍃'], advertises: { fun: 2 }, activity: 'admire',
    parts: [box(0.75, 0.5, 0.75), box(0.55, 0.25, 0.55, 0.05, 0.45, -0.05, 0x5aa850)],
  },
  {
    type: 'flowering-bush', label: 'Flowering Bush', emoji: '🌺', category: 'outdoor', footprint: { w: 1, d: 1 }, color: 0x4a8f42, height: 0.7, use: 'stand',
    thoughts: ['🌺', '🐝', '😊'], advertises: { fun: 3 }, activity: 'admire',
    parts: [
      box(0.75, 0.5, 0.75),
      box(0.55, 0.25, 0.55, 0, 0.45, 0, 0x55a04c),
      box(0.09, 0.09, 0.09, 0.3, 0.35, 0.36, 0xf28fb0),
      box(0.09, 0.09, 0.09, -0.2, 0.42, 0.36, 0xf28fb0),
      box(0.09, 0.09, 0.09, 0.36, 0.22, -0.15, 0xf6d04d),
      box(0.09, 0.09, 0.09, -0.36, 0.3, 0.1, 0xf28fb0),
      box(0.09, 0.09, 0.09, 0.05, 0.68, 0.1, 0xffffff),
      box(0.09, 0.09, 0.09, -0.15, 0.66, -0.15, 0xf28fb0),
    ],
  },
  {
    type: 'hedge', label: 'Hedge', emoji: '🟩', category: 'outdoor', footprint: { w: 2, d: 1 }, color: 0x3f7f3a, height: 0.8, use: 'stand',
    thoughts: ['🌿', '✂️', '🍃'], advertises: { fun: 2 }, activity: 'admire',
    parts: [box(1.85, 0.75, 0.7), box(1.8, 0.08, 0.65, 0, 0.75, 0, 0x4a8f42)],
  },
  {
    type: 'espalier', label: 'Espalier Pear', emoji: '🍐', category: 'outdoor', footprint: { w: 2, d: 1 }, color: ESPALIER_LEAF, height: 1.5, use: 'stand',
    thoughts: ['🍐', '🌿', '✂️'], advertises: { fun: 10 }, activity: 'garden', approach: 'front',
    parts: espalierParts(),
  },
  {
    type: 'flower-bed', label: 'Flower Bed', emoji: '🌷', category: 'outdoor', footprint: { w: 2, d: 1 }, color: 0x5d9c59, height: 0.3, use: 'stand',
    thoughts: ['🌷', '🌼', '🐝'], advertises: { fun: 8 }, activity: 'garden',
    parts: [
      box(1.85, 0.1, 0.75, 0, 0, 0, 0x9a9a94),
      box(1.75, 0.04, 0.65, 0, 0.1, 0, SOIL),
      ...flowerRow(-0.15, [0xe86a92, 0xf6d04d, 0xc77dd6, 0xff8a3a, 0xffffff, 0xe86a92, 0xf6d04d]),
      ...flowerRow(0.15, [0xf6d04d, 0xc77dd6, 0xe86a92, 0xffffff, 0xff8a3a, 0xc77dd6, 0xe86a92]),
    ],
  },
  {
    type: 'raised-garden', label: 'Raised Garden', emoji: '🥬', category: 'outdoor', footprint: { w: 2, d: 1 }, color: WOOD, height: 0.45, use: 'stand',
    thoughts: ['🥬', '🥕', '🍅'], advertises: { fun: 12 }, activity: 'garden',
    parts: [
      box(1.8, 0.36, 0.8),
      box(1.7, 0.02, 0.7, 0, 0.36, 0, SOIL),
      // Lettuces down one end, carrot tops in the middle, and a tomato plant on a stake.
      box(0.2, 0.12, 0.2, -0.65, 0.38, -0.15, 0x8fd16a),
      box(0.2, 0.12, 0.2, -0.65, 0.38, 0.17, 0x8fd16a),
      box(0.2, 0.12, 0.2, -0.35, 0.38, 0.0, 0x7cc45a),
      box(0.05, 0.16, 0.05, -0.05, 0.38, -0.18, 0x5aa83a),
      box(0.05, 0.16, 0.05, -0.05, 0.38, 0.0, 0x5aa83a),
      box(0.05, 0.16, 0.05, -0.05, 0.38, 0.18, 0x5aa83a),
      box(0.05, 0.16, 0.05, 0.15, 0.38, -0.1, 0x5aa83a),
      box(0.05, 0.16, 0.05, 0.15, 0.38, 0.1, 0x5aa83a),
      box(0.03, 0.5, 0.03, 0.55, 0.38, 0, 0xc9a77a),
      box(0.26, 0.32, 0.26, 0.55, 0.45, 0, 0x4f9a3a),
      box(0.08, 0.08, 0.08, 0.5, 0.55, 0.14, APPLE_RED),
      box(0.08, 0.08, 0.08, 0.66, 0.65, 0.06, APPLE_RED),
      box(0.08, 0.08, 0.08, 0.45, 0.7, -0.13, APPLE_RED),
    ],
  },
  {
    type: 'garden-patch', label: 'Garden Patch', emoji: '🥕', category: 'outdoor', footprint: { w: 2, d: 2 }, color: SOIL, height: 0.15, use: 'stand',
    thoughts: ['🥕', '🌽', '🥬'], advertises: { fun: 12 }, activity: 'garden',
    parts: [
      box(1.9, 0.04, 1.9),
      // Three rows: cabbages, carrot tops and corn.
      ...[-0.7, -0.25, 0.2, 0.65].map((x) => box(0.24, 0.2, 0.24, x, 0.04, -0.6, 0xb8dc8a)),
      ...[-0.75, -0.45, -0.15, 0.15, 0.45, 0.75].map((x) => box(0.06, 0.16, 0.06, x, 0.04, 0, 0x5aa83a)),
      ...[-0.7, -0.25, 0.2, 0.65].flatMap((x) => [box(0.07, 0.7, 0.07, x, 0.04, 0.6, 0x8fc45a), box(0.1, 0.16, 0.1, x + 0.04, 0.4, 0.6, 0xf6d04d)]),
    ],
  },
  {
    type: 'pond', label: 'Pond', emoji: '🪷', category: 'outdoor', footprint: { w: 2, d: 2 }, color: 0x9a9a94, height: 0.1, use: 'stand',
    thoughts: ['🐸', '🪷', '🦆'], advertises: { fun: 10 }, activity: 'peer',
    parts: [
      // A rim of stones around the water.
      box(1.9, 0.12, 0.18, 0, 0, -0.86),
      box(1.9, 0.12, 0.18, 0, 0, 0.86),
      box(0.18, 0.12, 1.54, -0.86, 0, 0),
      box(0.18, 0.12, 1.54, 0.86, 0, 0),
      box(0.22, 0.1, 0.2, 0.6, 0.12, 0.8, 0x85857f),
      box(0.18, 0.08, 0.22, -0.82, 0.12, -0.4, 0xaaaaa4),
      box(1.56, 0.02, 1.56, 0, 0, 0, 0x2f5f78),
      box(1.56, 0.06, 1.56, 0, 0.02, 0, 0x4a9fd0, 0.75),
      // Lily pads that drift about, one with a flower.
      moving(box(0.24, 0.012, 0.24, -0.35, 0.085, 0.25, 0x5aa83a), 'drift'),
      moving(box(0.2, 0.012, 0.2, 0.35, 0.085, -0.3, 0x4f9a3a), 'drift'),
      moving(box(0.18, 0.012, 0.18, 0.2, 0.085, 0.45, 0x5aa83a), 'drift'),
      box(0.08, 0.06, 0.08, -0.35, 0.095, 0.25, 0xf28fb0),
    ],
  },
  {
    type: 'bird-bath', label: 'Bird Bath', emoji: '🐦', category: 'outdoor', footprint: { w: 1, d: 1 }, color: 0xcfcac0, height: 0.7, use: 'stand',
    thoughts: ['🐦', '💧', '😊'], advertises: { fun: 5 }, activity: 'admire',
    parts: [box(0.34, 0.06, 0.34), box(0.12, 0.56, 0.12, 0, 0.06), box(0.55, 0.08, 0.55, 0, 0.62), box(0.45, 0.02, 0.45, 0, 0.7, 0, WATER)],
  },
  {
    type: 'garden-gnome', label: 'Garden Gnome', emoji: '🍄', category: 'outdoor', footprint: { w: 1, d: 1 }, color: 0x3f6ac0, height: 0.5, use: 'stand',
    thoughts: ['😂', '🍄', '🤔'], advertises: { fun: 6 }, activity: 'admire',
    parts: [
      box(0.2, 0.06, 0.18, 0, 0, 0, 0x5f4630),
      box(0.18, 0.18, 0.16, 0, 0.06),
      box(0.13, 0.11, 0.12, 0, 0.24, 0, 0xf2c7a5),
      box(0.12, 0.09, 0.03, 0, 0.18, 0.07, WHITE),
      box(0.16, 0.06, 0.15, 0, 0.35, 0, 0xd84a3a),
      box(0.1, 0.06, 0.1, 0, 0.41, 0, 0xd84a3a),
      box(0.05, 0.06, 0.05, 0, 0.47, 0, 0xd84a3a),
    ],
  },
  {
    type: 'garden-lamp', label: 'Garden Lamp', emoji: '🏮', category: 'lighting', footprint: { w: 1, d: 1 }, color: NEAR_BLACK, height: 1.6, use: 'stand',
    thoughts: ['💡', '🌙', '✨'], advertises: {},
    light: { color: 0xffe2a0, at: [0, 1.53, 0], strength: 5, pool: 2.4, halo: 0.8 },
    parts: [box(0.26, 0.06, 0.26), box(0.07, 1.34, 0.07, 0, 0.06), glowingBox(0.22, 0.26, 0.22, 0, 1.4, 0, 0xffe7a8), box(0.3, 0.05, 0.3, 0, 1.66)],
  },

  // Storage
  {
    type: 'small-bookshelf', label: 'Small Bookshelf', emoji: '📗', category: 'storage', footprint: { w: 1, d: 1 }, color: 0x8a6a45, height: 1, use: 'stand',
    thoughts: ['📗', '📖', '🤓'], advertises: { fun: 15 }, activity: 'browse', approach: 'front', holds: 1,
    parts: [
      box(0.85, 1, 0.03, 0, 0, -0.255, DARK_WOOD),
      box(0.05, 1, 0.35, -0.4, 0, -0.1),
      box(0.05, 1, 0.35, 0.4, 0, -0.1),
      box(0.85, 0.05, 0.35, 0, 0.95, -0.1),
      box(0.85, 0.08, 0.35, 0, 0, -0.1),
      box(0.76, 0.04, 0.33, 0, 0.5, -0.1),
      ...bookRow(-0.37, 0.37, 0.08, 0.38, 13),
      ...bookRow(-0.37, 0.37, 0.54, 0.37, 37),
    ],
  },
  {
    // A glass display case of keepsakes, lit softly from the top. Its glass door swings open when someone looks closer.
    type: 'curio-cabinet', label: 'Curio Cabinet', emoji: '🏺', category: 'storage', footprint: { w: 1, d: 1 }, color: 0x6b4a2e, height: 1.8, use: 'stand',
    thoughts: ['🏺', '🥹', '🏆'], advertises: { fun: 10 }, activity: 'admire', approach: 'front',
    light: { color: 0xfff0c8, at: [0, 1.6, 0], strength: 0.8, pool: 0.9, halo: 0.3 },
    parts: [
      // The cupboard underneath, and the case on top of it.
      box(0.8, 0.3, 0.5, 0, 0, -0.05),
      box(0.7, 0.02, 0.02, 0, 0.15, 0.2, 0x4a3524),
      box(0.06, 0.03, 0.03, 0, 0.2, 0.215, BRASS),
      box(0.76, 1.4, 0.03, 0, 0.3, -0.28, 0xd9cdb5),
      ...[-0.38, 0.38].flatMap((x) => [box(0.04, 1.4, 0.04, x, 0.3, -0.28), box(0.04, 1.4, 0.04, x, 0.3, 0.18)]),
      box(0.01, 1.4, 0.44, -0.385, 0.3, -0.05, GLASS, 0.3),
      box(0.01, 1.4, 0.44, 0.385, 0.3, -0.05, GLASS, 0.3),
      box(0.82, 0.06, 0.52, 0, 1.7, -0.05),
      box(0.88, 0.05, 0.56, 0, 1.76, -0.05, 0x5a3d26),
      glowingBox(0.6, 0.01, 0.04, 0, 1.69, -0.05, 0xfff0c8),
      ...[0.68, 1.06, 1.38].map((y) => box(0.74, 0.015, 0.44, 0, y, -0.05, GLASS, 0.5)),
      // Bottom shelf: a vase, a plate on its stand and a little figurine.
      box(0.08, 0.2, 0.08, -0.2, 0.3, -0.05, 0x4f81bd),
      box(0.05, 0.04, 0.05, -0.2, 0.5, -0.05, 0x4f81bd),
      box(0.18, 0.18, 0.012, 0.06, 0.3, -0.2, 0xf4f4f0),
      box(0.1, 0.1, 0.004, 0.06, 0.34, -0.193, 0x4f81bd),
      box(0.05, 0.12, 0.05, 0.24, 0.3, 0.02, 0xe8dcc0),
      box(0.04, 0.04, 0.04, 0.24, 0.42, 0.02, 0xe8dcc0),
      // Teacups, a jade ball and a little gold bird.
      box(0.06, 0.05, 0.06, -0.24, 0.695, 0.02, 0xf5d0dc),
      box(0.06, 0.05, 0.06, -0.12, 0.695, 0.04, 0xf5d0dc),
      box(0.09, 0.09, 0.09, 0.08, 0.695, -0.06, 0x6aa84f),
      box(0.07, 0.06, 0.04, 0.24, 0.695, 0, BRASS),
      box(0.03, 0.03, 0.03, 0.27, 0.755, 0, BRASS),
      // A big painted plate and a trophy.
      box(0.22, 0.22, 0.012, -0.1, 1.075, -0.22, 0xf4f4f0),
      box(0.1, 0.1, 0.004, -0.1, 1.135, -0.213, 0xc0504d),
      box(0.04, 0.06, 0.04, 0.2, 1.075, 0, BRASS),
      box(0.08, 0.08, 0.06, 0.2, 1.135, 0, BRASS),
      // A pair of bud vases at the top.
      box(0.05, 0.16, 0.05, -0.15, 1.395, -0.05, 0x8064a2),
      box(0.05, 0.12, 0.05, 0.12, 1.395, -0.05, 0x2f6f6a),
      // The glass door, hinged on the left.
      { ...box(0.74, 1.38, 0.012, 0, 0.31, 0.2, GLASS, 0.25), motion: 'door', pivot: [-0.38, 0, 0.2] },
      { ...box(0.03, 1.38, 0.03, 0.355, 0.31, 0.2), motion: 'door', pivot: [-0.38, 0, 0.2] },
      { ...box(0.02, 0.06, 0.03, 0.33, 0.95, 0.225, BRASS), motion: 'door', pivot: [-0.38, 0, 0.2] },
    ],
  },
  {
    type: 'tall-dresser', label: 'Chest of Drawers', emoji: '🗃️', category: 'storage', footprint: { w: 1, d: 1 }, color: 0x9a6b44, height: 1.15, use: 'stand',
    thoughts: ['🧦', '👕', '🩳'], advertises: { hygiene: 12 }, activity: 'browse', approach: 'front', holds: 1.15,
    parts: [
      box(0.8, 1.15, 0.6, 0, 0, -0.05),
      ...[0.24, 0.47, 0.7, 0.93].map((y) => box(0.72, 0.02, 0.02, 0, y, 0.25, DARK_WOOD)),
      ...[0.13, 0.36, 0.59, 0.82, 1.03].map((y) => box(0.08, 0.03, 0.03, 0, y, 0.26, BRASS)),
    ],
  },
  {
    type: 'long-dresser', label: 'Long Dresser', emoji: '🧺', category: 'storage', footprint: { w: 3, d: 1 }, color: 0xd9c3a0, height: 0.75, use: 'stand',
    thoughts: ['👚', '🧦', '🪞'], advertises: { hygiene: 15 }, activity: 'browse', approach: 'front', holds: 0.75,
    parts: [
      box(2.7, 0.68, 0.6, 0, 0.07, -0.05),
      ...legs(2.6, 0.5, 0.07, DARK_WOOD),
      box(0.02, 0.62, 0.02, -0.45, 0.1, 0.25, 0xa8916c),
      box(0.02, 0.62, 0.02, 0.45, 0.1, 0.25, 0xa8916c),
      box(2.6, 0.02, 0.02, 0, 0.3, 0.25, 0xa8916c),
      box(2.6, 0.02, 0.02, 0, 0.52, 0.25, 0xa8916c),
      ...[-0.9, 0, 0.9].flatMap((x) => [box(0.14, 0.025, 0.03, x, 0.2, 0.26, NEAR_BLACK), box(0.14, 0.025, 0.03, x, 0.41, 0.26, NEAR_BLACK), box(0.14, 0.025, 0.03, x, 0.62, 0.26, NEAR_BLACK)]),
    ],
  },
  {
    type: 'vanity', label: 'Vanity', emoji: '💄', category: 'storage', footprint: { w: 2, d: 1 }, color: 0xf2ece4, height: 0.75, use: 'stand',
    thoughts: ['💄', '💇', '😘'], advertises: { hygiene: 15, fun: 5 }, activity: 'primp', approach: 'front',
    parts: [
      box(0.45, 0.72, 0.5, -0.6, 0, -0.1),
      box(0.45, 0.72, 0.5, 0.6, 0, -0.1),
      box(1.65, 0.05, 0.55, 0, 0.72, -0.1),
      box(0.35, 0.02, 0.02, -0.6, 0.45, 0.16, 0xc9a24d),
      box(0.35, 0.02, 0.02, 0.6, 0.45, 0.16, 0xc9a24d),
      box(0.85, 0.8, 0.05, 0, 0.77, -0.32),
      box(0.74, 0.69, 0.012, 0, 0.825, -0.29, 0xd9eef3),
      box(0.08, 0.12, 0.08, -0.6, 0.77, -0.05, 0xe86a92),
      box(0.12, 0.05, 0.08, 0.6, 0.77, -0.05, 0x8fc3e0),
    ],
  },
  {
    type: 'small-wardrobe', label: 'Small Wardrobe', emoji: '👔', category: 'storage', footprint: { w: 1, d: 1 }, color: 0x7f5f3f, height: 1.6, use: 'stand',
    thoughts: ['👔', '👗', '🧣'], advertises: { hygiene: 12, fun: 4 }, activity: 'browse', approach: 'front',
    parts: [
      ...wardrobeShell(0.85, 1.6),
      ...hangingClothes(-0.32, 0.32, 0.5, [0xc0504d, 0x4f81bd, 0xf0c94d, 0x2f6f6a]),
      { ...box(0.85, 1.6, 0.04, 0, 0, 0.32), motion: 'door', pivot: [-0.425, 0, 0.32] },
      { ...box(0.03, 0.18, 0.04, 0.33, 0.75, 0.36, BRASS), motion: 'door', pivot: [-0.425, 0, 0.32] },
    ],
  },
  {
    type: 'armoire', label: 'Armoire', emoji: '🚪', category: 'storage', footprint: { w: 2, d: 1 }, color: 0xeee6d8, height: 1.8, use: 'stand',
    thoughts: ['👗', '🎩', '🧥'], advertises: { hygiene: 15, fun: 6 }, activity: 'browse', approach: 'front',
    parts: [
      ...legs(1.6, 0.6, 0.1, 0xb8ab94),
      ...wardrobeShell(1.7, 1.62, 0.1),
      box(1.82, 0.08, 0.75, 0, 1.72, 0.0, 0xd9cfbd),
      ...hangingClothes(-0.72, 0.72, 0.6, [0x8064a2, 0xe8556b, 0x34495e, 0xf4a261, 0x6aa84f, 0xe8dcc0, 0x3d5a80]),
      { ...box(0.85, 1.6, 0.04, -0.425, 0.11, 0.32), motion: 'door', pivot: [-0.85, 0, 0.32] },
      { ...box(0.03, 0.2, 0.04, -0.06, 0.85, 0.36, 0xc9a24d), motion: 'door', pivot: [-0.85, 0, 0.32] },
      { ...box(0.85, 1.6, 0.04, 0.425, 0.11, 0.32), motion: 'door-right', pivot: [0.85, 0, 0.32] },
      { ...box(0.03, 0.2, 0.04, 0.06, 0.85, 0.36, 0xc9a24d), motion: 'door-right', pivot: [0.85, 0, 0.32] },
    ],
  },
  {
    type: 'clothes-rack', label: 'Clothes Rack', emoji: '👗', category: 'storage', footprint: { w: 2, d: 1 }, color: STEEL, height: 1.5, use: 'stand',
    thoughts: ['👗', '👚', '🤔'], advertises: { hygiene: 10, fun: 6 }, activity: 'browse',
    parts: [
      box(0.06, 0.04, 0.5, -0.8, 0, 0),
      box(0.06, 0.04, 0.5, 0.8, 0, 0),
      box(0.04, 1.45, 0.04, -0.8, 0.04, 0),
      box(0.04, 1.45, 0.04, 0.8, 0.04, 0),
      box(1.64, 0.03, 0.03, 0, 1.46, 0),
      ...hangingClothes(-0.68, 0.68, 0.62, [0xe8556b, 0xf0c94d, 0x8fc3e0, 0xffffff, 0x6aa84f, 0xc77dd6, 0xf4a261, 0x34495e], 0, 1.44),
    ],
  },
  {
    type: 'coat-rack', label: 'Coat Rack', emoji: '🧥', category: 'storage', footprint: { w: 1, d: 1 }, color: DARK_WOOD, height: 1.8, use: 'stand',
    thoughts: ['🧥', '🧣', '🎩'], advertises: {},
    parts: [
      box(0.45, 0.04, 0.08),
      box(0.08, 0.04, 0.45),
      box(0.05, 1.72, 0.05, 0, 0.04),
      box(0.09, 0.06, 0.09, 0, 1.76),
      box(0.16, 0.03, 0.03, 0, 1.6, 0),
      box(0.03, 0.03, 0.16, 0, 1.55, 0),
      box(0.22, 0.62, 0.12, 0.13, 0.96, 0, 0x8b3a3a),
      box(0.12, 0.08, 0.12, 0.13, 1.5, 0, 0x8b3a3a),
      box(0.12, 0.55, 0.2, 0, 1.0, -0.12, 0x3d5a80),
      box(0.06, 0.4, 0.08, -0.08, 1.1, 0.06, 0xf0c94d),
      box(0.24, 0.02, 0.24, 0, 1.82, 0, NEAR_BLACK),
      box(0.15, 0.1, 0.15, 0, 1.84, 0, NEAR_BLACK),
    ],
  },
  {
    type: 'wall-coat-rack', label: 'Wall Coat Hooks', emoji: '🪝', category: 'storage', footprint: { w: 1, d: 1 }, color: WOOD, height: 1.5, use: 'stand',
    thoughts: ['🧥', '🧣', '🎒'], advertises: {}, approach: 'front', onWall: true,
    parts: [
      box(0.78, 0.12, 0.03, 0, 1.48, WALL_FACE + 0.015),
      ...[-0.27, -0.09, 0.09, 0.27].map((x) => box(0.03, 0.03, 0.08, x, 1.51, WALL_FACE + 0.07, BRASS)),
      box(0.2, 0.55, 0.1, -0.27, 0.98, WALL_FACE + 0.09, 0x6b8f4e),
      box(0.12, 0.08, 0.1, -0.27, 1.45, WALL_FACE + 0.09, 0x6b8f4e),
      box(0.18, 0.48, 0.1, 0.09, 1.05, WALL_FACE + 0.09, 0xb5485f),
      box(0.05, 0.42, 0.04, -0.09, 1.1, WALL_FACE + 0.09, 0xf0c94d),
      box(0.14, 0.2, 0.08, 0.27, 1.3, WALL_FACE + 0.08, 0x3d5a80),
    ],
  },

  // Kitchen
  {
    type: 'pantry', label: 'Pantry', emoji: '🥫', category: 'kitchen', footprint: { w: 1, d: 1 }, color: 0xf0e6d2, height: 1.9, use: 'stand',
    thoughts: ['🥫', '🍪', '🥨'], advertises: { hunger: 30 }, activity: 'rummage', approach: 'front',
    food: { prepareSeconds: { min: 2, max: 4 }, reliefPerSecond: 4, servings: ['🍪', '🥨', '🍿', '🍞', '🥫'] },
    parts: [
      box(0.85, 1.9, 0.5, 0, 0, -0.1),
      box(0.04, 1.9, 0.15, -0.405, 0, 0.225),
      box(0.04, 1.9, 0.15, 0.405, 0, 0.225),
      box(0.85, 0.05, 0.15, 0, 1.85, 0.225),
      box(0.85, 0.05, 0.15, 0, 0, 0.225),
      box(0.77, 0.004, 0.01, 0, 0.06, 0.155, 0x9c8a6c),
      ...[0.5, 0.95, 1.4].map((y) => box(0.77, 0.03, 0.15, 0, y, 0.225, 0xd9cdb5)),
      box(0.12, 0.2, 0.1, -0.24, 0.07, 0.22, 0xf4a261),
      box(0.1, 0.14, 0.1, 0.05, 0.07, 0.22, 0xc0504d),
      box(0.18, 0.1, 0.1, 0.25, 0.07, 0.22, 0xe8dcc0),
      box(0.1, 0.16, 0.1, -0.25, 0.53, 0.22, 0xd94f30),
      box(0.1, 0.16, 0.1, -0.12, 0.53, 0.22, 0xd94f30),
      box(0.16, 0.24, 0.08, 0.15, 0.53, 0.22, 0xf0c94d),
      box(0.1, 0.12, 0.1, -0.2, 0.98, 0.22, GLASS, 0.7),
      box(0.1, 0.12, 0.1, 0, 0.98, 0.22, GLASS, 0.7),
      box(0.1, 0.12, 0.1, 0.2, 0.98, 0.22, GLASS, 0.7),
      box(0.22, 0.2, 0.1, 0, 1.43, 0.22, 0x8fc3e0),
      { ...box(0.85, 1.9, 0.04, 0, 0, 0.32), motion: 'door', pivot: [-0.425, 0, 0.32] },
      { ...box(0.03, 0.22, 0.04, 0.34, 0.9, 0.36, STEEL), motion: 'door', pivot: [-0.425, 0, 0.32] },
    ],
  },

  // Tables
  {
    type: 'side-table', label: 'Side Table', emoji: '🔘', category: 'tables', footprint: { w: 1, d: 1 }, color: WOOD, height: 0.55, use: 'stand',
    thoughts: ['☕', '📖'], advertises: {}, surface: 'table', holds: 0.55,
    parts: [box(0.3, 0.04, 0.3), box(0.07, 0.47, 0.07, 0, 0.04), box(0.5, 0.04, 0.5, 0, 0.51), box(0.44, 0.02, 0.44, 0, 0.49, 0, DARK_WOOD)],
  },
  {
    type: 'key-table', label: 'Key Table', emoji: '🔑', category: 'tables', footprint: { w: 1, d: 1 }, color: 0x6b4a2e, height: 0.8, use: 'stand',
    thoughts: ['🔑', '👛', '🤔'], advertises: {}, approach: 'front', holds: 0.8,
    parts: [
      box(0.86, 0.04, 0.42, 0, 0.76, -0.04),
      box(0.04, 0.76, 0.04, -0.4, 0, -0.22),
      box(0.04, 0.76, 0.04, 0.4, 0, -0.22),
      box(0.04, 0.76, 0.04, -0.4, 0, 0.14),
      box(0.04, 0.76, 0.04, 0.4, 0, 0.14),
      box(0.8, 0.03, 0.36, 0, 0.22, -0.04),
      box(0.8, 0.1, 0.38, 0, 0.66, -0.04),
      box(0.12, 0.02, 0.02, 0, 0.7, 0.155, BRASS),
      box(0.16, 0.03, 0.12, 0.28, 0.8, 0.02, 0xc9a24d),
      box(0.05, 0.012, 0.02, 0.27, 0.83, 0.02, STEEL),
      box(0.02, 0.012, 0.05, 0.3, 0.83, 0.03, 0xd4a93c),
      box(0.22, 0.12, 0.12, -0.28, 0.22 + 0.03, -0.04, 0x8b5a2b),
    ],
  },

  // Electronics
  {
    type: 'computer', label: 'Computer', emoji: '🖥️', category: 'electronics', footprint: { w: 1, d: 1 }, color: NEAR_BLACK, height: 0.3, use: 'stand',
    thoughts: ['💻', '🎮', '😂'], advertises: { fun: 35 }, activity: 'type', approach: 'front', onTop: true,
    parts: [
      box(0.2, 0.012, 0.13, 0, 0, -0.15),
      box(0.06, 0.08, 0.04, 0, 0.012, -0.16),
      box(0.56, 0.34, 0.04, 0, 0.08, -0.15),
      moving(box(0.5, 0.28, 0.012, 0, 0.11, -0.125, SCREEN_OFF), 'screen'),
      box(0.4, 0.02, 0.14, 0, 0, 0.13, 0xd0d4d7),
      box(0.36, 0.006, 0.1, 0, 0.02, 0.13, 0x7f8a90),
      box(0.05, 0.025, 0.07, 0.3, 0, 0.14, WHITE),
    ],
  },

  // Lighting: hung from the ceiling, so they leave the floor free and light the whole room.
  {
    type: 'pendant-light', label: 'Pendant Light', emoji: '🔅', category: 'lighting', footprint: { w: 1, d: 1 }, color: 0x2f4858, height: 2, use: 'stand',
    thoughts: ['💡'], advertises: {}, onCeiling: true,
    light: { color: 0xffe2a8, at: [0, 1.42, 0], strength: 5, pool: 2.4, halo: 0.7 },
    parts: [
      box(0.12, 0.03, 0.12, 0, 1.97, 0, NEAR_BLACK),
      box(0.015, 0.4, 0.015, 0, 1.58, 0, NEAR_BLACK),
      box(0.36, 0.05, 0.36, 0, 1.53),
      box(0.3, 0.1, 0.3, 0, 1.45),
      glowingBox(0.12, 0.06, 0.12, 0, 1.4, 0, 0xfff0c0),
    ],
  },
  {
    type: 'chandelier', label: 'Chandelier', emoji: '🕎', category: 'lighting', footprint: { w: 1, d: 1 }, color: BRASS, height: 2, use: 'stand',
    thoughts: ['😮', '✨', '💡'], advertises: {}, onCeiling: true,
    light: { color: 0xffd58a, at: [0, 1.66, 0], strength: 6, pool: 2.8, halo: 1 },
    parts: [
      box(0.14, 0.03, 0.14, 0, 1.97, 0),
      box(0.03, 0.32, 0.03, 0, 1.65, 0),
      box(0.14, 0.14, 0.14, 0, 1.52, 0),
      box(0.64, 0.025, 0.025, 0, 1.6, 0),
      box(0.025, 0.025, 0.64, 0, 1.6, 0),
      ...[[0.31, 0], [-0.31, 0], [0, 0.31], [0, -0.31]].flatMap(([x, z]) => [
        box(0.06, 0.04, 0.06, x, 1.62, z),
        box(0.025, 0.06, 0.025, x, 1.66, z, WHITE),
        glowingBox(0.03, 0.05, 0.03, x, 1.72, z, 0xffd27a),
      ]),
      box(0.03, 0.08, 0.03, 0, 1.44, 0, 0xd9eef3, 0.8),
    ],
  },
  {
    type: 'ceiling-light', label: 'Ceiling Light', emoji: '⚪', category: 'lighting', footprint: { w: 1, d: 1 }, color: WHITE, height: 2, use: 'stand',
    thoughts: ['💡'], advertises: {}, onCeiling: true,
    light: { color: 0xfff1d6, at: [0, 1.9, 0], strength: 4.5, pool: 2.6, halo: 0.5 },
    parts: [box(0.46, 0.02, 0.46, 0, 1.98, 0), glowingBox(0.4, 0.05, 0.4, 0, 1.93, 0, 0xfff6e0)],
  },
  {
    type: 'ceiling-fan', label: 'Ceiling Fan', emoji: '🌀', category: 'lighting', footprint: { w: 1, d: 1 }, color: 0x6b4a2e, height: 2, use: 'stand',
    thoughts: ['🌀', '😌'], advertises: {}, onCeiling: true,
    light: { color: 0xffe6b8, at: [0, 1.56, 0], strength: 4.5, pool: 2.4, halo: 0.6 },
    parts: [
      box(0.12, 0.03, 0.12, 0, 1.97, 0, STEEL),
      box(0.03, 0.25, 0.03, 0, 1.72, 0, STEEL),
      box(0.18, 0.1, 0.18, 0, 1.63, 0, STEEL),
      { ...box(0.48, 0.015, 0.12, 0.32, 1.68, 0), motion: 'fan', pivot: [0, 1.68, 0] },
      { ...box(0.48, 0.015, 0.12, -0.32, 1.68, 0), motion: 'fan', pivot: [0, 1.68, 0] },
      { ...box(0.12, 0.015, 0.48, 0, 1.68, 0.32), motion: 'fan', pivot: [0, 1.68, 0] },
      { ...box(0.12, 0.015, 0.48, 0, 1.68, -0.32), motion: 'fan', pivot: [0, 1.68, 0] },
      glowingBox(0.16, 0.07, 0.16, 0, 1.56, 0, 0xfff0c8),
    ],
  },

  // Kids
  {
    type: 'toy-box', label: 'Toy Box', emoji: '🧸', category: 'kids', footprint: { w: 1, d: 1 }, color: 0x4f81bd, height: 0.45, use: 'stand',
    thoughts: ['🧸', '🪀', '🤩'], advertises: { fun: 20 }, activity: 'rummage', approach: 'front',
    parts: [
      box(0.72, 0.4, 0.46),
      box(0.73, 0.06, 0.47, 0, 0.12, 0, 0xf0c94d),
      box(0.1, 0.1, 0.1, -0.18, 0.29, 0, 0xe8556b),
      box(0.14, 0.08, 0.08, 0.1, 0.31, 0.05, 0x6aa84f),
      box(0.08, 0.06, 0.08, 0.22, 0.33, -0.1, 0xc77dd6),
      { ...box(0.76, 0.05, 0.5, 0, 0.4, 0, 0xe8556b), motion: 'lid', pivot: [0, 0.4, -0.25] },
    ],
  },
  {
    type: 'rocking-horse', label: 'Rocking Horse', emoji: '🐴', category: 'kids', footprint: { w: 1, d: 1 }, color: 0xd9a35f, height: 0.42, use: 'sit',
    thoughts: ['🐴', '🤠', '😆'], advertises: { fun: 30 },
    parts: rockingHorseParts(),
  },
  {
    type: 'toy-blocks', label: 'Building Blocks', emoji: '🧱', category: 'kids', footprint: { w: 1, d: 1 }, color: 0xe8556b, height: 0.3, use: 'stand',
    thoughts: ['🧱', '🏰', '😄'], advertises: { fun: 20 }, activity: 'garden',
    parts: onTheFloor([
      box(0.7, 0.01, 0.7, 0, 0, 0, 0x8fc3e0),
      box(0.12, 0.12, 0.12, -0.05, 0.01, 0.02, 0xe8556b),
      box(0.12, 0.12, 0.12, -0.05, 0.13, 0.02, 0xf0c94d),
      box(0.12, 0.12, 0.12, -0.05, 0.25, 0.02, 0x4f81bd),
      box(0.12, 0.12, 0.12, 0.08, 0.01, 0.02, 0x6aa84f),
      box(0.12, 0.12, 0.12, 0.08, 0.13, 0.02, 0xc77dd6),
      box(0.1, 0.1, 0.1, 0.22, 0.01, 0.2, 0xf4a261),
      box(0.1, 0.1, 0.1, -0.24, 0.01, -0.18, 0x4f81bd),
      box(0.1, 0.1, 0.1, -0.2, 0.01, 0.24, 0xf0c94d),
      box(0.14, 0.06, 0.06, 0.2, 0.01, -0.22, 0xe8556b),
    ]),
  },
  {
    type: 'dollhouse', label: 'Dollhouse', emoji: '🏠', category: 'kids', footprint: { w: 1, d: 1 }, color: 0xf5d0dc, height: 0.8, use: 'stand',
    thoughts: ['🏠', '👧', '🥰'], advertises: { fun: 25 }, activity: 'peer', approach: 'front',
    parts: [
      box(0.78, 0.04, 0.52, 0, 0, -0.08, WOOD),
      box(0.7, 0.55, 0.42, 0, 0.04, -0.1),
      box(0.76, 0.06, 0.48, 0, 0.59, -0.1, 0xc0504d),
      box(0.56, 0.06, 0.48, 0, 0.65, -0.1, 0xc0504d),
      box(0.36, 0.06, 0.48, 0, 0.71, -0.1, 0xc0504d),
      box(0.16, 0.06, 0.48, 0, 0.77, -0.1, 0xc0504d),
      box(0.13, 0.13, 0.012, -0.2, 0.36, 0.115, 0xbfe3ee),
      box(0.13, 0.13, 0.012, 0.2, 0.36, 0.115, 0xbfe3ee),
      box(0.13, 0.11, 0.012, -0.2, 0.14, 0.115, 0xbfe3ee),
      box(0.12, 0.2, 0.012, 0.12, 0.04, 0.115, DARK_WOOD),
      box(0.7, 0.02, 0.02, 0, 0.31, 0.115, WHITE),
    ],
  },
  {
    type: 'train-set', label: 'Train Set', emoji: '🚂', category: 'kids', footprint: { w: 2, d: 2 }, color: 0x6aa84f, height: 0.15, use: 'stand',
    thoughts: ['🚂', '🛤️', '🤩'], advertises: { fun: 30 }, activity: 'garden',
    parts: trainSetParts(),
  },
  ...usableTabletop('teddy-bear', 'Teddy Bear', '🧸', 0xa0703f, [
    box(0.16, 0.16, 0.12, 0, 0, 0),
    box(0.13, 0.12, 0.11, 0, 0.16, 0),
    box(0.04, 0.04, 0.03, -0.055, 0.27, 0),
    box(0.04, 0.04, 0.03, 0.055, 0.27, 0),
    box(0.05, 0.035, 0.02, 0, 0.18, 0.06, 0xe0c39a),
    box(0.012, 0.012, 0.01, -0.03, 0.23, 0.058, NEAR_BLACK),
    box(0.012, 0.012, 0.01, 0.03, 0.23, 0.058, NEAR_BLACK),
    box(0.05, 0.1, 0.05, -0.1, 0.06, 0.02),
    box(0.05, 0.1, 0.05, 0.1, 0.06, 0.02),
    box(0.06, 0.05, 0.08, -0.05, 0, 0.08),
    box(0.06, 0.05, 0.08, 0.05, 0, 0.08),
    box(0.1, 0.03, 0.02, 0, 0.16, 0.06, 0xe8556b),
  ]),
];

export function getFurnitureDef(type: string): FurnitureDef {
  const def = FURNITURE_CATALOG.find((f) => f.type === type);
  if (!def) throw new Error(`Unknown furniture type: ${type}`);
  return def;
}

/** Whether a piece is a flight of stairs, of any kind. */
export function isStairs(type: string): boolean {
  return getFurnitureDef(type).stairs !== undefined;
}

/** Whether a piece is on: always, unless it's something you switch, like a fireplace, that hasn't been lit. */
export function isLit(piece: { type: string; lit?: boolean }): boolean {
  return !getFurnitureDef(piece.type).switchable || piece.lit === true;
}

/** Pass `joins` to shape a counter or a seat to the ones around it, and `lit` false for something switched off, which leaves out its glowing parts, like a fire's flames. */
/** `tint` stands in for the piece's own color, like bedding someone's chosen for a bed. */
export function buildFurnitureMesh(def: FurnitureDef, joins?: CounterJoins, lit = true, tint?: string): THREE.Group {
  const own = tint ? new THREE.Color(tint).getHex() : def.color;
  const group = new THREE.Group();
  const parts = def.joins && joins ? joinedParts(def.joins, joins, def.type) : def.parts;
  parts.forEach(({ size: [w, h, d], at: [x, y, z], color: partColor, opacity, glow, motion, pivot, tilt = 0, turn = 0, wing, along, follows }, index) => {
    if (!lit && def.switchable && glow) return;
    const color = follows !== undefined && tint ? new THREE.Color(tint).multiplyScalar(follows).getHex() : partColor;
    const material = new THREE.MeshStandardMaterial({ color: color ?? own });
    if (glow) material.emissive.setHex(color ?? own).multiplyScalar(0.8);
    if (opacity !== undefined) {
      material.transparent = true;
      material.opacity = opacity;
      material.depthWrite = false;
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y + h / 2, z);
    mesh.rotation.z = tilt;
    mesh.rotation.y = turn;
    if (motion) {
      // Each part gets its own phase so two fish, or two flames, never move in step.
      const data: MotionData = { kind: motion, home: mesh.position.clone(), height: h, phase: index * 1.7, tilt, pivot: pivot && new THREE.Vector3(...pivot), wing, along, openness: 0 };
      mesh.userData.motion = data;
      // Water only runs, falls or fills while someone's using it.
      if (motion === 'water' || motion === 'rain' || motion === 'fill' || motion === 'suds' || motion === 'ripple' || motion === 'tongue' || motion === 'snake-tongue' || motion === 'chest-bubble') mesh.visible = false;
    }
    group.add(mesh);
  });
  return group;
}

export interface MotionData {
  kind: PartMotion;
  home: THREE.Vector3;
  height: number;
  phase: number;
  tilt: number;
  pivot?: THREE.Vector3;
  wing?: number;
  along?: number;
  /** How far a door has swung open, or a burner or screen has come on, from 0 to 1. Eases toward 1 while the piece is in use. */
  openness: number;
}

/** How far a trash can's lid tips back while it's being used. */
const LID_OPEN_ANGLE = 1.4;

/** How quickly a door swings, or a burner warms, toward open or shut. */
const OPEN_SPEED = 5;
const DOOR_OPEN_ANGLE = 1.75;

// The parrot's routine, which repeats every PARROT_CYCLE seconds: sit and
// bob, shuffle sideways along the perch, flap, shuffle back, look around, flap.
const PARROT_CYCLE = 9;
const PERCH_LEFT = PARROT_HOME[0];
const PERCH_RIGHT = 0.08;

interface ParrotPose extends GerbilPose {
  /** How far its wings are out, from 0 (folded) up. */
  flap: number;
}

function parrotPose(time: number): ParrotPose {
  const t = time % PARROT_CYCLE;
  const [, homeY, homeZ] = PARROT_HOME;
  const bob = Math.abs(Math.sin(time * 3)) * 0.008;
  const flapping = (from: number, to: number) => (t >= from && t < to ? 0.5 + 0.5 * Math.sin(time * 28) : 0);
  /** Sideways along the perch in two little hops, still facing the front. */
  const shuffle = (from: number, to: number, amount: number): ParrotPose => ({
    x: from + (to - from) * amount,
    y: homeY + Math.abs(Math.sin(amount * Math.PI * 2)) * 0.03,
    z: homeZ,
    heading: 0,
    flap: 0,
  });

  if (t < 2) return { x: PERCH_LEFT, y: homeY + bob, z: homeZ, heading: 0, flap: 0 };
  if (t < 3) return shuffle(PERCH_LEFT, PERCH_RIGHT, t - 2);
  if (t < 5.5) return { x: PERCH_RIGHT, y: homeY + bob, z: homeZ, heading: 0, flap: flapping(3.6, 4.4) };
  if (t < 6.5) return shuffle(PERCH_RIGHT, PERCH_LEFT, t - 5.5);
  // Turning this way and that to look around the room.
  return { x: PERCH_LEFT, y: homeY, z: homeZ, heading: Math.sin((t - 6.5) * 2.5) * 0.7, flap: flapping(7.6, 8.1) };
}

/** Puts one part of an animal where it belongs on the animal's body, as the body moves and turns. */
function placeOnBody(mesh: THREE.Mesh, home: THREE.Vector3, bodyHome: [number, number, number], pose: GerbilPose) {
  const offsetX = home.x - bodyHome[0];
  const offsetZ = home.z - bodyHome[2];
  const cos = Math.cos(pose.heading);
  const sin = Math.sin(pose.heading);
  mesh.position.set(pose.x + offsetX * cos + offsetZ * sin, pose.y + (home.y - bodyHome[1]), pose.z - offsetX * sin + offsetZ * cos);
  mesh.rotation.y = pose.heading;
}

// The gerbil's routine, which repeats every GERBIL_CYCLE seconds: two laps of
// the cage floor, over to the wheel, a run in it, back out, and a sit and sniff.
const GERBIL_CYCLE = 12;
const LAPS_END = 6;
const INTO_WHEEL_END = 6.6;
const WHEEL_END = 10.6;
const OUT_OF_WHEEL_END = 11.2;
/** The laps go round this oval, starting and ending at GERBIL_HOME. */
const LAP_CENTER = { x: -0.1, z: 0.08 };
const LAP_RADIUS = { x: 0.17, z: 0.1 };
/** How fast the wheel turns while the gerbil runs in it, in radians a second. */
const WHEEL_SPEED = 7;

interface GerbilPose {
  x: number;
  /** The underside of its body. */
  y: number;
  z: number;
  /** Which way it faces: 0 is +x, the way it's built. */
  heading: number;
}

function headingToward(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

/** Where the gerbil is and which way it faces at this moment. */
function gerbilPose(time: number): GerbilPose {
  const t = time % GERBIL_CYCLE;
  const [homeX, homeY, homeZ] = GERBIL_HOME;
  const inWheel = { x: WHEEL_CENTER[0], y: WHEEL_CENTER[1] - WHEEL_RADIUS + 0.008, z: WHEEL_CENTER[2] };
  const scamper = Math.abs(Math.sin(time * 18)) * 0.012;
  const between = (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, amount: number): GerbilPose => ({
    x: from.x + (to.x - from.x) * amount,
    // A little hop on the way.
    y: from.y + (to.y - from.y) * amount + Math.sin(amount * Math.PI) * 0.05,
    z: from.z + (to.z - from.z) * amount,
    heading: headingToward(to.x - from.x, to.z - from.z),
  });
  const home = { x: homeX, y: homeY, z: homeZ };

  if (t < LAPS_END) {
    const angle = (t / LAPS_END) * Math.PI * 4;
    return {
      x: LAP_CENTER.x + LAP_RADIUS.x * Math.cos(angle),
      y: homeY + scamper,
      z: LAP_CENTER.z + LAP_RADIUS.z * Math.sin(angle),
      heading: headingToward(-LAP_RADIUS.x * Math.sin(angle), LAP_RADIUS.z * Math.cos(angle)),
    };
  }
  if (t < INTO_WHEEL_END) return between(home, inWheel, (t - LAPS_END) / (INTO_WHEEL_END - LAPS_END));
  // Running toward -x keeps the bottom of the wheel rolling away under its feet.
  if (t < WHEEL_END) return { ...inWheel, y: inWheel.y + scamper, heading: Math.PI };
  if (t < OUT_OF_WHEEL_END) return between(inWheel, home, (t - WHEEL_END) / (OUT_OF_WHEEL_END - WHEEL_END));
  // Sitting still, turning its head this way and that.
  return { ...home, heading: Math.PI / 2 + Math.sin(time * 4) * 0.5 };
}

/** How far the wheel has turned by now: it only moves while the gerbil runs in it. */
function wheelAngle(time: number): number {
  const runSeconds = WHEEL_END - INTO_WHEEL_END;
  const t = time % GERBIL_CYCLE;
  const thisRun = Math.min(Math.max(t - INTO_WHEEL_END, 0), runSeconds);
  return WHEEL_SPEED * (Math.floor(time / GERBIL_CYCLE) * runSeconds + thisRun);
}

// The lizard's routine, which repeats every LIZARD_CYCLE seconds: bask on the
// rock with a few push-ups, dart down to the water dish and drink, dart over to
// the front glass and stare out, then wander slowly back up onto the rock.
const LIZARD_CYCLE = 18;
const LIZARD_STEPS: { until: number; to: { x: number; y: number; z: number }; facing?: number; move?: 'dart' | 'walk' }[] = [
  { until: 6, to: { x: LIZARD_HOME[0], y: LIZARD_HOME[1], z: LIZARD_HOME[2] }, facing: headingToward(-1, 1) },
  { until: 6.45, to: { x: -0.36, y: TERRARIUM_SAND, z: 0.08 }, move: 'dart' },
  { until: 9, to: { x: -0.36, y: TERRARIUM_SAND, z: 0.08 }, facing: Math.PI },
  { until: 9.4, to: { x: -0.05, y: TERRARIUM_SAND, z: 0.06 }, move: 'dart' },
  { until: 12.5, to: { x: -0.05, y: TERRARIUM_SAND, z: 0.06 }, facing: headingToward(0, 1) },
  { until: 15, to: { x: LIZARD_HOME[0], y: LIZARD_HOME[1], z: LIZARD_HOME[2] }, move: 'walk' },
  { until: LIZARD_CYCLE, to: { x: LIZARD_HOME[0], y: LIZARD_HOME[1], z: LIZARD_HOME[2] }, facing: headingToward(-1, 1) },
];
/** When, in the cycle, the tongue flicks out. */
const TONGUE_FLICKS = [1.2, 3.8, 7, 8.1, 10.6, 11.7, 16.4];

interface LizardPose extends GerbilPose {
  tongueOut: boolean;
}

/** Where the lizard is and which way it faces at this moment, and whether its tongue is out. */
function lizardPose(time: number): LizardPose {
  const t = time % LIZARD_CYCLE;
  const tongueOut = TONGUE_FLICKS.some((at) => t >= at && t < at + 0.35 && Math.sin((t - at) * 36) > -0.2);
  let from = LIZARD_STEPS[LIZARD_STEPS.length - 1].to;
  let start = 0;
  let lastHeading = headingToward(-1, 1);
  for (const step of LIZARD_STEPS) {
    if (step.move) lastHeading = headingToward(step.to.x - from.x, step.to.z - from.z);
    else lastHeading = step.facing ?? lastHeading;
    if (t < step.until) {
      if (!step.move) {
        // Sitting still, except for a few quick push-ups while it basks.
        const pushUps = step.until === 6 && t > 3 && t < 3.9 ? Math.abs(Math.sin(t * 14)) * 0.014 : 0;
        return { ...step.to, y: step.to.y + pushUps, heading: lastHeading, tongueOut };
      }
      const amount = (t - start) / (step.until - start);
      // A dart eases out fast; a walk goes at an even pace. Either way the body wiggles side to side.
      const along = step.move === 'dart' ? 1 - (1 - amount) * (1 - amount) : amount;
      const wiggle = Math.sin(time * (step.move === 'dart' ? 40 : 16)) * 0.25;
      // It climbs onto the rock at the end of the way back, and drops off it at the start of the way down.
      const climb = step.to.y > from.y ? along ** 3 : Math.min(1, along * 2.5);
      return {
        x: from.x + (step.to.x - from.x) * along,
        y: from.y + (step.to.y - from.y) * climb,
        z: from.z + (step.to.z - from.z) * along,
        heading: lastHeading + wiggle,
        tongueOut: false,
      };
    }
    from = step.to;
    start = step.until;
  }
  return { x: LIZARD_HOME[0], y: LIZARD_HOME[1], z: LIZARD_HOME[2], heading: lastHeading, tongueOut };
}

// The treasure chest's routine, every CHEST_CYCLE seconds: shut, then the lid
// lifts, bubbles stream out for a moment, and it closes again.
const CHEST_CYCLE = 8;
const CHEST_OPENS = 3;
const CHEST_OPEN_FOR = 2;
const CHEST_SWING = 0.18;
const CHEST_LID_ANGLE = 1.1;

/** How far open the chest's lid is at this moment, from 0 to 1. */
function chestOpenness(time: number): number {
  const t = time % CHEST_CYCLE;
  if (t < CHEST_OPENS) return 0;
  if (t < CHEST_OPENS + CHEST_SWING) return (t - CHEST_OPENS) / CHEST_SWING;
  if (t < CHEST_OPENS + CHEST_OPEN_FOR) return 1;
  return Math.max(0, 1 - (t - CHEST_OPENS - CHEST_OPEN_FOR) / CHEST_SWING);
}

// The geckos. Each one follows its own path around the tank, a list of moments
// with where it is, what it's clinging to, and which way it faces on it.
// On the floor, a heading of 0 faces +x and -π/2 faces the front. On the front
// glass, -π/2 is up, π/2 is down and 0 is to the right. On the right-hand glass,
// 0 is up, π is down and -π/2 is toward the front.
type GeckoSurface = 'floor' | 'front' | 'side';
interface GeckoStop {
  t: number;
  at: [number, number, number];
  on: GeckoSurface;
  heading: number;
}
const GECKO_CYCLE = 18;
const PI = Math.PI;
const GECKO_PATHS: Record<'gecko' | 'gecko2', GeckoStop[]> = {
  // Up the front glass, a rest near the top, across a little, then back down to the floor.
  gecko: [
    { t: 0, at: [-0.1, GECKO_FLOOR, 0.08], on: 'floor', heading: -PI / 2 },
    { t: 2, at: [-0.1, GECKO_FLOOR, 0.08], on: 'floor', heading: -PI / 2 },
    { t: 2.8, at: [-0.1, 0.76, GECKO_FRONT_GLASS], on: 'front', heading: -PI / 2 },
    { t: 6, at: [-0.05, 1.12, GECKO_FRONT_GLASS], on: 'front', heading: -PI / 2 },
    { t: 9, at: [-0.05, 1.12, GECKO_FRONT_GLASS], on: 'front', heading: -PI / 2 },
    { t: 10.2, at: [0.12, 1.06, GECKO_FRONT_GLASS], on: 'front', heading: 0 },
    { t: 10.8, at: [0.12, 1.06, GECKO_FRONT_GLASS], on: 'front', heading: PI / 2 },
    { t: 13.5, at: [0.12, 0.78, GECKO_FRONT_GLASS], on: 'front', heading: PI / 2 },
    { t: 14.3, at: [0.12, GECKO_FLOOR, 0.1], on: 'floor', heading: PI / 2 },
    { t: 14.8, at: [0.12, GECKO_FLOOR, 0.05], on: 'floor', heading: PI },
    { t: 16.5, at: [-0.1, GECKO_FLOOR, 0.05], on: 'floor', heading: PI },
    { t: 17.4, at: [-0.1, GECKO_FLOOR, 0.08], on: 'floor', heading: -PI / 2 },
    { t: GECKO_CYCLE, at: [-0.1, GECKO_FLOOR, 0.08], on: 'floor', heading: -PI / 2 },
  ],
  // Clinging to the right-hand glass, a creep along it, down to the floor, and back up.
  gecko2: [
    { t: 0, at: [GECKO_SIDE_GLASS, 1.0, -0.05], on: 'side', heading: 0 },
    { t: 3, at: [GECKO_SIDE_GLASS, 1.0, -0.05], on: 'side', heading: 0 },
    { t: 3.5, at: [GECKO_SIDE_GLASS, 1.0, -0.05], on: 'side', heading: -PI / 2 },
    { t: 6, at: [GECKO_SIDE_GLASS, 1.0, 0.1], on: 'side', heading: -PI / 2 },
    { t: 6.5, at: [GECKO_SIDE_GLASS, 1.0, 0.1], on: 'side', heading: -PI },
    { t: 9, at: [GECKO_SIDE_GLASS, 0.78, 0.1], on: 'side', heading: -PI },
    { t: 9.7, at: [0.17, GECKO_FLOOR, 0.1], on: 'floor', heading: PI },
    { t: 11, at: [0.03, GECKO_FLOOR, -0.02], on: 'floor', heading: PI },
    { t: 11.6, at: [0.03, GECKO_FLOOR, -0.02], on: 'floor', heading: 0 },
    { t: 12.4, at: [GECKO_SIDE_GLASS, 0.78, -0.05], on: 'side', heading: 0 },
    { t: 15, at: [GECKO_SIDE_GLASS, 1.0, -0.05], on: 'side', heading: 0 },
    { t: GECKO_CYCLE, at: [GECKO_SIDE_GLASS, 1.0, -0.05], on: 'side', heading: 0 },
  ],
};
/** Turns a gecko built lying on the floor so its belly is against this surface. */
const SURFACE_TURN: Record<GeckoSurface, THREE.Quaternion> = {
  floor: new THREE.Quaternion(),
  front: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -PI / 2),
  side: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), PI / 2),
};
const UP = new THREE.Vector3(0, 1, 0);
const geckoFrom = new THREE.Quaternion();
const geckoTo = new THREE.Quaternion();
const geckoTurn = new THREE.Quaternion();
const geckoOffset = new THREE.Vector3();

function geckoFacing(stop: GeckoStop, out: THREE.Quaternion): THREE.Quaternion {
  return out.copy(SURFACE_TURN[stop.on]).multiply(geckoTurn.setFromAxisAngle(UP, stop.heading));
}

/** Puts one part of a gecko where it should be on its path at this moment. */
function placeGecko(mesh: THREE.Mesh, home: THREE.Vector3, path: GeckoStop[], time: number) {
  const t = time % GECKO_CYCLE;
  let i = 0;
  while (i < path.length - 2 && path[i + 1].t <= t) i++;
  const from = path[i];
  const to = path[i + 1];
  const amount = Math.min(1, (t - from.t) / (to.t - from.t));
  geckoFacing(from, geckoFrom);
  geckoFacing(to, geckoTo);
  geckoFrom.slerp(geckoTo, amount);
  const moving = from.at.some((value, axis) => value !== to.at[axis]);
  // A wiggle side to side as it scurries.
  if (moving) geckoFrom.multiply(geckoTurn.setFromAxisAngle(UP, Math.sin(time * 22) * 0.15));
  geckoOffset.set(home.x - GECKO_HOME[0], home.y - GECKO_HOME[1], home.z - GECKO_HOME[2]).applyQuaternion(geckoFrom);
  mesh.position.set(
    from.at[0] + (to.at[0] - from.at[0]) * amount + geckoOffset.x,
    from.at[1] + (to.at[1] - from.at[1]) * amount + geckoOffset.y,
    from.at[2] + (to.at[2] - from.at[2]) * amount + geckoOffset.z,
  );
  mesh.quaternion.copy(geckoFrom);
}

/** Moves one part to where it should be at this moment, in seconds. `inUse` is whether a pawn is using its piece, and `seconds` how long since the last frame. */
export function animatePart(mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>, motion: MotionData, time: number, inUse = false, seconds = 0) {
  const { home, height, phase } = motion;
  motion.openness += ((inUse ? 1 : 0) - motion.openness) * Math.min(1, OPEN_SPEED * seconds);
  const on = motion.openness;
  switch (motion.kind) {
    case 'drop-door': {
      // Hinged along its bottom edge, it tips forward and down while someone's loading it.
      const pivot = motion.pivot!;
      const angle = on * 1.45;
      const offsetY = home.y - pivot.y;
      const offsetZ = home.z - pivot.z;
      mesh.position.set(home.x, pivot.y + offsetY * Math.cos(angle) - offsetZ * Math.sin(angle), pivot.z + offsetY * Math.sin(angle) + offsetZ * Math.cos(angle));
      mesh.rotation.x = angle;
      break;
    }
    case 'door-right': {
      // A door hinged down its right edge, which swings out the other way.
      const pivot = motion.pivot!;
      const angle = on * DOOR_OPEN_ANGLE;
      const offsetX = home.x - pivot.x;
      const offsetZ = home.z - pivot.z;
      mesh.position.set(pivot.x + offsetX * Math.cos(angle) + offsetZ * Math.sin(angle), home.y, pivot.z - offsetX * Math.sin(angle) + offsetZ * Math.cos(angle));
      mesh.rotation.y = angle;
      break;
    }
    case 'fan': {
      // Ceiling fan blades, always turning about the downrod.
      const pivot = motion.pivot!;
      const angle = time * 5;
      const offsetX = home.x - pivot.x;
      const offsetZ = home.z - pivot.z;
      mesh.position.set(pivot.x + offsetX * Math.cos(angle) + offsetZ * Math.sin(angle), home.y, pivot.z - offsetX * Math.sin(angle) + offsetZ * Math.cos(angle));
      mesh.rotation.y = angle;
      break;
    }
    case 'rock': {
      // A rocking horse tips forward and back on its rockers while someone's riding it.
      const pivot = motion.pivot!;
      const angle = Math.sin(time * 3.4) * 0.18 * on;
      const offsetY = home.y - pivot.y;
      const offsetZ = home.z - pivot.z;
      mesh.position.set(home.x, pivot.y + offsetY * Math.cos(angle) - offsetZ * Math.sin(angle), pivot.z + offsetY * Math.sin(angle) + offsetZ * Math.cos(angle));
      mesh.rotation.x = angle;
      break;
    }
    case 'swing': {
      // Round the line the ropes are tied on, the way a hammock sways, more the more it's been in use.
      const angle = on * hammockSwing(time);
      const offsetX = home.x;
      const offsetY = home.y - HAMMOCK_PIVOT_Y;
      mesh.position.set(offsetX * Math.cos(angle) - offsetY * Math.sin(angle), HAMMOCK_PIVOT_Y + offsetX * Math.sin(angle) + offsetY * Math.cos(angle), home.z);
      mesh.rotation.z = angle;
      break;
    }
    case 'snake':
    case 'snake-tongue': {
      // Each piece of the body follows the head round the loop, a little behind the one before.
      // A piece built off to one side of the head, like an eye, stays off to that side.
      const { x, z, heading } = snakePathAt(snakeLap(time) + (motion.along ?? 0));
      const [cos, sin] = [Math.cos(heading), Math.sin(heading)];
      mesh.position.set(x + home.x * cos + home.z * sin, home.y, z - home.x * sin + home.z * cos);
      mesh.rotation.y = heading;
      // The tongue flicks out twice in quick succession every couple of seconds.
      if (motion.kind === 'snake-tongue') mesh.visible = (time * 0.45) % 1 < 0.06 || ((time * 0.45) % 1 > 0.1 && (time * 0.45) % 1 < 0.15);
      break;
    }
    case 'train': {
      // Round and round the square of track, turning at each corner.
      const { x, z, heading } = trainTrackAt((motion.along ?? 0) + time * TRAIN_SPEED);
      mesh.position.set(x, home.y, z);
      mesh.rotation.y = heading;
      break;
    }
    case 'door': {
      // Swings out around its hinge, which runs straight up.
      const pivot = motion.pivot!;
      const angle = -on * DOOR_OPEN_ANGLE;
      const offsetX = home.x - pivot.x;
      const offsetZ = home.z - pivot.z;
      mesh.position.set(pivot.x + offsetX * Math.cos(angle) + offsetZ * Math.sin(angle), home.y, pivot.z - offsetX * Math.sin(angle) + offsetZ * Math.cos(angle));
      mesh.rotation.y = angle;
      break;
    }
    case 'drift': {
      // A slow wander about where it floats, turning as it goes, like a lily pad on a breeze.
      mesh.position.set(home.x + Math.sin(time * 0.3 + phase) * 0.07, home.y, home.z + Math.cos(time * 0.23 + phase) * 0.07);
      mesh.rotation.y = Math.sin(time * 0.15 + phase) * 0.6;
      break;
    }
    case 'burner': {
      mesh.material.emissive.setHex(0xff5a1f);
      mesh.material.emissiveIntensity = on * (0.9 + 0.15 * Math.sin(time * 9 + phase));
      break;
    }
    case 'screen': {
      // Shifting colors and the odd flicker, like a show playing.
      const hue = (time * 0.07 + Math.sin(time * 1.3 + phase) * 0.08 + 1) % 1;
      mesh.material.emissive.setHSL(hue, 0.55, 0.55);
      mesh.material.emissiveIntensity = on * (0.75 + 0.15 * Math.sin(time * 7.3) + 0.1 * Math.sin(time * 17));
      break;
    }
    case 'water': {
      mesh.visible = on > 0.3;
      // A slight shimmer as it runs.
      mesh.scale.x = 1 + 0.25 * Math.sin(time * 30 + phase);
      break;
    }
    case 'rain': {
      // Each drop falls from the head to the floor and starts again, all at different moments.
      mesh.visible = on > 0.3;
      const fallen = (time * 1.6 + phase * 0.37) % 1;
      mesh.position.y = home.y - fallen * (SHOWER_FALL - height);
      break;
    }
    case 'fill': {
      // Rises from the bottom of the tub as it fills, and sinks back as it drains.
      mesh.visible = on > 0.02;
      const level = Math.max(0.02, on);
      mesh.scale.y = level;
      mesh.position.y = home.y - height / 2 + (height * level) / 2;
      break;
    }
    case 'ripple': {
      // Swells out from the pawn and back, gently, once the bath is full.
      mesh.visible = on > 0.7;
      const swell = 1 + 0.06 * Math.sin(time * 2.4);
      mesh.position.set(home.x * swell, home.y, home.z * swell);
      break;
    }
    case 'suds': {
      // Bobbing on the water once it's full.
      mesh.visible = on > 0.7;
      mesh.position.y = home.y + Math.sin(time * 2 + phase) * 0.008;
      mesh.rotation.y = time * 0.2 + phase;
      break;
    }
    case 'spin': {
      const pivot = motion.pivot!;
      const turn = wheelAngle(time);
      const offsetX = home.x - pivot.x;
      const offsetY = home.y - pivot.y;
      const radius = Math.hypot(offsetX, offsetY);
      const angle = Math.atan2(offsetY, offsetX) + turn;
      mesh.position.set(pivot.x + radius * Math.cos(angle), pivot.y + radius * Math.sin(angle), home.z);
      mesh.rotation.z = motion.tilt + turn;
      break;
    }
    case 'gerbil': {
      placeOnBody(mesh, home, GERBIL_HOME, gerbilPose(time));
      break;
    }
    case 'sway': {
      // Higher pieces of a water plant sway further, all of one plant in step.
      const reach = home.y - AQUARIUM_SAND;
      const offset = Math.sin(time * 1.3 + home.x * 5 + home.z * 3) * 0.12 * reach;
      mesh.position.x = home.x + offset;
      mesh.rotation.z = -offset * 2;
      break;
    }
    case 'lid': {
      // Tips back on its hinge along the back edge while someone's using it, like a trash can's pedal lid.
      const pivot = motion.pivot!;
      const angle = -on * LID_OPEN_ANGLE;
      const offsetY = home.y - pivot.y;
      const offsetZ = home.z - pivot.z;
      mesh.position.set(home.x, pivot.y + offsetY * Math.cos(angle) - offsetZ * Math.sin(angle), pivot.z + offsetY * Math.sin(angle) + offsetZ * Math.cos(angle));
      mesh.rotation.x = angle;
      break;
    }
    case 'chest-lid': {
      // Tips back on its hinge along the back edge.
      const pivot = motion.pivot!;
      const angle = -chestOpenness(time) * CHEST_LID_ANGLE;
      const offsetY = home.y - pivot.y;
      const offsetZ = home.z - pivot.z;
      mesh.position.set(home.x, pivot.y + offsetY * Math.cos(angle) - offsetZ * Math.sin(angle), pivot.z + offsetY * Math.sin(angle) + offsetZ * Math.cos(angle));
      mesh.rotation.x = angle;
      break;
    }
    case 'chest-bubble': {
      // While the chest is open, each bubble rises out of it in turn, growing as it goes.
      const t = time % CHEST_CYCLE;
      const delay = (Math.round(phase / 1.7) % 6) * 0.25;
      const rise = (t - CHEST_OPENS - 0.1 - delay) / 1.3;
      mesh.visible = rise > 0 && rise < 1;
      mesh.position.set(home.x + Math.sin(time * 6 + phase) * 0.015, home.y + rise * 0.3, home.z);
      mesh.scale.setScalar(0.6 + rise * 0.6);
      break;
    }
    case 'hour-hand':
    case 'minute-hand': {
      // Tells the real time, turning clockwise as seen from in front of the wall.
      const now = new Date();
      const minutes = now.getMinutes() + now.getSeconds() / 60;
      const turns = motion.kind === 'minute-hand' ? minutes / 60 : ((now.getHours() % 12) + minutes / 60) / 12;
      const pivot = motion.pivot!;
      const angle = -turns * Math.PI * 2;
      const offsetX = home.x - pivot.x;
      const offsetY = home.y - pivot.y;
      mesh.position.set(pivot.x + offsetX * Math.cos(angle) - offsetY * Math.sin(angle), pivot.y + offsetX * Math.sin(angle) + offsetY * Math.cos(angle), home.z);
      mesh.rotation.z = angle;
      break;
    }
    case 'twirl': {
      // Turns slowly about the upright line through its pivot.
      const pivot = motion.pivot!;
      const angle = time * 0.4;
      const offsetX = home.x - pivot.x;
      const offsetZ = home.z - pivot.z;
      mesh.position.set(pivot.x + offsetX * Math.cos(angle) + offsetZ * Math.sin(angle), home.y, pivot.z - offsetX * Math.sin(angle) + offsetZ * Math.cos(angle));
      mesh.rotation.y = angle;
      break;
    }
    case 'gecko':
    case 'gecko2': {
      placeGecko(mesh, home, GECKO_PATHS[motion.kind], time);
      break;
    }
    case 'lizard': {
      placeOnBody(mesh, home, LIZARD_HOME, lizardPose(time));
      break;
    }
    case 'tongue': {
      const pose = lizardPose(time);
      mesh.visible = pose.tongueOut;
      placeOnBody(mesh, home, LIZARD_HOME, pose);
      break;
    }
    case 'parrot': {
      const pose = parrotPose(time);
      placeOnBody(mesh, home, PARROT_HOME, pose);
      if (motion.wing) {
        // Out and up from the shoulder, around the bird's front-to-back axis.
        mesh.rotation.z = -motion.wing * pose.flap * 1.1;
        mesh.position.y += pose.flap * 0.03;
      }
      break;
    }
    case 'swim': {
      // Back and forth along the tank, drifting toward the glass and back, bobbing a little.
      const speed = 0.45 + (phase % 0.4);
      const along = time * speed + phase;
      mesh.position.set(Math.sin(along) * 0.55, home.y + Math.sin(time * 2.1 + phase) * 0.04, home.z + Math.sin(time * 0.7 + phase) * 0.1);
      // Facing the way it's going, with a little wiggle.
      mesh.rotation.y = (Math.cos(along) >= 0 ? 0 : Math.PI) + Math.sin(time * 9 + phase) * 0.25;
      break;
    }
    case 'firefly': {
      // Wanders about the cage, and blinks now and then, each in its own time.
      mesh.position.set(
        home.x + Math.sin(time * 0.7 + phase) * 0.07,
        home.y + Math.sin(time * 0.9 + phase * 1.3) * 0.05,
        home.z + Math.cos(time * 0.6 + phase * 0.7) * 0.07,
      );
      mesh.material.emissiveIntensity = 0.15 + Math.max(0, Math.sin(time * 1.7 + phase * 2.1)) ** 6 * 1.4;
      break;
    }
    case 'bubble': {
      // Rises from the plant to the surface, then starts again from the bottom.
      const rise = (time * 0.35 + phase / 3) % 1;
      mesh.position.set(home.x + Math.sin(time * 5 + phase) * 0.02, home.y + rise * 0.4, home.z);
      mesh.scale.setScalar(0.6 + rise * 0.6);
      break;
    }
    case 'flicker': {
      // A few sine waves at odd speeds never quite repeat, which reads as fire.
      const stretch = 1 + 0.18 * Math.sin(time * 11 + phase) + 0.1 * Math.sin(time * 23.3 + phase * 2) + 0.06 * Math.sin(time * 6.1);
      mesh.scale.set(1 + 0.08 * Math.sin(time * 8.7 + phase), stretch, 1);
      // Grows up from its base rather than out from its middle.
      mesh.position.y = home.y - height / 2 + (height * stretch) / 2;
      mesh.material.emissiveIntensity = 0.85 + 0.3 * Math.sin(time * 15 + phase * 3);
      break;
    }
  }
}

/** A piece's footprint is stored as its anchor cell (its "back-left" corner,
 * not its center) plus the catalog's unrotated {w,d} in cells. This returns
 * the world-axis extent after rotation — a 90°/270° piece occupies d cells
 * along x and w along z, since the piece itself has turned a quarter turn. */
function rotatedExtent(def: FurnitureDef, rotation: number): { ew: number; ed: number } {
  const swapped = rotation === 90 || rotation === 270;
  return swapped ? { ew: def.footprint.d, ed: def.footprint.w } : { ew: def.footprint.w, ed: def.footprint.d };
}

/**
 * Where one of a piece's own squares ends up in the lot. Square (i, j) is i
 * across and j from the back of the piece before it's turned, so the front
 * (+z), where a pawn uses it from, has the biggest j.
 */
export function pieceSquare(type: string, x: number, z: number, rotation: number, [i, j]: [number, number]): { x: number; z: number } {
  const { w, d } = getFurnitureDef(type).footprint;
  const middle = getFootprintCenterOffset(type, rotation);
  const angle = THREE.MathUtils.degToRad(rotation);
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const across = i - (w - 1) / 2;
  const along = j - (d - 1) / 2;
  // Rounded, and with no -0, so it makes the same key as any other square.
  return { x: Math.round(x + middle.dx + across * cos + along * sin) + 0, z: Math.round(z + middle.dz - across * sin + along * cos) + 0 };
}

/** Every grid cell a piece at (x,z) with this rotation actually covers —
 * used so a click anywhere on a multi-cell piece (not just its anchor cell)
 * finds it, for hover, rotate, delete, and overlap checks alike. Stairs
 * cover only the squares their steps are on, so a corner an L-shaped flight
 * turns round is left free. */
export function getFootprintCells(type: string, x: number, z: number, rotation: number): { x: number; z: number }[] {
  const def = getFurnitureDef(type);
  if (def.stairs) return def.stairs.path.map((square) => pieceSquare(type, x, z, rotation, square));
  const { ew, ed } = rotatedExtent(def, rotation);
  const cells: { x: number; z: number }[] = [];
  for (let i = 0; i < ew; i++) {
    for (let j = 0; j < ed; j++) {
      cells.push({ x: x + i, z: z + j });
    }
  }
  return cells;
}

/** Offset from the anchor cell to the footprint's visual center, in cells —
 * the mesh is centered on its footprint, not anchored at its corner. */
export function getFootprintCenterOffset(type: string, rotation: number): { dx: number; dz: number } {
  const def = getFurnitureDef(type);
  const { ew, ed } = rotatedExtent(def, rotation);
  return { dx: (ew - 1) / 2, dz: (ed - 1) / 2 };
}

/** The piece a small thing has been set on top of, if it's sitting on one. */
export function pieceUnder(piece: { id?: string; type: string; x: number; z: number }, pieces: readonly FurniturePiece[]): FurniturePiece | undefined {
  if (!getFurnitureDef(piece.type).onTop) return undefined;
  return pieces.find((other) => other.id !== piece.id && getFurnitureDef(other.type).holds !== undefined && getFootprintCells(other.type, other.x, other.z, other.rotation).some((cell) => cell.x === piece.x && cell.z === piece.z));
}

/** How high a piece sits: on the top of whatever it's set on, or on the floor. */
export function restingHeight(piece: { id?: string; type: string; x: number; z: number }, pieces: readonly FurniturePiece[]): number {
  const under = pieceUnder(piece, pieces);
  return under ? getFurnitureDef(under.type).holds ?? 0 : 0;
}

/** The small things sitting on top of this piece. */
export function piecesOnTop(host: FurniturePiece, pieces: readonly FurniturePiece[]): FurniturePiece[] {
  if (getFurnitureDef(host.type).holds === undefined) return [];
  return pieces.filter((piece) => pieceUnder(piece, pieces)?.id === host.id);
}

/** Where a square on a piece ends up when the piece is moved to (x, z) and turned to `rotation`, so what's on it goes with it. */
export function carriedCell(cell: { x: number; z: number }, host: FurniturePiece, to: { x: number; z: number; rotation: number }): { x: number; z: number } {
  const from = getFootprintCenterOffset(host.type, host.rotation);
  const offsetX = cell.x - (host.x + from.dx);
  const offsetZ = cell.z - (host.z + from.dz);
  // The same turn the piece's own shape makes.
  const turn = THREE.MathUtils.degToRad(to.rotation - host.rotation);
  const center = getFootprintCenterOffset(host.type, to.rotation);
  return {
    x: Math.round(to.x + center.dx + offsetX * Math.cos(turn) + offsetZ * Math.sin(turn)),
    z: Math.round(to.z + center.dz - offsetX * Math.sin(turn) + offsetZ * Math.cos(turn)),
  };
}

/** The step from a piece's square out of its back, toward the wall wall art hangs on. */
export function backStep(rotation: number): { dx: number; dz: number } {
  const angle = THREE.MathUtils.degToRad(rotation);
  return { dx: -Math.round(Math.sin(angle)), dz: -Math.round(Math.cos(angle)) };
}

/** The walls a picture hangs on, one behind each of its squares, by wall key. */
export function hangingWallKeys(piece: FurniturePiece): string[] {
  const { dx, dz } = backStep(piece.rotation);
  const dir = dx > 0 ? 'E' : dx < 0 ? 'W' : dz > 0 ? 'N' : 'S';
  return getFootprintCells(piece.type, piece.x, piece.z, piece.rotation).map((cell) => wallKey(cell.x, cell.z, dir));
}
