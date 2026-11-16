import * as THREE from 'three';
import type { FlatRoofFinish, RoofMaterial } from '../grid/house';

/** How many squares of roof one picture covers before it repeats, across and up the slope. */
export const ROOF_TILE_CELLS = 2;
const PIXELS = 512;
const PIXELS_PER_CELL = PIXELS / ROOF_TILE_CELLS;
/** Shingles are half a square wide, and each row shows a quarter of a square. */
const SHINGLE_WIDTH = PIXELS_PER_CELL * 0.5;
const SHINGLE_ROW = PIXELS_PER_CELL * 0.25;
const SLATE = [96, 103, 115];

// Fixed seed so the roof looks the same on every load.
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

let shingles: THREE.CanvasTexture | null = null;

/**
 * Rows of slate shingles, each row staggered half a shingle from the one
 * above, each shingle a slightly different shade, with a shadow along the
 * bottom of every row where it laps over the next. Rows run across the
 * picture; its bottom is the downhill side.
 */
export function shingleTexture(): THREE.CanvasTexture {
  if (shingles) return shingles;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PIXELS;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const random = seededRandom(7);
  const rows = PIXELS / SHINGLE_ROW;
  const perRow = PIXELS / SHINGLE_WIDTH;
  for (let row = 0; row < rows; row++) {
    const top = row * SHINGLE_ROW;
    const offset = row % 2 === 0 ? 0 : SHINGLE_WIDTH / 2;
    for (let shingle = -1; shingle < perRow; shingle++) {
      const left = shingle * SHINGLE_WIDTH + offset;
      const tint = 0.88 + random() * 0.24;
      const [r, g, b] = SLATE.map((channel) => Math.round(channel * tint));
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(left, top, SHINGLE_WIDTH, SHINGLE_ROW);
      // A little lighter toward the top, where it's tucked under the row above.
      const sheen = ctx.createLinearGradient(0, top, 0, top + SHINGLE_ROW);
      sheen.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
      sheen.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
      ctx.fillStyle = sheen;
      ctx.fillRect(left, top, SHINGLE_WIDTH, SHINGLE_ROW);
      // The gap between this shingle and the next.
      ctx.fillStyle = 'rgba(30, 33, 40, 0.55)';
      ctx.fillRect(left + SHINGLE_WIDTH - 3, top, 3, SHINGLE_ROW);
    }
    // The shadowed edge where this row laps over the one below.
    ctx.fillStyle = 'rgba(25, 28, 34, 0.6)';
    ctx.fillRect(0, top + SHINGLE_ROW - 5, PIXELS, 5);
  }
  shingles = finish(canvas);
  return shingles;
}

let gravel: THREE.CanvasTexture | null = null;

