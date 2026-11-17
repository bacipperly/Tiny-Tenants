import * as THREE from 'three';
import type { Direction, DoorStyle, FenceStyle, FloorSurface, PillarStyle, PoolKind, WallSegment, WindowSize } from '../grid/gridModel';
import { GridModel, wallKey } from '../grid/gridModel';
import { cellToWorld, clampCellToLot, clampCornerToLot, cornerToWorld, isCellInLot, isCornerInLot, raycastGround, mouseToNdc, worldToCell, worldToCorner, worldToEdge } from '../grid/gridMath';
import type { FurniturePiece } from '../grid/gridModel';
import { connectedCells } from '../grid/flood';
import { STEPS, wallSides } from '../grid/roomDetection';
import { surfaceColor } from './floorTextures';
import { FURNITURE_CATALOG, backStep, carriedCell, getFootprintCells, getFootprintCenterOffset, getFurnitureDef, pieceSquare, piecesOnTop } from './furnitureCatalog';

/** Furniture comes in layers that only get in each other's way within a layer: rugs on the floor, everything standing on the floor, small things set on top of tables and counters, and pictures hung on the walls. */
type FurnitureLayer = 'floor' | 'standing' | 'top' | 'wall' | 'ceiling';

function layerOf(type: string): FurnitureLayer {
  const def = getFurnitureDef(type);
  return def.onFloor ? 'floor' : def.onTop ? 'top' : def.onWall ? 'wall' : def.onCeiling ? 'ceiling' : 'standing';
}

/** About where a picture hangs, so pointing at that spot on a wall finds the square in front of it. */
const WALL_ART_AIM_HEIGHT = 1.3;
const ROTATIONS = [0, 90, 180, 270] as const;
/**
 * The square of a piece, in its own frame, that goes on the square you point
 * at when placing it, and that it turns about: the middle of its back, like a
 * bed's headboard or the back of a sofa. A piece's own frame counts across
 * its width and then forward from its back.
 */
function anchorSquare(type: string): [number, number] {
  return [Math.floor((getFurnitureDef(type).footprint.w - 1) / 2), 0];
}

/** Where a piece's corner goes, the way pieces are stored, so its anchor lands on `cell` turned this way. A picture hung on a wall keeps to its corner, which the wall finds for it. */
function cornerForAnchor(type: string, cell: { x: number; z: number }, rotation: number): { x: number; z: number } {
  if (getFurnitureDef(type).onWall) return cell;
  const anchor = pieceSquare(type, 0, 0, rotation, anchorSquare(type));
  return { x: cell.x - anchor.x, z: cell.z - anchor.z };
}

/** How far, in screen pixels, the cursor moves with the button held before it starts turning the piece being placed. */
const AIM_START_PIXELS = 12;
import { PreviewRenderer, ADD_COLOR, DELETE_COLOR, RING_COLOR } from './previewRenderer';
import { fenceColor } from './fenceBuilder';
import { gameDay } from '../sim/dayClock';
import type { RoofStyle } from '../grid/house';
import { WALL_COLOR } from './wallBuilder';
import { DEFAULT_PIECE_COLOR, isColorable } from './furnitureColors';
import { gableColor, gableEnd, wallBelowColor } from './roofBuilder';
import type { GableStrip } from './roofBuilder';

/** 'none' is Live mode, where the mouse commands the pawn instead of editing the house. */
/** `stairs` is Build's way in to placing stairs, which then works like placing furniture. */
export type ToolId = 'wall' | 'door' | 'window' | 'floor' | 'paint' | 'stairs' | 'roof' | 'fence' | 'pillar' | 'pool' | 'outdoor' | 'furniture' | 'move' | 'delete' | 'none';
export type WallDrawMode = 'line' | 'room';
export type FloorDrawMode = 'drag' | 'flood';
export type DeleteMode = 'single' | 'area';
export type DeleteFilter = 'everything' | 'furniture';
export type PaintTarget = 'wall' | 'floor';
export type PaintMethod = 'brush' | 'bucket' | 'sample';
export type DragSize = { w: number; h: number } | null;
type CellBounds = { loX: number; hiX: number; loZ: number; hiZ: number };
type Corner = { x: number; z: number };
type Cell = { x: number; z: number };
/** One side of a wall: the wall's edge, the cell that side looks into, and how tall the wall currently stands. */
type WallFace = { x: number; z: number; dir: Direction; facing: Cell; heightScale: number };
/** A strip of gable end under the cursor, on whichever floor's roof it is, with the rest of that roof's gables and where along the ray it was hit. */
export interface GablePick {
  model: GridModel;
  strip: GableStrip;
  strips: GableStrip[];
  distance: number;
  /** From the roof's own space to the world's. */
  toWorld: THREE.Matrix4;
}
/** Something the Paint tool can paint when painting walls: one side of a wall, or a strip of gable above one. */
type PaintSpot = { kind: 'wall'; face: WallFace } | { kind: 'gable'; gable: GablePick } | { kind: 'fence'; fence: FenceHit };
/** A fence or railing the cursor is on: a real one, or one of the railings drawn for you upstairs. */
type FenceHit = { x: number; z: number; dir: Direction; style: FenceStyle; color?: string; auto: boolean; distance: number };
/** What a bucket click would fill, kept until the cursor moves to something else because working it out can cover the whole lot. */
type FillPreview = { key: string; faces: WallFace[]; cells: Cell[]; gables?: { pick: GablePick; strips: GableStrip[] }; fences?: FenceHit[] };

const STROKE_SAMPLE_SPACING = 0.01;

type DeleteTarget =
  | { kind: 'furniture'; id: string; type: string; x: number; z: number; rotation: number }
  | { kind: 'wall'; x: number; z: number; dir: Direction }
  | { kind: 'aperture'; x: number; z: number; dir: Direction }
  | { kind: 'fence'; x: number; z: number; dir: Direction }
  | { kind: 'railing'; x: number; z: number; dir: Direction }
  | { kind: 'pillar'; x: number; z: number; style: PillarStyle }
  | { kind: 'floor'; x: number; z: number }
  | { kind: 'mess'; id: string; x: number; z: number }
  | { kind: 'pool'; x: number; z: number }
  | null;

/** What the Delete tool needs to take messes as well: dirt, trash and dirty plates, which the household keeps, not the house. */
export interface MessAccess {
  /** The mess under the cursor on the floor you're on, if nothing's in front of it. */
  at(ndc: THREE.Vector2): string | null;
  /** The square a mess is on. */
  cellOf(id: string): { x: number; z: number } | null;
  /** Every mess on the floor you're on inside these squares. */
  inArea(bounds: { loX: number; hiX: number; loZ: number; hiZ: number }): string[];
  remove(id: string): void;
}

const DRAG_TOOLS: ToolId[] = ['wall', 'floor', 'window', 'fence', 'pool'];
/** The tint over squares about to become pool. */
const POOL_COLOR = 0x3fa9e0;
/** The eyedropper's ring round the piece it would pick up. */
const PICK_COLOR = 0x4aa8ff;
/** Where a click with the Roof tool is taken to land: about where the roof is, a little above the tops of the walls. */
const ROOF_PICK_HEIGHT = 2.3;

/** How tall a fence's ghost is while you drag one out. */
const FENCE_GHOST_HEIGHT = 1;
/** How close to a pillar's corner, in squares, the Delete tool has to point to pick the pillar. */
const PILLAR_REACH = 0.28;

export class ToolController {
  activeTool: ToolId = 'wall';
  /** The piece waiting to be placed, or null with nothing in hand. */
  selectedFurnitureType: string | null = FURNITURE_CATALOG.find((def) => !def.buildTool)!.type;
  /** The color picked from each type's wheel in the palette, like a bed's bedding. Null is the piece's own color. */
  furnitureColors = new Map<string, string | null>();

  /** What color a piece of this type goes down in: the one picked for it, or white for anything that can be colored. */
  placingColor(type: string): string | undefined {
    const picked = this.furnitureColors.get(type);
    if (picked !== undefined) return picked ?? undefined;
    return isColorable(getFurnitureDef(type)) ? DEFAULT_PIECE_COLOR : undefined;
  }
  /** Which way the next piece will face. It stays that way after placing, so a row of chairs can all face the same way. */
  placementRotation: 0 | 90 | 180 | 270 = 0;
  /** What the Pool tool digs: a pool to swim in, or a spa to soak in. */
  selectedPoolKind: PoolKind = 'pool';
  /**
   * A piece being placed, held down on its square: it goes down when the button
   * comes up, and dragging away from it first turns it to face the cursor.
   */
  private aim: { type: string; x: number; z: number; rotation: 0 | 90 | 180 | 270; startX: number; startY: number; turning: boolean; moving: FurniturePiece | null } | null = null;
  selectedPaintColor = '#f2e9da';
  /** Whether the paint tool is recoloring walls (wallpaper) or floor tiles
   * (carpet/flooring) — kept as its own choice so a brush stroke never hits
   * both at once, matching how The Sims separates wallpaper from flooring. */
  paintTarget: PaintTarget = 'wall';
  /** 'line': drag paints one straight run of walls (axis-locked).
   * 'room': drag defines a rectangle and builds all 4 of its perimeter walls. */
  wallDrawMode: WallDrawMode = 'line';
  /** What the Fence tool lays. */
  selectedFenceStyle: FenceStyle = 'picket';
  /** The Fence tool turning a length of fence into a gate, or back, instead of laying fence. */
  fenceGate = false;
  /** What the Pillar tool puts up. */
  selectedPillarStyle: PillarStyle = 'wood';
  /** What the Floor tool lays, or changes tiles already down to. */
  selectedSurface: FloorSurface = 'plain';
  /** Fires when stairs are put down, placed or moved, so the floor above can get a landing. */
  onStairsPlaced: ((piece: FurniturePiece) => void) | null = null;
  /** 'drag': drag a rectangle of tiles. 'flood': click to fill all connected bare ground, up to the walls. */
  floorDrawMode: FloorDrawMode = 'drag';
  /** 'brush': paint what the cursor crosses. 'bucket': click to fill everything connected. 'sample': click to pick up a color. */
  paintMethod: PaintMethod = 'brush';
  selectedWindowSize: WindowSize = 'standard';
  selectedDoorStyle: DoorStyle = 'wood';
  /** 'area': drag a square, then release to remove everything in it; a plain click removes one thing. 'single': every click removes one thing. */
  deleteMode: DeleteMode = 'area';
  /** 'furniture': the delete tool clears out a room's furniture and leaves the room itself alone, however you use it. */
  deleteFilter: DeleteFilter = 'everything';
  /** The furniture piece currently under the cursor, regardless of active
   * tool — used by the keyboard rotate shortcut so it works no matter which
   * tool you're on, same as selecting an object in The Sims. */
  hoveredFurniture: FurniturePiece | undefined;
  /** The Furniture tool's eyedropper: the next click on a placed piece picks up that kind to place more. Alt/Option-click does the same. */
  furniturePicking = false;
  /** Fires when the eyedropper picks up a placed piece. */
  onFurniturePicked: ((piece: FurniturePiece) => void) | null = null;
  /** The Roof tool, a room at a time: a click gives the room under the cursor this roof, or with null, gives it back the house's. Off, the roof styles are for the whole house. */
  roofForRoom: RoofStyle | null | undefined = undefined;
  /** Upstairs, the railings drawn for you on the floor being edited, which can be deleted, painted or restyled one at a time. */
  autoRailings: (() => { x: number; z: number; dir: Direction; style: FenceStyle }[]) | null = null;
  /** The fence pressed on with the Fence tool, which a click without a drag changes to the picked style. */
  private fencePressed: FenceHit | null = null;
  /** Finds the piece actually drawn under the cursor, so a click on a painting gets the painting and not the sofa beneath it. */
  pickFurniture: ((ndc: THREE.Vector2) => FurniturePiece | undefined) | null = null;
  /** Reports the in-progress drag's size in cells (or null when not
   * dragging), so the UI can show a "3x4"-style tooltip near the cursor. */
  onDragSize: ((size: DragSize) => void) | null = null;
  /** Fires when a click, drag or rotate finishes, so one action becomes one undo step. */
  onActionEnd: (() => void) | null = null;
  /** Fires when the eyedropper picks up a color, which also changes the paint target and method. */
  onColorSampled: (() => void) | null = null;
  /** Fires when the hand picks a piece up (its id) or lets go of it (null), so the piece can vanish from its old spot while it's carried. */
  onCarry: ((id: string | null) => void) | null = null;

