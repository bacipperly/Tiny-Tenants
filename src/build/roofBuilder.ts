import * as THREE from 'three';
import type { Direction, GridModel } from '../grid/gridModel';
import { CELL_SIZE, WALL_HEIGHT, cellToWorld, cornerToWorld } from '../grid/gridMath';
import type { FlatRoofFinish, RoofLook, RoofMaterial, RoofPitch } from '../grid/house';
import { WALL_COLOR } from './wallBuilder';
import { disposeTree } from '../scene/dispose';
import { ROOF_TILE_CELLS, flatTexture, pitchedTexture } from './roofTextures';

const SLAB_THICKNESS = 0.12;
/** Each cell's slab is wider than the cell, which makes the eaves; slabs inside the roof just overlap. */
const SLAB_WIDTH = CELL_SIZE * 1.3;
/** How steep a pitched roof is: how much it rises for each square in from its edge. */
const PITCHES: Record<RoofPitch, number> = { low: 0.3, medium: 0.5, steep: 0.85 };
/** A pitched roof starts just above the tops of the walls. */
const PITCHED_BASE = WALL_HEIGHT + 0.02;
/** How far a pitched roof's eaves reach out past the walls. */
const EAVE = 0.25;
/** Each slope is shaded by which way it faces, as if lit from this side, so hips, ridges and valleys show. */
const SHADE_TOWARD = new THREE.Vector3(0.55, 0.45, 0.7).normalize();

type Cell = { x: number; z: number };
const key = (x: number, z: number) => `${x},${z}`;

/** One square-wide strip of a gable end: above the `dir` side of square (x, z), drawn as these two triangles. */
export interface GableStrip {
  x: number;
  z: number;
  dir: Direction;
  points: THREE.Vector3[];
}

/** Out of a square, through each of its sides. */
const OUTWARD: Record<Direction, Cell> = { N: { x: 0, z: 1 }, S: { x: 0, z: -1 }, E: { x: 1, z: 0 }, W: { x: -1, z: 0 } };

/** What color a strip of gable is: its own paint, or else the outside of the wall below it, so the wall carries on up into the peak. */
export function gableColor(model: GridModel, strip: { x: number; z: number; dir: Direction }): string {
  return model.gableColor(strip.x, strip.z, strip.dir) ?? wallBelowColor(model, strip);
}

/** The outside of the wall under a strip of gable, as painted, or the plain wall color. */
export function wallBelowColor(model: GridModel, strip: { x: number; z: number; dir: Direction }): string {
  const out = OUTWARD[strip.dir];
  return model.wallFaceColor(strip.x, strip.z, strip.dir, { x: strip.x + out.x, z: strip.z + out.z }) ?? WALL_COLOR;
}

/** The strips of gable a ray hit, if it hit a gable: the one it hit, and every strip on the same roof. */
export function gableHit(hit: THREE.Intersection): { strip: GableStrip; strips: GableStrip[] } | null {
  const strips = hit.object.userData.gableStrips as GableStrip[] | undefined;
  if (!strips || hit.faceIndex == null) return null;
  const strip = strips[Math.floor(hit.faceIndex / 2)];
  return strip ? { strip, strips } : null;
}

/** The whole gable end a strip is part of: the strips beside it in a straight run, the same color as it. */
export function gableEnd(model: GridModel, start: GableStrip, strips: GableStrip[]): GableStrip[] {
  const color = gableColor(model, start);
  const across = start.dir === 'N' || start.dir === 'S';
  const line = (strip: GableStrip) => (across ? strip.z : strip.x);
  const along = (strip: GableStrip) => (across ? strip.x : strip.z);
  const run = new Map(strips.filter((strip) => strip.dir === start.dir && line(strip) === line(start) && gableColor(model, strip) === color).map((strip) => [along(strip), strip]));
  const end = [start];
  for (const step of [-1, 1]) {
    for (let at = along(start) + step; run.has(at); at += step) end.push(run.get(at)!);
  }
  return end;
}

/**
 * The roof over every room, worked out from the walls, so it can't get out of
 * step with them: flat, or pitched as a hip roof (sloping up from every side)
 * or a gable roof (two slopes meeting at a ridge, with the ends walled in).
 * Pitched roofs follow any shape of house, L-shapes included: each point is as
 * high as it is far in from the roof's edge, which is what makes the hips,
 * ridges and valleys line up.
 */
