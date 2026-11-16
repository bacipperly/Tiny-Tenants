import * as THREE from 'three';

const PLATE_RADIUS = 0.14;
const PLATE_THICKNESS = 0.02;
const FOOD_SIZE = 0.24;
const TEXTURE_PIXELS = 64;

const foodTextures = new Map<string, THREE.CanvasTexture>();

export function emojiTexture(emoji: string): THREE.CanvasTexture {
  const existing = foodTextures.get(emoji);
  if (existing) return existing;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_PIXELS;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.font = '50px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, TEXTURE_PIXELS / 2, TEXTURE_PIXELS / 2 + 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  foodTextures.set(emoji, texture);
  return texture;
}

/** A plate with some food on it, drawn as the food's emoji so you can tell what's for dinner. Its underside is at the group's origin. */
export class Plate {
  readonly group = new THREE.Group();
  readonly food: string;
  private dish = new THREE.MeshStandardMaterial({ color: 0xffffff });
  private spriteMaterial: THREE.SpriteMaterial;
  private sprite: THREE.Sprite;

  constructor(food: string) {
    this.food = food;
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS * 0.8, PLATE_THICKNESS, 20), this.dish);
    dish.position.y = PLATE_THICKNESS / 2;
    this.spriteMaterial = new THREE.SpriteMaterial({ map: emojiTexture(food), transparent: true });
    this.sprite = new THREE.Sprite(this.spriteMaterial);
    this.group.add(dish, this.sprite);
    this.setFoodLeft(1);
  }

  /** From 1 for a full plate down to 0 for a clean one. */
  setFoodLeft(fraction: number) {
    const size = FOOD_SIZE * fraction;
    this.sprite.scale.set(size, size, 1);
    this.sprite.position.y = PLATE_THICKNESS + size / 2;
    this.sprite.visible = fraction > 0;
  }

  /** Matches the room's light, so a plate doesn't glow in a dark room. */
  setBrightness(brightness: number) {
    this.dish.color.setScalar(brightness);
    this.spriteMaterial.color.setScalar(brightness);
  }

  dispose() {
    this.dish.dispose();
    this.spriteMaterial.dispose();
    for (const child of this.group.children) if (child instanceof THREE.Mesh) child.geometry.dispose();
  }
}
