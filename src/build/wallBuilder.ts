import * as THREE from 'three';
import { disposeTree } from '../scene/dispose';
import type { ApertureObject, DoorStyle, WallSegment } from '../grid/gridModel';
import { GridModel, wallKey } from '../grid/gridModel';
import { edgeMidpointWorld, edgeRotationY, CELL_SIZE, WALL_HEIGHT, WALL_THICKNESS } from '../grid/gridMath';
import { wallSides } from '../grid/roomDetection';
import { computeHiddenWalls } from './wallCutaway';
import { lightAt } from './roomLighting';
import type { RoomLight } from './roomLighting';
import { WINDOW_SHAPES } from './windowShapes';

export const WALL_COLOR = '#f2e9da';
const FRAME_COLOR = '#cbbfa3';
const GLASS_COLOR = 0x9fd3e8;

/** Camera-facing walls shrink to this fraction of their height — a low sill
 * you can still see and build against, same as The Sims' build-mode cutaway
 * (it never fully deletes the near wall, just drops it to a stub). */
const CUTAWAY_STUB_SCALE = 0.16;
const FULL_HEIGHT_ONLY = 'full-height-only';
const LOWERED_ONLY = 'lowered-only';

interface BuiltWall {
  group: THREE.Group;
  seg: WallSegment;
  meshes: THREE.Mesh[];
  /** The doors themselves, which swing or slide, and go away with the wall when it's cut down. */
  leaves: THREE.Group[];
}

/** One door, or half of a pair, and how it moves: swinging on a hinge at its left or right, or sliding along. */
interface Leaf {
  pivot: THREE.Group;
  motion: 'hinge-left' | 'hinge-right' | 'slide';
  /** For a sliding door: where it sits shut, and how far it slides open. */
  base?: number;
  slide?: number;
}

/** A door in the house, and how far it's open right now. */
interface MovingDoor {
  center: THREE.Vector3;
  rotY: number;
  leaves: Leaf[];
  openness: number;
  /** Which side it swings open to, away from whoever's coming. */
  side: number;
}

/** A pawn this close to a door, along the wall and through it, has it open. */
const DOOR_REACH_ALONG = 0.7;
const DOOR_REACH_THROUGH = 1.05;
const DOOR_SWING = 1.45;
const DOOR_SPEED = 7;

/** The opening between a door's posts, and how tall it is up to the lintel. */
const OPENING_HALF = CELL_SIZE / 2 - CELL_SIZE * 0.14;
const OPENING_HEIGHT = WALL_HEIGHT * (1 - 0.22);

function part(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function material(color: number, brightness: number, opacity?: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(brightness) });
  if (opacity !== undefined) {
    mat.transparent = true;
    mat.opacity = opacity;
    mat.depthWrite = false;
  }
  return mat;
}

/** A glazed door's frame, `w` wide from `x0`, with a pane of glass and, for French doors, bars across it. */
function glazedLeaf(pivot: THREE.Group, x0: number, w: number, h: number, frame: THREE.Material, glass: THREE.Material, bars: boolean) {
  const mid = x0 + w / 2;
  const depth = 0.045;
  pivot.add(
    part(0.08, h, depth, x0 + Math.sign(w) * 0.04, h / 2, 0, frame),
    part(0.08, h, depth, x0 + w - Math.sign(w) * 0.04, h / 2, 0, frame),
    part(Math.abs(w), 0.08, depth, mid, h - 0.04, 0, frame),
    part(Math.abs(w), 0.28, depth, mid, 0.14, 0, frame),
    part(Math.abs(w) - 0.14, h - 0.38, 0.012, mid, 0.28 + (h - 0.36) / 2, 0, glass),
  );
  if (bars) {
    pivot.add(part(0.025, h - 0.36, depth, mid, 0.28 + (h - 0.36) / 2, 0, frame));
    for (const y of [0.62, 1.0]) pivot.add(part(Math.abs(w) - 0.1, 0.025, depth, mid, y, 0, frame));
  }
}