export class RoofBuilder {
  readonly group = new THREE.Group();
  private slab = new THREE.BoxGeometry(SLAB_WIDTH, SLAB_THICKNESS, SLAB_WIDTH);
  private flatMaterials = new Map<FlatRoofFinish, THREE.MeshStandardMaterial>();
  private pitchedMaterials = new Map<RoofMaterial, THREE.MeshStandardMaterial>();
  private gableMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private gables: THREE.Mesh[] = [];
  private built = '';

  /** `covered` is the squares the floor above is built over, or where stairs go up through it, which need no roof. */
  rebuild(model: GridModel, covered: ReadonlySet<string> = new Set(), look: RoofLook = { style: 'flat', material: 'slate', flat: 'gravel', pitch: 'medium' }) {
    const { style } = look;
    const cells = model.allRooms().flatMap((room) => room.cells).filter((cell) => !covered.has(key(cell.x, cell.z)));
    // The roof's color is only a tint on its covering, which needs nothing rebuilt.
    const tint = roofTint(look.color);
    for (const material of [...this.flatMaterials.values(), ...this.pitchedMaterials.values()]) material.color.copy(tint);
    // Repainting doesn't change the rooms, and this runs for every tile of a paint drag.
    // Squares can be roofed in a style of their own, a room at a time.
    const styleAt = (cell: Cell) => model.roofAreaAt(cell.x, cell.z) ?? style;
    const built = `${style}|${look.material}|${look.flat}|${look.pitch}|${cells.map((cell) => `${key(cell.x, cell.z)}:${styleAt(cell)}`).sort().join(';')}`;
    if (built !== this.built) {
      this.built = built;
      disposeTree(this.group, new Set([this.slab, ...this.flatMaterials.values(), ...this.pitchedMaterials.values(), this.gableMaterial]));
      this.group.clear();
      this.gables = [];
      // Each style's squares are roofed on their own: where a hip room meets a flat one, the hip slopes down to an eave above the wall between.
      for (const each of ['flat', 'hip', 'gable'] as const) {
        const mine = cells.filter((cell) => styleAt(cell) === each);
        if (mine.length === 0) continue;
        if (each === 'flat') this.buildFlat(mine, this.flatMaterial(look.flat, tint));
        else for (const piece of connectedPieces(mine)) this.buildPitched(piece, each, this.pitchedMaterial(look.material, tint), PITCHES[look.pitch]);
      }
    }
    // Paint on the walls, or on the gables themselves, only changes the gables' colors.
    this.colorGables(model);
  }

  private colorGables(model: GridModel) {
    const color = new THREE.Color();
    for (const mesh of this.gables) {
      const colors = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
      (mesh.userData.gableStrips as GableStrip[]).forEach((strip, index) => {
        color.set(gableColor(model, strip));
        for (let corner = 0; corner < 6; corner++) colors.setXYZ(index * 6 + corner, color.r, color.g, color.b);
      });
      colors.needsUpdate = true;
    }
  }

