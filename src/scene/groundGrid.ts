import * as THREE from 'three';
import { LOT_MAX_CELL, LOT_MIN_CELL } from '../grid/gridMath';
import { skipPools } from '../build/poolBuilder';

const REVEAL_RADIUS = 5;
const FADE_SPEED = 5;
const FOLLOW_SPEED = 14;

const vertexShader = /* glsl */ `
  varying vec2 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec2 uCursor;
  uniform float uStrength;
  uniform float uRadius;
  uniform float uLotMin;
  uniform float uLotMax;
  varying vec2 vWorld;

  void main() {
    if (min(vWorld.x, vWorld.y) < uLotMin || max(vWorld.x, vWorld.y) > uLotMax) discard;

    float reveal = 1.0 - smoothstep(uRadius * 0.15, uRadius, distance(vWorld, uCursor));

    // Cell edges sit on .5 values, so shifting by .5 puts every grid line on a whole number.
    vec2 cell = vWorld + 0.5;
    vec2 toLine = abs(fract(cell - 0.5) - 0.5);
    vec2 pixel = fwidth(cell);

    // Lines get softer as they near the edge of the revealed area, so they blur in rather than just fade.
    float blur = (1.0 - reveal) * 0.14;
    vec2 line = 1.0 - smoothstep(pixel * 0.6, pixel * 1.4 + blur, toLine);
    float alpha = max(line.x, line.y) * reveal * uStrength * 0.1;

    if (alpha < 0.003) discard;
    gl_FragColor = vec4(0.11, 0.33, 0.16, alpha);
  }
`;

/** A grid that stays hidden until the cursor is over the ground, then dissolves in around it. */
export class GroundGrid {
  readonly mesh: THREE.Mesh;
  private target = new THREE.Vector2();
  private targetStrength = 0;
  private cursor = new THREE.Vector2();
  private strength = 0;
  private uniforms = {
    uCursor: { value: this.cursor },
    uStrength: { value: 0 },
    uRadius: { value: REVEAL_RADIUS },
    uLotMin: { value: LOT_MIN_CELL - 0.5 },
    uLotMax: { value: LOT_MAX_CELL + 0.5 },
  };

  constructor() {
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    });
    skipPools(material);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = -0.005;
  }

  /** Pass null when the cursor leaves the scene. */
  setCursor(point: THREE.Vector3 | null) {
    this.targetStrength = point ? 1 : 0;
    if (!point) return;
    this.target.set(point.x, point.z);
    // Appearing from nothing should start at the cursor, not slide over from where it last was.
    if (this.strength < 0.01) this.cursor.copy(this.target);
  }

  update(seconds: number) {
    this.strength += (this.targetStrength - this.strength) * (1 - Math.exp(-seconds * FADE_SPEED));
    this.cursor.lerp(this.target, 1 - Math.exp(-seconds * FOLLOW_SPEED));
    this.uniforms.uStrength.value = this.strength;
  }
}