/** The doors in a doorway of this style, built in the wall's own frame: across is x, through the wall is z. */
function doorLeaves(style: DoorStyle, brightness: number): Leaf[] {
  const half = OPENING_HALF;
  const h = OPENING_HEIGHT - 0.02;
  const hinged = (x: number, motion: 'hinge-left' | 'hinge-right'): Leaf => {
    const pivot = new THREE.Group();
    pivot.position.x = x;
    return { pivot, motion };
  };
  const brass = material(0xd4a93c, brightness);
  switch (style) {
    case 'wood': {
      const leaf = hinged(-half, 'hinge-left');
      const wood = material(0x8a5a36, brightness);
      const panel = material(0x7a4e2e, brightness);
      leaf.pivot.add(part(half * 2, h, 0.045, half, h / 2, 0, wood));
      for (const side of [-1, 1]) {
        for (const x of [half - 0.15, half + 0.15]) {
          leaf.pivot.add(part(0.22, 0.5, 0.01, x, 0.42, side * 0.027, panel), part(0.22, 0.56, 0.01, x, 1.08, side * 0.027, panel));
        }
      }
      leaf.pivot.add(part(0.04, 0.04, 0.11, half * 2 - 0.08, 0.82, 0, brass));
      return [leaf];
    }
    case 'glass': {
      const leaf = hinged(-half, 'hinge-left');
      glazedLeaf(leaf.pivot, 0, half * 2, h, material(0x6b4a2e, brightness), material(GLASS_COLOR, 1, 0.45), false);
      leaf.pivot.add(part(0.04, 0.04, 0.11, half * 2 - 0.08, 0.82, 0, brass));
      return [leaf];
    }
    case 'french': {
      const left = hinged(-half, 'hinge-left');
      const right = hinged(half, 'hinge-right');
      const white = material(0xf4f1ea, brightness);
      const glass = material(GLASS_COLOR, 1, 0.45);
      glazedLeaf(left.pivot, 0, half, h, white, glass, true);
      glazedLeaf(right.pivot, 0, -half, h, white, glass, true);
      left.pivot.add(part(0.03, 0.08, 0.1, half - 0.05, 0.85, 0, brass));
      right.pivot.add(part(0.03, 0.08, 0.1, -half + 0.05, 0.85, 0, brass));
      return [left, right];
    }
    case 'sliding': {
      // The half that slides, in front of the half that stays put.
      const pivot = new THREE.Group();
      const metal = material(0x9aa3a8, brightness);
      const glass = material(GLASS_COLOR, 1, 0.4);
      const slider = new THREE.Group();
      slider.position.z = 0.02;
      glazedLeaf(slider, -half, half + 0.02, h, metal, glass, false);
      slider.add(part(0.025, 0.25, 0.08, -0.06, 0.85, 0, metal));
      pivot.add(slider);
      // The half that stays put, a little behind, which the other slides across.
      const fixed = new THREE.Group();
      fixed.position.z = -0.02;
      glazedLeaf(fixed, 0, half, h, metal, glass, false);
      return [
        { pivot: fixed, motion: 'slide', base: 0, slide: 0 },
        { pivot, motion: 'slide', base: 0, slide: half - 0.04 },
      ];
    }
    case 'barn': {
      // Hung on a rail across the face of the wall, it rolls along it, clear of the doorway.
      const pivot = new THREE.Group();
      pivot.position.z = 0.09;
      const plank = material(0x9a6b44, brightness);
      const dark = material(0x6b4a2e, brightness);
      const w = half * 2 + 0.1;
      pivot.add(part(w, h + 0.06, 0.05, 0, (h + 0.06) / 2, 0, plank));
      for (const x of [-0.24, -0.08, 0.08, 0.24]) pivot.add(part(0.012, h + 0.06, 0.056, x, (h + 0.06) / 2, 0, dark));
      pivot.add(part(w, 0.1, 0.06, 0, 0.25, 0.005, dark), part(w, 0.1, 0.06, 0, h - 0.2, 0.005, dark));
      const brace = part(0.1, Math.hypot(w, h - 0.45) - 0.05, 0.06, 0, (h - 0.2 + 0.25) / 2, 0.006, dark);
      brace.rotation.z = Math.atan2(w, h - 0.45);
      pivot.add(brace);
      const iron = material(0x2b2b2b, brightness);
      pivot.add(part(0.06, 0.12, 0.03, -0.25, h + 0.1, 0, iron), part(0.06, 0.12, 0.03, 0.25, h + 0.1, 0, iron), part(0.03, 0.2, 0.05, 0.3, 0.9, 0.04, iron));
      return [{ pivot, motion: 'slide', base: 0, slide: w - 0.05 }];
    }
    case 'saloon': {
      // Two half doors at chest height, which swing whichever way someone's walking.
      const left = hinged(-half, 'hinge-left');
      const right = hinged(half, 'hinge-right');
      const wood = material(0xa0703f, brightness);
      const slat = material(0x7a4e2e, brightness);
      for (const [leaf, sign] of [[left, 1], [right, -1]] as const) {
        leaf.pivot.add(part(half, 0.72, 0.04, (sign * half) / 2, 0.82, 0, wood));
        for (const y of [0.62, 0.78, 0.94]) leaf.pivot.add(part(half - 0.06, 0.03, 0.05, (sign * half) / 2, y, 0, slat));
      }
      return [left, right];
    }
    default:
      return [];
  }
}