  private flatMaterial(finish: FlatRoofFinish, tint: THREE.Color): THREE.MeshStandardMaterial {
    let material = this.flatMaterials.get(finish);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ map: flatTexture(finish), side: THREE.DoubleSide });
      this.flatMaterials.set(finish, material);
    }
    material.color.copy(tint);
    return material;
  }

  private pitchedMaterial(covering: RoofMaterial, tint: THREE.Color): THREE.MeshStandardMaterial {
    let material = this.pitchedMaterials.get(covering);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ map: pitchedTexture(covering), side: THREE.DoubleSide, vertexColors: true });
      // A metal roof has a bit of a sheen; thatch has none at all.
      if (covering === 'metal') material.roughness = 0.5;
      if (covering === 'thatch') material.roughness = 1;
      this.pitchedMaterials.set(covering, material);
    }
    material.color.copy(tint);
    return material;
  }

  private buildFlat(cells: Cell[], material: THREE.Material) {
    const mesh = new THREE.InstancedMesh(this.slab, material, cells.length);
    const placement = new THREE.Matrix4();
    cells.forEach((cell, index) => {
      const position = cellToWorld(cell.x, cell.z);
      placement.setPosition(position.x, WALL_HEIGHT + SLAB_THICKNESS / 2, position.z);
      mesh.setMatrixAt(index, placement);
    });
    this.group.add(mesh);
  }

  /** One roof over one connected stretch of rooms. */
  private buildPitched(cells: Cell[], style: 'hip' | 'gable', material: THREE.Material, pitch: number) {
    const inside = new Set(cells.map((cell) => key(cell.x, cell.z)));
    const height = style === 'hip' ? hipHeights(cells, inside) : gableHeights(cells, inside);
    const at = (x: number, z: number) => {
      const corner = cornerToWorld(x, z);
      return new THREE.Vector3(corner.x, PITCHED_BASE + (height.get(key(x, z)) ?? 0) * pitch, corner.z);
    };
    const base = (x: number, z: number) => {
      const corner = cornerToWorld(x, z);
      return new THREE.Vector3(corner.x, PITCHED_BASE, corner.z);
    };

    const roof: THREE.Vector3[] = [];
    const ends: GableStrip[] = [];
    for (const { x, z } of cells) {
      const a = at(x, z);
      const b = at(x + 1, z);
      const c = at(x, z + 1);
      const d = at(x + 1, z + 1);
      // Split each square along whichever diagonal changes height most: that's where a hip or valley runs.
      if (Math.abs(a.y - d.y) >= Math.abs(b.y - c.y)) roof.push(a, d, b, a, c, d);
      else roof.push(a, c, b, b, c, d);

      // Where a gable's slope meets the edge above the wall, the wall carries on up to meet it.
      const edges: [Direction, [number, number], [number, number]][] = [
        ['S', [x, z], [x + 1, z]],
        ['N', [x, z + 1], [x + 1, z + 1]],
        ['W', [x, z], [x, z + 1]],
        ['E', [x + 1, z], [x + 1, z + 1]],
      ];
      for (const [dir, [px, pz], [qx, qz]] of edges) {
        if (inside.has(key(x + OUTWARD[dir].x, z + OUTWARD[dir].z))) continue;
        const p = at(px, pz);
        const q = at(qx, qz);
        if (p.y > PITCHED_BASE || q.y > PITCHED_BASE) {
          ends.push({ x, z, dir, points: [base(px, pz), base(qx, qz), q, base(px, pz), q, p] });
          continue;
        }
        // An eave: the slope carries on down and out past the wall.
        const out = new THREE.Vector3(px === qx ? Math.sign(px - x - 0.5) : 0, 0, pz === qz ? Math.sign(pz - z - 0.5) : 0);
        const drop = new THREE.Vector3(0, -EAVE * pitch, 0);
        const pOut = p.clone().addScaledVector(out, EAVE).add(drop);
        const qOut = q.clone().addScaledVector(out, EAVE).add(drop);
        roof.push(p, pOut, qOut, p, qOut, q);
        // At an outside corner, the eaves on its two sides meet across the corner. Filled from the north or south side only, so once.
        for (const [corner, cornerX, cornerZ] of out.z === 0 ? [] : ([[p, px, pz], [q, qx, qz]] as const)) {
          const sideways = new THREE.Vector3(out.x === 0 ? Math.sign(cornerX - x - 0.5) : 0, 0, out.z === 0 ? Math.sign(cornerZ - z - 0.5) : 0);
          const nextSquare = { x: x + sideways.x, z: z + sideways.z };
          if (inside.has(key(nextSquare.x, nextSquare.z))) continue;
          const alongOut = corner.clone().addScaledVector(out, EAVE).add(drop);
          const diagonal = alongOut.clone().addScaledVector(sideways, EAVE);
          const sideOut = corner.clone().addScaledVector(sideways, EAVE).add(drop);
          roof.push(corner, alongOut, diagonal, corner, diagonal, sideOut);
        }
      }
    }
    this.group.add(new THREE.Mesh(shaded(surface(roof)), material));
    if (ends.length > 0) {
      const geometry = surface(ends.flatMap((strip) => strip.points));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ends.length * 18), 3));
      const mesh = new THREE.Mesh(geometry, this.gableMaterial);
      // Which strip each pair of triangles is, for the Paint tool to find.
      mesh.userData.gableStrips = ends;
      this.gables.push(mesh);
      this.group.add(mesh);
    }
  }
}

