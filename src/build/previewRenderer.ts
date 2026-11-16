import * as THREE from 'three';
import type { Direction, FurniturePiece, PillarStyle } from '../grid/gridModel';
import { pillarGeometry } from './pillarBuilder';
import { edgeMidpointWorld, edgeRotationY, cellToWorld, cornerToWorld, CELL_SIZE, WALL_HEIGHT, WALL_THICKNESS } from '../grid/gridMath';
import { getFurnitureDef, buildFurnitureMesh, counterJoins, getFootprintCenterOffset, pieceUnder, restingHeight } from './furnitureCatalog';
import { disposeTree } from '../scene/dispose';

const ADD_COLOR = 0x4fc3f7;
const DELETE_COLOR = 0xff5252;
const RING_COLOR = 0xffd54f;

/**
 * Draws translucent "ghost" previews for build tools (so you see where
 * something will land before you commit it) and highlights for delete/rotate
 * targets (so it's always clear what a click is about to affect). Nothing
 * here touches the GridModel — it's pure visual feedback.
 */
export class PreviewRenderer {
  readonly group = new THREE.Group();

  private wallGhostGeo = new THREE.BoxGeometry(CELL_SIZE * 0.92, WALL_HEIGHT, WALL_THICKNESS * 4);
  private floorGhostGeo = new THREE.BoxGeometry(CELL_SIZE * 0.92, 0.1, CELL_SIZE * 0.92);
  private ringGeo = new THREE.RingGeometry(CELL_SIZE * 0.42, CELL_SIZE * 0.5, 24);
  private stickGeo = new THREE.CylinderGeometry(0.03, 0.03, WALL_HEIGHT, 12);
  private stickBaseGeo = new THREE.CircleGeometry(CELL_SIZE * 0.13, 24);
  private wallFaceGeo = new THREE.PlaneGeometry(CELL_SIZE, WALL_HEIGHT);
  private regionCells: { x: number; z: number }[] | null = null;
  private regionMesh: THREE.InstancedMesh | null = null;

  /** Previews are redrawn on every mouse move, so whatever was made for the last one is freed here, all but the shapes kept for reuse. */
  clear() {
    const keep = new Set<object>([this.wallGhostGeo, this.floorGhostGeo, this.ringGeo, this.stickGeo, this.stickBaseGeo, this.wallFaceGeo]);
    if (this.regionMesh) keep.add(this.regionMesh).add(this.regionMesh.material as THREE.Material);
    disposeTree(this.group, keep);
    this.group.clear();
  }

  /** Pass `height` for something lower than a wall, like a fence. */
  showWallGhosts(edges: { x: number; z: number; dir: Direction }[], color = ADD_COLOR, height = WALL_HEIGHT) {
    for (const e of edges) {
      const mesh = new THREE.Mesh(this.wallGhostGeo, this.ghostMaterial(color));
      const mid = edgeMidpointWorld(e.x, e.z, e.dir);
      mesh.scale.y = height / WALL_HEIGHT;
      mesh.position.set(mid.x, height / 2, mid.z);
      mesh.rotation.y = edgeRotationY(e.dir);
      this.group.add(mesh);
    }
  }

  showFloorGhosts(cells: { x: number; z: number }[], color = ADD_COLOR) {
    for (const c of cells) {
      const mesh = new THREE.Mesh(this.floorGhostGeo, this.ghostMaterial(color));
      const pos = cellToWorld(c.x, c.z);
      mesh.position.set(pos.x, 0.06, pos.z);
      this.group.add(mesh);
    }
  }

  /** Pass the pieces already down so a counter's ghost takes the shape it would have once placed. */
  /** `tint` is the color it'll be placed in, like a bed's bedding, if one's been picked. */
  showFurnitureGhost(type: string, x: number, z: number, rotation: number, blocked: boolean, others?: FurniturePiece[], tint?: string) {
    const def = getFurnitureDef(type);
    const ghost = buildFurnitureMesh(def, def.joins && others ? counterJoins({ type, x, z, rotation }, others) : undefined);
    const mat = new THREE.MeshStandardMaterial({
      color: blocked ? DELETE_COLOR : tint ?? def.color,
      transparent: true,
      opacity: 0.5,
    });
    for (const part of ghost.children as THREE.Mesh[]) part.material = mat;
    const offset = getFootprintCenterOffset(type, rotation);
    const pos = cellToWorld(x + offset.dx, z + offset.dz);
    ghost.position.x = pos.x;
    ghost.position.z = pos.z;
    // A lamp or bowl in hand shows sitting on the table under it.
    ghost.position.y = restingHeight({ type, x, z }, others ?? []);
    ghost.rotation.y = THREE.MathUtils.degToRad(rotation);
    this.group.add(ghost);
    // Up on a table or counter, a guide shows how far above the floor it is, and what it's sitting on.
    if (ghost.position.y > 0.01) {
      const host = pieceUnder({ type, x, z }, others ?? []);
      this.showHeightGuide(pos.x, pos.z, ghost.position.y, host ? getFurnitureDef(host.type).label : null, blocked ? DELETE_COLOR : RING_COLOR);
    }
  }