  /** The piece the hand is carrying, if any. It stays where it was in the house until it's put down. */
  private carried: FurniturePiece | null = null;
  private carriedRotation: 0 | 90 | 180 | 270 = 0;
  private isPointerDown = false;
  /** The last place the cursor was over the lot, for redrawing the ghost when a key turns it without the mouse moving. */
  private lastPointer: PointerEvent | null = null;
  private methodBeforeSample: PaintMethod = 'brush';
  private fillPreview: FillPreview | null = null;
  /** What a click would delete in area mode, if the pointer never leaves the cell it pressed. */
  private areaClickTarget: DeleteTarget = null;
  /** The first wall a window stroke touched: the one door a stroke is allowed to replace. */
  private windowStrokeStart: string | null = null;
  /** Shortcut keys held when a drag began, as in The Sims: Shift makes a wall drag a room, a floor click a fill and a
   * brush click a bucket fill; Ctrl (or ⌘) makes a wall, fence or floor drag take away instead of build. */
  private dragWallMode: WallDrawMode = 'line';
  private dragErasing = false;
  private strokePaintMethod: PaintMethod = 'brush';
  private dragWallKeys = new Map<string, { x: number; z: number; dir: Direction }>();
  private dragFloorKeys = new Map<string, { x: number; z: number }>();
  /** The grid corner a wall drag started from, in line or room mode. */
  private wallDragAnchor: Corner | null = null;
  /** The grid corner a wall drag currently ends at. */
  private wallDragEnd: Corner | null = null;
  /** Set on the first pointerdown of a floor drag or area erase: the opposite
   * corner of the rectangle currently being filled/outlined. */
  private rectDragAnchor: { x: number; z: number } | null = null;
  /** Last screen position stroked, for interpolating a fast stroke so it
   * doesn't skip anything between two pointer events. */
  private lastStrokeNdc: THREE.Vector2 | null = null;
  private eraseBounds: CellBounds | null = null;
  private model: GridModel;
  private getCamera: () => THREE.Camera;
  private domElement: HTMLElement;
  private preview: PreviewRenderer;
  private wallGroup: THREE.Object3D;

  constructor(
    model: GridModel,
    getCamera: () => THREE.Camera,
    domElement: HTMLElement,
    preview: PreviewRenderer,
    wallGroup: THREE.Object3D,
  ) {
    this.wallGroup = wallGroup;
    this.model = model;
    this.getCamera = getCamera;
    this.domElement = domElement;
    this.preview = preview;
    domElement.addEventListener('pointerdown', this.onPointerDown);
    domElement.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    domElement.addEventListener('pointerleave', this.onPointerLeave);
  }

  /** How high the floor being built on is. */
  private height = 0;
  /** From Mode controls: lets the Delete tool take dirt, trash and dirty plates too. */
  selectMesses = false;
  messes: MessAccess | null = null;
  /** Finds the gable end a ray hits, when the roof is showing. */
  gablePicker: ((raycaster: THREE.Raycaster) => GablePick | null) | null = null;
  /** Any further say on where a piece can go, like needing floor under it upstairs. */
  furnitureRule: ((type: string, cells: { x: number; z: number }[]) => boolean) | null = null;

  /** Works on another floor of the house from now on: its model, its walls to click on, and its height. */
  setLevel(model: GridModel, wallGroup: THREE.Object3D, height: number) {
    this.cancelDrag();
    this.putBackCarried();
    this.model = model;
    this.wallGroup = wallGroup;
    this.height = height;
    this.hoveredFurniture = undefined;
    this.resetPreview();
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.domElement.removeEventListener('pointerleave', this.onPointerLeave);
  }

  /** Call when the active tool changes, so stale ghosts don't linger. A piece being carried goes back where it was. */
  resetPreview() {
    this.isPointerDown = false;
    this.putBackCarried();
    this.clearDrag();
  }

  /** Escape while carrying a piece: puts it back where it came from, unmoved. True if there was one. */
  putBackCarried(): boolean {
    if (!this.carried) return false;
    this.carried = null;
    this.onCarry?.(null);
    this.preview.clear();
    if (this.lastPointer) this.updateHover(this.lastPointer);
    return true;
  }

  private pickUp(piece: FurniturePiece) {
    this.carried = piece;
    this.carriedRotation = piece.rotation;
    this.onCarry?.(piece.id);
  }

  /** Where the carried piece's corner would go with its anchor, the middle of its back, on this square, as it's placed. */
  private carriedAnchor(cell: { x: number; z: number }): { x: number; z: number } {
    return this.carried ? cornerForAnchor(this.carried.type, cell, this.carriedRotation) : cell;
  }

  /** Puts the carried piece down here if it fits. False if something's in the way, and it's still in hand. */
  private putDown(cell: { x: number; z: number }): boolean {
    const piece = this.carried;
    if (!piece) return false;
    const { x, z } = this.carriedAnchor(cell);
    const rotation = this.wallFacingRotation(piece.type, x, z, this.carriedRotation);
    if (!this.canPlaceFurniture(piece.type, x, z, rotation, piece.id)) return false;
    this.carried = null;
    this.onCarry?.(null);
    this.movePiece(piece, x, z, rotation);
    this.announceStairs(piece.id);
    return true;
  }

  /** Stairs just put down get a landing on the floor above. */
  private announceStairs(id: string) {
    const piece = this.model.allFurniture().find((each) => each.id === id);
    if (piece && getFurnitureDef(piece.type).stairs) this.onStairsPlaced?.(piece);
  }

  /** Moves or turns a piece, taking whatever's sitting on it along, so a lamp stays on its table. */
  private movePiece(piece: FurniturePiece, x: number, z: number, rotation: 0 | 90 | 180 | 270) {
    const riders = piecesOnTop(piece, this.model.allFurniture());
    this.model.batch(() => {
      for (const rider of riders) {
        const cell = carriedCell(rider, piece, { x, z, rotation });
        const turned = ((rider.rotation + rotation - piece.rotation + 360) % 360) as 0 | 90 | 180 | 270;
        this.model.moveFurniture(rider.id, cell.x, cell.z, turned);
      }
      this.model.moveFurniture(piece.id, x, z, rotation);
    });
  }

  /** Deletes a piece, along with anything sitting on it. */
  private removePiece(id: string) {
    const piece = this.model.allFurniture().find((other) => other.id === id);
    const riders = piece ? piecesOnTop(piece, this.model.allFurniture()) : [];
    this.model.batch(() => {
      for (const rider of riders) this.model.removeFurniture(rider.id);
      this.model.removeFurniture(id);
    });
  }

  /** Escape while holding a piece to place: puts it back, so nothing follows the cursor. True if there was one to put back. */
  dropHeldPiece(): boolean {
    if (this.activeTool !== 'furniture' || this.selectedFurnitureType === null) return false;
    this.selectedFurnitureType = null;
    this.preview.clear();
    if (this.lastPointer) this.updateHover(this.lastPointer);
    return true;
  }

  /** Escape: cancels an in-progress wall, floor, window or area-erase drag without changing anything. */
  cancelDrag() {
    if (this.aim) {
      this.aim = null;
      this.isPointerDown = false;
      this.preview.clear();
      return;
    }
    if (!this.isPointerDown || !(this.isDragTool() || this.isAreaErase())) return;
    this.isPointerDown = false;
    this.clearDrag();
  }

  private clearDrag() {
    this.dragWallKeys.clear();
    this.dragFloorKeys.clear();
    this.fencePressed = null;
    this.wallDragAnchor = null;
    this.rectDragAnchor = null;
    this.eraseBounds = null;
    this.lastStrokeNdc = null;
    this.windowStrokeStart = null;
    this.areaClickTarget = null;
    this.fillPreview = null;
    this.preview.clear();
    this.onDragSize?.(null);
  }

  setPaintMethod(method: PaintMethod) {
    if (method === 'sample' && this.paintMethod !== 'sample') this.methodBeforeSample = this.paintMethod;
    this.paintMethod = method;
    this.fillPreview = null;
  }

  /** Rotates whatever furniture piece is currently under the cursor,
   * regardless of the active tool — the keyboard-shortcut entry point
   * (comma/period, same as The Sims). */
  rotateHovered(delta: 90 | -90 = 90) {
    if (this.activeTool === 'none') return;
    if (this.carried) {
      this.turnCarried(delta);
      return;
    }
    const hovered = this.hoveredFurniture;
    if (hovered) {
      // It only turns to a way it still fits: not through a wall, into another piece or off the lot. A way that doesn't is skipped for the next one that does.
      for (let step = 1; step < 4; step++) {
        const turned = ((hovered.rotation + delta * step + 720) % 360) as 0 | 90 | 180 | 270;
        if (!this.canPlaceFurniture(hovered.type, hovered.x, hovered.z, turned, hovered.id)) continue;
        this.movePiece(hovered, hovered.x, hovered.z, turned);
        break;
      }
    }
    this.onActionEnd?.();
  }

  /** Turns the piece in hand about its anchor, which stays on the square under the cursor. */
  private turnCarried(delta: 90 | -90) {
    this.carriedRotation = ((this.carriedRotation + delta + 360) % 360) as 0 | 90 | 180 | 270;
    if (this.lastPointer) this.updateHover(this.lastPointer);
  }

  /** The Delete and Backspace keys: removes the piece of furniture, or else the door or window, under the cursor. Walls and floors are left alone, so a stray key press can't knock a hole in the house. A piece being carried goes instead. */
  deleteHovered() {
    if (this.activeTool === 'none' || !this.lastPointer) return;
    if (this.carried) {
      const id = this.carried.id;
      this.carried = null;
      this.onCarry?.(null);
      this.removePiece(id);
      this.onActionEnd?.();
      this.updateHover(this.lastPointer);
      return;
    }
    const worldPoint = this.worldPointFor(this.lastPointer);
    const target = worldPoint && this.resolveDeleteTarget(worldPoint, this.lastPointer);
    if (target?.kind !== 'furniture' && target?.kind !== 'aperture') return;
    this.applyDelete(target);
    this.onActionEnd?.();
    this.updateHover(this.lastPointer);
  }