/**
 * Lighter on slopes that face one way, darker the other, one shade per
 * triangle. And shingles laid on each triangle in rows that run level, along
 * its eave, with the picture's bottom downhill and stretched up the slope by
 * as much as the slope is longer than the ground under it.
 */
function shaded(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const uvs = new Float32Array(position.count * 2);
  const point = new THREE.Vector3();
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    const normal = b.sub(a).cross(c.sub(a)).normalize();
    if (normal.y < 0) normal.negate();
    const shade = 0.72 + 0.4 * normal.dot(SHADE_TOWARD);
    // Downhill, along the ground, and level, across it.
    const downhill = new THREE.Vector2(normal.x, normal.z);
    if (downhill.lengthSq() < 1e-6) downhill.set(0, 1);
    downhill.normalize();
    const stretch = 1 / Math.max(0.2, normal.y);
    for (let corner = 0; corner < 3; corner++) {
      colors.set([shade, shade, shade], (i + corner) * 3);
      point.fromBufferAttribute(position, i + corner);
      const across = point.x * -downhill.y + point.z * downhill.x;
      const down = (point.x * downhill.x + point.z * downhill.y) * stretch;
      uvs.set([across / ROOF_TILE_CELLS, -down / ROOF_TILE_CELLS], (i + corner) * 2);
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

function surface(points: THREE.Vector3[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeVertexNormals();
  return geometry;
}

/** The squares in groups that touch side by side, each getting its own roof. */
function connectedPieces(cells: Cell[]): Cell[][] {
  const remaining = new Map(cells.map((cell) => [key(cell.x, cell.z), cell]));
  const pieces: Cell[][] = [];
  for (const start of cells) {
    if (!remaining.has(key(start.x, start.z))) continue;
    const piece: Cell[] = [];
    const queue = [start];
    remaining.delete(key(start.x, start.z));
    while (queue.length > 0) {
      const cell = queue.pop()!;
      piece.push(cell);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = remaining.get(key(cell.x + dx, cell.z + dz));
        if (!next) continue;
        remaining.delete(key(next.x, next.z));
        queue.push(next);
      }
    }
    pieces.push(piece);
  }
  return pieces;
}

/** The four squares around a grid corner. Corner (x, z) is the one at the low-x, low-z side of square (x, z). */
function squaresAround(x: number, z: number): Cell[] {
  return [{ x: x - 1, z: z - 1 }, { x, z: z - 1 }, { x: x - 1, z }, { x, z }];
}

/** Every corner of the roof's squares, keyed. */
function cornersOf(cells: Cell[]): Map<string, Cell> {
  const corners = new Map<string, Cell>();
  for (const { x, z } of cells) {
    for (const [cx, cz] of [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]]) corners.set(key(cx, cz), { x: cx, z: cz });
  }
  return corners;
}

/**
 * A hip roof: each corner is as high as it is far from the roof's edge,
 * counting a diagonal step as one. So it rises the same from every side, with
 * hips running in at 45° from the outside corners and valleys from the inside
 * ones.
 */
function hipHeights(cells: Cell[], inside: ReadonlySet<string>): Map<string, number> {
  const corners = cornersOf(cells);
  const height = new Map<string, number>();
  let frontier: Cell[] = [];
  for (const [id, corner] of corners) {
    if (squaresAround(corner.x, corner.z).some((square) => !inside.has(key(square.x, square.z)))) {
      height.set(id, 0);
      frontier.push(corner);
    }
  }
  for (let distance = 1; frontier.length > 0; distance++) {
    const next: Cell[] = [];
    for (const corner of frontier) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const id = key(corner.x + dx, corner.z + dz);
          if (!corners.has(id) || height.has(id)) continue;
          height.set(id, distance);
          next.push(corners.get(id)!);
        }
      }
    }
    frontier = next;
  }
  return height;
}

type Axis = 'x' | 'z';
/** A rectangle of squares, x0..x1 by z0..z1, ends included. */
type Rect = { x0: number; z0: number; x1: number; z1: number };
/** One wing of a gable roof: squares a0..a1 along its ridge, and c0..c1 across it. */
type Wing = { along: Axis; a0: number; a1: number; c0: number; c1: number };

