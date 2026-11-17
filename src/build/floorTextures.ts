import * as THREE from 'three';
import type { FloorSurface } from '../grid/gridModel';

/**
 * What each floor surface looks like. The pictures are drawn here, pale, with
 * the pattern in darker lines and shades, and laid out across the whole floor
 * rather than tile by tile, so planks and grout run on from one square to the
 * next. The tile's color, its own or the surface's, tints the picture.
 */
export interface SurfaceLook {
  id: FloorSurface;
  label: string;
  emoji: string;
  hint: string;
  /** Before it's painted. */
  color: string;
  /** How many squares one picture covers before it repeats. Plain has no picture. */
  cells: number;
  /**
   * A road marking: asphalt with paint on it, drawn in its own colors (so the
   * paint keeps its color) one square at a time, and turned to suit the tiles
   * round it. A yellow line runs on into the line tiles beside it; a
   * crosswalk's stripes run across the row of crosswalk tiles, the way the
   * traffic goes.
   */
  marking?: 'line' | 'crosswalk';
}

/** Asphalt's color, which road markings are drawn on as well. */
const ASPHALT = '#3b3c40';
/** Road paint: a slightly warm, slightly worn yellow. */
const ROAD_YELLOW = '#f0c22e';
/** Crosswalk paint: white, a touch off from the tile's own white so it reads as paint. */
const CROSSWALK_WHITE = '#ecebe4';

export const SURFACES: SurfaceLook[] = [
  { id: 'plain', label: 'Plain', emoji: '⬜', hint: 'A plain flat tile, the one every floor started with', color: '#e8d9b8', cells: 0 },
  { id: 'planks', label: 'Planks', emoji: '🪵', hint: 'Long wooden boards, staggered', color: '#e0ad72', cells: 2 },
  { id: 'parquet', label: 'Parquet', emoji: '🟫', hint: 'Wooden blocks in a herringbone', color: '#c48a52', cells: 1 },
  { id: 'tile', label: 'Tile', emoji: '🔲', hint: 'Square ceramic tiles with grout between', color: '#f6f4ee', cells: 1 },
  { id: 'checker', label: 'Checker', emoji: '🏁', hint: 'Black and white squares, like a diner', color: '#f4f1ea', cells: 1 },
  { id: 'stone', label: 'Stone', emoji: '🪨', hint: 'Uneven flagstones', color: '#c2bdb2', cells: 2 },
  { id: 'carpet', label: 'Carpet', emoji: '🧶', hint: 'Soft carpet, faintly flecked', color: '#dccfb8', cells: 1 },
  { id: 'pavers', label: 'Pavers', emoji: '🧱', hint: 'Brick pavers in a basketweave, for patios and paths', color: '#cf7d5e', cells: 1 },
  { id: 'asphalt', label: 'Asphalt', emoji: '⬛', hint: 'Black asphalt, for roads and driveways', color: ASPHALT, cells: 2 },
  {
    id: 'road-line',
    label: 'Road line',
    emoji: '🟨',
    hint: 'Asphalt with a dashed yellow center line. Lay it in a row down the middle of a road: the line turns to run on into the line tiles beside it',
    color: '#ffffff',
    cells: 1,
    marking: 'line',
  },
  {
    id: 'road-double',
    label: 'Double line',
    emoji: '🛣️',
    hint: 'Asphalt with a double solid yellow line, for no passing. Lay it in a row down the middle of a road: the lines turn to run on into the line tiles beside them',
    color: '#ffffff',
    cells: 1,
    marking: 'line',
  },
  {
    id: 'crosswalk',
    label: 'Crosswalk',
    emoji: '🦓',
    hint: 'Asphalt with white zebra stripes. Lay it in a row across a road: the stripes run the way the traffic does',
    color: '#ffffff',
    cells: 1,
    marking: 'crosswalk',
  },
];

export function surfaceLook(surface: FloorSurface): SurfaceLook {
  return SURFACES.find((look) => look.id === surface) ?? SURFACES[0];
}

/** A tile's color before it's painted. */
export function surfaceColor(surface: FloorSurface): string {
  return surfaceLook(surface).color;
}

/** Pixels per square of floor. */
const PER_CELL = 256;

