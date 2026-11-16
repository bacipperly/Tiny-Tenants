import * as THREE from 'three';

const TEXTURE_PIXELS = 2048;
/** Same width as the lot, so no patch of grass repeats inside it. */
export const GRASS_TILE_CELLS = 64;
const PIXELS_PER_CELL = TEXTURE_PIXELS / GRASS_TILE_CELLS;
const CLUSTER_COUNT = 185;
const BASE_GRASS = '#7fae6b';

const DRY_GRASS = ['176, 172, 96', '160, 168, 90'];
const DARK_GRASS = ['100, 150, 86', '84, 136, 76'];
const PATCH_SIZES = [
  { count: 34, minRadiusCells: 6, maxRadiusCells: 12, alpha: 0.2 },
  { count: 70, minRadiusCells: 2.5, maxRadiusCells: 5, alpha: 0.12 },
];
const LOBES_PER_PATCH = 4;

// Fixed seed so the grass looks the same on every load.
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A soft oval that fades out at its edge. It's also drawn past each side of the texture, so it continues across the seam where the texture repeats. */
function drawSoftOval(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, stretch: number, heading: number, rgb: string, alpha: number) {
  for (const offsetX of [-TEXTURE_PIXELS, 0, TEXTURE_PIXELS]) {
    for (const offsetY of [-TEXTURE_PIXELS, 0, TEXTURE_PIXELS]) {
      ctx.save();
      ctx.translate(x + offsetX, y + offsetY);
      ctx.rotate(heading);
      ctx.scale(stretch, 1);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
      gradient.addColorStop(0.6, `rgba(${rgb}, ${alpha * 0.55})`);
      gradient.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

/** Soft, uneven patches of drier and darker grass. Each is a few overlapping ovals, so none reads as a clean circle. */
function drawColorPatches(ctx: CanvasRenderingContext2D, random: () => number) {
  for (const size of PATCH_SIZES) {
    for (let patch = 0; patch < size.count; patch++) {
      const hues = patch % 2 === 0 ? DRY_GRASS : DARK_GRASS;
      const rgb = hues[Math.floor(random() * hues.length)];
      const x = random() * TEXTURE_PIXELS;
      const y = random() * TEXTURE_PIXELS;
      const radius = (size.minRadiusCells + random() * (size.maxRadiusCells - size.minRadiusCells)) * PIXELS_PER_CELL;
      for (let lobe = 0; lobe < LOBES_PER_PATCH; lobe++) {
        drawSoftOval(
          ctx,
          x + (random() - 0.5) * radius,
          y + (random() - 0.5) * radius,
          radius * (0.55 + random() * 0.45),
          1 + random() * 0.7,
          random() * Math.PI,
          rgb,
          size.alpha / 2,
        );
      }
    }
  }
}

/** Plain grass with soft color patches and a few faint tufts. */
export function createGrassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_PIXELS;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BASE_GRASS;
  ctx.fillRect(0, 0, TEXTURE_PIXELS, TEXTURE_PIXELS);
  ctx.lineCap = 'round';

  const random = seededRandom(7);
  drawColorPatches(ctx, random);

  const margin = PIXELS_PER_CELL;
  for (let cluster = 0; cluster < CLUSTER_COUNT; cluster++) {
    const clusterX = margin + random() * (TEXTURE_PIXELS - margin * 2);
    const clusterY = margin + random() * (TEXTURE_PIXELS - margin * 2);
    const tufts = 1 + Math.floor(random() * 3);
    for (let tuft = 0; tuft < tufts; tuft++) {
      const x = clusterX + (random() - 0.5) * PIXELS_PER_CELL * 0.8;
      const y = clusterY + (random() - 0.5) * PIXELS_PER_CELL * 0.8;
      const heading = random() * Math.PI * 2;
      for (let blade = -1; blade <= 1; blade++) {
        const angle = heading + blade * 0.45;
        const length = PIXELS_PER_CELL * (0.09 + random() * 0.07);
        ctx.strokeStyle = `rgba(52, 86, 44, ${0.12 + random() * 0.07})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
        ctx.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
