import type { FurnitureDef, FurniturePart } from './furnitureCatalog';

/** How far a flight of stairs climbs: one floor's height, the height of a wall. */
const RISE = 2;
const WOOD = 0x8a6440;
const TREAD = 0xc9a274;
const RAIL = 0x5b3f26;
const IRON = 0x3d4148;
/** With a finish picked, the steps' sides are this much darker than their treads. */
const BODY_SHADE = 0.78;

/** What stairs can be finished in, beyond their own wood: the color their treads take, the sides a shade darker. */
export const STAIR_FINISHES: { label: string; color: string | null }[] = [
  { label: 'Wood', color: null },
  { label: 'Pale oak', color: '#dcc097' },
  { label: 'Stone', color: '#b3aea4' },
  { label: 'Painted white', color: '#efece4' },
  { label: 'Painted black', color: '#4a4b52' },
  { label: 'Red carpet', color: '#a8443a' },
  { label: 'Blue carpet', color: '#4c6f9a' },
  { label: 'Green carpet', color: '#4f7a4a' },
];

/**
 * The way up a flight of stairs, in the stairs' own squares before they're
 * turned: square (i, j) is i across and j from the back, so the front (+z),
 * where the bottom step usually is, has the biggest j.
 */
export interface StairShape {
  /** The squares a pawn climbs through, bottom first. */
  path: [number, number][];
  /** Where a pawn steps on, just outside the stairs, on the stairs' floor. */
  entry: [number, number];
  /** Where it steps off, just outside the stairs, on the floor above. */
  exit: [number, number];
  /** How many steps up there are in each square of the path. A landing is one; 0 carries on level with the square before. */
  treads: number[];
}

/**
 * Where each step is along a flight, measured in squares from where the
 * pawn steps onto it, so a pawn's height can follow the steps and hop from one
 * to the next.
 */
export interface StairProfile {
  /** Squares in the path. */
  length: number;
  /** Each step up, bottom first, as the stretch along the path it covers. */
  steps: { start: number; end: number }[];
}

export function stairProfile(shape: StairShape): StairProfile {
  const steps: { start: number; end: number }[] = [];
  shape.treads.forEach((count, index) => {
    if (count === 0) {
      // Level with the step before: that step carries on across this square.
      if (steps.length > 0) steps[steps.length - 1].end = index + 1;
      return;
    }
    for (let k = 0; k < count; k++) steps.push({ start: index + k / count, end: index + (k + 1) / count });
  });
  return { length: shape.path.length, steps };
}

/** How high a pawn is this far along a flight, as a share of the climb, with a little hop up or down onto each step. */
export function heightAlong(profile: StairProfile, along: number, hop: number): number {
  const { steps } = profile;
  if (along <= 0) return 0;
  if (along >= profile.length) return 1;
  const index = steps.findIndex((step) => along < step.end);
  if (index < 0) return 1;
  const step = steps[index];
  const before = index / steps.length;
  const after = (index + 1) / steps.length;
  // A landing is a long step: the hop onto it takes no longer than onto any other.
  const hopLength = Math.min(step.end - step.start, 1 / 3);
  const f = Math.min(1, Math.max(0, (along - step.start) / hopLength));
  const eased = f * f * (3 - 2 * f);
  return before + (after - before) * eased + Math.sin(Math.PI * f) * hop;
}

/** The middle of a square of the stairs, measured from the middle of their footprint. */
function center(shape: { w: number; d: number }, [i, j]: [number, number]): [number, number] {
  return [i - (shape.w - 1) / 2, j - (shape.d - 1) / 2];
}

/**
 * Blocks for each step, standing on the floor, with a paler tread on top, laid
 * along the way the path runs through each square. A square where the path
 * turns gets one block, a landing.
 */
