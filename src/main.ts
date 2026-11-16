import * as THREE from 'three';
import './style.css';
import { createScene } from './scene/scene';
import { IsoCameraRig } from './scene/camera';
import { GroundGrid } from './scene/groundGrid';
import { clampCellToLot, mouseToNdc, raycastGround, worldToCell } from './grid/gridMath';
import { LevelView } from './build/levelView';
import { LevelGrid } from './build/levelGrid';
import { MAX_REAL_LIGHTS } from './build/furnitureLights';
import { GroundShadow } from './build/groundShadow';
import { House, MAX_LEVELS, STAIRS_TYPE, stairCells, stairLandings } from './grid/house';
import { FURNITURE_CATALOG, getFootprintCells, getFurnitureDef, isStairs, pieceSquare } from './build/furnitureCatalog';
import { LEVEL_HEIGHT } from './grid/gridMath';
import { PreviewRenderer } from './build/previewRenderer';
import { gableHit } from './build/roofBuilder';
import { ToolController } from './build/tools';
import type { ToolId } from './build/tools';
import { createBuildToolbar, createViewControls, createFileControls } from './ui/toolbar';
import type { WallViewMode, NewHouseStart } from './ui/toolbar';
import { createStartScreen } from './ui/startScreen';
import { saveModel, loadModel, hasSave, loadDefaultHouse, loadStarterHouse, lastSavedAt, listHouses, currentHouse, openHouse, createHouse, renameHouse, deleteHouse, uniqueName, loadHousehold, newHousehold } from './persistence/save';
import { EditHistory } from './grid/editHistory';
import { Household } from './sim/household';
import { World } from './sim/world';
import { PathOverlay } from './sim/pathOverlay';
import { createNeedsPanel } from './ui/needsPanel';
import { createPawnPanel } from './ui/pawnPanel';
import { createSimPanel } from './ui/simPanel';
import { createPieMenu } from './ui/pieMenu';
import { UI_LAYOUT, createLayoutSwitch } from './ui/layout';

const NEEDS_PANEL_UPDATE_MS = 250;

const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
const toolbarEl = document.getElementById('toolbar') as HTMLElement;
const viewControlsEl = document.getElementById('view-controls') as HTMLElement;
const fileControlsEl = document.getElementById('file-controls') as HTMLElement;
const pawnPanelEl = document.getElementById('pawn-panel') as HTMLElement;
const hintEl = document.getElementById('hint') as HTMLElement;
const dragSizeTipEl = document.getElementById('drag-size-tip') as HTMLElement;

// The stencil is how a pool cuts a hole in the grass.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = createScene();
const cameraRig = new IsoCameraRig();

// The house, a floor at a time. The pawns live on the ground floor, which is `model`.
const house = new House();
const model = house.ground;
/** What's drawn for each floor, ground floor first. */
const views: LevelView[] = [];
/** The floor being built on and looked at. */
let activeLevel = 0;
/** The view settings that apply to every floor: the roof on, or the walls cut away. */
let roofShown = false;
let cutawayOn = true;
/** Walls down: every wall on the floor you're on drops low, not just the ones in the way. */
let wallsDown = false;
let roomsShown = false;
/** Live mode, where nothing is being built. Kept here because the floors are drawn before the tools exist. */
let inLive = false;

function viewFor(level: number): LevelView {
  while (views.length <= level) {
    const view = new LevelView(views.length);
    scene.add(view.group);
    views.push(view);
  }
  return views[level];
}
const ground = viewFor(0);

const previewRenderer = new PreviewRenderer();
const levelGrid = new LevelGrid();
const groundShadow = new GroundShadow();
const household = new Household(new World(house));
scene.add(groundShadow.mesh, previewRenderer.group, levelGrid.group, household.group);
/** The paths view: where every pawn is walking, drawn over the house. */
const pathOverlay = new PathOverlay();
scene.add(pathOverlay.group);

function houseCenter(): THREE.Vector3 {
  const points = [...model.allFloors(), ...model.allWalls()];
  if (points.length === 0) return new THREE.Vector3(0, 0, 0);
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumZ = points.reduce((sum, point) => sum + point.z, 0);
  return new THREE.Vector3(sumX / points.length, 0, sumZ / points.length);
}

// Only on load and reset: moving the camera during an edit would shift the grid out from under a drag in progress.
function centerCamera() {
  cameraRig.setPivot(houseCenter());
}

/** Builds one floor again in full. Only the floor you're on gets real lights: the others are mostly out of sight, and lights shine through floors. */
function rebuildLevel(level: number) {
  viewFor(level).rebuild(house.levels[level], house.levels[level - 1] ?? null, house.levels[level + 1] ?? null, level === activeLevel ? MAX_REAL_LIGHTS : 0, house.roofLook);
}

/**
 * After a floor changes: that floor in full, the stairwells in the floor
 * above, and the roof of the floor below, which the new floor may now cover.
 * Pass -1 when every floor changed, as on loading a house.
 */
function rebuildHouse(changed: number) {
  if (changed < 0) {
    house.levels.forEach((_, level) => rebuildLevel(level));
  } else {
    rebuildLevel(changed);
    const above = house.levels[changed + 1];
    if (above) viewFor(changed + 1).rebuildFloors(above, house.levels[changed]);
    const below = house.levels[changed - 1];
    if (below) viewFor(changed - 1).rebuildRoof(below, house.levels[changed], house.roofLook);
  }
  if (changed <= 0) groundShadow.rebuild(model);
  // Fences, and the railings drawn round open edges upstairs, which change with the floors either side.
  house.levels.forEach((level, index) => viewFor(index).fences.rebuild(level, house.autoRailingEdges(index)));
  household.onHouseChanged(house.levels.map((_, level) => viewFor(level).light));
  applyLevelView();
}

function rebuildAll() {
  rebuildHouse(-1);
}

