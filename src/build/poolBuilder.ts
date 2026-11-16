import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GridModel, PoolCell } from '../grid/gridModel';
import { cellKey } from '../grid/roomDetection';
import { POOL_FLOOR, POOL_WATER, SPA_FLOOR, SPA_SEAT } from './furnitureCatalog';
import { disposeTree } from '../scene/dispose';

/** How far the stone rim round a pool reaches in over the water, and how far out over the ground. */
const COPING_IN = 0.12;
const COPING_OUT = 0.06;
const COPING_HEIGHT = 0.05;
/** How far a spa's bench reaches in from its wall. */
const SPA_BENCH = 0.3;
/** The stencil value a pool's opening marks, which the grass and the like skip. */
const POOL_STENCIL = 1;

/**
 * Marks a material, like the grass, to be skipped wherever a pool's opening is,
 * so the ground has a hole where the pool is dug.
 */
export function skipPools(material: THREE.Material) {
  material.stencilWrite = true;
  material.stencilRef = POOL_STENCIL;
  material.stencilFunc = THREE.NotEqualStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
}

type Side = 'N' | 'E' | 'S' | 'W';
const STEP: Record<Side, [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };

/** How deep a square's floor is. */
export function poolFloor(pool: PoolCell): number {
  return pool.kind === 'spa' ? SPA_FLOOR : POOL_FLOOR;
}

/**
 * The pools and spas sunk into the ground floor: tiled walls and floors, a
 * stone rim round the edge, a spa's bench, and see-through water that
 * shimmers, with bubbles rising in a spa. The ground has a hole cut in it
 * over each one, by a stencil mark the grass skips.
 */