  /**
   * How high something being placed sits, drawn so it reads at a glance: a
   * dashed line straight down to the floor, a shadow on the floor where it
   * would be, a ring on the top it's resting on, and a label saying what that
   * is and how high. Drawn through everything, so the table doesn't hide it.
   */
  showHeightGuide(x: number, z: number, height: number, surface: string | null, color = RING_COLOR) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, height, z), new THREE.Vector3(x, 0.01, z)]),
      new THREE.LineDashedMaterial({ color, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.95, depthTest: false }),
    );
    line.computeLineDistances();
    line.renderOrder = 12;

    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, 0.012, z);
    shadow.renderOrder = 11;

    const ringMat = this.ghostMaterial(color, 0.9);
    ringMat.depthTest = false;
    ringMat.side = THREE.DoubleSide;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.22, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, height + 0.006, z);
    ring.renderOrder = 12;

    const label = heightLabel(`${surface ? `On the ${surface.toLowerCase()} · ` : ''}${height.toFixed(2)} up`, color);
    label.position.set(x, height + 0.55, z);
    label.renderOrder = 13;
    this.group.add(line, shadow, ring, label);
  }

  /** A flat ring on the ground marking a cell — used to call out the
   * furniture a rotate/delete click would act on. Depth-tested off: the ring
   * sits at the base of the very piece of furniture it's pointing at, so a
   * normal depth test would mostly hide it behind that piece's own geometry
   * (a selection indicator should always read through, same as game UI). */
  showRing(x: number, z: number, color = RING_COLOR) {
    const mat = this.ghostMaterial(color, 0.85);
    mat.depthTest = false;
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.renderOrder = 10;
    mesh.rotation.x = -Math.PI / 2;
    const pos = cellToWorld(x, z);
    mesh.position.set(pos.x, 0.02, pos.z);
    this.group.add(mesh);
  }

  /**
   * Round a piece being held down to place: a faint circle, which says it can
   * be turned, and an arrow on the floor out from its front, which says which
   * way it faces. `reach` is how far its sides are from its middle.
   */
  showTurnIndicator(x: number, z: number, rotation: number, reach: number, color = RING_COLOR) {
    const radius = reach + 0.35;
    const circleMat = this.ghostMaterial(color, 0.8);
    circleMat.depthTest = false;
    const circle = new THREE.Mesh(new THREE.RingGeometry(radius - 0.06, radius, 48), circleMat);
    circle.renderOrder = 10;
    circle.rotation.x = -Math.PI / 2;
    const pos = cellToWorld(x, z);
    circle.position.set(pos.x, 0.03, pos.z);
    this.group.add(circle);

    // An arrow pointing +z, from the circle outwards, turned the way the piece faces.
    const arrow = new THREE.Shape();
    const [from, to, head] = [radius - 0.06, radius + 0.55, radius + 0.22];
    arrow.moveTo(-0.09, from);
    arrow.lineTo(0.09, from);
    arrow.lineTo(0.09, head);
    arrow.lineTo(0.27, head);
    arrow.lineTo(0, to);
    arrow.lineTo(-0.27, head);
    arrow.lineTo(-0.09, head);
    arrow.closePath();
    const arrowMat = this.ghostMaterial(color, 0.95);
    arrowMat.depthTest = false;
    arrowMat.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(arrow), arrowMat);
    mesh.renderOrder = 11;
    // Laid flat, the shape's +y runs along the floor toward +z; then turned with the piece.
    mesh.rotation.set(Math.PI / 2, THREE.MathUtils.degToRad(rotation), 0, 'YXZ');
    mesh.position.set(pos.x, 0.035, pos.z);
    this.group.add(mesh);
  }

  /** A tint over one side of a wall, as tall as that wall currently stands. */
  showWallFaceGhost(face: { x: number; z: number; dir: Direction; facing: { x: number; z: number }; heightScale: number }, color: number) {
    const material = this.ghostMaterial(color, 0.7);
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(this.wallFaceGeo, material);
    const height = WALL_HEIGHT * face.heightScale;
    mesh.scale.y = face.heightScale;
    const middle = edgeMidpointWorld(face.x, face.z, face.dir);
    const toward = cellToWorld(face.facing.x, face.facing.z).sub(middle).setY(0).normalize();
    mesh.position.copy(middle).addScaledVector(toward, WALL_THICKNESS / 2 + 0.01).setY(height / 2);
    mesh.rotation.y = edgeRotationY(face.dir);
    this.group.add(mesh);
  }

  /** A tint over one strip of gable end, a hair outside it. `toWorld` takes the strip from its roof's space into the world. */
  showGableGhost(strip: { dir: Direction; points: THREE.Vector3[] }, toWorld: THREE.Matrix4, color: number) {
    const material = this.ghostMaterial(color, 0.7);
    material.side = THREE.DoubleSide;
    const outward = new THREE.Vector3(strip.dir === 'E' ? 1 : strip.dir === 'W' ? -1 : 0, 0, strip.dir === 'N' ? 1 : strip.dir === 'S' ? -1 : 0).multiplyScalar(0.02);
    this.group.updateWorldMatrix(true, false);
    const points = strip.points.map((point) => this.group.worldToLocal(point.clone().applyMatrix4(toWorld).add(outward)));
    this.group.add(new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  /** A tint over a whole region of cells. Pass the same array again to reuse it: a region can be the entire lot, too many to rebuild on every mouse move. */
  showCellRegion(cells: { x: number; z: number }[], color: number) {
    if (this.regionCells !== cells) {
      if (this.regionMesh) {
        this.regionMesh.dispose();
        (this.regionMesh.material as THREE.Material).dispose();
      }
      this.regionCells = cells;
      this.regionMesh = new THREE.InstancedMesh(this.floorGhostGeo, this.ghostMaterial(color), cells.length);
      const placement = new THREE.Matrix4();
      cells.forEach((cell, index) => {
        const pos = cellToWorld(cell.x, cell.z);
        placement.setPosition(pos.x, 0.06, pos.z);
        this.regionMesh!.setMatrixAt(index, placement);
      });
    }
    (this.regionMesh!.material as THREE.MeshStandardMaterial).color.setHex(color);
    this.group.add(this.regionMesh!);
  }

  /** A wall-height stick rising from a grid corner, showing where a wall would start or end. Like the ring, it reads through whatever is in front of it. */
  showCornerStick(x: number, z: number, color = ADD_COLOR) {
    const pos = cornerToWorld(x, z);
    const material = this.ghostMaterial(color, 0.9);
    material.depthTest = false;

    const stick = new THREE.Mesh(this.stickGeo, material);
    stick.renderOrder = 10;
    stick.position.set(pos.x, WALL_HEIGHT / 2, pos.z);

    const base = new THREE.Mesh(this.stickBaseGeo, material);
    base.renderOrder = 10;
    base.rotation.x = -Math.PI / 2;
    base.position.set(pos.x, 0.02, pos.z);

    this.group.add(stick, base);
  }

  /** A see-through pillar on a grid corner. */
  showPillarGhost(x: number, z: number, style: PillarStyle, color = ADD_COLOR) {
    const pos = cornerToWorld(x, z);
    const mesh = new THREE.Mesh(pillarGeometry(style), this.ghostMaterial(color, 0.55));
    mesh.position.set(pos.x, 0, pos.z);
    this.group.add(mesh);
  }

  private ghostMaterial(color: number, opacity = 0.45): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, transparent: true, opacity, depthWrite: false });
  }
}