/** Which floors show: the one you're on and those below it, or all of them with the roof on. Walls are cut away on your floor only. */
function applyLevelView() {
  // Building upstairs, a grid shows where on this floor tiles can go.
  levelGrid.group.visible = activeLevel > 0 && !roofShown && !inLive;
  if (levelGrid.group.visible) levelGrid.show(house.buildableCells(activeLevel), activeLevel * LEVEL_HEIGHT);
  views.forEach((view, level) => {
    view.group.visible = roofShown || level <= activeLevel;
    view.roof.group.visible = roofShown;
  });
  // Pawns upstairs are hidden with their floor.
  household.showLevelsUpTo(roofShown ? Infinity : activeLevel);
  views.forEach((view, level) => {
    if (view.rooms.group.visible !== (roomsShown && level === activeLevel)) view.rooms.setVisible(roomsShown && level === activeLevel, house.levels[level]);
  });
  updateCutaway();
}

function updateCutaway() {
  views.forEach((view, level) => {
    view.walls.cutawayEnabled = cutawayOn && level === activeLevel;
    view.walls.allLowered = wallsDown && level === activeLevel;
    view.walls.updateCutaway(cameraRig.getCameraDirXZ());
    view.furniture.setLoweredWalls(view.walls.lowered);
  });
}

house.onChange = (level) => rebuildHouse(level);

if (!(hasSave() && loadModel(house))) {
  loadStarterHouse(house);
}
centerCamera();
household.placeEveryoneAtStart(houseCenter(), cameraRig.getCameraDirXZ());

const pawnPanel = createPawnPanel(pawnPanelEl, {
  onSelect: (id) => {
    household.select(id);
    updatePawnPanel();
  },
  onFocus: focusOnPawn,
  onEdit: (id, name, color, traits) => {
    household.rename(id, name);
    household.recolor(id, color);
    household.setTraits(id, traits);
    updatePawnPanel();
  },
  onAdd: () => {
    household.add(houseCenter(), cameraRig.getCameraDirXZ());
    updatePawnPanel();
  },
  onRemove: (id) => {
    household.remove(id);
    updatePawnPanel();
  },
});

function updatePawnPanel() {
  pawnPanel.render(household.roster, household.selected);
}

/** Takes the view to the pawn, and up or down to its floor. */
function focusOnPawn(id: string) {
  const position = household.positionOf(id);
  const level = household.levelOf(id);
  if (level !== undefined && level !== activeLevel) goToLevel(level);
  if (position) cameraRig.glideTo(position);
}
updatePawnPanel();
pawnPanel.setEditable(false);

const needsPanel = createNeedsPanel(document.getElementById('needs-panel') as HTMLElement);
needsPanel.setVisible(false);
let nextNeedsPanelUpdate = 0;

const editHistory = new EditHistory(house);

const HINTS: Record<ToolId, string> = {
  none: 'Right-click anywhere, a pawn or a piece of furniture for what you can do. Left-click a pawn to select it, drag to look around 🚶',
  wall: 'Drag from corner to corner to sketch walls, let go to build them 🧱',
  door: 'Click a wall to add a door, in whichever style is picked below. Clicking a door swaps it for this style 🚪',
  window: 'Click or drag along walls to add windows 🪟',
  floor: 'Pick a surface, then drag to lay tiles, or drag over tiles to change them. Upstairs, tiles go over rooms, up to 2 squares past a wall or pillar below, and round the top of stairs ⬛',
  paint: 'Choose walls or floors, pick a color, then click or drag to paint. With the roof on, walls include the gable ends 🎨',
  roof: 'Pick a roof for the whole house, flat, hip or gable, and what it is covered in. It shows with the Roof view, which this turns on 🏠',
  pool: 'Drag to dig a pool or spa, any shape you like, or Ctrl-drag to fill it back in. Pick a ladder, pool stairs or a diving board below to put one in 🏊',
  pillar: 'Click a corner to put up a pillar. It holds up the floor above for 2 squares round it. Ctrl-click takes one down 🏛️',
  fence: 'Drag along the grid lines to put up a fence or railing. Upstairs, railings go along the edges of tiles. Gate turns a length of fence into a gate 🪵',
  outdoor: 'Pick a tree, plant or garden piece, then click a tile to place it. R turns it 🌳',
  stairs: 'Pick a kind of stairs, then click to place them. They climb to the floor above and leave a hole in it. R turns them. Page Up and Page Down change floors 🪜',
  furniture: 'Pick a piece and click a tile to place it. Hold and drag to turn it before you let go, or press R, which also turns whatever piece you point at 🪑',
  move: 'Click a piece to pick it up, then click where it should go. R turns it, Esc puts it back ✋',
  delete: 'Drag across an area to erase it, or click one thing 🗑️',
};

const toolController = new ToolController(model, () => cameraRig.getCamera(), canvas, previewRenderer, ground.walls.group);
toolController.pickFurniture = (ndc) => viewFor(activeLevel).furniture.pieceAt(ndc, cameraRig.getCamera(), house.levels[activeLevel]);
// Upstairs, a piece needs floor under it and can't go in a stairwell, and stairs can't start on the top floor.
toolController.furnitureRule = (type, cells) => {
  if (isStairs(type) && activeLevel >= MAX_LEVELS - 1) return false;
  if (activeLevel === 0) return true;
  const here = house.levels[activeLevel];
  const stairwell = stairCells(house.levels[activeLevel - 1]);
  return cells.every(({ x, z }) => here.hasFloor(x, z) && !stairwell.has(`${x},${z}`));
};

/** Roof on, full walls, walls cut away to see in, or every wall down. */
function setWallViewMode(mode: WallViewMode) {
  cutawayOn = mode === 'cutaway';
  wallsDown = mode === 'down';
  roofShown = mode === 'roof';
  updateBubbles();
  applyLevelView();
}

/** Moves building and looking to another floor. Going up past the top starts a new floor, up to the most a house can have. */
function goToLevel(level: number) {
  if (level < 0) return;
  if (level >= house.levels.length && !house.addLevel()) return;
  const previous = activeLevel;
  activeLevel = level;
  viewFor(level);
  // Real lights follow you to the floor you're on.
  for (const each of new Set([previous, level])) viewFor(each).lights.rebuild(house.levels[each], views[each].light, each === activeLevel ? MAX_REAL_LIGHTS : 0);
  const height = level * LEVEL_HEIGHT;
  toolController.setLevel(house.levels[level], views[level].walls.group, height);
  previewRenderer.group.position.y = height;
  groundGrid.mesh.position.y = height - 0.005;
  cameraRig.setHeight(height);
  applyLevelView();
  viewControls.setLevel(level, house.levels.length < MAX_LEVELS || level < house.levels.length - 1);
  updateBubbles();
}

