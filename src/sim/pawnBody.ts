import * as THREE from 'three';
import type { Activity } from '../build/furnitureCatalog';
import type { Gesture } from './personality';

/**
 * A tenant's body: a soft gummy bean with no neck, little mitten arms and
 * stubby legs, a dot-eyed face whose mouth shows how it feels, and springs
 * on everything. Nothing snaps into place: each part chases where it's meant
 * to be, overshoots and wobbles back, so a tenant lurches when it sets off,
 * wobbles when it stops, waddles, flails, and flops when it's thrown.
 *
 * It only moves its own parts. Where the tenant is, which way it faces and
 * whether it's sitting or lying are the pawn's, on the groups this sits in.
 */

/** How a tenant is holding itself, for its arms and legs. */
export type BodyPose = 'stand' | 'sit' | 'lie' | 'swim' | 'tread' | 'dive' | 'carried' | 'flying' | 'flopped' | 'getup' | 'lifting' | 'grapple';

/** What the face shows. */
export type Expression = 'smile' | 'grin' | 'flat' | 'frown' | 'oh' | 'blush';

/** What the pawn is doing this frame, which is all the body needs to know to move. */
export interface BodyDrive {
  /** How fast it's going across the ground, in world units a second. */
  speed: number;
  /** Speeding up (positive) or slowing down along the way it faces, in world units a second squared. */
  forwardAccel: number;
  /** Swinging round a corner: to its right is positive. */
  sideAccel: number;
  pose: BodyPose;
  activity: Activity | null;
  gesture: Gesture | null;
  /** How far through the gesture it is, from 0 to 1. */
  gestureProgress: number;
  eating: boolean;
  /** Something in its hands, like a plate or a bag of trash. */
  holding: boolean;
  /** How shut its eyes are, from 0 (wide open) to 1 (asleep). */
  eyesShut: number;
  expression: Expression;
}

/** Feet to hips: how long the legs are. */
const HIP_HEIGHT = 0.2;
/** How far each leg is from the middle. */
const HIP_SPREAD = 0.085;
const LEG_RADIUS = 0.062;
/** The bean, from just below the hips to the top of its head. */
const BEAN_BOTTOM = -0.08;
const BEAN_HEIGHT = 0.78;
/** Widest at the bottom, a little narrower at the top, like a bean standing on end. */
const BEAN_WIDTH_BOTTOM = 0.225;
const BEAN_WIDTH_TOP = 0.19;
const SHOULDER_HEIGHT = 0.37;
const ARM_RADIUS = 0.058;
const ARM_LENGTH = 0.17;
/** Arms hang out from the sides a little rather than straight down. */
const ARM_REST_OUT = 0.42;
/** How far it goes for one step of the waddle. Short legs take lots of little steps. */
const STEP_LENGTH = 0.36;
const FACE_HEIGHT = 0.48;
const MOUTH_HEIGHT = 0.36;
const CHEEK_HEIGHT = 0.39;
const EYE_SPREAD = 0.07;
const CHEEK_SPREAD = 0.12;
const EYE_COLOR = 0x2b2b2b;
const CHEEK_COLOR = 0xff8fa3;
/** How often it trips over nothing while walking, on average, per second. */
const STUMBLE_CHANCE = 0.015;
const STUMBLE_SECONDS = 0.7;

/** A damped spring chasing a target: it overshoots and wobbles back, more so the lower `damping` is. */
class Spring {
  value: number;
  velocity = 0;

  constructor(value = 0) {
    this.value = value;
  }

  step(target: number, seconds: number, stiffness: number, damping: number) {
    const friction = 2 * damping * Math.sqrt(stiffness);
    // In small steps, so a stiff spring on a slow frame doesn't fly apart.
    const steps = Math.ceil(seconds / (1 / 120));
    const dt = seconds / Math.max(1, steps);
    for (let i = 0; i < steps; i++) {
      this.velocity += (stiffness * (target - this.value) - friction * this.velocity) * dt;
      this.value += this.velocity * dt;
    }
    return this.value;
  }