const area = (r: Rect) => (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
const rectKey = (r: Rect) => `${r.x0},${r.z0},${r.x1},${r.z1}`;
/** The square `a` along and `c` across, for a wing whose ridge runs along `along`. */
const turned = (along: Axis, a: number, c: number) => (along === 'x' ? key(a, c) : key(c, a));

/**
 * A gable roof: two slopes meeting at a ridge, with the ends walled in. The
 * roof is split into rectangular wings, each with its own ridge, so an L, T or
 * U gets a ridge down each arm. Where one wing's end runs into another, its
 * roof carries on into the other's until the two meet, which makes the
 * valleys.
 */
function gableHeights(cells: Cell[], inside: ReadonlySet<string>): Map<string, number> {
  const { wings, owner } = gableWings(cells, inside);
  const height = new Map<string, number>();
  for (const id of cornersOf(cells).keys()) height.set(id, 0);
  const raise = (along: Axis, a: number, c: number, rise: number) => {
    const id = turned(along, a, c);
    if (height.has(id) && rise > height.get(id)!) height.set(id, rise);
  };

  for (const wing of wings) {
    const width = wing.c1 - wing.c0 + 1;
    // Each corner is as high as it is far, across the ridge, from the wing's side.
    const row = (a: number) => {
      for (let c = wing.c0; c <= wing.c1 + 1; c++) raise(wing.along, a, c, Math.min(c - wing.c0, wing.c1 + 1 - c));
    };
    for (let a = wing.a0; a <= wing.a1 + 1; a++) row(a);

    // Past each end, through the wings it runs into: as far as their ridge if they're as wide, or right through them if they're narrower and lower.
    for (const step of [1, -1]) {
      let limit = step * Infinity;
      for (let a = step > 0 ? wing.a1 + 1 : wing.a0 - 1; ; a += step) {
        const into = new Set<number>();
        for (let c = wing.c0; c <= wing.c1; c++) into.add(owner.get(turned(wing.along, a, c)) ?? -1);
        if (into.has(-1)) break;
        const others = [...into].map((index) => wings[index]);
        // A wing running the same way is a step in the roof, not one to run into.
        if (others.some((other) => other.along === wing.along)) break;
        for (const other of others) {
          if (other.c1 - other.c0 + 1 < width) continue;
          const ridge = (other.c0 + other.c1 + 1) / 2;
          limit = step > 0 ? Math.min(limit, ridge) : Math.max(limit, ridge);
        }
        const far = step > 0 ? a + 1 : a;
        if (step * far > step * limit) break;
        row(far);
      }
    }
  }
  return height;
}

/**
 * The roof's wings. The roof is cut into as few rectangles as it can be, the
 * biggest first. The first runs along its longer side. Each one after that
 * runs out from the wing it's joined to, like a wing off a house, unless that
 * would make it wider and so taller than that wing.
 */
function gableWings(cells: Cell[], inside: ReadonlySet<string>): { wings: Wing[]; owner: Map<string, number> } {
  const box: Rect = {
    x0: Math.min(...cells.map((cell) => cell.x)),
    z0: Math.min(...cells.map((cell) => cell.z)),
    x1: Math.max(...cells.map((cell) => cell.x)),
    z1: Math.max(...cells.map((cell) => cell.z)),
  };
  // Try starting from each of the biggest rectangles, keeping the cut with the fewest wings, then the fewest one square wide.
  const candidates = maximalRectangles(inside, box);
  const biggest = Math.max(...candidates.map(area));
  let best: Rect[] = [];
  let bestScore = [Infinity, Infinity, 0];
  for (const first of candidates.filter((r) => area(r) * 2 >= biggest)) {
    const rects = cutFrom(inside, box, first);
    const score = [rects.length, rects.filter((r) => r.x0 === r.x1 || r.z0 === r.z1).length, -area(first)];
    const better = score[0] - bestScore[0] || score[1] - bestScore[1] || score[2] - bestScore[2];
    if (better < 0) {
      best = rects;
      bestScore = score;
    }
  }

  const wings: Wing[] = [];
  const owner = new Map<string, number>();
  for (const r of best) {
    const width = r.x1 - r.x0 + 1;
    const depth = r.z1 - r.z0 + 1;
    let along: Axis = width >= depth ? 'x' : 'z';
    // How much of each side touches each wing already placed: a side facing x means a ridge along x would run into that wing.
    const shared = new Map<string, number>();
    const touch = (x: number, z: number, facing: Axis) => {
      const index = owner.get(key(x, z));
      if (index !== undefined) shared.set(`${index}|${facing}`, (shared.get(`${index}|${facing}`) ?? 0) + 1);
    };
    for (let z = r.z0; z <= r.z1; z++) {
      touch(r.x0 - 1, z, 'x');
      touch(r.x1 + 1, z, 'x');
    }
    for (let x = r.x0; x <= r.x1; x++) {
      touch(x, r.z0 - 1, 'z');
      touch(x, r.z1 + 1, 'z');
    }
    let longest = 0;
    for (const [id, length] of shared) {
      const [index, facing] = id.split('|') as [string, Axis];
      const other = wings[Number(index)];
      const widthIfFacing = facing === 'x' ? depth : width;
      if (length > longest && widthIfFacing <= other.c1 - other.c0 + 1) {
        longest = length;
        along = facing;
      }
    }
    const index = wings.length;
    wings.push(along === 'x' ? { along, a0: r.x0, a1: r.x1, c0: r.z0, c1: r.z1 } : { along, a0: r.z0, a1: r.z1, c0: r.x0, c1: r.x1 });
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) owner.set(key(x, z), index);
  }
  return { wings, owner };
}