function isLiveMode(): boolean {
  return toolController.activeTool === 'none';
}

/** Whether the selected pawn's status stays up while building and furnishing, not just in Live. */
let showStatusesWhileEditing = false;

/** Which kind of stairs the Stairs tool places. */
let stairsType = STAIRS_TYPE;

/** Which tree, plant or garden piece the Outdoor tool places. */
/** The pool item picked in the Pool tool's row, or null while digging. */
let poolItem: string | null = null;
let outdoorType = FURNITURE_CATALOG.find((def) => def.category === 'outdoor' && !def.buildTool)!.type;

/** The tool picked in the menus. Stairs and Outdoor are furniture to the tool controller. */
let menuTool: ToolId = 'none';

/** The last piece picked from Furnish's palette, which placing stairs mustn't lose. */
let paletteFurniture: string | null = toolController.selectedFurnitureType;

function selectTool(tool: ToolId) {
  pieMenu.close();
  // Stairs are placed like furniture, with the stairs in hand. Back in Furnish, the palette's piece is in hand again.
  // Outdoor is the same, with a tree or garden piece in hand.
  const heldByBuildTool = menuTool === 'stairs' || menuTool === 'outdoor' || menuTool === 'pool';
  menuTool = tool;
  // The Pool tool digs, or with an item picked from its row, places that like furniture.
  toolController.activeTool = tool === 'stairs' || tool === 'outdoor' || (tool === 'pool' && poolItem) ? 'furniture' : tool;
  inLive = tool === 'none';
  if (tool === 'stairs') toolController.selectedFurnitureType = stairsType;
  else if (tool === 'outdoor') toolController.selectedFurnitureType = outdoorType;
  else if (tool === 'pool' && poolItem) toolController.selectedFurnitureType = poolItem;
  else if (tool === 'furniture' && (heldByBuildTool || isStairs(toolController.selectedFurnitureType ?? ''))) toolController.selectedFurnitureType = paletteFurniture;
  toolController.resetPreview();
  hintEl.textContent = HINTS[tool];
  pawnPanel.setEditable(tool === 'none');
  household.setWandering(tool === 'none');
  updateNeedsPanelVisibility();
  updateBubbles();
  applyLevelView();
  // Picking a roof is no use without seeing it.
  if (tool === 'roof' && !roofShown) {
    setWallViewMode('roof');
    viewControls.setWallView('roof');
  }
}

/** Band layout: Live's slot in the band, which holds the Sim panel. */
let bandLiveSlot: HTMLElement | null = null;
let simPanel: ReturnType<typeof createSimPanel> | null = null;

function updateNeedsPanelVisibility() {
  if (bandLiveSlot) {
    // Band: Live has its own Sim panel in the band and the household column
    // above the anchor. Statuses while building still float top right.
    const live = isLiveMode();
    pawnPanelEl.style.display = live ? '' : 'none';
    simPanel?.setVisible(live);
    needsPanel.setVisible(!live && showStatusesWhileEditing);
    nextNeedsPanelUpdate = 0;
    return;
  }
  needsPanel.setVisible(isLiveMode() || showStatusesWhileEditing);
  // Shown straight away, rather than at the next update.
  nextNeedsPanelUpdate = 0;
}

// Bubbles draw over everything, so with the roof on they'd float over a house whose pawns can't be seen.
function updateBubbles() {
  household.setBubblesVisible(isLiveMode() && !roofShown);
}

const groundGrid = new GroundGrid();
scene.add(groundGrid.mesh);
let pointerNdc: THREE.Vector2 | null = null;

const lastPointer = { x: 0, y: 0 };
canvas.addEventListener('pointermove', (e) => {
  lastPointer.x = e.clientX;
  lastPointer.y = e.clientY;
  pointerNdc = mouseToNdc(e, canvas);
});
canvas.addEventListener('pointerleave', () => {
  pointerNdc = null;
});

// --- Moving the camera: right or middle drag, or Space + left drag for trackpads.
// Live mode has no tools, so a left drag moves it too, and a left or right click
// that barely moves isn't a drag: it selects the pawn it landed on, sends the
// selected pawn to use the furniture it landed on, or sends it there. ---
const WALK_CLICK_MAX_PIXELS = 5;
let spaceHeld = false;
let panDrag: { x: number; y: number; startX: number; startY: number; button: number } | null = null;

/** What can hide a pawn from a click: the walls and the furniture. */
// With Select everything on, the Delete tool can take messes on the floor you're on too.
toolController.messes = {
  at: (ndc) => {
    const id = household.messAt(ndc, cameraRig.getCamera(), pawnBlockers());
    return id && household.messCellOf(id)?.level === activeLevel ? id : null;
  },
  cellOf: (id) => household.messCellOf(id),
  inArea: (bounds) => household.messesIn(activeLevel, bounds),
  remove: (id) => household.removeMess(id),
};

function pawnBlockers(): THREE.Object3D[] {
  return views.filter((view) => view.group.visible).flatMap((view) => [view.walls.group, view.furniture.group]);
}

// While building or furnishing, a click on a pawn shows how it's doing instead of reaching the tool,
// so it doesn't also put a wall or a chair where it's standing. In the capture phase, so it's first.
canvas.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== 0 || spaceHeld || isLiveMode()) return;
    const clickedPawn = household.pawnAt(mouseToNdc(e, canvas), cameraRig.getCamera(), pawnBlockers());
    if (!clickedPawn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    household.select(clickedPawn);
    updatePawnPanel();
    // Band has no Statuses button to turn them off again, so clicking a pawn only selects it there.
    if (UI_LAYOUT === 'band') return;
    showStatusesWhileEditing = true;
    viewControls.setStatusesShown(true);
    updateNeedsPanelVisibility();
  },
  { capture: true },
);