// Fixed seed so a floor looks the same on every load.
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gray(value: number, alpha = 1): string {
  const v = Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgba(${v}, ${v}, ${v}, ${alpha})`;
}

/** A rectangle that carries on across the picture's edges, so the picture repeats without a seam. */
function wrappedRect(ctx: CanvasRenderingContext2D, size: number, x: number, y: number, w: number, h: number) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) ctx.fillRect(x + dx, y + dy, w, h);
}

/** A brick, block or board: a shade, a lighter top edge, and a dark gap round it. */
function block(ctx: CanvasRenderingContext2D, size: number, x: number, y: number, w: number, h: number, shade: number, gap: number, gapShade: number) {
  ctx.fillStyle = gray(gapShade);
  wrappedRect(ctx, size, x, y, w, h);
  ctx.fillStyle = gray(shade);
  wrappedRect(ctx, size, x + gap / 2, y + gap / 2, w - gap, h - gap);
  ctx.fillStyle = gray(1, 0.12);
  wrappedRect(ctx, size, x + gap / 2, y + gap / 2, w - gap, Math.max(2, gap));
}

type Draw = (ctx: CanvasRenderingContext2D, size: number, random: () => number) => void;

const DRAW: Partial<Record<FloorSurface, Draw>> = {
  planks: (ctx, size, random) => {
    const rows = 8;
    const height = size / rows;
    const length = size / 2;
    for (let row = 0; row < rows; row++) {
      const offset = Math.floor(random() * length);
      for (let board = 0; board < 2; board++) {
        block(ctx, size, offset + board * length, row * height, length, height, 0.86 + random() * 0.14, 3, 0.45);
      }
      // Grain along each board.
      for (let line = 0; line < 5; line++) {
        ctx.fillStyle = gray(0.5, 0.08 + random() * 0.08);
        wrappedRect(ctx, size, random() * size, row * height + 4 + random() * (height - 8), 40 + random() * 140, 1);
      }
    }
  },
  parquet: (ctx, size, random) => {
    // A herringbone of two-by-one blocks: a stair of flat and upright blocks, repeated.
    const unit = size / 4;
    for (let k = -3; k <= 3; k++) {
      for (let n = -8; n <= 8; n++) {
        const x = (n + 2 * k) * unit;
        const y = (n - 2 * k) * unit;
        block(ctx, size, mod(x, size), mod(y, size), unit * 2, unit, 0.82 + random() * 0.18, 3, 0.4);
        block(ctx, size, mod(x, size), mod(y + unit, size), unit, unit * 2, 0.82 + random() * 0.18, 3, 0.4);
      }
    }
  },
  tile: (ctx, size, random) => {
    const tile = size / 2;
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) block(ctx, size, x * tile, y * tile, tile, tile, 0.95 + random() * 0.05, 6, 0.72);
  },
  checker: (ctx, size, random) => {
    const tile = size / 2;
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) block(ctx, size, x * tile, y * tile, tile, tile, (x + y) % 2 === 0 ? 0.97 : 0.16 + random() * 0.03, 3, 0.55);
  },
  stone: (ctx, size, random) => {
    ctx.fillStyle = gray(0.5);
    ctx.fillRect(0, 0, size, size);
    const heights = [150, 104, 142, 116];
    let y = 0;
    for (const height of heights) {
      const offset = random() * size;
      let x = 0;
      while (x < size) {
        const width = Math.min(size - x, 90 + random() * 120);
        // The last stone in a row closes the gap exactly, so the row repeats.
        const fits = size - x - width < 70 ? size - x : width;
        const shade = 0.78 + random() * 0.22;
        ctx.fillStyle = gray(shade);
        roundedWrapped(ctx, size, offset + x + 4, y + 4, fits - 8, height - 8, 14);
        x += fits;
      }
      y += height;
    }
    for (let fleck = 0; fleck < 1800; fleck++) {
      ctx.fillStyle = gray(random() < 0.5 ? 0.35 : 1, 0.12);
      ctx.fillRect(random() * size, random() * size, 2, 2);
    }
  },
  carpet: (ctx, size, random) => {
    ctx.fillStyle = gray(0.9);
    ctx.fillRect(0, 0, size, size);
    // Soft patches where the pile lies one way or the other.
    for (let patch = 0; patch < 40; patch++) {
      const x = random() * size;
      const y = random() * size;
      const radius = 12 + random() * 30;
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          const glow = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
          const light = random() < 0.5;
          glow.addColorStop(0, gray(light ? 1 : 0.7, 0.18));
          glow.addColorStop(1, gray(light ? 1 : 0.7, 0));
          ctx.fillStyle = glow;
          ctx.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
        }
      }
    }
    // Tufts: little strands of yarn leaning every which way.
    ctx.lineCap = 'round';
    for (let tuft = 0; tuft < 9000; tuft++) {
      const x = random() * size;
      const y = random() * size;
      const angle = random() * Math.PI * 2;
      const length = 1.5 + random() * 3;
      ctx.strokeStyle = gray(random() < 0.5 ? 0.6 : 1, 0.22 + random() * 0.2);
      ctx.lineWidth = 0.8 + random() * 1.2;
      for (const dx of x < 6 ? [0, size] : x > size - 6 ? [0, -size] : [0]) {
        for (const dy of y < 6 ? [0, size] : y > size - 6 ? [0, -size] : [0]) {
          ctx.beginPath();
          ctx.moveTo(x + dx, y + dy);
          ctx.lineTo(x + dx + Math.cos(angle) * length, y + dy + Math.sin(angle) * length);
          ctx.stroke();
        }
      }
    }
    // A fine grain over everything, pixel by pixel.
    const image = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const grain = (random() - 0.5) * 34;
      for (let c = 0; c < 3; c++) image.data[i + c] = Math.min(255, Math.max(0, image.data[i + c] + grain));
    }
    ctx.putImageData(image, 0, 0);
  },
  asphalt: (ctx, size, random) => drawAsphalt(ctx, size, random),
  'road-line': (ctx, size, random) => {
    drawMarkingGround(ctx, size, random);
    // One dash, half a square long, in the middle: tile after tile, dash and gap alternate.
    const width = size * 0.055;
    paintStripe(ctx, size / 2 - width / 2, size * 0.25, width, size * 0.5, random);
  },
  'road-double': (ctx, size, random) => {
    drawMarkingGround(ctx, size, random);
    const width = size * 0.04;
    const apart = size * 0.05;
    paintStripe(ctx, size / 2 - apart / 2 - width, 0, width, size, random);
    paintStripe(ctx, size / 2 + apart / 2, 0, width, size, random);
  },
  crosswalk: (ctx, size, random) => {
    drawMarkingGround(ctx, size, random);
    // Two broad bars a square, as wide as the gaps between them, so a row of crosswalk tiles stripes evenly all the way across.
    const bar = size / 4;
    for (const x of [bar / 2, bar * 2.5]) paintStripe(ctx, x, size * 0.07, bar, size * 0.86, random, CROSSWALK_WHITE);
  },
  pavers: (ctx, size, random) => {
    const square = size / 2;
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        // Each square is a pair of bricks, side by side one way, then the other.
        const across = (x + y) % 2 === 0;
        for (let brick = 0; brick < 2; brick++) {
          const bx = x * square + (across ? 0 : (brick * square) / 2);
          const by = y * square + (across ? (brick * square) / 2 : 0);
          block(ctx, size, bx, by, across ? square : square / 2, across ? square / 2 : square, 0.8 + random() * 0.2, 6, 0.75);
        }
      }
    }
  },
};

/** Asphalt, pale, for tinting: a fine mix of stones in the tar, and a few smoother, darker patches where it's worn. */
function drawAsphalt(ctx: CanvasRenderingContext2D, size: number, random: () => number) {
  ctx.fillStyle = gray(0.84);
  ctx.fillRect(0, 0, size, size);
  for (let patch = 0; patch < 10; patch++) {
    const x = random() * size;
    const y = random() * size;
    const radius = 30 + random() * 60;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const glow = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
        glow.addColorStop(0, gray(0.7, 0.25));
        glow.addColorStop(1, gray(0.7, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
      }
    }
  }
  // Stones: specks lighter and darker than the tar.
  const stones = Math.round((size * size) / 22);
  for (let stone = 0; stone < stones; stone++) {
    const light = random() < 0.55;
    ctx.fillStyle = gray(light ? 1 : 0.55, 0.25 + random() * 0.35);
    const across = random() < 0.85 ? 1.5 : 2.5;
    ctx.fillRect(random() * size, random() * size, across, across);
  }
}

/** Under a road marking: the asphalt itself, already in asphalt's color, since a marking isn't tinted. */
function drawMarkingGround(ctx: CanvasRenderingContext2D, size: number, random: () => number) {
  drawAsphalt(ctx, size, random);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = ASPHALT;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
}

/** A stripe of road paint, yellow unless said otherwise, running up the picture, worn through in specks where the asphalt shows. */
function paintStripe(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, random: () => number, color = ROAD_YELLOW) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
  const worn = Math.round((width * height) / 30);
  for (let speck = 0; speck < worn; speck++) {
    ctx.fillStyle = random() < 0.6 ? 'rgba(60, 60, 64, 0.55)' : 'rgba(255, 240, 190, 0.35)';
    ctx.fillRect(x + random() * width, y + random() * height, 1.5, 1.5);
  }
}

function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function roundedWrapped(ctx: CanvasRenderingContext2D, size: number, x: number, y: number, w: number, h: number, radius: number) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      ctx.beginPath();
      ctx.roundRect(x + dx, y + dy, w, h, radius);
      ctx.fill();
    }
  }
}

const textures = new Map<FloorSurface, THREE.CanvasTexture>();

/** The picture for a surface, or null for plain. Made once and shared. */
export function surfaceTexture(surface: FloorSurface): THREE.CanvasTexture | null {
  const draw = DRAW[surface];
  if (!draw) return null;
  const made = textures.get(surface);
  if (made) return made;
  const size = PER_CELL * surfaceLook(surface).cells;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = gray(1);
  ctx.fillRect(0, 0, size, size);
  draw(ctx, size, seededRandom(SURFACES.findIndex((look) => look.id === surface) + 3));
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  textures.set(surface, texture);
  return texture;
}