function flightParts(footprint: { w: number; d: number }, shape: StairShape): FurniturePart[] {
  const parts: FurniturePart[] = [];
  const profile = stairProfile(shape);
  const rise = RISE / profile.steps.length;
  const points = [shape.entry, ...shape.path, shape.exit];
  let stepIndex = 0;
  shape.path.forEach((square, index) => {
    const [x, z] = center(footprint, square);
    const before = points[index];
    const after = points[index + 2];
    const inward: [number, number] = [square[0] - before[0], square[1] - before[1]];
    const outward: [number, number] = [after[0] - square[0], after[1] - square[1]];
    const count = shape.treads[index];
    const turns = inward[0] !== outward[0] || inward[1] !== outward[1];
    if (count === 0 || turns || count === 1) {
      // A landing, or carrying on level with one.
      if (count > 0) stepIndex += count;
      const top = stepIndex * rise;
      parts.push({ size: [0.98, top - 0.04, 0.98], at: [x, 0, z], color: WOOD, follows: BODY_SHADE }, { size: [1, 0.04, 1], at: [x, top - 0.04, z], color: TREAD, follows: 1 });
      return;
    }
    for (let k = 0; k < count; k++) {
      stepIndex++;
      const top = stepIndex * rise;
      // From the square's near edge, partway across it each step.
      const offset = -0.5 + (k + 0.5) / count;
      const along: [number, number] = [x + outward[0] * offset, z + outward[1] * offset];
      const across = outward[0] === 0;
      const size = (height: number, thickness: number): [number, number, number] => (across ? [0.9, height, 1 / count + thickness] : [1 / count + thickness, height, 0.9]);
      parts.push({ size: size(top - 0.04, 0), at: [along[0], 0, along[1]], color: WOOD, follows: BODY_SHADE }, { size: size(0.04, 0.02), at: [along[0], top - 0.04, along[1]], color: TREAD, follows: 1 });
    }
  });
  return parts;
}

/** Rail posts in a line from one point to another, rising with the steps. Points are [x, z]. */
function railLine(from: [number, number], to: [number, number], fromY: number, toY: number, count: number): FurniturePart[] {
  const posts: FurniturePart[] = [];
  for (let post = 0; post < count; post++) {
    const t = count === 1 ? 0 : post / (count - 1);
    posts.push({ size: [0.04, 0.6, 0.04], at: [from[0] + (to[0] - from[0]) * t, fromY + (toY - fromY) * t, from[1] + (to[1] - from[1]) * t], color: RAIL });
  }
  return posts;
}

/** Posts up one side of a run that goes front to back. */
function railPosts(x: number, fromZ: number, toZ: number, fromY: number, toY: number, count: number): FurniturePart[] {
  return railLine([x, fromZ], [x, toZ], fromY, toY, count);
}

/** A straight flight, climbing from the front to the back, where it meets the floor above. */
const STRAIGHT: StairShape = { path: [[0, 2], [0, 1], [0, 0]], entry: [0, 3], exit: [0, -1], treads: [3, 3, 3] };

/** Up a short run, round a landing in the back corner, and up to the side. The front corner it turns round is left open. */
const QUARTER_TURN: StairShape = { path: [[0, 1], [0, 0], [1, 0]], entry: [0, 2], exit: [2, 0], treads: [3, 1, 3] };

/** Up one side to a landing across the back, then up the other side, coming out at the front beside where it started. */
const HALF_TURN: StairShape = { path: [[0, 2], [0, 1], [0, 0], [1, 0], [1, 1], [1, 2]], entry: [0, 3], exit: [1, 3], treads: [3, 3, 1, 0, 3, 3] };

/** Round and round a pole, in from the front left and out at the front right. */
const SPIRAL: StairShape = { path: [[0, 1], [0, 0], [1, 0], [1, 1]], entry: [0, 2], exit: [1, 2], treads: [3, 3, 3, 3] };

/** Very steep and very small, like a ship's ladder up to a loft. */
const LADDER: StairShape = { path: [[0, 0]], entry: [0, 1], exit: [0, -1], treads: [6] };

function straightParts(): FurniturePart[] {
  return [...flightParts({ w: 1, d: 3 }, STRAIGHT), ...[-0.46, 0.46].flatMap((x) => railPosts(x, 1.3, -1.25, 0.05, 1.75, 4))];
}

function quarterTurnParts(): FurniturePart[] {
  const footprint = { w: 2, d: 2 };
  return [
    ...flightParts(footprint, QUARTER_TURN),
    ...railPosts(-0.96, 0.85, -0.85, 0.05, 1.1, 3),
    ...railLine([0.1, -0.96], [0.85, -0.96], 1.3, 1.85, 2),
  ];
}