// Runs in the capture phase so a pan never reaches the active build tool.
canvas.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== 1 && e.button !== 2 && !(e.button === 0 && (spaceHeld || isLiveMode()))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    canvas.setPointerCapture(e.pointerId);
    panDrag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, button: e.button };
    canvas.style.cursor = 'grabbing';
  },
  { capture: true },
);
window.addEventListener('pointermove', (e) => {
  if (!panDrag) return;
  cameraRig.panByPixels(e.clientX - panDrag.x, e.clientY - panDrag.y, canvas.clientHeight);
  panDrag.x = e.clientX;
  panDrag.y = e.clientY;
});
const pieMenu = createPieMenu();
household.onSelectionChange = () => updatePawnPanel();

window.addEventListener('pointerup', (e) => {
  const isWalkButton = panDrag?.button === 0 || panDrag?.button === 2;
  // The click that closed a menu was only for closing it.
  const dismissedMenu = pieMenu.takeDismissal();
  if (panDrag && isLiveMode() && isWalkButton && !dismissedMenu && Math.hypot(e.clientX - panDrag.startX, e.clientY - panDrag.startY) < WALK_CLICK_MAX_PIXELS) {
    const ndc = mouseToNdc(e, canvas);
    const clickedPawn = household.pawnAt(ndc, cameraRig.getCamera(), pawnBlockers());
    const clickedMess = household.messAt(ndc, cameraRig.getCamera(), pawnBlockers());
    // A ceiling light isn't something to send a pawn to, so a click goes through it to what's below.
    const piece = viewFor(activeLevel).furniture.pieceAt(ndc, cameraRig.getCamera(), house.levels[activeLevel], true);
    const clickedFurniture = piece && { ...piece, level: activeLevel };
    const point = raycastGround(ndc, cameraRig.getCamera(), activeLevel * LEVEL_HEIGHT);
    // Everything goes through a pie menu: pawns, messes and furniture each have theirs, and the floor offers "Go here".
    // Furniture with nothing to do, like a rug, gives way to the floor it's on.
    const groundCell = point ? { ...clampCellToLot(worldToCell(point.x, point.z)), level: activeLevel } : null;
    // Only a right-click opens a menu. A left-click just selects a pawn, so nothing happens by accident.
    if (panDrag.button !== 2) {
      if (clickedPawn) {
        household.select(clickedPawn);
        updatePawnPanel();
      }
      panDrag = null;
      canvas.style.cursor = '';
      return;
    }
    const menu =
      (clickedPawn ? household.menuForPawn(clickedPawn) : null) ??
      (clickedMess ? household.menuForMess(clickedMess) : null) ??
      (clickedFurniture && !clickedPawn && !clickedMess ? household.menuForPiece(clickedFurniture) : null) ??
      (groundCell && !clickedPawn ? household.menuForGround(groundCell) : null);
    if (menu) {
      pieMenu.open(e.clientX, e.clientY, menu);
    } else if (clickedPawn) {
      household.select(clickedPawn);
      updatePawnPanel();
    }
  }
  panDrag = null;
  canvas.style.cursor = '';
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('dblclick', (e) => {
  if (!isLiveMode()) return;
  const clickedPawn = household.pawnAt(mouseToNdc(e, canvas), cameraRig.getCamera(), pawnBlockers());
  if (clickedPawn) focusOnPawn(clickedPawn);
});

const PAN_KEYS: Record<string, [right: number, up: number]> = {
  arrowup: [0, 1],
  w: [0, 1],
  arrowdown: [0, -1],
  s: [0, -1],
  arrowleft: [-1, 0],
  a: [-1, 0],
  arrowright: [1, 0],
  d: [1, 0],
};
const heldPanKeys = new Set<string>();
/** Shift with the arrow keys or WASD moves the camera faster, as in The Sims. */
let panFaster = false;
window.addEventListener('keyup', (e) => {
  heldPanKeys.delete(e.key.toLowerCase());
  if (e.key === 'Shift') panFaster = false;
  if (e.code === 'Space') {
    spaceHeld = false;
    e.preventDefault();
  }
});
window.addEventListener('blur', () => {
  heldPanKeys.clear();
  panFaster = false;
  spaceHeld = false;
});

toolController.onDragSize = (size) => {
  if (!size) {
    dragSizeTipEl.style.display = 'none';
    return;
  }
  dragSizeTipEl.style.display = 'block';
  dragSizeTipEl.style.left = `${lastPointer.x}px`;
  dragSizeTipEl.style.top = `${lastPointer.y}px`;
  dragSizeTipEl.textContent = size.w === 1 && size.h === 1 ? '1' : `${size.w} × ${size.h}`;
};

toolController.onActionEnd = () => editHistory.commit();
household.onSplash = (x, z, size) => viewFor(0).pools.splash(x, z, size);
// With the roof on, the Paint tool can paint the gable ends on any floor's roof. The first piece of roof a ray hits is the one in front.
toolController.gablePicker = (raycaster) => {
  if (!roofShown) return null;
  const roofs = views.filter((view) => view.group.visible).map((view) => view.roof.group);
  for (const roof of roofs) roof.updateWorldMatrix(true, true);
  const hit = raycaster.intersectObjects(roofs, true)[0];
  const gable = hit && gableHit(hit);
  if (!gable) return null;
  const level = views.findIndex((view) => view.roof.group === hit.object.parent);
  const model = house.levels[level];
  if (!model) return null;
  return { model, ...gable, distance: hit.distance, toWorld: hit.object.matrixWorld.clone() };
};

// Stairs come out onto a tile on the floor above, laid for you, starting that floor if there isn't one yet.
toolController.onStairsPlaced = (piece) => {
  const shape = getFurnitureDef(piece.type).stairs;
  if (!shape || activeLevel + 1 >= MAX_LEVELS) return;
  const above = house.levels[activeLevel + 1] ?? house.addLevel();
  const top = pieceSquare(piece.type, piece.x, piece.z, piece.rotation, shape.exit);
  above?.setFloor(top.x, top.z, toolController.selectedSurface);
};

/** Tiles upstairs that nothing held up when the house last settled, laid before the rules said so. They're left be. */
let looseTiles = house.unsupportedTiles();

/** The tiles each flight of stairs holds up, as `level|x,z`: where it comes out, and round it. */
function stairsHoldUp(): Set<string> {
  const held = new Set<string>();
  house.levels.forEach((model, level) => {
    if (level + 1 >= house.levels.length) return;
    for (const { top } of stairLandings(model)) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) held.add(`${level + 1}|${top.x + dx},${top.z + dz}`);
    }
  });
  return held;
}
let heldByStairs = stairsHoldUp();

