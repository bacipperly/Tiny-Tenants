import * as THREE from 'three';

/** One pawn's route ahead, for drawing: where it is now first, then each square it'll walk through, in the world. */
export interface Route {
  color: string;
  points: THREE.Vector3[];
  /** The pawn picked in the household, whose route is drawn a little bolder. */
  selected: boolean;
}

/** How far apart the dots along a route are, and how fast they flow along it toward where the pawn's going, both in squares. */
const DOT_SPACING = 0.26;
const DOT_SPEED = 0.8;
const DOT_RADIUS = 0.065;
/** Dots this close to the pawn are left out, since they'd be under its feet. */
const CLEAR_OF_PAWN = 0.3;
/** Just above the floor, so the dots never flicker against it. */
const LIFT = 0.04;
const MAX_DOTS = 3000;
const MAX_RINGS = 64;
const SELECTED_SCALE = 1.35;

const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const WHITE = new THREE.Color(0xffffff);

/** A material drawn over everything, so a route shows through walls and furniture, like a map laid on top of the house. */
function overlayMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthTest: false, depthWrite: false });
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, order: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  mesh.count = 0;
  // Colors set up front, so the material is built knowing each dot has its own.
  for (let i = 0; i < count; i++) mesh.setColorAt(i, WHITE);
  return mesh;
}

/**
 * The paths view: every walking pawn's route ahead as a trail of dots in the
 * pawn's own color, flowing from it toward where it's going, with a ring
 * where the route ends. A pale halo under each dot keeps a dark pawn's trail
 * readable on grass.
 */
export class PathOverlay {
  readonly group = new THREE.Group();
  private dots = instanced(new THREE.CircleGeometry(DOT_RADIUS, 12), overlayMaterial(0.95), MAX_DOTS, 1001);
  private halos = instanced(new THREE.CircleGeometry(DOT_RADIUS * 1.55, 12), overlayMaterial(0.55), MAX_DOTS, 1000);
  private rings = instanced(new THREE.RingGeometry(0.2, 0.28, 28), overlayMaterial(0.9), MAX_RINGS, 1001);
  private matrix = new THREE.Matrix4();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();

  constructor() {
    this.group.add(this.halos, this.dots, this.rings);
    this.group.visible = false;
  }

  setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  update(routes: Route[], time: number) {
    if (!this.group.visible) return;
    let dots = 0;
    let rings = 0;
    // Every route's dots move along together, so they all read as flowing the same way.
    const phase = (time * DOT_SPEED) % DOT_SPACING;
    for (const route of routes) {
      if (route.points.length < 2) continue;
      this.color.set(route.color);
      const size = route.selected ? SELECTED_SCALE : 1;
      let travelled = 0;
      let next = phase + CLEAR_OF_PAWN;
      for (let i = 1; i < route.points.length && dots < MAX_DOTS; i++) {
        const from = route.points[i - 1];
        const to = route.points[i];
        const length = from.distanceTo(to);
        while (next <= travelled + length && dots < MAX_DOTS) {
          const at = from.clone().lerp(to, length === 0 ? 0 : (next - travelled) / length);
          at.y += LIFT;
          this.place(this.dots, dots, at, size);
          this.place(this.halos, dots, at, size);
          dots++;
          next += DOT_SPACING;
        }
        travelled += length;
      }
      if (rings < MAX_RINGS) {
        const end = route.points[route.points.length - 1].clone();
        end.y += LIFT;
        // A slow pulse where it's headed.
        this.place(this.rings, rings++, end, size * (1 + 0.08 * Math.sin(time * 4)));
      }
    }
    for (const [mesh, count] of [[this.dots, dots], [this.halos, dots], [this.rings, rings]] as const) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Lays one dot or ring flat at this point, in the route's color, except a halo, which stays white. */
  private place(mesh: THREE.InstancedMesh, index: number, at: THREE.Vector3, size: number) {
    this.matrix.compose(at, FLAT, this.scale.setScalar(size));
    mesh.setMatrixAt(index, this.matrix);
    if (mesh !== this.halos) mesh.setColorAt(index, this.color);
  }
}
