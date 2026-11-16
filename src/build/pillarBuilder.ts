import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GridModel, PillarStyle } from '../grid/gridModel';
import { cornerToWorld, WALL_HEIGHT } from '../grid/gridMath';
import { disposeTree } from '../scene/dispose';

/** One piece of a pillar: a box, or a round shaft, standing on the floor at `y`. */
type Piece = { size: [number, number, number]; y: number; color: number; round?: boolean };

const WOOD = 0x7a5636;
const WHITE = 0xf2efe6;
const STONE = [0x9b978f, 0x8b877f, 0x928e86, 0xa3a097];
const STEEL = 0x4d535b;

/** Each kind of pillar, from the floor up to the floor above. */
const LOOKS: Record<PillarStyle, () => Piece[]> = {
  wood: () => [
    { size: [0.24, 0.08, 0.24], y: 0, color: 0x5e4129 },
    { size: [0.16, WALL_HEIGHT - 0.16, 0.16], y: 0.08, color: WOOD },
    { size: [0.24, 0.08, 0.24], y: WALL_HEIGHT - 0.08, color: 0x5e4129 },
  ],
  column: () => [
    { size: [0.34, 0.1, 0.34], y: 0, color: WHITE },
    { size: [0.26, 0.06, 0.26], y: 0.1, color: WHITE, round: true },
    { size: [0.2, WALL_HEIGHT - 0.32, 0.2], y: 0.16, color: WHITE, round: true },
    { size: [0.26, 0.06, 0.26], y: WALL_HEIGHT - 0.16, color: WHITE, round: true },
    { size: [0.34, 0.1, 0.34], y: WALL_HEIGHT - 0.1, color: WHITE },
  ],
  stone: () => Array.from({ length: 5 }, (_, course) => ({
    size: [course % 2 === 0 ? 0.34 : 0.32, WALL_HEIGHT / 5, course % 2 === 0 ? 0.32 : 0.34] as [number, number, number],
    y: (course * WALL_HEIGHT) / 5,
    color: STONE[course % STONE.length],
  })),
  steel: () => [
    { size: [0.22, 0.02, 0.22], y: 0, color: STEEL },
    { size: [0.1, WALL_HEIGHT - 0.04, 0.1], y: 0.02, color: STEEL },
    { size: [0.22, 0.02, 0.22], y: WALL_HEIGHT - 0.02, color: STEEL },
  ],
};

/** One pillar's shape, standing at the origin, colored by its vertices. */
export function pillarGeometry(style: PillarStyle): THREE.BufferGeometry {
  const shapes = LOOKS[style]().map((piece) => {
    const [w, h, d] = piece.size;
    const shape = piece.round ? new THREE.CylinderGeometry(w / 2, d / 2, h, 14) : new THREE.BoxGeometry(w, h, d);
    shape.translate(0, piece.y + h / 2, 0);
    const color = new THREE.Color(piece.color);
    const colors = new Float32Array(shape.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    shape.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Boxes and cylinders don't share index layouts, so merge them unindexed.
    return shape.toNonIndexed();
  });
  const merged = mergeGeometries(shapes);
  for (const shape of shapes) shape.dispose();
  return merged;
}

/** The pillars on one floor, as one mesh. */
export class PillarBuilder {
  readonly group = new THREE.Group();
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  private built = '';

  rebuild(model: GridModel) {
    const pillars = model.allPillars();
    const built = pillars.map((pillar) => `${pillar.x},${pillar.z}:${pillar.style}`).sort().join(';');
    if (built === this.built) return;
    this.built = built;
    disposeTree(this.group, new Set([this.material]));
    this.group.clear();
    if (pillars.length === 0) return;
    const shapes = pillars.map((pillar) => {
      const at = cornerToWorld(pillar.x, pillar.z);
      return pillarGeometry(pillar.style).translate(at.x, 0, at.z);
    });
    const merged = mergeGeometries(shapes);
    for (const shape of shapes) shape.dispose();
    const mesh = new THREE.Mesh(merged, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }
}