/** Label pictures already drawn, by text and color: there are only so many tables and heights, and a hover redraws on every move. */
const labelTextures = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

/** A small tag that always faces the camera, with a line of text on it. */
function heightLabel(text: string, color: number): THREE.Sprite {
  const key = `${color}|${text}`;
  const drawn = labelTextures.get(key) ?? drawLabel(text, color);
  labelTextures.set(key, drawn);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: drawn.texture, depthTest: false, transparent: true }));
  // About a third of a square tall, however long the text.
  const tall = 0.32;
  sprite.scale.set(tall * drawn.aspect, tall, 1);
  return sprite;
}

function drawLabel(text: string, color: number): { texture: THREE.CanvasTexture; aspect: number } {
  const scale = 2;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const font = `700 ${13 * scale}px 'Comic Sans MS', 'Trebuchet MS', system-ui, sans-serif`;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + 20 * scale;
  const height = 24 * scale;
  canvas.width = width;
  canvas.height = height;
  ctx.font = font;
  ctx.fillStyle = 'rgba(255, 248, 234, 0.95)';
  ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.roundRect(scale, scale, width - 2 * scale, height - 2 * scale, height / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#5b4a30';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + scale);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: width / height };
}

export { ADD_COLOR, DELETE_COLOR, RING_COLOR };