  /** A shove, like a foot hitting the ground. */
  kick(velocity: number) {
    this.velocity += velocity;
  }
}

/** How stiff and how bouncy each kind of part is. Arms are the floppiest. */
const SPRINGS = {
  arm: { stiffness: 110, damping: 0.32 },
  leg: { stiffness: 320, damping: 0.55 },
  lean: { stiffness: 130, damping: 0.28 },
  squash: { stiffness: 260, damping: 0.22 },
  /** Thrown and knocked flat: everything goes limp and droops. */
  limp: { stiffness: 22, damping: 0.5 },
};

/** The bean's outline from bottom to top, turned on a lathe: how wide it is at a height `h` up it. */
function beanRadius(h: number): number {
  const t = Math.asin(Math.max(-1, Math.min(1, (h - BEAN_HEIGHT / 2) / (BEAN_HEIGHT / 2))));
  const width = BEAN_WIDTH_BOTTOM + ((BEAN_WIDTH_TOP - BEAN_WIDTH_BOTTOM) * (Math.sin(t) + 1)) / 2;
  return width * Math.pow(Math.max(0, Math.cos(t)), 0.75);
}

function beanGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];
  const rows = 22;
  for (let i = 0; i <= rows; i++) {
    const h = (BEAN_HEIGHT * (1 - Math.cos((i / rows) * Math.PI))) / 2;
    points.push(new THREE.Vector2(i === 0 || i === rows ? 0 : beanRadius(h), h));
  }
  const geometry = new THREE.LatheGeometry(points, 28);
  geometry.computeVertexNormals();
  return geometry;
}

/** Made once, shared by every tenant. */
let shared: {
  bean: THREE.BufferGeometry;
  arm: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
  cheek: THREE.BufferGeometry;
  mouths: Record<Exclude<Expression, 'blush'>, THREE.BufferGeometry>;
  dark: THREE.MeshStandardMaterial;
} | null = null;

function sharedParts() {
  if (shared) return shared;
  const arm = new THREE.CapsuleGeometry(ARM_RADIUS, ARM_LENGTH, 6, 12);
  arm.translate(0, -(ARM_LENGTH / 2 + ARM_RADIUS) + ARM_RADIUS * 0.6, 0);
  const legLength = HIP_HEIGHT - LEG_RADIUS * 2;
  const leg = new THREE.CapsuleGeometry(LEG_RADIUS, legLength, 6, 12);
  leg.translate(0, -(legLength / 2 + LEG_RADIUS), 0);
  const smile = new THREE.TorusGeometry(0.034, 0.0085, 6, 14, Math.PI);
  smile.rotateZ(Math.PI);
  const frown = new THREE.TorusGeometry(0.03, 0.0085, 6, 14, Math.PI);
  frown.translate(0, -0.022, 0);
  const flat = new THREE.CapsuleGeometry(0.0085, 0.04, 4, 8);
  flat.rotateZ(Math.PI / 2);
  const oh = new THREE.TorusGeometry(0.017, 0.0085, 6, 14);
  // An open grin: the bottom half of a disc.
  const grin = new THREE.CircleGeometry(0.045, 16, Math.PI, Math.PI);
  shared = {
    bean: beanGeometry(),
    arm,
    leg,
    eye: new THREE.SphereGeometry(0.026, 12, 8),
    cheek: new THREE.CircleGeometry(0.03, 16),
    mouths: { smile, frown, flat, oh, grin },
    dark: new THREE.MeshStandardMaterial({ color: EYE_COLOR, roughness: 0.5 }),
  };
  return shared;
}

/** A point on the front of the bean, at height `y` above the hips and `x` to the side, a hair proud of the surface. */
function onFace(x: number, y: number): THREE.Vector3 {
  const r = beanRadius(y - BEAN_BOTTOM);
  return new THREE.Vector3(x, y, Math.sqrt(Math.max(0, r * r - x * x)) + 0.004);
}

