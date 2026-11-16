import * as THREE from 'three';

/** A thought is private and a speech bubble is said out loud, the same way comics draw them. */
export type BubbleStyle = 'thought' | 'speech';

const TEXTURE_PIXELS = 128;
const BUBBLE_SIZE = 0.85;
const POP_SECONDS = 0.18;
const FADE_SECONDS = 0.3;

const textures = new Map<string, THREE.CanvasTexture>();

/** A cloud with two small puffs trailing down toward the pawn's head. */
function drawThoughtShape(ctx: CanvasRenderingContext2D) {
  for (const [x, y, radiusX, radiusY] of [[64, 52, 54, 44], [46, 106, 9, 8], [34, 120, 5, 5]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** A rounded box with a pointed tail aimed at the pawn's head, drawn as one outline so the tail joins the box. */
function drawSpeechShape(ctx: CanvasRenderingContext2D) {
  const [left, right, top, bottom, corner] = [8, 120, 8, 94, 28];
  ctx.beginPath();
  ctx.moveTo(left + corner, top);
  ctx.arcTo(right, top, right, bottom, corner);
  ctx.arcTo(right, bottom, left, bottom, corner);
  ctx.lineTo(70, bottom);
  ctx.lineTo(36, 124);
  ctx.lineTo(44, bottom);
  ctx.arcTo(left, bottom, left, top, corner);
  ctx.arcTo(left, top, right, top, corner);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function textureFor(emoji: string, style: BubbleStyle): THREE.CanvasTexture {
  const key = `${style} ${emoji}`;
  const existing = textures.get(key);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_PIXELS;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(91, 74, 48, 0.35)';
  ctx.lineWidth = 3;
  if (style === 'speech') drawSpeechShape(ctx);
  else drawThoughtShape(ctx);
  ctx.font = '56px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000';
  ctx.fillText(emoji, 64, 56);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, texture);
  return texture;
}

/** An emoji floating over a pawn's head. It pops in, stays for a moment, then fades away. */
export class Bubble {
  readonly group = new THREE.Group();
  private material = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false });
  private sprite = new THREE.Sprite(this.material);
  private age = 0;
  private lifetime = 0;

  constructor() {
    this.sprite.renderOrder = 11;
    this.sprite.visible = false;
    this.group.add(this.sprite);
  }

  show(emoji: string, seconds: number, style: BubbleStyle) {
    this.material.map = textureFor(emoji, style);
    this.material.needsUpdate = true;
    this.age = 0;
    this.lifetime = seconds;
    this.sprite.visible = true;
    this.update(0);
  }

  update(seconds: number) {
    if (!this.sprite.visible) return;
    this.age += seconds;
    if (this.age >= this.lifetime) {
      this.sprite.visible = false;
      return;
    }
    const pop = Math.min(1, this.age / POP_SECONDS);
    // Overshoots slightly before settling, so it feels like it pops rather than grows.
    const size = BUBBLE_SIZE * (pop + Math.sin(pop * Math.PI) * 0.15);
    this.sprite.scale.set(size, size, 1);
    this.material.opacity = Math.min(1, (this.lifetime - this.age) / FADE_SECONDS);
  }
}