/**
 * Builds and maintains wall/door/window meshes from the GridModel, and hides
 * whichever walls currently sit between the camera and the house interior
 * (the classic Sims build-mode cutaway). Each wall gets its own mesh, drawn
 * with one material all walls share; a later live-mode "fade walls near the
 * pawn" effect would give a fading wall its own see-through copy.
 */
export class WallBuilder {
  readonly group = new THREE.Group();
  /** When false, every wall stays at full height regardless of camera angle
   * — a view preference for seeing the whole house built up, no cutaway. */
  cutawayEnabled = true;
  /** Walls down: every wall drops low, wherever it is and whichever way the camera faces. Wins over the cutaway. */
  allLowered = false;
  private built: BuiltWall[] = [];
  private doors: MovingDoor[] = [];

  rebuild(model: GridModel, light: RoomLight) {
    disposeTree(this.group, KEEP);
    this.group.clear();
    this.built = [];
    this.doors = [];
    for (const seg of model.allWalls()) {
      const [ownerCell, neighborCell] = wallSides(seg.x, seg.z, seg.dir);
      const sides: WallSideLight = { owner: lightAt(light, model, ownerCell), neighbor: lightAt(light, model, neighborCell) };
      const built = this.buildSegment(seg, model.getAperture(seg.x, seg.z, seg.dir), sides);
      this.group.add(built.group);
      this.built.push(built);
    }
  }

  /** Scales each wall's whole group on Y, so door and window frames shrink with it and no wall ever fully disappears. */
  /** The walls cut down right now, by wall key, so pictures hung on them can be put away too. */
  lowered = new Set<string>();

  updateCutaway(cameraDirXZ: THREE.Vector2) {
    const lowered = this.allLowered
      ? new Set(this.built.map(({ seg }) => wallKey(seg.x, seg.z, seg.dir)))
      : this.cutawayEnabled
        ? computeHiddenWalls(this.built.map((built) => built.seg), cameraDirXZ)
        : new Set<string>();
    this.lowered = lowered;
    for (const built of this.built) {
      this.setLowered(built, lowered.has(wallKey(built.seg.x, built.seg.z, built.seg.dir)));
    }
  }

  private setLowered(built: BuiltWall, lowered: boolean) {
    built.group.scale.y = lowered ? CUTAWAY_STUB_SCALE : 1;
    // Cut off at sill height, a doorway is open and a window is solid wall, so neither shows its upper parts.
    for (const mesh of built.meshes) {
      if (mesh.name === FULL_HEIGHT_ONLY) mesh.visible = !lowered;
      if (mesh.name === LOWERED_ONLY) mesh.visible = lowered;
    }
    for (const leaf of built.leaves) leaf.visible = !lowered;
  }

  /** Call every frame with where the pawns are. A door opens as one comes up to it, away from them, and swings shut once they've gone. */
  animateDoors(seconds: number, pawns: THREE.Vector3[]) {
    for (const door of this.doors) {
      const sin = Math.sin(door.rotY);
      const cos = Math.cos(door.rotY);
      let through: number | null = null;
      for (const pawn of pawns) {
        const dx = pawn.x - door.center.x;
        const dz = pawn.z - door.center.z;
        const along = dx * cos - dz * sin;
        const across = dx * sin + dz * cos;
        if (Math.abs(along) < DOOR_REACH_ALONG && Math.abs(across) < DOOR_REACH_THROUGH && (through === null || Math.abs(across) < Math.abs(through))) through = across;
      }
      if (through !== null && door.openness < 0.05) door.side = through > 0 ? -1 : 1;
      door.openness += ((through !== null ? 1 : 0) - door.openness) * Math.min(1, DOOR_SPEED * seconds);
      const angle = door.openness * DOOR_SWING;
      for (const leaf of door.leaves) {
        if (leaf.motion === 'hinge-left') leaf.pivot.rotation.y = -door.side * angle;
        else if (leaf.motion === 'hinge-right') leaf.pivot.rotation.y = door.side * angle;
        else leaf.pivot.position.x = (leaf.base ?? 0) + (leaf.slide ?? 0) * door.openness;
      }
    }
  }