/** Whether anything stands on this tile. */
function tileInUse(level: number, x: number, z: number): boolean {
  return house.levels[level].allFurniture().some((piece) => getFootprintCells(piece.type, piece.x, piece.z, piece.rotation).some((cell) => cell.x === x && cell.z === z));
}

/**
 * Taking away a wall or pillar that holds up the floor above doesn't happen:
 * those tiles flash and it's put back. Stairs moved or taken away take the
 * bare tiles only they held up with them, as those were their landing.
 */
editHistory.allow = () => {
  const stranded = [...house.unsupportedTiles()].filter((key) => !looseTiles.has(key));
  if (stranded.length === 0) return true;
  const landings = stranded.map((key) => {
    const [level, cell] = key.split('|');
    const [x, z] = cell.split(',').map(Number);
    return { key, level: Number(level), x, z };
  });
  const goWithStairs = landings.filter(({ key, level, x, z }) => heldByStairs.has(key) && !tileInUse(level, x, z));
  if (goWithStairs.length === stranded.length) {
    for (const { level, x, z } of goWithStairs) house.levels[level].batch(() => house.levels[level].removeFloor(x, z));
    return true;
  }
  stranded.splice(0, stranded.length, ...stranded.filter((key) => !goWithStairs.some((tile) => tile.key === key)));
  flashTiles(stranded);
  fileControls.showMessage('⚠️ That holds up the floor above, so it stays. Take those tiles away first, or put up a pillar to hold them.', 'error');
  return false;
};

/** A quick red flash over tiles, given as `level|x,z`. */
function flashTiles(keys: string[]) {
  const geometry = new THREE.BoxGeometry(0.96, 0.1, 0.96);
  const material = new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.7, depthTest: false });
  const mesh = new THREE.InstancedMesh(geometry, material, keys.length);
  mesh.renderOrder = 20;
  keys.forEach((key, index) => {
    const [level, cell] = key.split('|');
    const [x, z] = cell.split(',').map(Number);
    mesh.setMatrixAt(index, new THREE.Matrix4().setPosition(x, Number(level) * LEVEL_HEIGHT + 0.08, z));
  });
  scene.add(mesh);
  const start = performance.now();
  const fade = () => {
    const t = (performance.now() - start) / 1800;
    if (t >= 1) {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      mesh.dispose();
      return;
    }
    // Three pulses, fading.
    material.opacity = 0.75 * (1 - t) * (0.55 + 0.45 * Math.cos(t * Math.PI * 6));
    requestAnimationFrame(fade);
  };
  fade();
}
toolController.onCarry = (id) => {
  views[activeLevel].furniture.setHidden(id);
  views[activeLevel].lights.setHidden(id);
};

toolController.onColorSampled = () => {
  toolbar.setActivePaintColor(toolController.selectedPaintColor);
  toolbar.setActivePaintTarget(toolController.paintTarget);
  toolbar.setActivePaintMethod(toolController.paintMethod);
};

function undo() {
  if (isLiveMode()) return;
  toolController.resetPreview();
  editHistory.undo();
}

function redo() {
  if (isLiveMode()) return;
  toolController.resetPreview();
  editHistory.redo();
}

const toolbar = createBuildToolbar(toolbarEl, {
  onUndo: undo,
  onRedo: redo,
  onMode: () => {
    // Tool switching (and its hint/preview reset) is driven by onTool, which
    // the toolbar always calls right alongside a mode change.
  },
  onTool: selectTool,
  onFurnitureColor: (type, color) => {
    toolController.furnitureColors.set(type, color ?? null);
  },
  onFurnitureType: (type) => {
    toolController.selectedFurnitureType = type;
    paletteFurniture = type;
  },
  onPaintColor: (color) => {
    toolController.selectedPaintColor = color;
  },
  onPaintTarget: (target) => {
    toolController.paintTarget = target;
  },
  onPaintMethod: (method) => {
    toolController.setPaintMethod(method);
  },
  onWallDrawMode: (mode) => {
    toolController.wallDrawMode = mode;
    toolController.resetPreview();
  },
  onFloorDrawMode: (mode) => {
    toolController.floorDrawMode = mode;
    toolController.resetPreview();
  },
  onWindowSize: (size) => {
    toolController.selectedWindowSize = size;
  },
  onDoorStyle: (style) => {
    toolController.selectedDoorStyle = style;
  },
  onStairsType: (type) => {
    stairsType = type;
    if (isStairs(toolController.selectedFurnitureType ?? '')) {
      toolController.selectedFurnitureType = type;
      toolController.resetPreview();
    }
  },
  onPoolKind: (kind) => {
    toolController.selectedPoolKind = kind;
  },
  onPoolItem: (type) => {
    poolItem = type;
    if (menuTool === 'pool') selectTool('pool');
  },
  onOutdoorType: (type) => {
    outdoorType = type;
    if (menuTool === 'outdoor') {
      toolController.selectedFurnitureType = type;
      toolController.resetPreview();
    }
  },
  onRoofStyle: (style) => {
    house.setRoofStyle(style);
    editHistory.commit();
  },
  onRoofCovering: (covering) => {
    house.setRoofCovering(covering);
    editHistory.commit();
  },
  onFenceStyle: (style) => {
    toolController.selectedFenceStyle = style;
    // Picking a railing also picks the one tiles laid upstairs from now on get. Tiles already down keep theirs.
    if (style.endsWith('-rail')) {
      house.setAutoRailings(house.autoRailings, style);
      syncFenceButtons();
    }
  },
  onPillarStyle: (style) => {
    toolController.selectedPillarStyle = style;
    toolController.resetPreview();
  },
  onSurface: (surface) => {
    toolController.selectedSurface = surface;
    toolController.resetPreview();
  },
  onFenceGate: (gate) => {
    toolController.fenceGate = gate;
    toolController.resetPreview();
  },
  onAutoRailings: (on) => {
    house.setAutoRailings(on);
    syncFenceButtons();
  },
  onDeleteFilter: (filter) => {
    toolController.deleteFilter = filter;
  },
  onDeleteMode: (mode) => {
    toolController.deleteMode = mode;
  },
}, { layout: UI_LAYOUT });

