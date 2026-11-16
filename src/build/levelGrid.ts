import * as THREE from 'three';
import { cornerToWorld } from '../grid/gridMath';

/** Just above the floor tiles, so the lines show over tiles already laid too. */
const LIFT = 0.075;
const LINE_OPACITY = 0.55;
const FILL_OPACITY = 0.07;

/**
 * Upstairs, a grid of squares over everywhere a floor tile can go: over the
 * floor and rooms below, leaving out stairwells. It shows that you're
 * building on a new level, and where on it you can build.
 */
export class LevelGrid {
  readonly group = new THREE.Group();
  private lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: LINE_OPACITY, depthWrite: false });
  private fillMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: FILL_OPACITY, depthWrite: false, side: THREE.DoubleSide });
  private built = '';

  /** The squares to draw, at the height of the floor they're on. */
  show(cells: { x: number; z: number }[], height: number) {
    this.group.position.y = height + LIFT;
    const built = cells.map(({ x, z }) => `${x},${z}`).sort().join(';');
    if (built === this.built) return;
    this.built = built;
    for (const child of this.group.children) (child as THREE.Mesh).geometry.dispose();
    this.group.clear();
    if (cells.length === 0) return;

    // Each edge once, though most are shared by two squares.
    const edges = new Map<string, [number, number, number, number]>();
    const fill: number[] = [];
    for (const { x, z } of cells) {
      edges.set(`${x},${z},h`, [x, z, x + 1, z]);
      edges.set(`${x},${z + 1},h`, [x, z + 1, x + 1, z + 1]);
      edges.set(`${x},${z},v`, [x, z, x, z + 1]);
      edges.set(`${x + 1},${z},v`, [x + 1, z, x + 1, z + 1]);
      const a = cornerToWorld(x, z);
      const b = cornerToWorld(x + 1, z + 1);
      fill.push(a.x, 0, a.z, b.x, 0, b.z, b.x, 0, a.z, a.x, 0, a.z, a.x, 0, b.z, b.x, 0, b.z);
    }
    const lines: number[] = [];
    for (const [x1, z1, x2, z2] of edges.values()) {
      const a = cornerToWorld(x1, z1);
      const b = cornerToWorld(x2, z2);
      lines.push(a.x, 0, a.z, b.x, 0, b.z);
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const fillGeometry = new THREE.BufferGeometry();
    fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fill, 3));
    this.group.add(new THREE.Mesh(fillGeometry, this.fillMaterial), new THREE.LineSegments(lineGeometry, this.lineMaterial));
  }
}