  private buildSegment(seg: WallSegment, aperture: ApertureObject | undefined, sides: WallSideLight): BuiltWall {
    const group = new THREE.Group();
    const pos = edgeMidpointWorld(seg.x, seg.z, seg.dir);
    const rotY = edgeRotationY(seg.dir);
    group.position.copy(pos);
    group.rotation.y = rotY;

    const meshes: THREE.Mesh[] = [];
    const leaves: THREE.Group[] = [];
    if (aperture?.kind === 'door') {
      const style = aperture.style ?? 'open';
      meshes.push(...this.doorFrame(seg, sides, style));
      const moving = doorLeaves(style, Math.max(sides.owner, sides.neighbor));
      for (const leaf of moving) {
        group.add(leaf.pivot);
        leaves.push(leaf.pivot);
      }
      if (moving.length > 0) this.doors.push({ center: pos.clone(), rotY, leaves: moving, openness: 0, side: 1 });
    } else if (aperture?.kind === 'window') {
      meshes.push(...this.windowFrame(seg, sides, aperture));
    } else {
      meshes.push(this.plainWall(wallMaterials(seg, sides, WALL_COLOR)));
    }
    for (const m of meshes) group.add(m);

    group.userData.wall = seg;
    bakeFaceColors(meshes);

    return { group, seg, meshes, leaves };
  }

  private plainWall(materials: THREE.Material[]): THREE.Mesh {
    const geo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, WALL_THICKNESS);
    const mesh = new THREE.Mesh(geo, materials);
    mesh.position.y = WALL_HEIGHT / 2;
    return mesh;
  }

  private doorFrame(seg: WallSegment, sides: WallSideLight, style: DoorStyle): THREE.Mesh[] {
    const postWidth = CELL_SIZE * 0.14;
    const lintelHeight = WALL_HEIGHT * 0.22;
    const postGeo = new THREE.BoxGeometry(postWidth, WALL_HEIGHT, WALL_THICKNESS);
    const materials = wallMaterials(seg, sides, FRAME_COLOR);

    const leftPost = new THREE.Mesh(postGeo, materials);
    leftPost.position.set(-CELL_SIZE / 2 + postWidth / 2, WALL_HEIGHT / 2, 0);

    const rightPost = new THREE.Mesh(postGeo, materials);
    rightPost.position.set(CELL_SIZE / 2 - postWidth / 2, WALL_HEIGHT / 2, 0);

    const lintelGeo = new THREE.BoxGeometry(CELL_SIZE, lintelHeight, WALL_THICKNESS);
    const lintel = new THREE.Mesh(lintelGeo, materials);
    lintel.name = FULL_HEIGHT_ONLY;
    lintel.position.set(0, WALL_HEIGHT - lintelHeight / 2, 0);

    // Raycasts still hit invisible meshes, so clicks inside the opening select the door instead of passing through.
    const clickArea = this.plainWall(materials);
    clickArea.visible = false;

    const extras: THREE.Mesh[] = [];
    if (style === 'arch') {
      // Stepped in at the top corners, which reads as a rounded arch.
      for (const sign of [-1, 1]) {
        extras.push(part(0.14, 0.14, WALL_THICKNESS, sign * (OPENING_HALF - 0.07), OPENING_HEIGHT - 0.07, 0, materials[0]));
        extras.push(part(0.07, 0.14, WALL_THICKNESS, sign * (OPENING_HALF - 0.035), OPENING_HEIGHT - 0.21, 0, materials[0]));
        extras.push(part(0.05, 0.08, WALL_THICKNESS, sign * (OPENING_HALF - 0.17), OPENING_HEIGHT - 0.04, 0, materials[0]));
      }
    }
    if (style === 'barn') {
      // The rail the door rolls along, across the doorway and the wall beside it.
      const rail = part(CELL_SIZE * 1.7, 0.05, 0.04, CELL_SIZE * 0.35, OPENING_HEIGHT + 0.12, 0.09, new THREE.MeshStandardMaterial({ color: 0x2b2b2b }));
      extras.push(rail);
    }
    for (const extra of extras) extra.name = FULL_HEIGHT_ONLY;
    return [leftPost, rightPost, lintel, clickArea, ...extras];
  }

  private windowFrame(seg: WallSegment, sides: WallSideLight, aperture: ApertureObject): THREE.Mesh[] {
    const shape = WINDOW_SHAPES[aperture.size ?? 'standard'];
    const sillHeight = WALL_HEIGHT * shape.sill;
    const headerHeight = WALL_HEIGHT * shape.header;
    const glassHeight = WALL_HEIGHT - sillHeight - headerHeight;
    const frameMaterials = wallMaterials(seg, sides, FRAME_COLOR);
    const glassMat = new THREE.MeshStandardMaterial({
      color: GLASS_COLOR,
      transparent: true,
      opacity: 0.55,
    });

    const sill = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, sillHeight, WALL_THICKNESS), frameMaterials);
    sill.position.y = sillHeight / 2;

    const header = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, headerHeight, WALL_THICKNESS), frameMaterials);
    header.position.y = WALL_HEIGHT - headerHeight / 2;

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE * shape.width, glassHeight, WALL_THICKNESS * 0.6),
      glassMat,
    );
    glass.position.y = sillHeight + glassHeight / 2;

    // Fills the wall on either side of the glass.
    const sideWidth = (CELL_SIZE * (1 - shape.width)) / 2;
    const sideGeo = new THREE.BoxGeometry(sideWidth, glassHeight, WALL_THICKNESS);
    const leftSide = new THREE.Mesh(sideGeo, frameMaterials);
    leftSide.position.set(-CELL_SIZE / 2 + sideWidth / 2, glass.position.y, 0);
    const rightSide = new THREE.Mesh(sideGeo, frameMaterials);
    rightSide.position.set(CELL_SIZE / 2 - sideWidth / 2, glass.position.y, 0);

    const fullHeightParts = [sill, header, glass, leftSide, rightSide];
    for (const part of fullHeightParts) part.name = FULL_HEIGHT_ONLY;
    const loweredSill = this.plainWall(wallMaterials(seg, sides, WALL_COLOR));
    loweredSill.name = LOWERED_ONLY;

    return [...fullHeightParts, loweredSill];
  }
}