  /** The R key: turns the piece about to be placed, or, when the cursor is on a piece that's already down, turns that one instead. */
  rotatePlacementOrHovered() {
    if (this.carried) {
      this.turnCarried(90);
      return;
    }
    if (this.aim) {
      this.aim.rotation = ((this.aim.rotation + 90) % 360) as 0 | 90 | 180 | 270;
      this.renderAim();
      return;
    }
    if (this.activeTool !== 'furniture' || this.hoveredFurniture || this.selectedFurnitureType === null) {
      this.rotateHovered();
      return;
    }
    this.placementRotation = ((this.placementRotation + 90) % 360) as 0 | 90 | 180 | 270;
    if (this.lastPointer) this.updateHover(this.lastPointer);
  }

  /**
   * The fence or railing the cursor is on, if any: looked for along the ray
   * at a few heights up a fence, so pointing at the rail or the slats both
   * find it. Upstairs, the railings drawn for you count too.
   */
  private fenceAt(ndc: THREE.Vector2): FenceHit | null {
    const camera = this.getCamera();
    const auto = this.autoRailings?.() ?? [];
    for (const up of [0.5, 0.85, 0.2]) {
      const point = raycastGround(ndc, camera, this.height + up);
      if (!point) continue;
      const edge = worldToEdge(point.x, point.z);
      // Only close to the line of the edge, not anywhere in the square beside it.
      const cell = worldToCell(point.x, point.z);
      const off = edge.dir === 'E' || edge.dir === 'W' ? Math.abs(point.x - cell.x) : Math.abs(point.z - cell.z);
      if (off < 0.3) continue;
      const distance = camera.position.distanceTo(point);
      const fence = this.model.getFence(edge.x, edge.z, edge.dir);
      if (fence) return { x: fence.x, z: fence.z, dir: fence.dir, style: fence.style, color: fence.color, auto: false, distance };
      const key = wallKey(edge.x, edge.z, edge.dir);
      const railing = auto.find((each) => wallKey(each.x, each.z, each.dir) === key);
      if (railing) return { ...railing, auto: true, distance };
    }
    return null;
  }

  /** Paints a fence. A railing drawn for you becomes a fence of its own first, so it can keep the paint. */
  private paintFence(fence: FenceHit) {
    if (fence.auto) this.model.setFence(fence.x, fence.z, fence.dir, fence.style);
    this.model.paintFence(fence.x, fence.z, fence.dir, this.selectedPaintColor);
  }

  /** Changes a fence to the picked style, keeping its gate and paint. A railing drawn for you becomes a fence of its own in that style. */
  private restyleFence(fence: FenceHit) {
    if (fence.auto) this.model.setFence(fence.x, fence.z, fence.dir, this.selectedFenceStyle);
    else this.model.restyleFence(fence.x, fence.z, fence.dir, this.selectedFenceStyle);
  }

  /** A bucket on a fence: the whole run it's part of, every fence joined end to end in the same style and color. */
  private fenceRun(start: FenceHit): FenceHit[] {
    const fences: FenceHit[] = [
      ...this.model.allFences().map((fence): FenceHit => ({ ...fence, auto: false, distance: 0 })),
      ...(this.autoRailings?.() ?? []).map((railing): FenceHit => ({ ...railing, auto: true, distance: 0 })),
    ];
    const all = fences.filter((fence) => fence.style === start.style && fence.color === start.color);
    // Each edge's two ends, in half squares, so edges that meet share an end.
    const ends = (fence: FenceHit): string[] => {
      const { x, z, dir } = fence;
      if (dir === 'N') return [`${2 * x - 1},${2 * z + 1}`, `${2 * x + 1},${2 * z + 1}`];
      if (dir === 'S') return [`${2 * x - 1},${2 * z - 1}`, `${2 * x + 1},${2 * z - 1}`];
      if (dir === 'E') return [`${2 * x + 1},${2 * z - 1}`, `${2 * x + 1},${2 * z + 1}`];
      return [`${2 * x - 1},${2 * z - 1}`, `${2 * x - 1},${2 * z + 1}`];
    };
    const byEnd = new Map<string, FenceHit[]>();
    for (const fence of all) for (const end of ends(fence)) byEnd.set(end, [...(byEnd.get(end) ?? []), fence]);
    const startKey = wallKey(start.x, start.z, start.dir);
    const first = all.find((fence) => wallKey(fence.x, fence.z, fence.dir) === startKey);
    if (!first) return [start];
    const seen = new Set<FenceHit>([first]);
    const queue = [first];
    while (queue.length > 0) {
      const fence = queue.pop()!;
      for (const end of ends(fence)) for (const next of byEnd.get(end) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    return [...seen];
  }

  /** The square under the cursor at the height of the roof, where the roof is drawn, rather than down on the floor. */
  private roofCellAt(e: PointerEvent): Cell | null {
    const point = raycastGround(mouseToNdc(e, this.domElement), this.getCamera(), this.height + ROOF_PICK_HEIGHT);
    return point ? worldToCell(point.x, point.z) : null;
  }

  /** The squares of the room this square is in, or none outdoors. */
  private roomCellsAt(cell: Cell): Cell[] {
    const id = this.model.roomIdAt(cell.x, cell.z);
    if (!id) return [];
    return this.model.allRooms().find((room) => room.id === id)?.cells ?? [];
  }

  /** Whether a click picks up a placed piece rather than placing one: the eyedropper's on, or Alt/Option is held. */
  private isPickingFurniture(e: { altKey: boolean }): boolean {
    return this.activeTool === 'furniture' && (this.furniturePicking || e.altKey);
  }

  private isDragTool(): boolean {
    return DRAG_TOOLS.includes(this.activeTool) && !(this.activeTool === 'fence' && this.fenceGate);
  }

  private isAreaErase(): boolean {
    return this.activeTool === 'delete' && this.deleteMode === 'area';
  }

  private isDeletingFurnitureOnly(): boolean {
    return this.activeTool === 'delete' && this.deleteFilter === 'furniture';
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.activeTool === 'none') return;
    this.isPointerDown = true;
    this.dragWallKeys.clear();
    this.dragFloorKeys.clear();
    this.wallDragAnchor = null;
    this.rectDragAnchor = null;
    this.eraseBounds = null;
    this.lastStrokeNdc = null;
    this.windowStrokeStart = null;

    this.dragWallMode = e.shiftKey ? 'room' : this.wallDrawMode;
    this.dragErasing = (e.ctrlKey || e.metaKey) && (this.activeTool === 'wall' || this.activeTool === 'fence' || this.activeTool === 'floor' || this.activeTool === 'pillar' || this.activeTool === 'pool');
    this.strokePaintMethod = e.shiftKey && this.paintMethod === 'brush' ? 'bucket' : this.paintMethod;

    const worldPoint = this.worldPointFor(e);
    if (!worldPoint) return;

    if (this.activeTool === 'roof' && this.roofForRoom !== undefined) {
      const room = this.roomCellsAt(this.roofCellAt(e) ?? worldToCell(worldPoint.x, worldPoint.z));
      if (room.length > 0) this.model.setRoofArea(room, this.roofForRoom);
      return;
    }

    if (this.isPickingFurniture(e)) {
      // The eyedropper: whatever piece is clicked becomes the one in hand, in its color.
      const cell = worldToCell(worldPoint.x, worldPoint.z);
      const piece = this.pieceUnderCursor(e) ?? this.findFurnitureAt(cell.x, cell.z);
      this.isPointerDown = false;
      if (piece) {
        this.furniturePicking = false;
        this.onFurniturePicked?.(piece);
      }
      return;
    }

    if (this.activeTool === 'fence' && this.fenceGate) {
      this.toggleGate(worldPoint);
    } else if (this.activeTool === 'wall' || this.activeTool === 'fence') {
      // A click on a fence, rather than a drag from a corner, changes it to the picked style.
      this.fencePressed = this.activeTool === 'fence' && !this.dragErasing ? this.fenceAt(mouseToNdc(e, this.domElement)) : null;
      const corner = worldToCorner(worldPoint.x, worldPoint.z);
      if (!isCornerInLot(corner.x, corner.z)) return;
      this.wallDragAnchor = corner;
      if (this.dragWallMode === 'line') this.updateWallLine(worldPoint);
      else this.updateWallRoom(worldPoint);
    } else if (this.activeTool === 'floor') {
      const startCell = worldToCell(worldPoint.x, worldPoint.z);
      if (!isCellInLot(startCell.x, startCell.z)) return;
      if ((this.floorDrawMode === 'flood' || e.shiftKey) && !this.dragErasing) {
        this.floodFloor(startCell);
      } else {
        this.rectDragAnchor = startCell;
        this.updateFloorRect(worldPoint);
      }
    } else if (this.activeTool === 'pool') {
      const startCell = worldToCell(worldPoint.x, worldPoint.z);
      if (!isCellInLot(startCell.x, startCell.z)) return;
      this.rectDragAnchor = startCell;
      this.updatePoolRect(worldPoint);
    } else if (this.activeTool === 'window') {
      this.updateWindowStroke(e);
    } else if (this.activeTool === 'paint') {
      this.paintPress(e, worldPoint);
    } else if (this.isAreaErase()) {
      this.areaClickTarget = this.resolveDeleteTarget(worldPoint, e);
      this.rectDragAnchor = worldToCell(worldPoint.x, worldPoint.z);
      this.updateEraseArea(worldPoint);
    } else if (this.activeTool === 'delete') {
      this.applyDelete(this.resolveDeleteTarget(worldPoint, e));
    } else if (this.activeTool === 'furniture' && this.selectedFurnitureType && !getFurnitureDef(this.selectedFurnitureType).onWall) {
      // Held down rather than placed at once, so it can be turned before it goes down. A picture hung on a wall turns to the wall by itself.
      const { x, z } = worldToCell(worldPoint.x, worldPoint.z);
      this.aim = { type: this.selectedFurnitureType, x, z, rotation: this.placementRotation, startX: e.clientX, startY: e.clientY, turning: false, moving: null };
      this.renderAim();
    } else if (this.activeTool === 'move' && this.carried && !getFurnitureDef(this.carried.type).onWall) {
      // A piece in hand goes down the same way: on letting go, turned first if the cursor's dragged away.
      const { x, z } = worldToCell(worldPoint.x, worldPoint.z);
      this.aim = { type: this.carried.type, x, z, rotation: this.carriedRotation, startX: e.clientX, startY: e.clientY, turning: false, moving: this.carried };
      this.renderAim();
    } else {
      this.commitSingleAction(worldPoint, e);
    }
    this.updateHover(e);
  };

  /** Turns the piece being held down to face the cursor, once the cursor has moved far enough from where it was pressed. */
  private updateAim(e: PointerEvent) {
    const aim = this.aim;
    if (!aim) return;
    if (!aim.turning && Math.hypot(e.clientX - aim.startX, e.clientY - aim.startY) < AIM_START_PIXELS) return;
    aim.turning = true;
    const point = raycastGround(mouseToNdc(e, this.domElement), this.getCamera(), this.height);
    if (!point) return;
    const middle = cellToWorld(aim.x, aim.z);
    const dx = point.x - middle.x;
    const dz = point.z - middle.z;
    if (Math.hypot(dx, dz) < 0.3) return;
    // A piece faces +z unturned, +x at 90, -z at 180 and -x at 270.
    const rotation = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 90 : 270) : dz > 0 ? 0 : 180;
    if (rotation === aim.rotation) return;
    aim.rotation = rotation;
    this.renderAim();
  }