const viewControls = createViewControls(viewControlsEl, {
  onShowStatuses: (visible) => {
    showStatusesWhileEditing = visible;
    updateNeedsPanelVisibility();
  },
  onRotateCamera: (dir) => {
    if (dir === 'cw') cameraRig.rotateCW();
    else cameraRig.rotateCCW();
    updateCutaway();
  },
  onZoom: (dir) => {
    if (dir === 'in') cameraRig.zoomIn();
    else cameraRig.zoomOut();
  },
  onShowRooms: (visible) => {
    roomsShown = visible;
    applyLevelView();
  },
  onShowPaths: (visible) => pathOverlay.setVisible(visible),
  onSelectEverything: (on) => {
    toolController.selectMesses = on;
    toolController.resetPreview();
  },
  onLevel: (direction) => goToLevel(activeLevel + (direction === 'up' ? 1 : -1)),
  onCenterCamera: () => centerCamera(),
  onWallViewMode: setWallViewMode,
}, { layout: UI_LAYOUT });

editHistory.onChange = () => {
  toolbar.setHistoryState(editHistory.canUndo, editHistory.canRedo);
  looseTiles = house.unsupportedTiles();
  heldByStairs = stairsHoldUp();
};

const fileControls = createFileControls(fileControlsEl, {
  onSave: () => saveHouse('by hand'),
  houses: () => ({ list: listHouses(), currentId: currentHouse()?.id ?? null }),
  onOpen: openSavedHouse,
  onNew: startNewHouse,
  onHome: () => showStartScreen(),
  onRename: (id, name) => {
    const result = renameHouse(id, name);
    if (!result.ok) fileControls.showMessage(`⚠️ Couldn't rename it: ${result.reason}.`, 'error');
    fileControls.refresh();
  },
  onDelete: (id) => {
    const name = listHouses().find((house) => house.id === id)?.name ?? 'That house';
    const result = deleteHouse(id);
    fileControls.showMessage(result.ok ? `🗑️ Deleted ${name}` : `⚠️ Couldn't delete it: ${result.reason}.`, result.ok ? 'ok' : 'error');
    fileControls.refresh();
  },
});

// The layout. Classic gets the Classic | Band switch top right. Band (the
// default) builds the anchor (camera, floors, wall views, 📁 and 👁️‍🗨️ menus),
// which stays put in every mode, with Live/Furnish/Build beside it, the
// household column on top of it, and the Sim panel and catalog in the band.
if (UI_LAYOUT === 'classic') document.getElementById('app')!.appendChild(createLayoutSwitch());
if (UI_LAYOUT === 'band') {
  document.body.classList.add('ui-band');
  const anchor = document.createElement('div');
  anchor.className = 'panel anchor-panel';
  viewControlsEl.parentElement!.insertBefore(anchor, viewControlsEl);
  anchor.append(viewControlsEl);
  // Live, Furnish and Build stand on their own, stacked just right of the anchor.
  const modeColumn = document.createElement('div');
  modeColumn.className = 'panel mode-column';
  modeColumn.appendChild(toolbar.modeRow);
  anchor.after(modeColumn);
  // Under the camera: the 📁 houses menu and the 👁️‍🗨️ mode controls.
  const utilityRow = document.createElement('div');
  utilityRow.className = 'anchor-utility-row';
  utilityRow.append(fileControlsEl, viewControls.specialViews);
  // The Classic | Band switch, at the bottom of the 👁️‍🗨️ menu.
  const layoutHeading = document.createElement('div');
  layoutHeading.className = 'houses-heading';
  layoutHeading.textContent = 'Layout';
  viewControls.specialViews.querySelector('.special-views-menu')!.append(layoutHeading, createLayoutSwitch());
  viewControlsEl.appendChild(utilityRow);
  // The household: a column of faces standing on the anchor, the selected one
  // named. The band beside it holds the selected pawn's Sim panel.
  pawnPanelEl.classList.add('household-column');
  anchor.appendChild(pawnPanelEl);
  simPanel = createSimPanel(toolbar.householdSlot, document.getElementById('app')!);
  toolbar.inspectorSlot.appendChild(hintEl);
  bandLiveSlot = toolbar.householdSlot;
  updateNeedsPanelVisibility();
}

/** Switches to a saved house, from the 📁 menu or the start screen. */
function openSavedHouse(id: string) {
  const name = listHouses().find((house) => house.id === id)?.name ?? 'that house';
  switchHouse(
    () => {
      if (!openHouse(id, house)) return false;
      household.moveIn(loadHousehold());
      return true;
    },
    `🏠 Opened ${name}`,
    `⚠️ Couldn't open ${name}: its save couldn't be read.`,
  );
}

/** Starts a new house, from the 📁 menu or the start screen, and saves it straight away under a name of its own. */
function startNewHouse(start: NewHouseStart) {
  const base = start === 'copy' ? `${currentHouse()?.name ?? 'My house'} copy` : start === 'starter' ? 'Starter house' : start === 'default' ? 'Garden lot' : 'New house';
  const name = uniqueName(base);
  switchHouse(
    () => {
      const previous = currentHouse()?.id;
      // Who moves in: a copy brings everyone along, and anything else gets a household of its own.
      const people = start === 'copy' ? household.snapshot() : newHousehold(start);
      if (start !== 'copy') {
        house.clear();
        if (start === 'starter') loadStarterHouse(house);
        if (start === 'default') loadDefaultHouse(house);
      }
      const result = createHouse(name, house);
      if (result.ok) {
        household.moveIn(people);
        return true;
      }
      // Back to the house you were in, so the next save can't put the new one over it.
      if (previous) openHouse(previous, house);
      return false;
    },
    `🆕 Started ${name}. Rename it from the 📁 menu`,
    `⚠️ Couldn't start a new house: the browser wouldn't save it. You're still in the house you were in.`,
  );
}