/** Where a part of a limb is aimed: its swing forward (x) and out to the side (z), in radians. */
interface LimbAim {
  x: number;
  z: number;
}

export class PawnBody {
  readonly group = new THREE.Group();
  /** The solid bean, for clicks to land on. */
  readonly bean: THREE.Mesh;
  /** The hips up: everything but the legs, so it can lean, squash and wobble on them. */
  private belly = new THREE.Group();
  private arms: THREE.Group[] = [];
  private legs: THREE.Group[] = [];
  private eyes: THREE.Mesh[] = [];
  private mouth: THREE.Mesh;
  private cheeks: THREE.Mesh[] = [];
  private cheekMaterial = new THREE.MeshBasicMaterial({ color: CHEEK_COLOR, transparent: true, opacity: 0, depthWrite: false });

  private armSprings = [0, 1].map(() => ({ x: new Spring(), z: new Spring(ARM_REST_OUT) }));
  private legSprings = [0, 1].map(() => ({ x: new Spring(), z: new Spring() }));
  private leanForward = new Spring();
  private leanSide = new Spring();
  private squash = new Spring(1);
  private twist = new Spring();
  /** Where the legs are in their stepping, in radians: one step each half turn. */
  private stride = 0;
  private clock = Math.random() * 100;
  private blinkIn = 2 + Math.random() * 4;
  private blink = 0;
  private stumble = 0;
  private lastPose: BodyPose = 'stand';

  constructor(material: THREE.Material) {
    const parts = sharedParts();
    this.belly.position.y = HIP_HEIGHT;
    this.group.add(this.belly);

    this.bean = new THREE.Mesh(parts.bean, material);
    this.bean.position.y = BEAN_BOTTOM;
    this.belly.add(this.bean);

    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * (beanRadius(SHOULDER_HEIGHT - BEAN_BOTTOM) - ARM_RADIUS * 0.2), SHOULDER_HEIGHT, 0);
      shoulder.rotation.order = 'XZY';
      shoulder.add(new THREE.Mesh(parts.arm, material));
      this.belly.add(shoulder);
      this.arms.push(shoulder);

      const hip = new THREE.Group();
      hip.position.set(side * HIP_SPREAD, HIP_HEIGHT, 0);
      hip.rotation.order = 'XZY';
      hip.add(new THREE.Mesh(parts.leg, material));
      this.group.add(hip);
      this.legs.push(hip);

      const eye = new THREE.Mesh(parts.eye, parts.dark);
      eye.position.copy(onFace(side * EYE_SPREAD, FACE_HEIGHT));
      this.belly.add(eye);
      this.eyes.push(eye);

