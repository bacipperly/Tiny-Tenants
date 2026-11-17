import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Direction, FenceSegment, FenceStyle, GridModel } from '../grid/gridModel';
import { wallKey } from '../grid/gridModel';
import { edgeMidpointWorld, edgeRotationY } from '../grid/gridMath';
import { disposeTree } from '../scene/dispose';

/** One box of a fence, along its edge: x runs along the edge from -0.5 to 0.5, y up from the ground, z across. */
type Box = { size: [number, number, number]; at: [number, number, number]; color: number; glass?: boolean };

interface StyleLook {
  /** Everything between the posts. */
  panel: () => Box[];
  /** The post at each end, shared where two lengths meet. */
  post: Box | null;
}

const WHITE = 0xf2efe6;
const WOOD = 0x8a6a48;
const DARK_WOOD = 0x6b4a2e;
const IRON = 0x2b2d31;
const STEEL = 0x9aa3ad;
const GLASS = 0x9fd4e8;

/** Evenly spaced along the edge, leaving the ends for the posts. */
function spaced(count: number, make: (x: number, index: number) => Box): Box[] {
  return Array.from({ length: count }, (_, index) => make(-0.5 + (index + 0.5) / count, index));
}

const LOOKS: Record<FenceStyle, StyleLook> = {
  picket: {
    post: { size: [0.08, 0.92, 0.08], at: [0, 0, 0], color: WHITE },
    panel: () => [
      { size: [0.96, 0.04, 0.04], at: [0, 0.22, -0.03], color: WHITE },
      { size: [0.96, 0.04, 0.04], at: [0, 0.6, -0.03], color: WHITE },
      ...spaced(6, (x, i) => ({ size: [0.08, 0.72 + (i % 2) * 0.04, 0.025], at: [x, 0.06, 0.01], color: WHITE })),
    ],
  },
  ranch: {
    post: { size: [0.1, 0.9, 0.1], at: [0, 0, 0], color: DARK_WOOD },
    panel: () => [
      { size: [1, 0.09, 0.05], at: [0, 0.32, 0], color: WOOD },
      { size: [1, 0.09, 0.05], at: [0, 0.68, 0], color: WOOD },
    ],
  },
  privacy: {
    post: { size: [0.1, 1.62, 0.1], at: [0, 0, 0], color: DARK_WOOD },
    panel: () => spaced(6, (x, i) => ({ size: [0.155, 1.52, 0.04], at: [x, 0.04, 0], color: i % 2 === 0 ? 0xa47b52 : 0x9a7149 })),
  },
  // Waist high and solid, like a wall cut down, with a ledge along the top to set things on.
  'half-wall': {
    post: { size: [0.16, 1.02, 0.16], at: [0, 0, 0], color: 0xece6da },
    panel: () => [
      { size: [1, 0.96, 0.14], at: [0, 0, 0], color: 0xece6da },
      { size: [1.02, 0.06, 0.24], at: [0, 0.96, 0], color: 0xd9d0bf },
    ],
  },
  stone: {
    post: { size: [0.34, 0.6, 0.34], at: [0, 0, 0], color: 0x8d8a84 },
    panel: () => [
      { size: [0.5, 0.25, 0.28], at: [-0.25, 0, 0], color: 0x9b978f },
      { size: [0.5, 0.25, 0.28], at: [0.25, 0, 0], color: 0x8b877f },
      { size: [0.34, 0.24, 0.27], at: [-0.33, 0.25, 0], color: 0x878379 },
      { size: [0.34, 0.24, 0.27], at: [0, 0.25, 0], color: 0x9f9b93 },
      { size: [0.34, 0.24, 0.27], at: [0.33, 0.25, 0], color: 0x928e86 },
      { size: [1, 0.05, 0.3], at: [0, 0.49, 0], color: 0xa8a59e },
    ],
  },
  'wood-rail': {
    post: { size: [0.08, 1.02, 0.08], at: [0, 0, 0], color: DARK_WOOD },
    panel: () => [
      { size: [1, 0.06, 0.07], at: [0, 0.94, 0], color: DARK_WOOD },
      { size: [1, 0.04, 0.05], at: [0, 0.07, 0], color: DARK_WOOD },
      ...spaced(6, (x) => ({ size: [0.035, 0.83, 0.035], at: [x, 0.11, 0], color: WOOD })),
    ],
  },
  'iron-rail': {
    post: { size: [0.045, 1.02, 0.045], at: [0, 0, 0], color: IRON },
    panel: () => [
      { size: [1, 0.035, 0.045], at: [0, 0.97, 0], color: IRON },
      { size: [1, 0.025, 0.03], at: [0, 0.1, 0], color: IRON },
      ...spaced(9, (x) => ({ size: [0.016, 0.86, 0.016], at: [x, 0.11, 0], color: IRON })),
    ],
  },
  'glass-rail': {
    post: { size: [0.05, 1.02, 0.05], at: [0, 0, 0], color: STEEL },
    panel: () => [
      { size: [1, 0.04, 0.06], at: [0, 0.98, 0], color: STEEL },
      { size: [0.92, 0.86, 0.02], at: [0, 0.08, 0], color: GLASS, glass: true },
    ],
  },
};