/** A flat roof's gravel finish: gray, flecked lighter and darker. */
export function gravelTexture(): THREE.CanvasTexture {
  if (gravel) return gravel;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const random = seededRandom(11);
  ctx.fillStyle = 'rgb(112, 118, 128)';
  ctx.fillRect(0, 0, 256, 256);
  for (let fleck = 0; fleck < 2600; fleck++) {
    const shade = 70 + Math.floor(random() * 110);
    ctx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 10}, ${0.35 + random() * 0.4})`;
    const size = 1 + random() * 2.5;
    ctx.fillRect(random() * 256, random() * 256, size, size);
  }
  gravel = finish(canvas);
  return gravel;
}

// --- More coverings. Pitched pictures cover ROOF_TILE_CELLS squares each way, bottom downhill; flat ones cover one square. ---

type Rgb = [number, number, number];
type Draw = (ctx: CanvasRenderingContext2D, size: number, random: () => number) => void;

function rgb([r, g, b]: Rgb, tint = 1, alpha = 1): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v * tint)));
  return `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${alpha})`;
}

/** Draws something again a picture's width or height over where it would run off an edge, so the picture repeats without a seam. */
function wrapped(size: number, x: number, y: number, reach: number, draw: (x: number, y: number) => void) {
  for (const dx of [0, ...(x < reach ? [size] : []), ...(x > size - reach ? [-size] : [])]) {
    for (const dy of [0, ...(y < reach ? [size] : []), ...(y > size - reach ? [-size] : [])]) draw(x + dx, y + dy);
  }
}

/** Specks all over, lighter and darker, like the grit on a shingle. */
function grit(ctx: CanvasRenderingContext2D, size: number, random: () => number, count: number, strength: number) {
  for (let speck = 0; speck < count; speck++) {
    ctx.fillStyle = random() < 0.5 ? `rgba(255, 255, 255, ${strength})` : `rgba(0, 0, 0, ${strength})`;
    ctx.fillRect(random() * size, random() * size, 1 + random() * 1.5, 1 + random() * 1.5);
  }
}

/** A shadow along the bottom of a row, where it laps over the row below. */
function rowShadow(ctx: CanvasRenderingContext2D, size: number, bottom: number, depth: number, alpha: number) {
  const shadow = ctx.createLinearGradient(0, bottom - depth, 0, bottom);
  shadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
  shadow.addColorStop(1, `rgba(0, 0, 0, ${alpha})`);
  ctx.fillStyle = shadow;
  ctx.fillRect(0, bottom - depth, size, depth);
}

const PITCHED: Record<RoofMaterial, Draw> = {
  slate: () => {},
  asphalt: (ctx, size, random) => {
    const base: Rgb = [94, 86, 80];
    const row = size / 8;
    for (let r = 0; r < 8; r++) {
      const top = r * row;
      let x = random() * 60;
      const start = x;
      while (x < start + size) {
        const width = 40 + random() * 70;
        ctx.fillStyle = rgb(base, 0.78 + random() * 0.4);
        wrapped(size, x % size, top, 120, (px, py) => ctx.fillRect(px, py, width, row));
        ctx.fillStyle = 'rgba(20, 18, 16, 0.6)';
        wrapped(size, (x + width) % size, top, 120, (px, py) => ctx.fillRect(px - 2, py + row * 0.35, 2, row * 0.65));
        x += width;
      }
      rowShadow(ctx, size, top + row, 10, 0.55);
    }
    grit(ctx, size, random, 9000, 0.12);
  },
  clay: (ctx, size, random) => {
    const base: Rgb = [184, 88, 52];
    const row = size / 8;
    const width = size / 8;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const left = c * width;
        const top = r * row;
        const tint = 0.85 + random() * 0.25;
        // Rounded like a pipe cut in half: dark at the sides, bright along the middle.
        const barrel = ctx.createLinearGradient(left, 0, left + width, 0);
        barrel.addColorStop(0, rgb(base, tint * 0.55));
        barrel.addColorStop(0.45, rgb(base, tint * 1.12));
        barrel.addColorStop(0.6, rgb(base, tint * 1.05));
        barrel.addColorStop(1, rgb(base, tint * 0.5));
        ctx.fillStyle = barrel;
        ctx.fillRect(left, top, width, row);
      }
      rowShadow(ctx, size, (r + 1) * row, 14, 0.5);
    }
    grit(ctx, size, random, 3000, 0.06);
  },
  shakes: (ctx, size, random) => {
    const base: Rgb = [138, 108, 80];
    const row = size / 8;
    for (let r = 0; r < 8; r++) {
      const top = r * row;
      let x = random() * 40;
      const start = x;
      while (x < start + size) {
        const width = 28 + random() * 52;
        const tint = 0.7 + random() * 0.45;
        const at = x % size;
        wrapped(size, at, top, 90, (px, py) => {
          ctx.fillStyle = rgb(base, tint);
          ctx.fillRect(px, py, width, row);
          // Grain down each shake.
          for (let line = 0; line < 4; line++) {
            ctx.fillStyle = 'rgba(40, 28, 18, 0.18)';
            ctx.fillRect(px + 3 + random() * (width - 6), py, 1, row);
          }
          ctx.fillStyle = 'rgba(30, 20, 12, 0.7)';
          ctx.fillRect(px + width - 2, py, 2, row);
        });
        x += width;
      }
      rowShadow(ctx, size, top + row, 12, 0.6);
    }
  },
  metal: (ctx, size, random) => {
    const base: Rgb = [112, 134, 146];
    const panel = size / 8;
    for (let p = 0; p < 8; p++) {
      const left = p * panel;
      const sheen = ctx.createLinearGradient(left, 0, left + panel, 0);
      sheen.addColorStop(0, rgb(base, 0.92));
      sheen.addColorStop(0.5, rgb(base, 1.06));
      sheen.addColorStop(1, rgb(base, 0.95));
      ctx.fillStyle = sheen;
      ctx.fillRect(left, 0, panel, size);
      // The raised seam where two panels meet, catching the light, with its shadow beside it.
      ctx.fillStyle = rgb(base, 1.6);
      ctx.fillRect(left + panel - 7, 0, 4, size);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(left + panel - 3, 0, 5, size);
    }
    grit(ctx, size, random, 1200, 0.04);
  },
  thatch: (ctx, size, random) => {
    const base: Rgb = [178, 148, 92];
    ctx.fillStyle = rgb(base, 0.8);
    ctx.fillRect(0, 0, size, size);
    const layer = size / 4;
    for (let straw = 0; straw < 9000; straw++) {
      const x = random() * size;
      const y = random() * size;
      const length = 18 + random() * 34;
      const lean = (random() - 0.5) * 0.35;
      ctx.strokeStyle = rgb(base, 0.45 + random() * 0.85, 0.6);
      ctx.lineWidth = 1 + random();
      wrapped(size, x, y, 60, (px, py) => {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + lean * length, py + length);
        ctx.stroke();
      });
    }
    for (let l = 1; l <= 4; l++) rowShadow(ctx, size, l * layer, 30, 0.6);
  },
};

const FLAT: Record<FlatRoofFinish, Draw> = {
  gravel: () => {},
  membrane: (ctx, size, random) => {
    const base: Rgb = [206, 208, 210];
    ctx.fillStyle = rgb(base);
    ctx.fillRect(0, 0, size, size);
    for (let blot = 0; blot < 30; blot++) {
      ctx.fillStyle = rgb(base, 0.9 + random() * 0.12, 0.25);
      wrapped(size, random() * size, random() * size, 40, (x, y) => ctx.fillRect(x, y, 20 + random() * 40, 20 + random() * 40));
    }
    // Seams where the sheets overlap.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.fillRect(0, size / 2 - 2, size, 3);
    ctx.fillRect(0, 0, size, 2);
    grit(ctx, size, random, 1500, 0.05);
  },
  green: (ctx, size, random) => {
    ctx.fillStyle = 'rgb(86, 116, 62)';
    ctx.fillRect(0, 0, size, size);
    const greens: Rgb[] = [[110, 150, 72], [74, 104, 52], [140, 160, 80], [160, 96, 80], [196, 186, 90]];
    for (let leaf = 0; leaf < 4000; leaf++) {
      const color = greens[random() < 0.9 ? Math.floor(random() * 3) : 3 + Math.floor(random() * 2)];
      ctx.fillStyle = rgb(color, 0.85 + random() * 0.3);
      const r = 1.5 + random() * 3;
      wrapped(size, random() * size, random() * size, 6, (x, y) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  },
};

const pitchedTextures = new Map<RoofMaterial, THREE.CanvasTexture>();
const flatTextures = new Map<FlatRoofFinish, THREE.CanvasTexture>();

/** The picture on a pitched roof. */
export function pitchedTexture(material: RoofMaterial): THREE.CanvasTexture {
  if (material === 'slate') return shingleTexture();
  const made = pitchedTextures.get(material);
  if (made) return made;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PIXELS;
  PITCHED[material](canvas.getContext('2d') as CanvasRenderingContext2D, PIXELS, seededRandom(material.length * 31 + 5));
  const texture = finish(canvas);
  pitchedTextures.set(material, texture);
  return texture;
}

/** The picture on a flat roof, one square of it. */
export function flatTexture(finishing: FlatRoofFinish): THREE.CanvasTexture {
  if (finishing === 'gravel') return gravelTexture();
  const made = flatTextures.get(finishing);
  if (made) return made;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  FLAT[finishing](canvas.getContext('2d') as CanvasRenderingContext2D, 256, seededRandom(finishing.length * 17 + 3));
  const texture = finish(canvas);
  flatTextures.set(finishing, texture);
  return texture;
}