/** Cuts the squares into rectangles: `first`, then the biggest left each time. */
function cutFrom(inside: ReadonlySet<string>, box: Rect, first: Rect): Rect[] {
  const remaining = new Set(inside);
  const rects: Rect[] = [];
  for (let next: Rect | null = first; next; next = largestRectangle(remaining, box)) {
    rects.push(next);
    for (let x = next.x0; x <= next.x1; x++) for (let z = next.z0; z <= next.z1; z++) remaining.delete(key(x, z));
  }
  return rects;
}

/** Every rectangle of squares in `inside` ending at each row, as tall as it can be. */
function rectanglesByRow(inside: ReadonlySet<string>, box: Rect): Rect[] {
  const rects: Rect[] = [];
  const tall = new Map<number, number>();
  for (let z = box.z0; z <= box.z1; z++) {
    for (let x = box.x0; x <= box.x1; x++) tall.set(x, inside.has(key(x, z)) ? (tall.get(x) ?? 0) + 1 : 0);
    for (let x0 = box.x0; x0 <= box.x1; x0++) {
      let lowest = Infinity;
      for (let x1 = x0; x1 <= box.x1; x1++) {
        lowest = Math.min(lowest, tall.get(x1)!);
        if (lowest === 0) break;
        rects.push({ x0, x1, z0: z - lowest + 1, z1: z });
      }
    }
  }
  return rects;
}

function largestRectangle(inside: ReadonlySet<string>, box: Rect): Rect | null {
  let best: Rect | null = null;
  for (const r of rectanglesByRow(inside, box)) if (!best || area(r) > area(best)) best = r;
  return best;
}

/** The rectangles that can't grow any way without leaving the squares. */
function maximalRectangles(inside: ReadonlySet<string>, box: Rect): Rect[] {
  const full = (x0: number, z0: number, x1: number, z1: number) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (!inside.has(key(x, z))) return false;
    return true;
  };
  const found = new Map<string, Rect>();
  for (const r of rectanglesByRow(inside, box)) {
    const grows = full(r.x0 - 1, r.z0, r.x0 - 1, r.z1) || full(r.x1 + 1, r.z0, r.x1 + 1, r.z1) || full(r.x0, r.z0 - 1, r.x1, r.z0 - 1) || full(r.x0, r.z1 + 1, r.x1, r.z1 + 1);
    if (!grows) found.set(rectKey(r), r);
  }
  return [...found.values()];
}

/**
 * The tint a roof color puts on its covering. The covering's picture already
 * has its own shading, so the color is scaled up until its brightest channel
 * is full: a red roof is as bright as the slate it's painted on, just red.
 */
function roofTint(color: string | undefined): THREE.Color {
  if (!color) return new THREE.Color(1, 1, 1);
  const tint = new THREE.Color(color);
  const top = Math.max(tint.r, tint.g, tint.b, 0.05);
  return tint.multiplyScalar(Math.min(2.2, 1 / top));
}
