import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GridModel } from '../grid/gridModel';
import type { FurniturePiece } from '../grid/gridModel';
import { cellToWorld } from '../grid/gridMath';
import { animatePart, buildFurnitureMesh, counterJoins, getFurnitureDef, isLit, getFootprintCenterOffset, hangingWallKeys, piecesOnTop, restingHeight } from './furnitureCatalog';
import type { MotionData } from './furnitureCatalog';
import { lightAt } from './roomLighting';
import type { RoomLight } from './roomLighting';
import { disposeTree } from '../scene/dispose';

type PlacedPart = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;

/** How solid anything hanging from the ceiling looks: faint enough to see the room through. */
const OVERHEAD_OPACITY = 0.3;

/** The still, solid parts of every piece share these, colored part by part, so each piece is drawn in one go rather than once per part. */
const SOLID = new THREE.MeshStandardMaterial({ vertexColors: true });
const OVERHEAD = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: OVERHEAD_OPACITY, depthWrite: false });
const SHARED = new Set<object>([SOLID, OVERHEAD]);

/** Which part of which piece this is, the same from one rebuild to the next. */
function partKey(part: PlacedPart): string {
  return `${part.userData.furnitureId}:${(part.userData.motion as MotionData).phase}`;
}

/** Rebuilds furniture meshes from the model's furniture list. */
export class FurniturePlacer {
  readonly group = new THREE.Group();
  /** The fish, bubbles and flames, which keep moving every frame, and the doors, burners, screens and taps that come on while a piece is in use. */
  private movingParts: PlacedPart[] = [];
  private lastTime: number | null = null;
  private pieces = new Map<string, THREE.Group>();
  /** Each piece as last built, and what it was built from, so a rebuild only remakes what changed. */
  private built = new Map<string, { signature: string; model3d: THREE.Group }>();
  /** A piece in the hand, which isn't drawn where it was until it's put down, and nor is anything sitting on it. */
  private hiddenId: string | null = null;
  private allPieces: FurniturePiece[] = [];

  /** Walls cut down for the view, which any pictures hung on them go with. */
  private loweredWalls = new Set<string>();

  setHidden(id: string | null) {
    this.hiddenId = id;
    this.applyVisibility();
  }

  setLoweredWalls(keys: ReadonlySet<string>) {
    this.loweredWalls = new Set(keys);
    this.applyVisibility();
  }

  private applyVisibility() {
    const hidden = hiddenWith(this.hiddenId, this.allPieces);
    for (const piece of this.allPieces) {
      const model3d = this.pieces.get(piece.id);
      if (!model3d) continue;
      const onLoweredWall = getFurnitureDef(piece.type).onWall === true && hangingWallKeys(piece).some((key) => this.loweredWalls.has(key));
      model3d.visible = !hidden.has(piece.id) && !onLoweredWall;
    }
  }

  rebuild(model: GridModel, light: RoomLight) {
    // A fridge left open stays open through a rebuild, rather than snapping shut and swinging open again.
    const openness = new Map(this.movingParts.map((part) => [partKey(part), (part.userData.motion as MotionData).openness]));
    const previous = this.built;
    this.built = new Map();
    this.group.clear();
    this.movingParts = [];
    this.pieces.clear();
    this.allPieces = model.allFurniture();
    for (const piece of this.allPieces) {
      const def = getFurnitureDef(piece.type);
      const joins = def.joins ? counterJoins(piece, this.allPieces) : undefined;
      const brightness = lightAt(light, model, piece);
      const height = restingHeight(piece, this.allPieces);
      // Everything the piece's look depends on. Most edits touch one or two pieces, so the rest are kept as they are.
      const signature = JSON.stringify([piece.type, piece.x, piece.z, piece.rotation, isLit(piece), piece.color ?? null, joins ?? null, brightness, height]);
      const kept = previous.get(piece.id);
      let model3d: THREE.Group;
      if (kept && kept.signature === signature) {
        model3d = kept.model3d;
        previous.delete(piece.id);
      } else {
        model3d = this.buildPiece(piece, joins, height, brightness);
        for (const part of model3d.children as PlacedPart[]) {
          if (part.userData.motion) (part.userData.motion as MotionData).openness = openness.get(partKey(part)) ?? 0;
        }
      }
      this.built.set(piece.id, { signature, model3d });
      this.pieces.set(piece.id, model3d);
      for (const part of model3d.children as PlacedPart[]) if (part.userData.motion) this.movingParts.push(part);
      this.group.add(model3d);
    }
    // Pieces taken away, or changed and built again.
    for (const { model3d } of previous.values()) disposeTree(model3d, SHARED);
    this.applyVisibility();
  }