export class PoolBuilder {
  readonly group = new THREE.Group();
  private tileMaterial = new THREE.MeshStandardMaterial({ map: poolTileTexture(), roughness: 0.35, side: THREE.DoubleSide });
  private copingMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d3c6, roughness: 0.9 });
  private waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x3fa9e0,
    map: waterTexture(),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    roughness: 0.15,
    side: THREE.DoubleSide,
  });
  private spaWaterMaterial = this.waterMaterial.clone();
  private maskMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  private bubbleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  private bubbles: THREE.InstancedMesh | null = null;
  private bubbleCells: { x: number; z: number }[] = [];
  private built = '';
  /** Splashes where someone's hit the water, each a burst of drops that flies up and falls back. */
  private splashGroup = new THREE.Group();
  private splashes: { x: number; z: number; size: number; start: number | null; mesh: THREE.InstancedMesh; foam: THREE.Mesh }[] = [];
  private foamGeometry = new THREE.RingGeometry(0.8, 1, 32);
  private dropGeometry = new THREE.SphereGeometry(0.045, 6, 4);
  private dropMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });

  constructor() {
    this.spaWaterMaterial.color.setHex(0x6cc9cf);
    this.spaWaterMaterial.map = this.waterMaterial.map;
    this.maskMaterial.stencilWrite = true;
    this.maskMaterial.stencilRef = POOL_STENCIL;
    this.maskMaterial.stencilFunc = THREE.AlwaysStencilFunc;
    this.maskMaterial.stencilZPass = THREE.ReplaceStencilOp;
    this.maskMaterial.stencilFail = THREE.ReplaceStencilOp;
    this.maskMaterial.stencilZFail = THREE.ReplaceStencilOp;
  }

  rebuild(model: GridModel) {
    const pools = model.allPools();
    const built = pools.map((pool) => `${pool.x},${pool.z}:${pool.kind}`).sort().join(';');
    if (built === this.built) return;
    this.built = built;
    disposeTree(this.group, new Set([this.tileMaterial, this.copingMaterial, this.waterMaterial, this.spaWaterMaterial, this.maskMaterial, this.bubbleMaterial]));
    this.group.clear();
    this.group.add(this.splashGroup);
    this.bubbles = null;
    this.bubbleCells = [];
    if (pools.length === 0) return;

    const byKey = new Map(pools.map((pool) => [cellKey(pool.x, pool.z), pool]));
    const at = (x: number, z: number) => byKey.get(cellKey(x, z));
    const tiles: THREE.BufferGeometry[] = [];
    const coping: THREE.BufferGeometry[] = [];
    const masks: THREE.BufferGeometry[] = [];
    const water: THREE.BufferGeometry[] = [];
    const spaWater: THREE.BufferGeometry[] = [];

    for (const pool of pools) {
      const { x, z } = pool;
      const floor = poolFloor(pool);
      // A side counts as an edge where the water stops, or where a pool meets a spa: they get a stone divider between them.
      const same = (cx: number, cz: number) => at(cx, cz)?.kind === pool.kind;
      const dry = (side: Side) => !same(x + STEP[side][0], z + STEP[side][1]);
      // The opening: the square, less the rim along each side that's dry ground.
      const x0 = x - 0.5 + (dry('W') ? COPING_IN : 0);
      const x1 = x + 0.5 - (dry('E') ? COPING_IN : 0);
      const z0 = z - 0.5 + (dry('S') ? COPING_IN : 0);
      const z1 = z + 0.5 - (dry('N') ? COPING_IN : 0);

      tiles.push(quad([x0, floor, z0], [x1, floor, z0], [x1, floor, z1], [x0, floor, z1]));
      masks.push(quad([x0, 0.002, z0], [x1, 0.002, z0], [x1, 0.002, z1], [x0, 0.002, z1]));
      (pool.kind === 'spa' ? spaWater : water).push(quad([x0, POOL_WATER, z0], [x1, POOL_WATER, z0], [x1, POOL_WATER, z1], [x0, POOL_WATER, z1]));

      for (const side of ['N', 'E', 'S', 'W'] as Side[]) {
        if (!dry(side)) continue;
        // A wall all the way up, a stone rim along the top, and in a spa, a bench along it.
        tiles.push(sideWall(side, x0, x1, z0, z1, floor, 0));
        coping.push(copingStrip(side, x, z));
        if (pool.kind === 'spa') tiles.push(...bench(side, x0, x1, z0, z1, floor));
      }
      // Where the rim along one side stops short at a corner the next square's water carries on round, its end needs a face too.
      for (const side of ['W', 'E'] as Side[]) {
        if (!dry(side)) continue;
        const sx = side === 'W' ? x - 0.5 : x + 0.5 - COPING_IN;
        for (const along of [-1, 1]) {
          if (same(x, z + along) && same(x + STEP[side][0], z + along)) {
            const zz = along < 0 ? z - 0.5 : z + 0.5;
            tiles.push(quad([sx, floor, zz], [sx + COPING_IN, floor, zz], [sx + COPING_IN, 0, zz], [sx, 0, zz]));
          }
        }
      }
      for (const side of ['S', 'N'] as Side[]) {
        if (!dry(side)) continue;
        const sz = side === 'S' ? z - 0.5 : z + 0.5 - COPING_IN;
        for (const along of [-1, 1]) {
          if (same(x + along, z) && same(x + along, z + STEP[side][1])) {
            const xx = along < 0 ? x - 0.5 : x + 0.5;
            tiles.push(quad([xx, floor, sz], [xx, floor, sz + COPING_IN], [xx, 0, sz + COPING_IN], [xx, 0, sz]));
          }
        }
      }
      if (pool.kind === 'spa') this.bubbleCells.push({ x, z });
    }

    const mesh = (geometries: THREE.BufferGeometry[], material: THREE.Material) => {
      const merged = mergeGeometries(geometries);
      for (const geometry of geometries) geometry.dispose();
      return new THREE.Mesh(merged, material);
    };
    const mask = mesh(masks, this.maskMaterial);
    // Before the grass, so the grass knows where to leave a hole.
    mask.renderOrder = -20;
    this.group.add(mask, mesh(tiles, this.tileMaterial), mesh(coping, this.copingMaterial));
    if (water.length > 0) this.group.add(mesh(water, this.waterMaterial));
    if (spaWater.length > 0) this.group.add(mesh(spaWater, this.spaWaterMaterial));
    if (this.bubbleCells.length > 0) {
      this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), this.bubbleMaterial, this.bubbleCells.length * BUBBLES_PER_SQUARE);
      this.group.add(this.bubbles);
    }
  }

  /** A splash where someone's just hit the water. `size` 1 is someone jumping in; bigger is a dive off the board, with more drops thrown higher and wider. */
  splash(x: number, z: number, size = 1) {
    const mesh = new THREE.InstancedMesh(this.dropGeometry, this.dropMaterial, Math.round(DROPS * (size > 1 ? 3 : 1)));
    // A ring of foam spreading out on the water from where it went in.
    const foam = new THREE.Mesh(this.foamGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(x, POOL_WATER + 0.01, z);
    this.splashGroup.add(mesh, foam);
    this.splashes.push({ x, z, size, start: null, mesh, foam });
  }

  /** Every frame: the water's shimmer, the spa's bubbles rising, and any splashes. */
  animate(time: number) {
    const drop = new THREE.Matrix4();
    for (const splash of [...this.splashes]) {
      splash.start ??= time;
      const age = time - splash.start;
      const { size } = splash;
      const lasts = SPLASH_SECONDS * (1 + (size - 1) * 0.45);
      if (age > lasts) {
        this.splashGroup.remove(splash.mesh, splash.foam);
        splash.mesh.dispose();
        (splash.foam.material as THREE.Material).dispose();
        this.splashes.splice(this.splashes.indexOf(splash), 1);
        continue;
      }
      const count = splash.mesh.count;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.3;
        // A big splash throws some drops nearly straight up in a column, and the rest out in a crown.
        const column = size > 1 && i % 4 === 0;
        const speed = (0.9 + (i % 3) * 0.35) * (1 + (size - 1) * 0.5) * (column ? 0.2 : 1);
        const out = age * speed;
        const rise = (2.4 + (i % 4) * 0.4) * Math.sqrt(size) * (column ? 1.35 : 1);
        const y = POOL_WATER + age * rise - age * age * 6;
        const scale = Math.max(0.01, 1 - age / lasts) * (1 + (size - 1) * 0.55);
        drop.makeScale(scale, scale, scale).setPosition(splash.x + Math.sin(angle) * out, Math.max(POOL_WATER, y), splash.z + Math.cos(angle) * out);
        splash.mesh.setMatrixAt(i, drop);
      }
      splash.mesh.instanceMatrix.needsUpdate = true;
      const spread = 0.15 + (age / lasts) * 0.55 * size;
      splash.foam.scale.setScalar(spread);
      (splash.foam.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - age / lasts);
    }
    const map = this.waterMaterial.map;
    if (map) map.offset.set(Math.sin(time * 0.21) * 0.08 + time * 0.012, Math.cos(time * 0.17) * 0.08 + time * 0.009);
    const bubbles = this.bubbles;
    if (!bubbles) return;
    const place = new THREE.Matrix4();
    this.bubbleCells.forEach((cell, index) => {
      for (let n = 0; n < BUBBLES_PER_SQUARE; n++) {
        const seed = index * 7.13 + n * 3.71;
        const rise = (time * 0.45 + seed) % 1;
        const y = SPA_SEAT - 0.15 + rise * (POOL_WATER - SPA_SEAT + 0.13);
        const dx = Math.sin(seed * 12.9) * 0.3 + Math.sin(time * 3 + seed) * 0.02;
        const dz = Math.cos(seed * 7.7) * 0.3;
        const scale = 0.6 + rise * 0.8;
        place.makeScale(scale, scale, scale).setPosition(cell.x + dx, y, cell.z + dz);
        bubbles.setMatrixAt(index * BUBBLES_PER_SQUARE + n, place);
      }
    });
    bubbles.instanceMatrix.needsUpdate = true;
  }
}