/**
 * Leaves the house you're in for another: saves it first, so nothing built
 * there is lost, then puts the pawns out front of the new one, with nothing
 * left lying about and no undoing back into the last house.
 */
function switchHouse(load: () => boolean, done: string, failed: string) {
  if (houseChanged && !saveHouse('on its own')) return;
  toolController.resetPreview();
  // Each house keeps its own household and mess, so the one you leave is left as it was.
  const loaded = load();
  goToLevel(0);
  centerCamera();
  household.placeEveryoneAtStart(houseCenter(), cameraRig.getCameraDirXZ());
  updatePawnPanel();
  editHistory.reset();
  houseChanged = false;
  fileControls.setLastSaved(lastSavedAt());
  fileControls.showMessage(loaded ? done : failed, loaded ? 'ok' : 'error');
}

// Saving. The house saves on its own a little while after it changes, and
// when the page is closed, hidden or reloaded, so nothing built is lost.
const AUTOSAVE_SECONDS = 20;
/** Whether the house has changed since it was last saved or loaded. */
let houseChanged = false;
/** So a save that keeps failing on its own says so once, not every time. */
let autosaveFailureShown = false;
fileControls.setLastSaved(lastSavedAt());
{
  const rebuild = house.onChange;
  house.onChange = (level) => {
    rebuild?.(level);
    houseChanged = true;
    // Undo, or opening another house, can change the roof and railings too.
    toolbar.setActiveRoofStyle(house.roofStyle);
    toolbar.setActiveRoofCovering({ material: house.roofMaterial, flat: house.flatRoof });
    syncFenceButtons();
  };
}
toolbar.setActiveRoofStyle(house.roofStyle);
toolbar.setActiveRoofCovering({ material: house.roofMaterial, flat: house.flatRoof });
toolbar.setActiveStairs(stairsType);
toolbar.setActiveOutdoor(outdoorType);
syncFenceButtons();

function syncFenceButtons() {
  toolbar.setFenceState({ style: toolController.selectedFenceStyle, gate: toolController.fenceGate, auto: house.autoRailings });
}

/** True if it saved. */
function saveHouse(how: 'by hand' | 'on its own'): boolean {
  const result = saveModel(house);
  if (result.ok) {
    houseChanged = false;
    autosaveFailureShown = false;
    fileControls.setLastSaved(Date.now());
    if (how === 'by hand') fileControls.showMessage(`💾 Saved ${currentHouse()?.name ?? ''}`.trim(), 'ok');
    return true;
  }
  if (how === 'on its own' && autosaveFailureShown) return false;
  autosaveFailureShown = how === 'on its own';
  fileControls.showMessage(`⚠️ Couldn't save the house: ${result.reason}. Your build is still here, but it won't survive a reload.`, 'error');
  return false;
}

window.setInterval(() => {
  if (houseChanged) saveHouse('on its own');
}, AUTOSAVE_SECONDS * 1000);
window.addEventListener('pagehide', () => {
  if (houseChanged) saveHouse('on its own');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && houseChanged) saveHouse('on its own');
});

hintEl.textContent = HINTS.wall;

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  cameraRig.resize(width, height);
}
window.addEventListener('resize', resize);
resize();

// --- Scroll wheel zoom (muscle memory from every other building game) ---
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (e.deltaY < 0) cameraRig.zoomIn();
    else cameraRig.zoomOut();
  },
  { passive: false },
);

// --- Keyboard shortcuts ---
// 1-6 and 8 switch tools (hotbar-style); Q/E rotate the camera; scroll/+/-/Z/X zoom;
// ,/. rotate whatever furniture is under the cursor, same keys The Sims uses
// to rotate a selected object; R does too, and also turns a piece being placed.
// Delete and Backspace remove the object under the cursor, same as The Sims.
// Also from The Sims 2: F1/F2/F3 for Live/Furnish/Build, F10 hides the menus,
// Home/End step the wall view up and down, P (or ` or Pause) pauses the household,
// N picks the next pawn in Live, Enter takes the camera to the selected pawn, and
// Shift speeds up the arrow keys. While dragging: Shift makes walls a room, a floor
// click a fill and a brush click a bucket fill; Ctrl or ⌘ takes walls, fences or floor away.
const TOOL_KEYS: Record<string, ToolId> = {
  '1': 'wall',
  '2': 'door',
  '3': 'window',
  '4': 'floor',
  '5': 'paint',
  '7': 'stairs',
  '0': 'fence',
  '9': 'roof',
  '6': 'furniture',
  '8': 'delete',
  // The Sims' hand tool.
  h: 'move',
  H: 'move',
  // The Sims 2's sledgehammer key.
  j: 'delete',
  J: 'delete',
};

/** The wall views from lowest to highest, for Home and End to step through. */
const WALL_VIEW_ORDER: WallViewMode[] = ['down', 'cutaway', 'full', 'roof'];

function stepWallView(step: 1 | -1) {
  const current = roofShown ? 'roof' : wallsDown ? 'down' : cutawayOn ? 'cutaway' : 'full';
  const next = WALL_VIEW_ORDER[WALL_VIEW_ORDER.indexOf(current) + step];
  if (!next) return;
  setWallViewMode(next);
  viewControls.setWallView(next);
}

/** P pauses the household, as in The Sims; building carries on. */
let paused = false;
const pausedBadgeEl = document.createElement('div');
pausedBadgeEl.className = 'paused-badge';
pausedBadgeEl.textContent = '⏸ Paused (P to carry on)';
pausedBadgeEl.style.display = 'none';
document.getElementById('app')!.appendChild(pausedBadgeEl);

function togglePause() {
  paused = !paused;
  pausedBadgeEl.style.display = paused ? '' : 'none';
}