      const cheek = new THREE.Mesh(parts.cheek, this.cheekMaterial);
      const at = onFace(side * CHEEK_SPREAD, CHEEK_HEIGHT);
      cheek.position.copy(at);
      cheek.rotation.y = Math.atan2(at.x, at.z);
      this.belly.add(cheek);
      this.cheeks.push(cheek);
    }
    this.mouth = new THREE.Mesh(parts.mouths.smile, parts.dark);
    this.mouth.position.copy(onFace(0, MOUTH_HEIGHT));
    this.belly.add(this.mouth);
  }

  /** Something hit it, like landing from a throw: a big squash, and everything jolts. */
  thump(strength = 1) {
    this.squash.kick(-3.2 * strength);
    for (const arm of this.armSprings) arm.z.kick(9 * strength);
    for (const leg of this.legSprings) leg.z.kick((Math.random() - 0.5) * 6 * strength);
  }

  /** Trips or staggers: arms flailing and lurching forward for a moment. */
  stagger() {
    this.stumble = STUMBLE_SECONDS;
  }

  update(seconds: number, drive: BodyDrive) {
    if (seconds <= 0) return;
    this.clock += seconds;
    const time = this.clock;
    const pose = drive.pose;
    if (pose !== this.lastPose) {
      // Changing how it holds itself gives it a little jolt, so sitting down or getting up has some give.
      this.squash.kick(pose === 'stand' ? 1.2 : -1.2);
      this.lastPose = pose;
    }

    const walking = pose === 'stand' && drive.speed > 0.15;
    const pace = Math.min(1.2, drive.speed / 2);
    if (walking) {
      const before = Math.sin(this.stride);
      this.stride += (drive.speed / STEP_LENGTH) * Math.PI * seconds;
      // Each footfall squashes it a little.
      if (Math.sign(Math.sin(this.stride)) !== Math.sign(before)) this.squash.kick(-0.9 * pace);
      if (this.stumble <= 0 && Math.random() < STUMBLE_CHANCE * seconds) this.stumble = STUMBLE_SECONDS;
    } else {
      // Feet come back together.
      this.stride += (Math.round(this.stride / Math.PI) * Math.PI - this.stride) * Math.min(1, 10 * seconds);
    }
    if (this.stumble > 0) this.stumble -= seconds;
    const stumbling = this.stumble > 0 ? Math.sin(((STUMBLE_SECONDS - this.stumble) / STUMBLE_SECONDS) * Math.PI) : 0;

    const aims = this.aim(pose, drive, time, walking, pace, stumbling);
    const limp = pose === 'flopped' || pose === 'flying';
    const armSpring = limp ? SPRINGS.limp : SPRINGS.arm;
    const legSpring = limp ? SPRINGS.limp : SPRINGS.leg;
    this.arms.forEach((arm, i) => {
      const spring = this.armSprings[i];
      arm.rotation.x = spring.x.step(aims.arms[i].x, seconds, armSpring.stiffness, armSpring.damping);
      arm.rotation.z = (i === 0 ? -1 : 1) * spring.z.step(aims.arms[i].z, seconds, armSpring.stiffness, armSpring.damping);
    });
    this.legs.forEach((leg, i) => {
      const spring = this.legSprings[i];
      leg.rotation.x = spring.x.step(aims.legs[i].x, seconds, legSpring.stiffness, legSpring.damping);
      leg.rotation.z = (i === 0 ? -1 : 1) * spring.z.step(aims.legs[i].z, seconds, legSpring.stiffness, legSpring.damping);
    });

    // The body leans into a start and rocks back on a stop, swings out round corners, and rolls from foot to foot.
    const roll = walking ? Math.sin(this.stride) * 0.09 * pace : 0;
    const leanForwardTarget = aims.lean + THREE.MathUtils.clamp(-drive.forwardAccel * 0.035, -0.35, 0.35) + stumbling * 0.45;
    const leanSideTarget = roll + THREE.MathUtils.clamp(drive.sideAccel * 0.025, -0.3, 0.3);
    this.belly.rotation.x = this.leanForward.step(leanForwardTarget, seconds, SPRINGS.lean.stiffness, SPRINGS.lean.damping);
    this.belly.rotation.z = this.leanSide.step(leanSideTarget, seconds, SPRINGS.lean.stiffness, SPRINGS.lean.damping);
    this.belly.rotation.y = this.twist.step(aims.twist, seconds, SPRINGS.lean.stiffness, SPRINGS.lean.damping);

    // Breathing, a bob as it walks, and the squash from landings and footfalls, keeping its volume.
    const breath = Math.sin(time * 2.2) * 0.022;
    const squash = this.squash.step(1 + breath + aims.squash, seconds, SPRINGS.squash.stiffness, SPRINGS.squash.damping);
    const s = THREE.MathUtils.clamp(squash, 0.6, 1.4);
    this.belly.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    this.belly.position.y = HIP_HEIGHT + (walking ? Math.abs(Math.cos(this.stride)) * 0.03 * pace : 0) + aims.lift;

    this.updateFace(seconds, drive, pose);
  }

  /** Where every part wants to be right now, before the springs get it there. */
  private aim(pose: BodyPose, drive: BodyDrive, time: number, walking: boolean, pace: number, stumbling: number) {
    const arms: LimbAim[] = [
      { x: 0, z: ARM_REST_OUT },
      { x: 0, z: ARM_REST_OUT },
    ];
    const legs: LimbAim[] = [
      { x: 0, z: 0 },
      { x: 0, z: 0 },
    ];
    let lean = 0;
    let twist = 0;
    let squash = 0;
    let lift = 0;
    const both = (x: number, z = ARM_REST_OUT) => {
      for (const arm of arms) {
        arm.x = x;
        arm.z = z;
      }
    };
    const wave = (speed: number, phase = 0) => Math.sin(time * speed + phase);
    const beat = (speed: number) => Math.abs(Math.sin(time * speed));

    switch (pose) {
      case 'sit':
        legs[0].x = legs[1].x = -1.45;
        legs[0].z = legs[1].z = 0.12;
        both(-0.35, 0.25);
        break;
      case 'lie':
        // Flat on its back, arms and legs loose.
        both(-0.15, 0.45 + wave(0.6) * 0.04);
        legs[0].z = legs[1].z = 0.12;
        break;
      case 'swim':
        // Big alternating strokes, legs fluttering.
        arms[0].x = -1.6 + wave(5) * 1.4;
        arms[1].x = -1.6 + wave(5, Math.PI) * 1.4;
        arms[0].z = arms[1].z = 0.3;
        legs[0].x = wave(11) * 0.45;
        legs[1].x = wave(11, Math.PI) * 0.45;
        break;
      case 'tread':
        both(-0.5 + wave(5) * 0.35, 1 + wave(5) * 0.3);
        legs[0].x = wave(6) * 0.5;
        legs[1].x = wave(6, Math.PI) * 0.5;
        break;
      case 'dive':
        both(-2.95, 0.1);
        legs[0].z = legs[1].z = 0.05;
        break;
      case 'carried':
        // Up in the air, arms and legs going everywhere.
        arms[0].x = -2 + wave(13) * 0.7;
        arms[1].x = -2 + wave(13, 2) * 0.7;
        arms[0].z = arms[1].z = 0.6 + wave(9) * 0.3;
        legs[0].x = wave(15) * 0.8;
        legs[1].x = wave(15, Math.PI) * 0.8;
        break;
      case 'flying':
        // Spread out like a starfish.
        both(-0.4 + wave(7) * 0.3, 1.5);
        legs[0].z = legs[1].z = 0.55;
        legs[0].x = wave(8) * 0.3;
        legs[1].x = wave(8, 1.5) * 0.3;
        break;
      case 'flopped':
        both(-0.1, 1.25);
        legs[0].z = legs[1].z = 0.3;
        break;
      case 'getup':
        // Pushing itself up off the floor, a bit wobbly.
        both(-0.9 + wave(9) * 0.2, 0.5);
        legs[0].x = legs[1].x = -0.4;
        break;
      case 'grapple':
        // Arms out at someone, legs braced, leaning in: a push, a grapple or a hug.
        both(-1.45 + wave(7) * 0.12, 0.12 + wave(5) * 0.08);
        legs[0].z = legs[1].z = 0.22;
        legs[0].x = 0.25;
        legs[1].x = -0.3;
        lean = 0.25;
        break;
      case 'lifting':
        // Hoisting someone overhead.
        both(-2.7 + wave(6) * 0.08, 0.35);
        legs[0].z = legs[1].z = 0.18;
        squash = -0.08;
        break;
      case 'stand':
        if (walking) {
          const step = Math.sin(this.stride) * 0.6 * pace;
          legs[0].x = step;
          legs[1].x = -step;
          // Arms swing opposite the legs, loosely, and further the faster it goes.
          arms[0].x = -step * 0.9;
          arms[1].x = step * 0.9;
          arms[0].z = arms[1].z = ARM_REST_OUT + 0.08 * pace;
          lean = 0.06 * pace;
        } else {
          // Arms hang and sway a little, out of time with each other.
          arms[0].x = wave(0.9) * 0.05;
          arms[1].x = wave(1.1, 1) * 0.05;
        }
        if (drive.holding) both(-1.15, 0.12);
        if (drive.activity) this.aimActivity(drive.activity, time, arms, legs, beat);
        if (drive.eating) {
          // A bite now and then: one arm up to the mouth.
          arms[1].x = -1.6 - Math.max(0, wave(2.5)) * 0.6;
          arms[1].z = 0.05;
        }
        break;
    }
    if (pose === 'sit' && drive.activity) this.aimActivity(drive.activity, time, arms, legs, beat, true);
    if (pose === 'sit' && drive.eating) {
      arms[1].x = -1.6 - Math.max(0, wave(2.5)) * 0.6;
      arms[1].z = 0.05;
    }

    if (drive.gesture) {
      const p = drive.gestureProgress;
      const swell = Math.sin(p * Math.PI);
      switch (drive.gesture) {
        case 'hop': {
          // Crouch, spring up with arms flung up, and land with a squash.
          const air = Math.abs(Math.sin(p * Math.PI * 3));
          both(-2.4 * air * swell, 0.4);
          legs[0].x = legs[1].x = -0.5 * air;
          squash = (air - 0.5) * 0.25 * swell;
          break;
        }
        case 'spin':
          both(-0.2, 1.45 * swell);
          twist = wave(30) * 0.05;
          break;
        case 'wiggle':
          arms[0].z = 0.6 + wave(18) * 0.5 * swell;
          arms[1].z = 0.6 - wave(18) * 0.5 * swell;
          arms[0].x = arms[1].x = -0.4;
          twist = wave(14) * 0.35 * swell;
          break;
        case 'wave':
          // One arm up, flapping hello.
          arms[1].x = -2.6 * Math.min(1, swell * 2);
          arms[1].z = 0.6 + wave(16) * 0.45;
          break;
        case 'bow':
          both(0.3 * swell, 0.15);
          lean = 0.5 * swell;
          break;
        case 'slump':
          both(0.15, 0.04);
          lean = 0.25 * swell;
          squash = -0.1 * swell;
          break;
        case 'stomp': {
          const up = Math.max(0, Math.sin(p * Math.PI * 8));
          legs[0].x = -0.9 * up;
          both(0.2, 0.55 + up * 0.2);
          if (up < 0.1) squash = -0.08;
          break;
        }
      }
    }
    if (stumbling > 0) {
      // Arms flailing to catch itself.
      arms[0].x = -1.4 + Math.sin(time * 14) * 1.2;
      arms[1].x = -1.4 + Math.sin(time * 14 + Math.PI) * 1.2;
      arms[0].z = arms[1].z = 0.9 * stumbling + ARM_REST_OUT;
    }
    return { arms, legs, lean, twist, squash, lift };
  }

  /** The arms' part in what it's doing at a piece: stirring, chopping, mopping, typing and the rest. */
  private aimActivity(activity: Activity, time: number, arms: LimbAim[], legs: LimbAim[], beat: (speed: number) => number, seated = false) {
    const wave = (speed: number, phase = 0) => Math.sin(time * speed + phase);
    const set = (i: number, x: number, z: number) => {
      arms[i].x = x;
      arms[i].z = z;
    };
    switch (activity) {
      case 'admire':
        set(0, 0.25, 0.12);
        set(1, 0.25, 0.12);
        break;
      case 'peer':
        set(1, -1.3 + Math.max(0, wave(1.8)) ** 8 * 0.4, 0.1);
        break;
      case 'warm':
        // Hands out to the fire, rubbing them together.
        set(0, -1.25, 0.02 + wave(16) * 0.06);
        set(1, -1.25, 0.02 - wave(16) * 0.06);
        break;
      case 'scrub':
        set(0, -1.1 + wave(10) * 0.3, 0.1);
        set(1, -1.1 - wave(10) * 0.3, 0.1);
        break;
      case 'stir':
        set(1, -1.15 + Math.cos(time * 4) * 0.2, 0.15 + Math.sin(time * 4) * 0.2);
        set(0, -0.7, 0.15);
        break;
      case 'chop':
        set(1, -1.5 + beat(11) * 0.7, 0.08);
        set(0, -0.9, 0.12);
        break;
      case 'rummage':
        set(0, -1.2 + wave(3) * 0.35, 0.15);
        set(1, -1.2 - wave(3) * 0.35, 0.15);
        break;
      case 'type':
        set(0, -1.25 + wave(22) * 0.08, 0.06);
        set(1, -1.25 + wave(22, 1.7) * 0.08, 0.06);
        break;
      case 'ponder':
        // A mitten under its chin.
        set(1, -2.3, -0.25);
        set(0, -0.6, 0.15);
        break;
      case 'play':
        set(0, -0.9 + wave(5.2) * 0.4, 0.4);
        set(1, -0.9 - wave(5.2) * 0.4, 0.4);
        break;
      case 'watch':
        set(0, -0.2, 0.18);
        set(1, -0.2, 0.18);
        break;
      case 'browse':
        set(1, -1.3 + wave(0.6) * 0.3, 0.1 + wave(0.6) * 0.3);
        break;
      case 'primp':
        set(1, -2.5, -0.1);
        set(0, -0.3, 0.2);
        break;
      case 'shoot':
        set(0, -1.3 + Math.max(0, wave(1.6)) ** 10 * 0.5, 0.0);
        set(1, -1.1 + Math.max(0, wave(1.6)) ** 10 * 0.5, 0.05);
        break;
      case 'garden':
        set(0, -0.7 + beat(3.2) * 0.5, 0.15);
        set(1, -0.7 + beat(3.2 + 0.4) * 0.5, 0.15);
        break;
      case 'mop':
        set(0, -0.95, 0.05 + wave(5) * 0.4);
        set(1, -0.8, 0.05 + wave(5) * 0.4);
        break;
      case 'pickup':
        set(0, -0.6, 0.12);
        set(1, -0.6, 0.12);
        break;
    }
    if (!seated && activity === 'garden') legs[0].x = legs[1].x = -0.2;
  }

  /** Blinks now and then, shuts its eyes to slits asleep, and wears its mood. */
  private updateFace(seconds: number, drive: BodyDrive, pose: BodyPose) {
    this.blinkIn -= seconds;
    if (this.blinkIn <= 0) {
      this.blink = 0.15;
      this.blinkIn = 2 + Math.random() * 5;
    }
    this.blink = Math.max(0, this.blink - seconds);
    const shut = Math.max(drive.eyesShut, this.blink > 0 ? 1 : 0);
    // Knocked flat: eyes squeezed into little crosses would need more parts, so they're squashed shut and wide.
    const dazed = pose === 'flopped';
    for (const eye of this.eyes) eye.scale.set(1 + 0.5 * shut + (dazed ? 0.4 : 0), 1 - 0.85 * (dazed ? 0.9 : shut), 1 - 0.3 * shut);

    const surprised = pose === 'flying' || pose === 'carried';
    const expression: Expression = surprised ? 'oh' : dazed ? 'flat' : drive.eyesShut > 0.5 ? 'flat' : drive.expression;
    const parts = sharedParts();
    this.mouth.geometry = expression === 'blush' ? parts.mouths.oh : parts.mouths[expression];
    this.mouth.scale.setScalar(expression === 'blush' ? 0.7 : 1);
    const rosy = expression === 'blush' ? 0.75 : expression === 'grin' || expression === 'smile' ? 0.3 : 0;
    this.cheekMaterial.opacity += (rosy - this.cheekMaterial.opacity) * Math.min(1, 3 * seconds);
  }
}