function halfTurnParts(): FurniturePart[] {
  const footprint = { w: 2, d: 3 };
  return [
    ...flightParts(footprint, HALF_TURN),
    // A wall between the two runs, up to the landing, with a rail along its top.
    { size: [0.06, 1.0, 2], at: [0, 0, 0.5], color: WOOD },
    ...railPosts(0, 1.4, -0.3, 0.3, 1.0, 3),
    ...railPosts(-0.96, 1.3, -0.4, 0.05, 0.9, 3),
    ...railPosts(0.96, -0.4, 1.3, 1.05, 1.85, 3),
  ];
}

/** Wedge-shaped steps round a pole, going round once from the front to the front again. */
function spiralParts(): FurniturePart[] {
  const steps = SPIRAL.treads.reduce((sum, count) => sum + count, 0);
  const rise = RISE / steps;
  const parts: FurniturePart[] = [{ size: [0.12, RISE + 0.9, 0.12], at: [0, 0, 0], color: IRON }];
  for (let step = 0; step < steps; step++) {
    // Front, then round to the left and back, the way the path goes.
    const angle = -((step + 0.5) / steps) * Math.PI * 2;
    const top = (step + 1) * rise;
    const reach = 0.52;
    parts.push({ size: [0.42, 0.05, 0.9], at: [Math.sin(angle) * reach, top - 0.05, Math.cos(angle) * reach], turn: angle, color: TREAD, follows: 1 });
    // A baluster at the outer end of each step.
    parts.push({ size: [0.03, 0.75, 0.03], at: [Math.sin(angle) * 0.92, top, Math.cos(angle) * 0.92], color: IRON });
  }
  return parts;
}

function ladderParts(): FurniturePart[] {
  const parts: FurniturePart[] = [];
  const count = LADDER.treads[0];
  for (let step = 0; step < count; step++) {
    const top = ((step + 1) / count) * RISE;
    const z = 0.5 - (step + 0.5) / count;
    parts.push({ size: [0.7, 0.04, 0.22], at: [0, top - 0.04, z], color: TREAD, follows: 1 });
  }
  // Steep sides the steps sit between, and a handrail up each.
  for (const x of [-0.38, 0.38]) {
    for (let piece = 0; piece < count; piece++) {
      const top = ((piece + 1) / count) * RISE;
      parts.push({ size: [0.05, RISE / count + 0.02, 1 / count], at: [x, top - RISE / count - 0.02, 0.5 - (piece + 0.5) / count], color: WOOD });
    }
    parts.push({ size: [0.03, 0.03, 0.03], at: [x, RISE + 0.6, -0.48], color: RAIL });
    parts.push({ size: [0.04, 0.9, 0.04], at: [x, 0.3, 0.45], color: RAIL });
    parts.push({ size: [0.04, 0.9, 0.04], at: [x, RISE - 0.3, -0.45], color: RAIL });
  }
  return parts;
}

function stairDef(type: string, label: string, emoji: string, footprint: { w: number; d: number }, shape: StairShape, parts: FurniturePart[]): FurnitureDef {
  return {
    type, label, emoji, category: 'decor', footprint, color: WOOD, height: 0, use: 'stand',
    thoughts: [], advertises: {}, approach: 'front', buildTool: true, stairs: shape, parts,
  };
}

/** Every kind of stairs, the plain straight flight first. */
export const STAIR_DEFS: FurnitureDef[] = [
  stairDef('stairs', 'Straight', '⬆️', { w: 1, d: 3 }, STRAIGHT, straightParts()),
  stairDef('stairs-l', 'L-shaped', '↱', { w: 2, d: 2 }, QUARTER_TURN, quarterTurnParts()),
  stairDef('stairs-u', 'U-shaped', '↶', { w: 2, d: 3 }, HALF_TURN, halfTurnParts()),
  stairDef('stairs-spiral', 'Spiral', '🌀', { w: 2, d: 2 }, SPIRAL, spiralParts()),
  stairDef('stairs-ladder', 'Ship ladder', '🪜', { w: 1, d: 1 }, LADDER, ladderParts()),
];

/** What each kind of stairs is good for, for the picker. */
export const STAIR_HINTS: Record<string, string> = {
  stairs: 'A straight flight, 1 by 3 squares',
  'stairs-l': 'Turns a corner at a landing, 2 by 2 squares',
  'stairs-u': 'Up, round a landing and back, coming out beside where it starts, 2 by 3 squares',
  'stairs-spiral': 'Winds round a pole, 2 by 2 squares',
  'stairs-ladder': 'Steep and tiny, for a loft, 1 square',
};