/** How much daylight reaches each side of a wall. */
type WallSideLight = { owner: number; neighbor: number };

/**
 * One material per box face, in three.js's order: the two ends, top, bottom,
 * then the two long sides. A wall's +z side always looks into its neighboring
 * cell, whichever way it's turned. The top and ends match the wall when both
 * sides are the same color, and stay neutral when they differ.
 */
/** Every wall shares this, its sides colored in, so a wall is drawn in one go instead of once per side. */
const WALL_FACES = new THREE.MeshStandardMaterial({ vertexColors: true });
const KEEP = new Set<object>([WALL_FACES]);

/**
 * A wall's sides can each be painted and lit differently, which on its own
 * takes a material per side and a separate draw for each. Instead, each side's
 * color is painted onto its corners, and the wall drawn with the one material
 * all walls share. Meshes sharing a shape get the same new shape.
 */
function bakeFaceColors(meshes: THREE.Mesh[]) {
  const baked = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  for (const mesh of meshes) {
    const materials = mesh.material;
    if (!Array.isArray(materials)) continue;
    const original = mesh.geometry;
    let shape = baked.get(original);
    if (!shape) {
      shape = original.clone();
      const index = shape.getIndex();
      const count = shape.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      for (const { start, count: length, materialIndex = 0 } of shape.groups) {
        const color = (materials[materialIndex] as THREE.MeshStandardMaterial).color;
        for (let i = start; i < start + length; i++) color.toArray(colors, (index ? index.getX(i) : i) * 3);
      }
      shape.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      shape.clearGroups();
      baked.set(original, shape);
    }
    mesh.geometry = shape;
    mesh.material = WALL_FACES;
  }
  // The per-side materials were never drawn, so they hold nothing on the graphics card and need no freeing.
  for (const [original] of baked) original.dispose();
}

function wallMaterials(seg: WallSegment, sides: WallSideLight, unpainted: string): THREE.Material[] {
  const ownerColor = seg.ownerColor ?? unpainted;
  const neighborColor = seg.neighborColor ?? unpainted;
  const trim = new THREE.MeshStandardMaterial({ color: ownerColor === neighborColor ? ownerColor : unpainted });
  const neighborSide = new THREE.MeshStandardMaterial({ color: new THREE.Color(neighborColor).multiplyScalar(sides.neighbor) });
  const ownerSide = new THREE.MeshStandardMaterial({ color: new THREE.Color(ownerColor).multiplyScalar(sides.owner) });
  return [trim, trim, trim, trim, neighborSide, ownerSide];
}