const BUBBLES_PER_SQUARE = 4;
const DROPS = 14;
const SPLASH_SECONDS = 0.8;

/** A flat four-cornered piece, with its picture laid across it by where it is in the world, so tiles run on unbroken. */
function quad(a: number[], b: number[], c: number[], d: number[]): THREE.BufferGeometry {
  const positions = [a, b, c, a, c, d];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
  // Walls take their picture across them and up; floors across the ground.
  const flat = Math.abs(a[1] - c[1]) < 1e-6;
  const upright = Math.abs(a[0] - c[0]) < 1e-6 ? 2 : 0;
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(positions.flatMap((p) => (flat ? [p[0] * 2, p[2] * 2] : [p[upright] * 2, p[1] * 2])), 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** The tiled wall of an opening along one side, from its floor up to `top`, facing in. */
function sideWall(side: Side, x0: number, x1: number, z0: number, z1: number, floor: number, top: number): THREE.BufferGeometry {
  if (side === 'W') return quad([x0, floor, z1], [x0, floor, z0], [x0, top, z0], [x0, top, z1]);
  if (side === 'E') return quad([x1, floor, z0], [x1, floor, z1], [x1, top, z1], [x1, top, z0]);
  if (side === 'S') return quad([x0, floor, z0], [x1, floor, z0], [x1, top, z0], [x0, top, z0]);
  return quad([x1, floor, z1], [x0, floor, z1], [x0, top, z1], [x1, top, z1]);
}

/** A spa's bench along one wall: its seat and its front. */
function bench(side: Side, x0: number, x1: number, z0: number, z1: number, floor: number): THREE.BufferGeometry[] {
  const y = SPA_SEAT;
  if (side === 'W') return [quad([x0, y, z0], [x0 + SPA_BENCH, y, z0], [x0 + SPA_BENCH, y, z1], [x0, y, z1]), sideWall('W', x0 + SPA_BENCH, x1, z0, z1, floor, y)];
  if (side === 'E') return [quad([x1 - SPA_BENCH, y, z0], [x1, y, z0], [x1, y, z1], [x1 - SPA_BENCH, y, z1]), sideWall('E', x0, x1 - SPA_BENCH, z0, z1, floor, y)];
  if (side === 'S') return [quad([x0, y, z0], [x1, y, z0], [x1, y, z0 + SPA_BENCH], [x0, y, z0 + SPA_BENCH]), sideWall('S', x0, x1, z0 + SPA_BENCH, z1, floor, y)];
  return [quad([x0, y, z1 - SPA_BENCH], [x1, y, z1 - SPA_BENCH], [x1, y, z1], [x0, y, z1]), sideWall('N', x0, x1, z0, z1 - SPA_BENCH, floor, y)];
}

/** The stone rim along one side of a square, over the edge of the water and a little out onto the ground. */
function copingStrip(side: Side, x: number, z: number): THREE.BufferGeometry {
  const width = COPING_IN + COPING_OUT;
  const middle = 0.5 - COPING_IN + width / 2;
  const geometry = side === 'N' || side === 'S' ? new THREE.BoxGeometry(1 + COPING_OUT * 2, COPING_HEIGHT, width) : new THREE.BoxGeometry(width, COPING_HEIGHT, 1 + COPING_OUT * 2);
  const [dx, dz] = STEP[side];
  geometry.translate(x + dx * middle, COPING_HEIGHT / 2, z + dz * middle);
  return geometry.toNonIndexed();
}

/** Small glazed tiles, pale blue with white grout, for a pool's walls and floor. */
function poolTileTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#e9f3f6';
  ctx.fillRect(0, 0, size, size);
  const tile = size / 4;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const shade = 200 + ((i * 7 + j * 13) % 5) * 6;
      ctx.fillStyle = `rgb(${shade - 60}, ${shade - 5}, ${Math.min(255, shade + 30)})`;
      ctx.fillRect(i * tile + 2, j * tile + 2, tile - 4, tile - 4);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Wavy lines of light on the water, which drift as the texture slides. */
function waterTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.0)';
  for (let line = 0; line < 22; line++) {
    const y = (line / 22) * size;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const wave = Math.sin((x / size) * Math.PI * 2 * 3 + line * 1.7) * 6 + Math.sin((x / size) * Math.PI * 2 * 5 + line) * 3;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.strokeStyle = `rgba(190, 230, 255, ${0.35 + (line % 3) * 0.15})`;
    ctx.lineWidth = 2 + (line % 2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