  /** Call every frame with the time in seconds, and the pieces pawns are using right now. */
  animate(time: number, inUse: ReadonlySet<string>) {
    const seconds = this.lastTime === null ? 0 : Math.min(0.1, time - this.lastTime);
    this.lastTime = time;
    for (const part of this.movingParts) animatePart(part, part.userData.motion as MotionData, time, inUse.has(part.userData.furnitureId), seconds);
  }

  /** The piece under the cursor, if there is one. */
  pieceAt(ndc: THREE.Vector2, camera: THREE.Camera, model: GridModel, skipOverhead = false): FurniturePiece | undefined {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    // Pieces rebuilt since the last frame don't have their world positions yet.
    this.group.updateWorldMatrix(true, true);
    // Skips a piece that isn't showing, like one in hand, or a picture on a wall cut down for the view.
    const hit = raycaster
      .intersectObject(this.group, true)
      .find(({ object }) => object.visible && object.parent?.visible !== false && !(skipOverhead && object.userData.overhead));
    const id = hit?.object.userData.furnitureId;
    return model.allFurniture().find((piece) => piece.id === id);
  }

  private buildPiece(piece: FurniturePiece, joins: ReturnType<typeof counterJoins> | undefined, height: number, brightness: number): THREE.Group {
    const def = getFurnitureDef(piece.type);
    const model3d = buildFurnitureMesh(def, joins, isLit(piece), piece.color);
    const offset = getFootprintCenterOffset(piece.type, piece.rotation);
    const pos = cellToWorld(piece.x + offset.dx, piece.z + offset.dz);
    model3d.position.x = pos.x;
    model3d.position.z = pos.z;
    // A lamp or a bowl sits on top of the table or counter it's set on.
    model3d.position.y = height;
    model3d.rotation.y = THREE.MathUtils.degToRad(piece.rotation);
    // A ceiling light is over everyone's heads, so it never gets in the way of clicking on a pawn or a mess below it,
    // and it's see-through, so it never hides what's under it either.
    const overhead = def.onCeiling === true;
    mergeSolidParts(model3d, brightness, overhead);
    for (const part of model3d.children) {
      // A click lands on one part, and has to find its way back to the piece.
      part.userData.furnitureId = piece.id;
      if (overhead) part.userData.overhead = true;
    }
    return model3d;
  }
}

/**
 * Folds a piece's still, solid parts into one shape, each part keeping its
 * color, drawn with a material every piece shares. A house's worth of
 * furniture is thousands of parts, and drawing each one separately is what
 * slows the game down. Parts that move, glow or are see-through stay as they
 * are, dimmed or made see-through here like the rest.
 */
function mergeSolidParts(model3d: THREE.Group, brightness: number, overhead: boolean) {
  const solid: PlacedPart[] = [];
  for (const part of model3d.children as PlacedPart[]) {
    const material = part.material;
    const still = !part.userData.motion && part.visible && !material.transparent && material.emissive.getHex() === 0;
    if (still) {
      solid.push(part);
      continue;
    }
    material.color.multiplyScalar(brightness);
    if (overhead) {
      material.transparent = true;
      material.opacity = Math.min(material.opacity, OVERHEAD_OPACITY);
      material.depthWrite = false;
    }
  }
  if (solid.length === 0) return;
  const shapes = solid.map((part) => {
    part.updateMatrix();
    const shape = part.geometry.clone().applyMatrix4(part.matrix);
    const color = part.material.color.clone().multiplyScalar(brightness);
    const count = shape.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
    shape.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return shape;
  });
  const merged = mergeGeometries(shapes);
  for (const shape of shapes) shape.dispose();
  for (const part of solid) {
    part.geometry.dispose();
    part.material.dispose();
    model3d.remove(part);
  }
  if (merged) model3d.add(new THREE.Mesh(merged, overhead ? OVERHEAD : SOLID));
}

/** The piece in the hand and everything sitting on it, which all go with it. */
export function hiddenWith(id: string | null, pieces: readonly FurniturePiece[]): Set<string> {
  if (id === null) return new Set();
  const piece = pieces.find((other) => other.id === id);
  return new Set([id, ...(piece ? piecesOnTop(piece, pieces).map((rider) => rider.id) : [])]);
}