/** The next pawn in the household, and the camera goes to it. */
function selectNextPawn() {
  const roster = household.roster;
  if (roster.length === 0) return;
  const index = roster.findIndex(({ id }) => id === household.selected);
  const next = roster[(index + 1) % roster.length].id;
  household.select(next);
  updatePawnPanel();
  focusOnPawn(next);
}

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
  // The start screen takes its own keys; the game's wait until you're in.
  if (startScreenShown) return;

  // The Sims' keys for its modes, and for hiding everything but the house.
  const modeKey = ({ F1: 'live', F2: 'furnish', F3: 'build' } as const)[e.key as 'F1' | 'F2' | 'F3'];
  if (modeKey) {
    e.preventDefault();
    toolbar.pressMode(modeKey);
    return;
  }
  if (e.key === 'F10') {
    e.preventDefault();
    document.body.classList.toggle('ui-hidden');
    return;
  }
  if (e.key === 'Shift') panFaster = true;

  // Checked first because plain Z is the zoom shortcut.
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }

  if (e.code === 'Space') {
    // Also stops Space from clicking whichever toolbar button was used last.
    e.preventDefault();
    spaceHeld = true;
    return;
  }
  if (!e.metaKey && !e.ctrlKey && !e.altKey && PAN_KEYS[e.key.toLowerCase()]) {
    e.preventDefault();
    heldPanKeys.add(e.key.toLowerCase());
    return;
  }

  const tool = TOOL_KEYS[e.key];
  if (tool && !e.metaKey && !e.ctrlKey) {
    selectTool(tool);
    toolbar.setActiveToolAnyMode(tool);
    return;
  }

  switch (e.key) {
    case 'q':
    case 'Q':
      cameraRig.rotateCCW();
      updateCutaway();
      break;
    case 'e':
    case 'E':
      cameraRig.rotateCW();
      updateCutaway();
      break;
    case '+':
    case '=':
    case 'z':
    case 'Z':
      cameraRig.zoomIn();
      break;
    case '-':
    case '_':
    case 'x':
    case 'X':
      cameraRig.zoomOut();
      break;
    case 'r':
    case 'R':
      // Cmd/Ctrl+R is reloading the page.
      if (!e.metaKey && !e.ctrlKey) toolController.rotatePlacementOrHovered();
      break;
    case ',':
    case '<':
      toolController.rotateHovered(-90);
      break;
    case '.':
    case '>':
      toolController.rotateHovered(90);
      break;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      toolController.deleteHovered();
      break;
    case 'PageUp':
      e.preventDefault();
      goToLevel(activeLevel + 1);
      break;
    case 'PageDown':
      e.preventDefault();
      goToLevel(activeLevel - 1);
      break;
    case 'Home':
      e.preventDefault();
      stepWallView(1);
      break;
    case 'End':
      e.preventDefault();
      stepWallView(-1);
      break;
    case 'p':
    case 'P':
    case '`':
    case '~':
    case 'Pause':
      if (!e.metaKey && !e.ctrlKey) togglePause();
      break;
    case 'n':
    case 'N':
      if (isLiveMode() && !e.metaKey && !e.ctrlKey) selectNextPawn();
      break;
    case 'Enter':
      // Enter on a focused button presses that button instead.
      if (target?.tagName !== 'BUTTON') focusOnPawn(household.selected);
      break;
    case 'Escape':
      toolController.cancelDrag();
      toolController.putBackCarried();
      if (toolController.dropHeldPiece()) toolbar.setActiveFurniture(null);
      break;
  }
});

rebuildAll();

// For checking the game from a test tab while developing. Left out of real builds.
if (import.meta.env.DEV) {
  Object.assign(window, { __game: { house, views, household, toolController, editHistory, goToLevel, cameraRig, get activeLevel() { return activeLevel; } } });
}

// The start screen the game opens on, with the house turning slowly behind it.
/** Whether the start screen is up: the game's menus and keys are put away meanwhile. */
let startScreenShown = false;
/** When the turning view last moved which walls are cut away. */
let showcaseCutawayAt = 0;
const startScreen = createStartScreen(document.getElementById('app')!, {
  houses: () => ({ list: listHouses(), currentId: currentHouse()?.id ?? null }),
  onContinue: () => {},
  onOpen: openSavedHouse,
  onNew: startNewHouse,
  onShownChange: (shown) => {
    startScreenShown = shown;
    document.body.classList.toggle('at-start', shown);
    toolController.resetPreview();
    cameraRig.setShowcase(shown);
    if (!shown) updateCutaway();
  },
});

/** Back to the start screen, saving first so the house it shows is the one you were in. */
function showStartScreen() {
  if (houseChanged) saveHouse('on its own');
  startScreen.show();
}
startScreen.show();

let lastFrameTime = performance.now();

function animate(now = performance.now()) {
  requestAnimationFrame(animate);
  const camera = cameraRig.getCamera();
  const seconds = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  for (const key of heldPanKeys) {
    const [right, up] = PAN_KEYS[key];
    const distance = cameraRig.keyPanSpeed * seconds * (panFaster ? 2.5 : 1);
    cameraRig.pan(right * distance, up * distance);
  }
  groundGrid.setCursor(pointerNdc && raycastGround(pointerNdc, camera, activeLevel * LEVEL_HEIGHT));
  groundGrid.update(seconds);
  cameraRig.update(seconds);
  if (startScreenShown && now - showcaseCutawayAt > 250) {
    showcaseCutawayAt = now;
    updateCutaway();
  }
  if (!paused) household.update(seconds);
  if (pathOverlay.visible) pathOverlay.update(household.routes(), now / 1000);
  const inUse = household.piecesInUse();
  for (const view of views) {
    if (!view.group.visible) continue;
    view.furniture.animate(now / 1000, inUse);
    view.pools.animate(now / 1000);
    view.lights.animate(now / 1000);
  }
  // Doors open as a pawn comes up to them, and close behind it.
  views.forEach((view, level) => {
    const pawns = household.pawnPositions(level);
    view.walls.animateDoors(seconds, pawns);
    view.fences.animateGates(seconds, pawns);
  });
  // Needs change slowly, so there's no call to touch the page every frame.
  if (now >= nextNeedsPanelUpdate && (isLiveMode() || showStatusesWhileEditing)) {
    nextNeedsPanelUpdate = now + NEEDS_PANEL_UPDATE_MS;
    const view = household.selectedView();
    if (view) needsPanel.update(view);
    const me = household.roster.find((pawn) => pawn.id === household.selected);
    if (view && me && simPanel && isLiveMode()) simPanel.update({ ...view, id: me.id, color: me.color, others: household.selectedRelationships() });
  }
  renderer.render(scene, camera);
}
animate();
