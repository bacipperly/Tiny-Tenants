import * as THREE from 'three';
import { LOT_MAX_CELL } from '../grid/gridMath';

const PAN_LIMIT = LOT_MAX_CELL + 8;
const GLIDE_SPEED = 5;
const GLIDE_ARRIVED_DISTANCE = 0.01;
/** How fast the start screen turns the view round the house: one full turn in about a minute and a half. */
const SHOWCASE_DEGREES_PER_SECOND = 4;
/** How far the house moves right on the start screen, as a share of the screen's width, and how wide (to tall) the screen has to be for it. */
const SHOWCASE_SHIFT = 0.17;
const SHOWCASE_MIN_ASPECT = 1.1;

/**
 * Isometric camera rig for v1. Kept behind this small interface (rotate, zoom,
 * pivot, getCameraDirXZ, getCamera) so a later perspective/free-fly camera can
 * be swapped in without touching anything that consumes it.
 */
export class IsoCameraRig {
  private camera: THREE.OrthographicCamera;
  private pivot = new THREE.Vector3(0, 0, 0);
  /** The height of the floor being looked at, which the view rises or sinks to. */
  private targetHeight = 0;
  private glideTarget: THREE.Vector3 | null = null;
  private yawIndex = 0; // 0..3, each step is a 90 degree rotation
  // Distance doesn't change an orthographic view, but ground closer than this to the viewer gets cut off.
  private readonly radius = 200;
  private readonly elevationDeg = 35.264;
  private viewSize = 10; // half-height of the orthographic frustum in world units
  private aspect = 1;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 600);
    this.updatePosition();
  }

  getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }

  /** Jumps to look at this point, at the height of the floor being looked at. */
  setPivot(p: THREE.Vector3) {
    this.glideTarget = null;
    this.pivot.set(p.x, this.pivot.y, p.z);
    this.updatePosition();
  }

  /** Rises or sinks smoothly to look at a floor of the house at this height. */
  setHeight(y: number) {
    this.targetHeight = y;
  }

  /** Moves the view smoothly over to this point. Any manual panning takes over from it. */
  glideTo(p: THREE.Vector3) {
    this.glideTarget = new THREE.Vector3(this.clampToPanLimit(p.x), this.pivot.y, this.clampToPanLimit(p.z));
  }

  /** The start screen's slow turn round the house, in degrees, on top of the usual quarter turns. */
  private spin = 0;
  private spinning = false;

  /** Turns the view slowly round and round the house, for the start screen. Stopping puts it back square. */
  setShowcase(on: boolean) {
    this.spinning = on;
    if (!on && this.spin !== 0) {
      this.spin = 0;
      this.updatePosition();
    }
    this.applyFrustum();
  }

  /** Call once a frame. */
  update(seconds: number) {
    if (this.spinning) {
      this.spin = (this.spin + SHOWCASE_DEGREES_PER_SECOND * seconds) % 360;
      this.updatePosition();
    }
    const ease = 1 - Math.exp(-GLIDE_SPEED * seconds);
    const rising = this.pivot.y !== this.targetHeight;
    if (rising) {
      this.pivot.y += (this.targetHeight - this.pivot.y) * ease;
      if (Math.abs(this.targetHeight - this.pivot.y) < GLIDE_ARRIVED_DISTANCE / 10) this.pivot.y = this.targetHeight;
    }
    const gliding = this.glideTarget !== null;
    if (this.glideTarget) {
      // Gliding goes across; rising and sinking between floors is separate, and panning doesn't stop it.
      this.glideTarget.y = this.pivot.y;
      this.pivot.lerp(this.glideTarget, ease);
      if (this.pivot.distanceTo(this.glideTarget) < GLIDE_ARRIVED_DISTANCE) {
        this.pivot.copy(this.glideTarget);
        this.glideTarget = null;
      }
    }
    if (rising || gliding) this.updatePosition();
  }

  getPivot(): THREE.Vector3 {
    return this.pivot.clone();
  }

  resize(width: number, height: number) {
    this.aspect = width / height;
    this.applyFrustum();
  }

  rotateCW() {
    this.yawIndex = (this.yawIndex + 1) % 4;
    this.updatePosition();
  }

  rotateCCW() {
    this.yawIndex = (this.yawIndex + 3) % 4;
    this.updatePosition();
  }

  zoomIn() {
    this.viewSize = Math.max(3, this.viewSize - 1.5);
    this.applyFrustum();
  }

  zoomOut() {
    this.viewSize = Math.min(30, this.viewSize + 1.5);
    this.applyFrustum();
  }

  /** Moves the view along the ground, by screen-space amounts: positive right and positive up, away from the camera. */
  pan(right: number, up: number) {
    this.glideTarget = null;
    const theta = THREE.MathUtils.degToRad(45 + this.yawIndex * 90);
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    this.pivot.x = this.clampToPanLimit(this.pivot.x + right * cos - up * sin);
    this.pivot.z = this.clampToPanLimit(this.pivot.z - right * sin - up * cos);
    this.updatePosition();
  }

  /** Drags the ground along with the cursor, so a pixel moved on screen is the same distance on the ground. */
  panByPixels(dx: number, dy: number, screenHeight: number) {
    const worldPerPixel = (this.viewSize * 2) / screenHeight;
    const groundForeshortening = Math.sin(THREE.MathUtils.degToRad(this.elevationDeg));
    this.pan(-dx * worldPerPixel, (dy * worldPerPixel) / groundForeshortening);
  }

  /** How far the view moves per second with the movement keys, which stays comfortable at any zoom. */
  get keyPanSpeed(): number {
    return this.viewSize * 1.2;
  }

  private clampToPanLimit(value: number): number {
    const limit = PAN_LIMIT;
    return Math.min(limit, Math.max(-limit, value));
  }

  /** Normalized horizontal (XZ) direction from the pivot toward the camera.
   * Used to decide which walls face the camera and should be hidden. */
  getCameraDirXZ(): THREE.Vector2 {
    const theta = THREE.MathUtils.degToRad(45 + this.yawIndex * 90 + this.spin);
    return new THREE.Vector2(Math.sin(theta), Math.cos(theta));
  }

  private updatePosition() {
    const theta = THREE.MathUtils.degToRad(45 + this.yawIndex * 90 + this.spin);
    const elevation = THREE.MathUtils.degToRad(this.elevationDeg);
    const horizontal = this.radius * Math.cos(elevation);
    const vertical = this.radius * Math.sin(elevation);
    const x = this.pivot.x + horizontal * Math.sin(theta);
    const z = this.pivot.z + horizontal * Math.cos(theta);
    const y = this.pivot.y + vertical;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.pivot);
  }

  private applyFrustum() {
    const halfHeight = this.viewSize;
    const halfWidth = halfHeight * this.aspect;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    // On the start screen, the house slides right, out from behind the card on the left, on a screen wide enough to have room.
    const shift = this.spinning && this.aspect > SHOWCASE_MIN_ASPECT ? SHOWCASE_SHIFT : 0;
    if (shift) this.camera.setViewOffset(1000, 1000, -shift * 1000, 0, 1000, 1000);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
}