/** How a gate opens: furthest it swings, and how fast. */
const GATE_OPEN = Math.PI * 0.55;
const GATE_SPEED = 6;
/** How close a pawn has to be, in squares, for a gate to swing open. */
const GATE_REACH = 0.95;

/** The ends of an edge, as corners in the world. */
function edgeEnds(x: number, z: number, dir: Direction): [THREE.Vector3, THREE.Vector3] {
  const mid = edgeMidpointWorld(x, z, dir);
  const along = edgeRotationY(dir) === 0 ? new THREE.Vector3(0.5, 0, 0) : new THREE.Vector3(0, 0, -0.5);
  return [mid.clone().sub(along), mid.clone().add(along)];
}

interface Gate {
  hinge: THREE.Group;
  middle: THREE.Vector3;
  openness: number;
  /** Which way it swings, toward the side the pawn isn't on. */
  side: number;
  /** Across the edge, for telling which side a pawn is on. */
  across: THREE.Vector3;
  /** How the edge is turned, which the swing adds to. */
  turn: number;
}

/**
 * The fences and railings on one floor, and the railings drawn for you round
 * its open edges. Everything that doesn't move is one mesh, plus one for
 * glass; gates are their own, so they can swing.
 */
export class FenceBuilder {
  readonly group = new THREE.Group();
  private solidMaterial = new THREE.MeshStandardMaterial({ vertexColors: true });
  private glassMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.1 });
  private gates: Gate[] = [];
  private built = '';

  /** `auto` is the railings drawn for you, each in the style its tile was laid with. */
  rebuild(model: GridModel, auto: { x: number; z: number; dir: Direction; style: FenceStyle }[]) {
    const fences: FenceSegment[] = [...model.allFences(), ...auto];
    const built = fences.map((fence) => `${wallKey(fence.x, fence.z, fence.dir)}:${fence.style}:${fence.gate ? 1 : 0}:${fence.color ?? ''}`).sort().join(';');
    if (built === this.built) return;
    this.built = built;
    disposeTree(this.group, new Set([this.solidMaterial, this.glassMaterial]));
    this.group.clear();
    this.gates = [];

    const solid: THREE.BufferGeometry[] = [];
    const glass: THREE.BufferGeometry[] = [];
    const add = (box: Box, place: THREE.Matrix4, paint?: { style: FenceStyle; color?: string }) => {
      const shape = new THREE.BoxGeometry(...box.size);
      shape.translate(box.at[0], box.at[1] + box.size[1] / 2, box.at[2]);
      shape.applyMatrix4(place);
      const color = boxColor(box, paint);
      const colors = new Float32Array(shape.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
      shape.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      (box.glass ? glass : solid).push(shape);
    };

    // A post at every corner a fence ends at, once, in the style of the first fence there.
    const posts = new Map<string, { at: THREE.Vector3; post: Box; turn: number; paint: { style: FenceStyle; color?: string } }>();
    for (const fence of fences) {
      const look = LOOKS[fence.style];
      const mid = edgeMidpointWorld(fence.x, fence.z, fence.dir);
      const turn = edgeRotationY(fence.dir);
      if (look.post) {
        for (const end of edgeEnds(fence.x, fence.z, fence.dir)) {
          const key = `${end.x.toFixed(2)},${end.z.toFixed(2)}`;
          if (!posts.has(key)) posts.set(key, { at: end, post: look.post, turn, paint: fence });
        }
      }
      if (fence.gate) {
        this.addGate(fence, look);
        continue;
      }
      const place = new THREE.Matrix4().makeRotationY(turn).setPosition(mid.x, 0, mid.z);
      for (const box of look.panel()) add(box, place, fence);
    }
    for (const { at, post, turn, paint } of posts.values()) add(post, new THREE.Matrix4().makeRotationY(turn).setPosition(at.x, 0, at.z), paint);

    if (solid.length > 0) this.group.add(new THREE.Mesh(mergeAndDispose(solid), this.solidMaterial));
    if (glass.length > 0) this.group.add(new THREE.Mesh(mergeAndDispose(glass), this.glassMaterial));
  }

  /** A gate hangs on a hinge at one end of its edge, as one swinging piece. */
  private addGate(fence: FenceSegment, look: StyleLook) {
    const [start] = edgeEnds(fence.x, fence.z, fence.dir);
    const turn = edgeRotationY(fence.dir);
    const hinge = new THREE.Group();
    hinge.position.set(start.x, 0, start.z);
    hinge.rotation.y = turn;
    const shapes: THREE.BufferGeometry[] = [];
    const glass: THREE.BufferGeometry[] = [];
    // A little narrower than the gap, with a brace across, so it reads as a gate.
    for (const box of [...look.panel(), { size: [0.85, 0.05, 0.04], at: [0, 0.4, 0.03], color: look.post?.color ?? WOOD } as Box]) {
      const shape = new THREE.BoxGeometry(box.size[0] * 0.9, box.size[1], box.size[2]);
      shape.translate(0.5 + box.at[0] * 0.9, box.at[1] + box.size[1] / 2, box.at[2]);
      const color = boxColor(box, fence);
      const colors = new Float32Array(shape.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
      shape.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      (box.glass ? glass : shapes).push(shape);
    }
    const leaf = new THREE.Group();
    if (shapes.length > 0) leaf.add(new THREE.Mesh(mergeAndDispose(shapes), this.solidMaterial));
    if (glass.length > 0) leaf.add(new THREE.Mesh(mergeAndDispose(glass), this.glassMaterial));
    hinge.add(leaf);
    this.group.add(hinge);
    const across = turn === 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    this.gates.push({ hinge, middle: edgeMidpointWorld(fence.x, fence.z, fence.dir), openness: 0, side: 1, across, turn });
  }

  /** Gates swing open, away from the pawn, as one comes up to them, and shut behind it. Positions are in the world, on this floor. */
  animateGates(seconds: number, pawns: THREE.Vector3[]) {
    for (const gate of this.gates) {
      let near: number | null = null;
      for (const pawn of pawns) {
        const dx = pawn.x - gate.middle.x;
        const dz = pawn.z - gate.middle.z;
        if (Math.hypot(dx, dz) > GATE_REACH) continue;
        const through = dx * gate.across.x + dz * gate.across.z;
        if (near === null || Math.abs(through) < Math.abs(near)) near = through;
      }
      if (near !== null && gate.openness < 0.05) gate.side = near > 0 ? -1 : 1;
      const target = near === null ? 0 : 1;
      gate.openness += (target - gate.openness) * Math.min(1, GATE_SPEED * seconds);
      gate.hinge.rotation.y = gate.turn + gate.side * gate.openness * GATE_OPEN;
    }
  }
}

function mergeAndDispose(shapes: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(shapes);
  for (const shape of shapes) shape.dispose();
  return merged;
}

/** The color a style's fence reads as at a glance: its posts, or its lightest part. What the eyedropper picks up from an unpainted fence. */
export function fenceColor(style: FenceStyle): string {
  return `#${new THREE.Color(mainColor(style)).getHexString()}`;
}

function mainColor(style: FenceStyle): number {
  const look = LOOKS[style];
  const parts = [...(look.post ? [look.post] : []), ...look.panel()].filter((box) => !box.glass);
  return parts.reduce((best, box) => (luminance(box.color) > luminance(best) ? box.color : best), parts[0].color);
}

function luminance(color: number): number {
  const c = new THREE.Color(color);
  return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
}

/**
 * One part's color. Painted, every part takes the paint, each a little darker
 * or lighter than it was against the style's lightest part, so rails, slats
 * and posts still read apart. Glass stays glass.
 */
function boxColor(box: Box, paint?: { style: FenceStyle; color?: string }): THREE.Color {
  if (!paint?.color || box.glass) return new THREE.Color(box.color);
  const shade = Math.min(1.1, Math.max(0.6, luminance(box.color) / Math.max(0.05, luminance(mainColor(paint.style)))));
  return new THREE.Color(paint.color).multiplyScalar(shade);
}