  /** The piece being held down, where it'll go, and an arrow round it showing which way it faces and that it can be turned. */
  private renderAim() {
    const aim = this.aim;
    if (!aim) return;
    this.preview.clear();
    const { x, z } = cornerForAnchor(aim.type, aim, aim.rotation);
    const moving = aim.moving;
    const blocked = !this.canPlaceFurniture(aim.type, x, z, aim.rotation, moving?.id);
    const others = this.model.allFurniture().filter((other) => other.id !== moving?.id);
    this.preview.showFurnitureGhost(aim.type, x, z, aim.rotation, blocked, others, moving ? moving.color : this.placingColor(aim.type));
    // Round its anchor, which it turns about, and big enough to take in the whole piece from there.
    const { w, d } = getFurnitureDef(aim.type).footprint;
    this.preview.showTurnIndicator(aim.x, aim.z, aim.rotation, Math.max(d - 0.5, w / 2), blocked ? DELETE_COLOR : RING_COLOR);
  }

  /** Lets go of the piece being held down: it goes down facing the way it was turned, if it fits, and later pieces start out turned that way too. */
  private finishAim() {
    const aim = this.aim;
    this.aim = null;
    if (!aim) return;
    if (aim.moving) {
      // Stays in hand, turned, if it doesn't fit there.
      this.carriedRotation = aim.rotation;
      this.putDown(aim);
      return;
    }
    this.placementRotation = aim.rotation;
    const { x, z } = cornerForAnchor(aim.type, aim, aim.rotation);
    if (!this.canPlaceFurniture(aim.type, x, z, aim.rotation)) return;
    let id = '';
    this.model.batch(() => {
      id = this.model.addFurniture(aim.type, x, z, aim.rotation);
      const color = this.placingColor(aim.type);
      if (color) this.model.setFurnitureColor(id, color);
      if (getFurnitureDef(aim.type).grows) this.model.plantFurniture(id, gameDay());
    });
    this.announceStairs(id);
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.isPointerDown) {
      const worldPoint = this.worldPointFor(e);
      if (worldPoint) {
        const runsLikeWall = this.activeTool === 'wall' || (this.activeTool === 'fence' && !this.fenceGate);
        if (runsLikeWall && this.dragWallMode === 'line') this.updateWallLine(worldPoint);
        else if (runsLikeWall && this.dragWallMode === 'room') this.updateWallRoom(worldPoint);
        else if (this.activeTool === 'floor') this.updateFloorRect(worldPoint);
        else if (this.activeTool === 'pool') this.updatePoolRect(worldPoint);
        else if (this.activeTool === 'window') this.updateWindowStroke(e);
        else if (this.activeTool === 'paint' && this.strokePaintMethod === 'brush') this.paintStroke(e);
        else if (this.isAreaErase()) this.updateEraseArea(worldPoint);
      }
      if (this.aim) this.updateAim(e);
    }
    this.updateHover(e);
  };

  private onPointerUp = (e: PointerEvent) => {
    const actionFinished = this.isPointerDown;
    if (this.aim) this.finishAim();
    if (this.isPointerDown && this.isDragTool()) {
      this.commitDrag();
    } else if (this.isPointerDown && this.isAreaErase()) {
      this.commitEraseArea();
    }
    this.isPointerDown = false;
    this.wallDragAnchor = null;
    this.rectDragAnchor = null;
    this.eraseBounds = null;
    this.lastStrokeNdc = null;
    this.windowStrokeStart = null;
    this.areaClickTarget = null;
    this.onDragSize?.(null);
    if (actionFinished) {
      this.fillPreview = null;
      this.onActionEnd?.();
    }
    // Otherwise the cursor's stick or ghost stays gone until the mouse next moves.
    if (e.target === this.domElement) this.updateHover(e);
  };

  private onPointerLeave = () => {
    this.lastPointer = null;
    // Otherwise a key pressed with the cursor over the menus would act on whatever it last passed over.
    this.hoveredFurniture = undefined;
    this.preview.clear();
  };

  private worldPointFor(e: PointerEvent): THREE.Vector3 | null {
    const ndc = mouseToNdc(e, this.domElement);
    const ground = raycastGround(ndc, this.getCamera(), this.height);
    if (this.wallArtInHand()) {
      // A picture goes on the side of the wall the cursor is on, in the square in front of it.
      const face = this.pickWallFace(ndc);
      if (face && face.heightScale > 0.5) {
        const back = face.facing.x === face.x && face.facing.z === face.z ? 1 : -1;
        this.aimedWallRotation = face.dir === 'N' ? (back > 0 ? 180 : 0) : back > 0 ? 270 : 90;
        const middle = cellToWorld(face.facing.x, face.facing.z);
        return new THREE.Vector3(middle.x, 0, middle.z);
      }
      this.aimedWallRotation = null;
      // Otherwise about at hanging height, not on the floor behind the wall.
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, this.getCamera());
      return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -WALL_ART_AIM_HEIGHT), new THREE.Vector3()) ?? ground;
    }
    return (this.aimsAtTops() && this.pointOnTop(ndc)) || ground;
  }

  /** Whether the cursor should land on the tops of tables and counters rather than the floor: placing or carrying a small thing, or picking one up. */
  private aimsAtTops(): boolean {
    if (this.activeTool === 'furniture') return this.selectedFurnitureType !== null && !!getFurnitureDef(this.selectedFurnitureType).onTop;
    if (this.activeTool === 'move') return !this.carried || !!getFurnitureDef(this.carried.type).onTop;
    return false;
  }

  /** The type of picture in hand, being placed or carried, if it is one. */
  private wallArtInHand(): string | null {
    const type = this.activeTool === 'furniture' ? this.selectedFurnitureType : this.activeTool === 'move' ? this.carried?.type ?? null : null;
    return type && getFurnitureDef(type).onWall ? type : null;
  }

  /** Whether a picture could hang here turned this way: every square needs a plain wall at its back, with no door or window in it. */
  private hasWallBehind(type: string, x: number, z: number, rotation: number): boolean {
    const { dx, dz } = backStep(rotation);
    const dir = dx > 0 ? 'E' : dx < 0 ? 'W' : dz > 0 ? 'N' : 'S';
    return getFootprintCells(type, x, z, rotation).every((cell) => this.model.hasWall(cell.x, cell.z, dir) && !this.model.getAperture(cell.x, cell.z, dir));
  }

  /** Which way a picture should turn to hang on the wall under the cursor, if the cursor is on one. */
  private aimedWallRotation: 0 | 90 | 180 | 270 | null = null;

  /** A picture turns to hang on the wall the cursor is on, or else whichever wall is behind its square, starting with the way it's already turned. */
  private wallFacingRotation(type: string, x: number, z: number, preferred: 0 | 90 | 180 | 270): 0 | 90 | 180 | 270 {
    if (!getFurnitureDef(type).onWall) return preferred;
    if (this.aimedWallRotation !== null && this.hasWallBehind(type, x, z, this.aimedWallRotation)) return this.aimedWallRotation;
    const start = ROTATIONS.indexOf(preferred);
    for (let i = 0; i < 4; i++) {
      const rotation = ROTATIONS[(start + i) % 4];
      if (this.hasWallBehind(type, x, z, rotation)) return rotation;
    }
    return preferred;
  }

  /**
   * Where the cursor meets the top of a table, counter or the like, so a click
   * on a tabletop lands on that table rather than the floor seen behind it.
   * Higher tops come first, since along the line of sight they're nearer.
   */
  private pointOnTop(ndc: THREE.Vector2): THREE.Vector3 | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.getCamera());
    const heights = new Set<number>();
    for (const piece of this.model.allFurniture()) {
      const holds = getFurnitureDef(piece.type).holds;
      if (holds !== undefined) heights.add(holds);
    }
    for (const height of [...heights].sort((a, b) => b - a)) {
      const point = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3());
      if (!point) continue;
      const cell = worldToCell(point.x, point.z);
      const piece = this.findFurnitureAt(cell.x, cell.z, 'standing', this.carried?.id);
      if (piece && getFurnitureDef(piece.type).holds === height) return point;
    }
    return null;
  }

  // --- Wall drag, line mode: one straight run from the starting corner ---

  /** Recomputes the full wall line from the anchor corner, replacing (not
   * adding to) the previous preview — so the line grows, shrinks, or swings
   * around as the cursor moves. It follows whichever axis the cursor has moved
   * further along, so wobble sideways never produces walls going the wrong way. */
  private updateWallLine(worldPoint: THREE.Vector3) {
    const anchor = this.wallDragAnchor;
    if (!anchor) return;
    this.dragWallKeys.clear();

    const cursor = clampCornerToLot(worldToCorner(worldPoint.x, worldPoint.z));
    const alongX = Math.abs(cursor.x - anchor.x) >= Math.abs(cursor.z - anchor.z);
    const end = alongX ? { x: cursor.x, z: anchor.z } : { x: anchor.x, z: cursor.z };
    this.addWallRun(anchor, end);

    const length = Math.abs(end.x - anchor.x) + Math.abs(end.z - anchor.z);
    this.onDragSize?.(length > 0 ? { w: length, h: 1 } : null);
    this.wallDragEnd = end;
    this.renderDragGhosts();
  }

  // --- Wall drag, room mode: builds the 4 perimeter walls of a rectangle ---

  private updateWallRoom(worldPoint: THREE.Vector3) {
    const anchor = this.wallDragAnchor;
    if (!anchor) return;
    this.dragWallKeys.clear();

    const end = clampCornerToLot(worldToCorner(worldPoint.x, worldPoint.z));
    const width = Math.abs(end.x - anchor.x);
    const depth = Math.abs(end.z - anchor.z);
    // Two corners in the same row or column don't make a room yet.
    if (width > 0 && depth > 0) {
      this.addWallRun(anchor, { x: end.x, z: anchor.z });
      this.addWallRun(anchor, { x: anchor.x, z: end.z });
      this.addWallRun(end, { x: end.x, z: anchor.z });
      this.addWallRun(end, { x: anchor.x, z: end.z });
    }
    this.onDragSize?.(width > 0 && depth > 0 ? { w: width, h: depth } : null);
    this.wallDragEnd = end;
    this.renderDragGhosts();
  }

  /** Adds the walls along one grid line between two corners in the same row or column. */
  private addWallRun(from: Corner, to: Corner) {
    for (let x = Math.min(from.x, to.x); x < Math.max(from.x, to.x); x++) this.addWallToDrag(x, from.z, 'S');
    for (let z = Math.min(from.z, to.z); z < Math.max(from.z, to.z); z++) this.addWallToDrag(from.x, z, 'W');
  }

  private addWallToDrag(x: number, z: number, dir: Direction) {
    if (this.dragErasing) {
      // Taking away: only what's actually there.
      const there = this.activeTool === 'fence' ? this.model.hasFence(x, z, dir) : this.model.hasWall(x, z, dir);
      if (there) this.dragWallKeys.set(`${x},${z},${dir}`, { x, z, dir });
      return;
    }
    if (this.model.hasWall(x, z, dir)) return;
    this.dragWallKeys.set(`${x},${z},${dir}`, { x, z, dir });
  }

  // --- Floor drag: rectangle fill between the drag anchor and the cursor ---

  /** Recomputes the full rectangle of cells between the drag anchor and the
   * current cursor cell, replacing the previous preview — same "grows,
   * shrinks, always ends exactly at the cursor" behavior as the wall line,
   * but filling a 2D block instead of a 1D line. */
  private updateFloorRect(worldPoint: THREE.Vector3) {
    const anchor = this.rectDragAnchor;
    if (!anchor) return;
    this.dragFloorKeys.clear();

    const { x: cellX, z: cellZ } = clampCellToLot(worldToCell(worldPoint.x, worldPoint.z));
    const loX = Math.min(anchor.x, cellX);
    const hiX = Math.max(anchor.x, cellX);
    const loZ = Math.min(anchor.z, cellZ);
    const hiZ = Math.max(anchor.z, cellZ);
    for (let x = loX; x <= hiX; x++) {
      for (let z = loZ; z <= hiZ; z++) {
        if (this.dragErasing ? this.model.hasFloor(x, z) : this.wouldLay(x, z)) this.dragFloorKeys.set(`${x},${z}`, { x, z });
      }
    }
    this.onDragSize?.({ w: hiX - loX + 1, h: hiZ - loZ + 1 });
    this.renderDragGhosts();
  }

  /** A rectangle of pool, or of squares to fill back in with Ctrl held, from where the drag started to here. A click is a rectangle of one. */
  private updatePoolRect(worldPoint: THREE.Vector3) {
    const anchor = this.rectDragAnchor;
    if (!anchor) return;
    this.dragFloorKeys.clear();
    const { x: cellX, z: cellZ } = clampCellToLot(worldToCell(worldPoint.x, worldPoint.z));
    const [loX, hiX] = [Math.min(anchor.x, cellX), Math.max(anchor.x, cellX)];
    const [loZ, hiZ] = [Math.min(anchor.z, cellZ), Math.max(anchor.z, cellZ)];
    for (let x = loX; x <= hiX; x++) {
      for (let z = loZ; z <= hiZ; z++) {
        if (this.dragErasing ? this.model.hasPool(x, z) : this.wouldDig(x, z)) this.dragFloorKeys.set(`${x},${z}`, { x, z });
      }
    }
    this.onDragSize?.({ w: hiX - loX + 1, h: hiZ - loZ + 1 });
    this.renderDragGhosts();
  }

  /** Whether the Pool tool would do anything here: dig a new square, on the ground and clear of tiles and furniture, or change one to the other kind. */
  private wouldDig(x: number, z: number): boolean {
    if (this.model.rules || !isCellInLot(x, z) || this.model.hasFloor(x, z)) return false;
    const pool = this.model.getPool(x, z);
    if (pool) return pool.kind !== this.selectedPoolKind;
    return !this.model.poolBlocker?.(x, z);
  }

  /** Whether the Floor tool would do anything here: lay a tile where something holds one up, or change a tile to the picked surface. */
  private wouldLay(x: number, z: number): boolean {
    const tile = this.model.getFloor(x, z);
    if (tile) return (tile.surface ?? 'plain') !== this.selectedSurface;
    return isCellInLot(x, z) && (this.model.rules?.canFloor(x, z) ?? true);
  }

  // --- Floor flood: click to tile all connected bare ground, up to the walls ---

  private floodFloor(start: Cell) {
    const cells = this.floorFloodRegion(start);
    this.model.batch(() => {
      for (const { x, z } of cells) this.model.setFloor(x, z, this.selectedSurface);
    });
  }

  /** Bare ground up to the walls, or upstairs, as far as it's held up. */
  private floorFloodRegion(start: Cell): Cell[] {
    return connectedCells(this.model, start, ({ x, z }) => isCellInLot(x, z) && !this.model.hasFloor(x, z) && (this.model.rules?.canFloor(x, z) ?? true));
  }

  // --- Window stroke: drag along walls, let go to put windows in all of them ---

  private updateWindowStroke(e: PointerEvent) {
    for (const sample of this.strokeSamples(e)) {
      const wall = this.wallFaceAt(sample);
      if (!wall) continue;
      const key = wallKey(wall.x, wall.z, wall.dir);
      this.windowStrokeStart ??= key;
      // Sweeping past a door shouldn't wall the pawn in; starting on one is a deliberate choice to replace it.
      const isDoor = this.model.getAperture(wall.x, wall.z, wall.dir)?.kind === 'door';
      if (isDoor && key !== this.windowStrokeStart) continue;
      this.dragWallKeys.set(key, { x: wall.x, z: wall.z, dir: wall.dir });
    }
    this.onDragSize?.(this.dragWallKeys.size > 1 ? { w: this.dragWallKeys.size, h: 1 } : null);
    this.renderDragGhosts();
  }

  // --- Paint: applies the selected color directly, no preview/commit split
  // needed since repainting is always reversible (just paint over it again) ---

  private paintPress(e: PointerEvent, worldPoint: THREE.Vector3) {
    if (this.strokePaintMethod === 'brush') {
      this.paintStroke(e);
    } else if (this.strokePaintMethod === 'bucket') {
      const { faces, cells, gables, fences } = this.fillRegionAt(mouseToNdc(e, this.domElement), worldPoint);
      if (gables) gables.pick.model.batch(() => { for (const strip of gables.strips) this.paintGable(gables.pick.model, strip); });
      this.model.batch(() => {
        for (const fence of fences ?? []) this.paintFence(fence);
        for (const face of faces) this.model.paintWallFace(face.x, face.z, face.dir, face.facing, this.selectedPaintColor);
        for (const { x, z } of cells) this.model.paintFloor(x, z, this.selectedPaintColor);
      });
    } else {
      this.sampleColor(mouseToNdc(e, this.domElement), worldPoint);
    }
  }

  /** Paints every wall side (or floor cell) the cursor crossed since the last
   * pointer event, so a fast brush stroke doesn't skip over anything in
   * between. Only touches `paintTarget`, never both at once. */
  private paintStroke(e: PointerEvent) {
    const samples = this.strokeSamples(e);
    this.model.batch(() => {
      for (const sample of samples) {
        if (this.paintTarget === 'wall') {
          const spot = this.paintSpotAt(sample);
          if (spot?.kind === 'wall') this.model.paintWallFace(spot.face.x, spot.face.z, spot.face.dir, spot.face.facing, this.selectedPaintColor);
          else if (spot?.kind === 'fence') this.paintFence(spot.fence);
          else if (spot) this.paintGable(spot.gable.model, spot.gable.strip);
        } else {
          const point = raycastGround(sample, this.getCamera(), this.height);
          if (!point) continue;
          const { x, z } = worldToCell(point.x, point.z);
          this.model.paintFloor(x, z, this.selectedPaintColor);
        }
      }
    });
  }

  /** Screen positions from the last stroke position to this event's, advancing the stroke. */
  private strokeSamples(e: PointerEvent): THREE.Vector2[] {
    const to = mouseToNdc(e, this.domElement);
    const from = this.lastStrokeNdc ?? to;
    this.lastStrokeNdc = to;
    const steps = Math.max(1, Math.ceil(from.distanceTo(to) / STROKE_SAMPLE_SPACING));
    return Array.from({ length: steps }, (_, step) => from.clone().lerp(to, (step + 1) / steps));
  }

  /** What a bucket click here would repaint: same-colored wall sides looking into the same space, or connected same-colored tiles. */
  private fillRegionAt(ndc: THREE.Vector2, worldPoint: THREE.Vector3): FillPreview {
    if (this.paintTarget === 'wall') {
      const spot = this.paintSpotAt(ndc);
      if (!spot) return { key: 'none', faces: [], cells: [] };
      if (spot.kind === 'fence') {
        const key = `fence|${wallKey(spot.fence.x, spot.fence.z, spot.fence.dir)}`;
        if (this.fillPreview?.key === key) return this.fillPreview;
        return { key, faces: [], cells: [], fences: this.fenceRun(spot.fence) };
      }
      if (spot.kind === 'gable') {
        const { model, strip } = spot.gable;
        // Which floor's roof it's on shows in how high the roof sits.
        const key = `gable|${spot.gable.toWorld.elements[13]}|${strip.x},${strip.z},${strip.dir}`;
        if (this.fillPreview?.key === key) return this.fillPreview;
        return { key, faces: [], cells: [], gables: { pick: spot.gable, strips: gableEnd(model, strip, spot.gable.strips) } };
      }
      const face = spot.face;
      const key = `wall|${wallKey(face.x, face.z, face.dir)}|${face.facing.x},${face.facing.z}`;
      if (this.fillPreview?.key === key) return this.fillPreview;
      return { key, faces: this.wallFacesToFill(face), cells: [] };
    }
    const start = worldToCell(worldPoint.x, worldPoint.z);
    const key = `floor|${start.x},${start.z}`;
    if (this.fillPreview?.key === key) return this.fillPreview;
    const color = this.floorColorAt(start);
    const cells = connectedCells(this.model, start, (cell) => this.model.hasFloor(cell.x, cell.z) && this.floorColorAt(cell) === color);
    return { key, faces: [], cells };
  }

  private wallFacesToFill(start: WallFace): WallFace[] {
    const color = this.wallColorOf(start);
    const heightScales = new Map(this.wallGroup.children.map((child) => {
      const wall = child.userData.wall as WallSegment;
      return [wallKey(wall.x, wall.z, wall.dir), child.scale.y];
    }));
    const faces: WallFace[] = [];
    for (const cell of connectedCells(this.model, start.facing)) {
      for (const { dir } of STEPS) {
        if (!this.model.hasWall(cell.x, cell.z, dir)) continue;
        const face = { x: cell.x, z: cell.z, dir, facing: cell, heightScale: heightScales.get(wallKey(cell.x, cell.z, dir)) ?? 1 };
        if (this.wallColorOf(face) === color) faces.push(face);
      }
    }
    return faces;
  }

  private wallColorOf(face: WallFace): string {
    return this.model.wallFaceColor(face.x, face.z, face.dir, face.facing) ?? WALL_COLOR;
  }

  private floorColorAt({ x, z }: Cell): string {
    const tile = this.model.getFloor(x, z);
    return tile?.color ?? surfaceColor(tile?.surface ?? 'plain');
  }

  /** Picks up the color of the wall side or floor tile under the cursor. A wall in front of the floor wins, because that's what you're pointing at. */
  private sampleColor(ndc: THREE.Vector2, worldPoint: THREE.Vector3) {
    const spot = this.paintSpotAt(ndc, false);
    const cell = worldToCell(worldPoint.x, worldPoint.z);
    if (!spot && !this.model.hasFloor(cell.x, cell.z)) return;
    this.selectedPaintColor =
      spot?.kind === 'wall' ? this.wallColorOf(spot.face) : spot?.kind === 'fence' ? spot.fence.color ?? fenceColor(spot.fence.style) : spot ? gableColor(spot.gable.model, spot.gable.strip) : this.floorColorAt(cell);
    this.paintTarget = spot ? 'wall' : 'floor';
    this.setPaintMethod(this.methodBeforeSample);
    // Otherwise moving the mouse before letting go would start painting with the new color.
    this.isPointerDown = false;
    this.onColorSampled?.();
  }

  // --- Delete, area mode: drag a square, release to remove everything in it ---

  private updateEraseArea(worldPoint: THREE.Vector3) {
    const anchor = this.rectDragAnchor;
    if (!anchor) return;
    const { x: cellX, z: cellZ } = worldToCell(worldPoint.x, worldPoint.z);
    this.eraseBounds = {
      loX: Math.min(anchor.x, cellX),
      hiX: Math.max(anchor.x, cellX),
      loZ: Math.min(anchor.z, cellZ),
      hiZ: Math.max(anchor.z, cellZ),
    };
    const { loX, hiX, loZ, hiZ } = this.eraseBounds;
    const width = hiX - loX + 1;
    const depth = hiZ - loZ + 1;
    this.preview.clear();
    if (width === 1 && depth === 1) {
      this.onDragSize?.(null);
      this.showDeleteTarget(this.areaClickTarget);
    } else {
      this.onDragSize?.({ w: width, h: depth });
      this.showEraseArea(this.eraseBounds);
    }
  }

  private showEraseArea(bounds: CellBounds) {
    // Only what's going to go is red, so a square drawn just to catch furniture doesn't look like it'll take the floor too.
    const areaColor = this.isDeletingFurnitureOnly() ? RING_COLOR : DELETE_COLOR;
    this.preview.showFloorGhosts(cellsIn(bounds), areaColor);
    if (!this.isDeletingFurnitureOnly()) {
      this.preview.showWallGhosts(this.wallsIn(bounds), DELETE_COLOR);
      this.preview.showWallGhosts(this.fencesIn(bounds), DELETE_COLOR, FENCE_GHOST_HEIGHT);
      for (const pillar of this.pillarsIn(bounds)) this.preview.showPillarGhost(pillar.x, pillar.z, pillar.style, DELETE_COLOR);
    }
    for (const piece of this.furnitureIn(bounds)) {
      const offset = getFootprintCenterOffset(piece.type, piece.rotation);
      this.preview.showRing(piece.x + offset.dx, piece.z + offset.dz, DELETE_COLOR);
    }
    for (const id of this.messesIn(bounds)) {
      const cell = this.messes?.cellOf(id);
      if (cell) this.preview.showRing(cell.x, cell.z, DELETE_COLOR);
    }
  }

  private commitEraseArea() {
    const bounds = this.eraseBounds;
    if (!bounds) return;
    // A click, not a drag: erasing the whole cell would also take its floor and all four of its walls.
    if (bounds.loX === bounds.hiX && bounds.loZ === bounds.hiZ) {
      this.applyDelete(this.areaClickTarget);
      this.preview.clear();
      return;
    }
    const walls = this.wallsIn(bounds);
    const fences = this.fencesIn(bounds);
    const pillars = this.pillarsIn(bounds);
    const furniture = this.furnitureIn(bounds);
    for (const id of this.messesIn(bounds)) this.messes?.remove(id);
    const furnitureOnly = this.isDeletingFurnitureOnly();
    this.model.batch(() => {
      if (!furnitureOnly) {
        for (const { x, z, dir } of walls) this.model.removeWall(x, z, dir);
        for (const { x, z, dir } of fences) this.model.removeFence(x, z, dir);
        for (const { x, z } of pillars) this.model.removePillar(x, z);
        for (const { x, z } of cellsIn(bounds)) {
          this.model.removeFloor(x, z);
          this.model.removePool(x, z);
        }
      }
      for (const piece of furniture) this.removePiece(piece.id);
    });
    this.preview.clear();
  }

  /** Includes the square's outer edge, so selecting a room's cells also takes the walls around it. */
  private wallsIn(bounds: CellBounds): { x: number; z: number; dir: Direction }[] {
    const found = new Map<string, { x: number; z: number; dir: Direction }>();
    for (const { x, z } of cellsIn(bounds)) {
      for (const dir of ['N', 'E', 'S', 'W'] as Direction[]) {
        if (this.model.hasWall(x, z, dir)) found.set(wallKey(x, z, dir), { x, z, dir });
      }
    }
    return Array.from(found.values());
  }

  /** The fences round and inside the square, like its walls. */
  private fencesIn(bounds: CellBounds): { x: number; z: number; dir: Direction }[] {
    const found = new Map<string, { x: number; z: number; dir: Direction }>();
    for (const { x, z } of cellsIn(bounds)) {
      for (const dir of ['N', 'E', 'S', 'W'] as Direction[]) {
        if (this.model.hasFence(x, z, dir)) found.set(wallKey(x, z, dir), { x, z, dir });
      }
    }
    return Array.from(found.values());
  }

  /** The pillars on the corners of the square, inside and round its edge. */
  private pillarsIn({ loX, hiX, loZ, hiZ }: CellBounds) {
    return this.model.allPillars().filter((pillar) => pillar.x >= loX && pillar.x <= hiX + 1 && pillar.z >= loZ && pillar.z <= hiZ + 1);
  }

  /** The pillar on the corner nearest the cursor, if it's close enough to that corner. */
  private pillarNear(worldPoint: THREE.Vector3) {
    const corner = worldToCorner(worldPoint.x, worldPoint.z);
    const pillar = this.model.allPillars().find((each) => each.x === corner.x && each.z === corner.z);
    if (!pillar) return undefined;
    const at = cornerToWorld(corner.x, corner.z);
    return Math.hypot(at.x - worldPoint.x, at.z - worldPoint.z) <= PILLAR_REACH ? pillar : undefined;
  }

  /** Turns the length of fence nearest the cursor into a gate, or a gate back into fence. */
  private toggleGate(worldPoint: THREE.Vector3) {
    const edge = worldToEdge(worldPoint.x, worldPoint.z);
    const fence = this.model.getFence(edge.x, edge.z, edge.dir);
    if (fence) this.model.setFence(edge.x, edge.z, edge.dir, fence.style, !fence.gate);
  }

  private furnitureIn({ loX, hiX, loZ, hiZ }: CellBounds): FurniturePiece[] {
    return this.model.allFurniture().filter((piece) =>
      getFootprintCells(piece.type, piece.x, piece.z, piece.rotation).some(
        (cell) => cell.x >= loX && cell.x <= hiX && cell.z >= loZ && cell.z <= hiZ,
      ),
    );
  }

  /** The side of the wall actually under the cursor, so pointing anywhere on a wall targets it rather than the ground behind it. */
  private pickWallFace(ndc: THREE.Vector2): WallFace | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.getCamera());
    return this.wallHit(raycaster)?.face ?? null;
  }

  /** Paints a strip of gable. Painting it the color of the wall below takes the paint off, so it goes back to following the wall. */
  private paintGable(model: GridModel, strip: GableStrip) {
    const color = this.selectedPaintColor;
    model.paintGable(strip.x, strip.z, strip.dir, color === wallBelowColor(model, strip) ? undefined : color);
  }

  /**
   * The wall side or gable end under the cursor, whichever is nearer. With
   * `orGround`, a wall on the grid edge nearest the cursor on the ground
   * counts too, so walls cut down low can still be painted.
   */
  private paintSpotAt(ndc: THREE.Vector2, orGround = true): PaintSpot | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.getCamera());
    const wall = this.wallHit(raycaster);
    const gable = this.gablePicker?.(raycaster) ?? null;
    const fence = this.fenceAt(ndc);
    if (fence && (!wall || fence.distance < wall.distance) && (!gable || fence.distance < gable.distance)) return { kind: 'fence', fence };
    if (gable && (!wall || gable.distance < wall.distance)) return { kind: 'gable', gable };
    if (wall) return { kind: 'wall', face: wall.face };
    const face = orGround ? this.wallFaceAt(ndc) : null;
    return face ? { kind: 'wall', face } : null;
  }

  private wallHit(raycaster: THREE.Raycaster): { face: WallFace; distance: number } | null {
    // Walls rebuilt since the last frame don't have their world positions yet.
    this.wallGroup.updateWorldMatrix(true, true);
    const hit = raycaster.intersectObject(this.wallGroup, true)[0];
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && !object.userData.wall) object = object.parent;
    if (!hit?.face || !object) return null;

    const wall = object.userData.wall as WallSegment;
    const towardNeighbor = wall.dir === 'N' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const lean = normal.dot(towardNeighbor);
    // The top and ends belong to neither side, so they count as whichever side is facing the camera.
    const facesNeighbor = Math.abs(lean) > 0.5 ? lean > 0 : raycaster.ray.direction.dot(towardNeighbor) < 0;
    const [owner, neighbor] = wallSides(wall.x, wall.z, wall.dir);
    return { face: { x: wall.x, z: wall.z, dir: wall.dir, facing: facesNeighbor ? neighbor : owner, heightScale: object.scale.y }, distance: hit.distance };
  }

  /** The wall side under the cursor, or else the wall on the nearest grid edge on the ground, seen from the cell the cursor is in. */
  private wallFaceAt(ndc: THREE.Vector2): WallFace | null {
    const picked = this.pickWallFace(ndc);
    if (picked) return picked;
    const point = raycastGround(ndc, this.getCamera(), this.height);
    if (!point) return null;
    const { x, z, dir } = worldToEdge(point.x, point.z);
    if (!this.model.hasWall(x, z, dir)) return null;
    const key = wallKey(x, z, dir);
    const wall = this.wallGroup.children.find((child) => {
      const seg = child.userData.wall as WallSegment;
      return wallKey(seg.x, seg.z, seg.dir) === key;
    });
    return { x, z, dir, facing: { x, z }, heightScale: wall?.scale.y ?? 1 };
  }

  private renderDragGhosts() {
    this.preview.clear();
    if (this.activeTool === 'wall' || this.activeTool === 'fence') {
      this.preview.showWallGhosts(Array.from(this.dragWallKeys.values()), this.dragErasing ? DELETE_COLOR : ADD_COLOR, this.activeTool === 'fence' ? FENCE_GHOST_HEIGHT : undefined);
      if (this.wallDragAnchor) this.preview.showCornerStick(this.wallDragAnchor.x, this.wallDragAnchor.z);
      if (this.wallDragEnd) this.preview.showCornerStick(this.wallDragEnd.x, this.wallDragEnd.z);
    } else if (this.activeTool === 'window') {
      this.preview.showWallGhosts(Array.from(this.dragWallKeys.values()));
    } else if (this.activeTool === 'floor') {
      this.preview.showFloorGhosts(Array.from(this.dragFloorKeys.values()), this.dragErasing ? DELETE_COLOR : ADD_COLOR);
    } else if (this.activeTool === 'pool') {
      this.preview.showFloorGhosts(Array.from(this.dragFloorKeys.values()), this.dragErasing ? DELETE_COLOR : POOL_COLOR);
    }
  }

  private commitDrag() {
    if (this.dragErasing && (this.dragWallKeys.size > 0 || this.dragFloorKeys.size > 0)) {
      this.model.batch(() => {
        for (const { x, z, dir } of this.dragWallKeys.values()) {
          if (this.activeTool === 'fence') this.model.removeFence(x, z, dir);
          else this.model.removeWall(x, z, dir);
        }
        for (const { x, z } of this.dragFloorKeys.values()) {
          if (this.activeTool === 'pool') this.model.removePool(x, z);
          else this.model.removeFloor(x, z);
        }
      });
    } else if (this.activeTool === 'wall' && this.dragWallKeys.size > 0) {
      this.model.batch(() => {
        for (const { x, z, dir } of this.dragWallKeys.values()) {
          this.model.setWall(x, z, dir);
        }
      });
    } else if (this.activeTool === 'fence' && this.dragWallKeys.size > 0) {
      this.model.batch(() => {
        for (const { x, z, dir } of this.dragWallKeys.values()) this.model.setFence(x, z, dir, this.selectedFenceStyle);
      });
    } else if (this.activeTool === 'fence' && this.fencePressed && !this.dragErasing) {
      this.restyleFence(this.fencePressed);
    } else if (this.activeTool === 'window' && this.dragWallKeys.size > 0) {
      this.model.batch(() => {
        for (const { x, z, dir } of this.dragWallKeys.values()) {
          this.model.placeAperture(x, z, dir, 'window', this.selectedWindowSize);
        }
      });
    } else if (this.activeTool === 'pool' && this.dragFloorKeys.size > 0) {
      this.model.batch(() => {
        for (const { x, z } of this.dragFloorKeys.values()) this.model.setPool(x, z, this.selectedPoolKind);
      });
    } else if (this.activeTool === 'floor' && this.dragFloorKeys.size > 0) {
      this.model.batch(() => {
        for (const { x, z } of this.dragFloorKeys.values()) {
          this.model.setFloor(x, z, this.selectedSurface);
        }
      });
    }
    this.dragWallKeys.clear();
    this.dragFloorKeys.clear();
    this.preview.clear();
  }

  // --- Single-click tools: door, furniture ---

  private commitSingleAction(worldPoint: THREE.Vector3, e: PointerEvent) {
    const tool = this.activeTool;
    switch (tool) {
      case 'door': {
        const wall = this.snapToWall(worldPoint, e);
        if (wall) this.model.placeAperture(wall.x, wall.z, wall.dir, 'door', undefined, this.selectedDoorStyle);
        break;
      }
      case 'pillar': {
        const corner = worldToCorner(worldPoint.x, worldPoint.z);
        if (!isCornerInLot(corner.x, corner.z)) break;
        if (this.dragErasing) this.model.removePillar(corner.x, corner.z);
        else this.model.setPillar(corner.x, corner.z, this.selectedPillarStyle);
        break;
      }
      case 'furniture': {
        const { x, z } = worldToCell(worldPoint.x, worldPoint.z);
        const type = this.selectedFurnitureType;
        const rotation = type ? this.wallFacingRotation(type, x, z, this.placementRotation) : this.placementRotation;
        if (type && this.canPlaceFurniture(type, x, z, rotation)) {
          let id = '';
          this.model.batch(() => {
            id = this.model.addFurniture(type, x, z, rotation);
            const color = this.placingColor(type);
            if (color) this.model.setFurnitureColor(id, color);
            if (getFurnitureDef(type).grows) this.model.plantFurniture(id, gameDay());
          });
          this.announceStairs(id);
        }
        break;
      }
      case 'move': {
        // One click picks a piece up, the next puts it down.
        const cell = worldToCell(worldPoint.x, worldPoint.z);
        if (this.carried) {
          this.putDown(cell);
          break;
        }
        const piece = this.pieceUnderCursor(e) ?? this.findFurnitureAt(cell.x, cell.z);
        if (piece) this.pickUp(piece);
        break;
      }
    }
  }

  /** The wall under the cursor, or at the nearest grid edge on the ground; null when there's no wall to attach to. */
  private snapToWall(worldPoint: THREE.Vector3, e: PointerEvent): { x: number; z: number; dir: Direction } | null {
    const visibleWall = this.pickWallFace(mouseToNdc(e, this.domElement));
    if (visibleWall) return { x: visibleWall.x, z: visibleWall.z, dir: visibleWall.dir };
    const edge = worldToEdge(worldPoint.x, worldPoint.z);
    return this.model.hasWall(edge.x, edge.z, edge.dir) ? edge : null;
  }

  private applyDelete(target: DeleteTarget) {
    if (!target) return;
    if (target.kind === 'furniture') this.removePiece(target.id);
    else if (target.kind === 'pillar') this.model.removePillar(target.x, target.z);
    else if (target.kind === 'aperture') this.model.removeAperture(target.x, target.z, target.dir);
    else if (target.kind === 'wall') this.model.removeWall(target.x, target.z, target.dir);
    else if (target.kind === 'fence') this.model.removeFence(target.x, target.z, target.dir);
    else if (target.kind === 'railing') this.model.removeRailing(target.x, target.z, target.dir);
    else if (target.kind === 'mess') this.messes?.remove(target.id);
    else if (target.kind === 'pool') this.model.removePool(target.x, target.z);
    else this.model.removeFloor(target.x, target.z);
  }

  /** The messes the Delete tool can take inside an area, when Mode controls lets it. */
  private messesIn(bounds: CellBounds): string[] {
    return this.selectMesses && this.messes ? this.messes.inArea(bounds) : [];
  }

  private resolveDeleteTarget(worldPoint: THREE.Vector3, e: PointerEvent): DeleteTarget {
    const { x: cx, z: cz } = worldToCell(worldPoint.x, worldPoint.z);
    // A plate lies on a table and dirt on the floor, so pointing at one gets it rather than what it's on.
    if (this.selectMesses && this.messes) {
      const id = this.messes.at(mouseToNdc(e, this.domElement));
      const cell = id ? this.messes.cellOf(id) : null;
      if (id && cell) return { kind: 'mess', id, ...cell };
    }
    const furniture = this.pieceUnderCursor(e) ?? this.findFurnitureAt(cx, cz);
    if (furniture) {
      return {
        kind: 'furniture',
        id: furniture.id,
        type: furniture.type,
        x: furniture.x,
        z: furniture.z,
        rotation: furniture.rotation,
      };
    }
    if (this.isDeletingFurnitureOnly()) return null;

    // A pillar often stands at the end of a wall, so pointing right at it gets the pillar.
    const pillar = this.pillarNear(worldPoint);
    if (pillar) return { kind: 'pillar', ...pillar };

    const wall = this.snapToWall(worldPoint, e);
    if (wall) {
      // A door or window goes first, leaving the wall it was attached to.
      const kind = this.model.getAperture(wall.x, wall.z, wall.dir) ? 'aperture' : 'wall';
      return { kind, x: wall.x, z: wall.z, dir: wall.dir };
    }

    const edge = worldToEdge(worldPoint.x, worldPoint.z);
    if (this.model.hasFence(edge.x, edge.z, edge.dir)) return { kind: 'fence', ...edge };
    const railing = this.fenceAt(mouseToNdc(e, this.domElement));
    if (railing?.auto) return { kind: 'railing', x: railing.x, z: railing.z, dir: railing.dir };

    if (this.model.hasFloor(cx, cz)) return { kind: 'floor', x: cx, z: cz };
    if (this.model.hasPool(cx, cz)) return { kind: 'pool', x: cx, z: cz };
    return null;
  }

  /** Finds the furniture piece (if any) whose footprint covers this cell —
   * not just the one piece whose anchor is exactly here, so a bed, table, or
   * sofa responds to a click anywhere on its visible footprint. */
  /** A lamp on a table comes before the table, and a piece standing on a rug before the rug, so a click gets the one on top. Pass `layer` to look only in that layer. */
  private findFurnitureAt(x: number, z: number, layer?: FurnitureLayer, ignoreId?: string): FurniturePiece | undefined {
    const found: Partial<Record<FurnitureLayer, FurniturePiece>> = {};
    for (const piece of this.model.allFurniture()) {
      if (piece.id === ignoreId) continue;
      const pieceLayer = layerOf(piece.type);
      if (layer !== undefined && pieceLayer !== layer) continue;
      const cells = getFootprintCells(piece.type, piece.x, piece.z, piece.rotation);
      if (!cells.some((c) => c.x === x && c.z === z)) continue;
      found[pieceLayer] ??= piece;
    }
    return found.top ?? found.standing ?? found.wall ?? found.ceiling ?? found.floor;
  }

  /** The piece drawn under the cursor, if the scene can say. */
  private pieceUnderCursor(e: PointerEvent): FurniturePiece | undefined {
    return this.pickFurniture?.(mouseToNdc(e, this.domElement));
  }

  /** Whether something on this square has a top that small things can be set on. */
  private holdsThingsAt(x: number, z: number, ignoreId?: string): boolean {
    const piece = this.findFurnitureAt(x, z, 'standing', ignoreId);
    return piece !== undefined && getFurnitureDef(piece.type).holds !== undefined;
  }

  /** True if placing `type` at (x,z) would overlap any existing piece's
   * footprint — checked over the new piece's own full footprint, not just
   * its anchor cell, so a 2-cell piece can't be dropped half onto another.
   * Rugs only clash with rugs, small things on tables with each other, and everything else with everything else. */
  private wouldOverlapFurniture(type: string, x: number, z: number, rotation: number, ignoreId?: string): boolean {
    const layer = layerOf(type);
    return getFootprintCells(type, x, z, rotation).some((c) => this.findFurnitureAt(c.x, c.z, layer, ignoreId) !== undefined);
  }

  /** Pass `ignoreId` for a piece being moved, which isn't in its own way. */
  private canPlaceFurniture(type: string, x: number, z: number, rotation = this.placementRotation, ignoreId?: string): boolean {
    const cells = getFootprintCells(type, x, z, rotation);
    const insideLot = cells.every((cell) => isCellInLot(cell.x, cell.z));
    // A small thing needs a table, counter or the like under it.
    const supported = !getFurnitureDef(type).onTop || cells.every((cell) => this.holdsThingsAt(cell.x, cell.z, ignoreId));
    // A picture needs a wall to hang on.
    const hung = !getFurnitureDef(type).onWall || this.hasWallBehind(type, x, z, rotation);
    // A ceiling light needs a ceiling: a room, not the yard.
    const roofed = !getFurnitureDef(type).onCeiling || cells.every((cell) => this.model.roomIdAt(cell.x, cell.z) !== 0);
    const allowed = !this.furnitureRule || this.furnitureRule(type, cells);
    return insideLot && supported && hung && roofed && allowed && this.fitsPool(type, x, z, rotation) && !this.crossesWall(cells) && !this.wouldOverlapFurniture(type, x, z, rotation, ignoreId);
  }

  /**
   * Pool things go with a pool: a ladder on the edge facing the water, pool
   * stairs down in the water against the edge, a diving board standing on the
   * edge and reaching out over the water. Anything else keeps out of the water,
   * except what hangs overhead.
   */
  private fitsPool(type: string, x: number, z: number, rotation: number): boolean {
    const def = getFurnitureDef(type);
    const { w, d } = def.footprint;
    const wet = (i: number, j: number) => {
      const cell = pieceSquare(type, x, z, rotation, [i, j]);
      return this.model.hasPool(cell.x, cell.z);
    };
    const across = Array.from({ length: w }, (_, i) => i);
    const along = Array.from({ length: d }, (_, j) => j);
    if (def.pool === 'edge') return across.every((i) => along.every((j) => !wet(i, j)) && wet(i, d));
    if (def.pool === 'inside') return across.every((i) => along.every((j) => wet(i, j)) && !wet(i, -1));
    if (def.pool === 'over') return across.every((i) => !wet(i, 0) && along.slice(1).every((j) => wet(i, j)));
    if (def.onCeiling || def.onWall) return true;
    return !across.some((i) => along.some((j) => wet(i, j)));
  }

  /** Whether a wall, door or window runs between two squares of the same piece, which would leave it half in one room and half in the next. */
  private crossesWall(cells: { x: number; z: number }[]): boolean {
    const inPiece = new Set(cells.map(({ x, z }) => `${x},${z}`));
    return cells.some(({ x, z }) => (inPiece.has(`${x + 1},${z}`) && this.model.hasWall(x, z, 'E')) || (inPiece.has(`${x},${z + 1}`) && this.model.hasWall(x, z, 'N')));
  }

  // --- Hover preview: always-on feedback for whatever the cursor is over ---

  private updateHover(e: PointerEvent) {
    this.lastPointer = e;
    const worldPoint = this.worldPointFor(e);
    if (!worldPoint) {
      this.preview.clear();
      this.hoveredFurniture = undefined;
      return;
    }

    const hoverCell = worldToCell(worldPoint.x, worldPoint.z);
    // While placing, only what the new piece would clash with counts, so a chair can still go down on a rug.
    // With the eyedropper, nothing's in hand: it points at pieces to pick up.
    const held = this.activeTool === 'furniture' && !this.isPickingFurniture(e) ? this.selectedFurnitureType : null;
    // While carrying, R and Delete act on what's in hand, not what's under it.
    if (this.carried) this.hoveredFurniture = undefined;
    else this.hoveredFurniture = held ? this.findFurnitureAt(hoverCell.x, hoverCell.z, layerOf(held)) : this.pieceUnderCursor(e) ?? this.findFurnitureAt(hoverCell.x, hoverCell.z);

    if (this.isPointerDown) return; // drag ghosts are already drawn by the active drag handler

    this.preview.clear();
    switch (this.activeTool) {
      case 'wall': {
        const corner = worldToCorner(worldPoint.x, worldPoint.z);
        if (isCornerInLot(corner.x, corner.z)) this.preview.showCornerStick(corner.x, corner.z);
        break;
      }
      case 'fence': {
        if (this.fenceGate) {
          const edge = worldToEdge(worldPoint.x, worldPoint.z);
          if (this.model.hasFence(edge.x, edge.z, edge.dir)) this.preview.showWallGhosts([edge], RING_COLOR, FENCE_GHOST_HEIGHT);
          break;
        }
        const corner = worldToCorner(worldPoint.x, worldPoint.z);
        if (isCornerInLot(corner.x, corner.z)) this.preview.showCornerStick(corner.x, corner.z);
        // A fence in another style can be clicked to change it to this one.
        const fence = e.ctrlKey || e.metaKey ? null : this.fenceAt(mouseToNdc(e, this.domElement));
        if (fence && fence.style !== this.selectedFenceStyle) this.preview.showWallGhosts([fence], RING_COLOR, FENCE_GHOST_HEIGHT);
        break;
      }
      case 'roof': {
        // A room at a time: the room a click would roof.
        if (this.roofForRoom === undefined) break;
        const room = this.roomCellsAt(this.roofCellAt(e) ?? hoverCell);
        if (room.length > 0) this.preview.showCellRegion(room, RING_COLOR);
        break;
      }
      case 'pool': {
        const { x, z } = hoverCell;
        if (!isCellInLot(x, z)) break;
        if (this.wouldDig(x, z)) this.preview.showFloorGhosts([{ x, z }], POOL_COLOR);
        else if (!this.model.hasPool(x, z)) this.preview.showFloorGhosts([{ x, z }], DELETE_COLOR);
        break;
      }
      case 'floor': {
        const { x, z } = hoverCell;
        if (!isCellInLot(x, z)) break;
        if ((this.floorDrawMode === 'flood' || e.shiftKey) && !this.model.hasFloor(x, z)) this.showFloodPreview(hoverCell);
        else if (this.wouldLay(x, z)) this.preview.showFloorGhosts([{ x, z }]);
        else if (!this.model.hasFloor(x, z)) this.preview.showFloorGhosts([{ x, z }], DELETE_COLOR);
        break;
      }
      case 'pillar': {
        const corner = worldToCorner(worldPoint.x, worldPoint.z);
        if (!isCornerInLot(corner.x, corner.z)) break;
        const erasing = e.ctrlKey || e.metaKey;
        if (erasing) {
          const pillar = this.model.allPillars().find((each) => each.x === corner.x && each.z === corner.z);
          if (pillar) this.preview.showPillarGhost(corner.x, corner.z, pillar.style, DELETE_COLOR);
          break;
        }
        const allowed = this.model.rules?.canPillar(corner.x, corner.z) ?? true;
        this.preview.showPillarGhost(corner.x, corner.z, this.selectedPillarStyle, allowed ? ADD_COLOR : DELETE_COLOR);
        break;
      }
      case 'door':
      case 'window': {
        const wall = this.snapToWall(worldPoint, e);
        if (wall) this.preview.showWallGhosts([wall]);
        break;
      }
      case 'paint': {
        this.showPaintPreview(mouseToNdc(e, this.domElement), worldPoint, hoverCell);
        break;
      }
      case 'furniture': {
        const { x, z } = worldToCell(worldPoint.x, worldPoint.z);
        // A piece already sits here — nothing useful to preview, and a red
        // overlay directly on top of what you just placed reads as an error
        // rather than "occupied", so just show nothing. Anywhere else it goes
        // red, so turning a piece into something shows why it won't fit.
        // With nothing in hand, it's just pointing, and a piece under the cursor gets the ring R would turn.
        if (!held) {
          const piece = this.hoveredFurniture;
          if (piece) {
            const offset = getFootprintCenterOffset(piece.type, piece.rotation);
            this.preview.showRing(piece.x + offset.dx, piece.z + offset.dz, this.isPickingFurniture(e) ? PICK_COLOR : undefined);
          }
        } else if (!this.hoveredFurniture) {
          const rotation = this.wallFacingRotation(held, x, z, this.placementRotation);
          const corner = cornerForAnchor(held, { x, z }, rotation);
          const blocked = !this.canPlaceFurniture(held, corner.x, corner.z, rotation);
          this.preview.showFurnitureGhost(held, corner.x, corner.z, rotation, blocked, this.model.allFurniture(), this.placingColor(held));
        }
        break;
      }
      case 'move': {
        const piece = this.carried;
        if (piece) {
          // The piece in hand, red where it won't fit.
          const { x, z } = this.carriedAnchor(hoverCell);
          const rotation = this.wallFacingRotation(piece.type, x, z, this.carriedRotation);
          const blocked = !this.canPlaceFurniture(piece.type, x, z, rotation, piece.id);
          const others = this.model.allFurniture().filter((other) => other.id !== piece.id);
          this.preview.showFurnitureGhost(piece.type, x, z, rotation, blocked, others, piece.color);
        } else if (this.hoveredFurniture) {
          const hovered = this.hoveredFurniture;
          const offset = getFootprintCenterOffset(hovered.type, hovered.rotation);
          this.preview.showRing(hovered.x + offset.dx, hovered.z + offset.dz);
        }
        break;
      }
      case 'delete': {
        this.showDeleteTarget(this.resolveDeleteTarget(worldPoint, e));
        break;
      }
    }
  }

  private showDeleteTarget(target: DeleteTarget) {
    if (target?.kind === 'furniture') {
      const offset = getFootprintCenterOffset(target.type, target.rotation);
      this.preview.showRing(target.x + offset.dx, target.z + offset.dz, DELETE_COLOR);
    } else if (target?.kind === 'wall' || target?.kind === 'aperture') this.preview.showWallGhosts([target], DELETE_COLOR);
    else if (target?.kind === 'fence' || target?.kind === 'railing') this.preview.showWallGhosts([target], DELETE_COLOR, FENCE_GHOST_HEIGHT);
    else if (target?.kind === 'pillar') this.preview.showPillarGhost(target.x, target.z, target.style, DELETE_COLOR);
    else if (target?.kind === 'floor') this.preview.showFloorGhosts([target], DELETE_COLOR);
    else if (target?.kind === 'mess') this.preview.showRing(target.x, target.z, DELETE_COLOR);
    else if (target?.kind === 'pool') this.preview.showFloorGhosts([target], DELETE_COLOR);
  }

  private showFloodPreview(start: Cell) {
    const key = `flood|${start.x},${start.z}`;
    if (this.fillPreview?.key !== key) this.fillPreview = { key, faces: [], cells: this.floorFloodRegion(start) };
    this.preview.showCellRegion(this.fillPreview.cells, ADD_COLOR);
  }

  private showPaintPreview(ndc: THREE.Vector2, worldPoint: THREE.Vector3, cell: Cell) {
    const color = hexToNumber(this.selectedPaintColor);
    if (this.paintMethod === 'sample') {
      const spot = this.paintSpotAt(ndc, false);
      if (spot?.kind === 'wall') this.preview.showWallFaceGhost(spot.face, RING_COLOR);
      else if (spot?.kind === 'fence') this.preview.showWallGhosts([spot.fence], RING_COLOR, FENCE_GHOST_HEIGHT);
      else if (spot) this.preview.showGableGhost(spot.gable.strip, spot.gable.toWorld, RING_COLOR);
      else if (this.model.hasFloor(cell.x, cell.z)) this.preview.showFloorGhosts([cell], RING_COLOR);
    } else if (this.paintMethod === 'bucket') {
      this.fillPreview = this.fillRegionAt(ndc, worldPoint);
      for (const face of this.fillPreview.faces) this.preview.showWallFaceGhost(face, color);
      const gables = this.fillPreview.gables;
      for (const strip of gables?.strips ?? []) this.preview.showGableGhost(strip, gables!.pick.toWorld, color);
      if (this.fillPreview.fences?.length) this.preview.showWallGhosts(this.fillPreview.fences, color, FENCE_GHOST_HEIGHT);
      if (this.fillPreview.cells.length > 0) this.preview.showCellRegion(this.fillPreview.cells, color);
    } else if (this.paintTarget === 'wall') {
      const spot = this.paintSpotAt(ndc);
      if (spot?.kind === 'wall') this.preview.showWallFaceGhost(spot.face, color);
      else if (spot?.kind === 'fence') this.preview.showWallGhosts([spot.fence], color, FENCE_GHOST_HEIGHT);
      else if (spot) this.preview.showGableGhost(spot.gable.strip, spot.gable.toWorld, color);
    } else if (this.model.hasFloor(cell.x, cell.z)) {
      this.preview.showFloorGhosts([cell], color);
    }
  }
}

function cellsIn({ loX, hiX, loZ, hiZ }: CellBounds): { x: number; z: number }[] {
  const cells: { x: number; z: number }[] = [];
  for (let x = loX; x <= hiX; x++) {
    for (let z = loZ; z <= hiZ; z++) cells.push({ x, z });
  }
  return cells;
}

function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}
