import { FURNITURE_CATALOG, FURNITURE_CATEGORIES, getFurnitureDef } from '../build/furnitureCatalog';
import type { FlatRoofFinish, RoofMaterial, RoofStyle } from '../grid/house';
import type { FenceStyle, FloorSurface, PillarStyle, PoolKind } from '../grid/gridModel';
import { SURFACES } from '../build/floorTextures';
import { STAIR_DEFS, STAIR_HINTS } from '../build/stairs';
import type { FurnitureCategory } from '../build/furnitureCatalog';
import type { ToolId, WallDrawMode, FloorDrawMode, DeleteMode, DeleteFilter, PaintTarget, PaintMethod } from '../build/tools';
import type { DoorStyle, WindowSize } from '../grid/gridModel';
import type { UiLayout } from './layout';
import { DEFAULT_PIECE_COLOR, PIECE_COLORS, colorPartName, isColorable } from '../build/furnitureColors';
import { openColorWheel } from './colorWheel';

export type AppMode = 'build' | 'furnish' | 'live';
export type WallViewMode = 'down' | 'cutaway' | 'full' | 'roof';

// ============================================================================
// Build toolbar, left to right: mode tabs (Live/Furnish/Build), then Delete,
// Undo and Redo in a panel of their own, since they work in either mode, then
// the shelf with that mode's tools and whichever tool's own options.
// ============================================================================

export interface BuildToolbarCallbacks {
  onMode: (mode: AppMode) => void;
  onTool: (tool: ToolId) => void;
  onFurnitureType: (type: string) => void;
  /** The color pieces of this type are placed in, like a bed's bedding; none for their own. */
  onFurnitureColor: (type: string, color: string | undefined) => void;
  onPaintColor: (color: string) => void;
  onPaintTarget: (target: PaintTarget) => void;
  onPaintMethod: (method: PaintMethod) => void;
  onWallDrawMode: (mode: WallDrawMode) => void;
  onFloorDrawMode: (mode: FloorDrawMode) => void;
  onWindowSize: (size: WindowSize) => void;
  onDoorStyle: (style: DoorStyle) => void;
  /** The whole house's roof: flat, hip or gable. */
  onRoofStyle: (style: RoofStyle) => void;
  /** What pitched roofs are covered in, or flat ones finished with. */
  onRoofCovering: (covering: { material?: RoofMaterial; flat?: FlatRoofFinish }) => void;
  /** Which kind of stairs the Stairs tool places. */
  onStairsType: (type: string) => void;
  /** Which tree, plant or garden piece the Outdoor tool places. */
  onOutdoorType: (type: string) => void;
  /** What the Pool tool digs: a pool or a spa. */
  onPoolKind: (kind: PoolKind) => void;
  /** A pool item to place, like a ladder, or null to go back to digging. */
  onPoolItem: (type: string | null) => void;
  /** What the Fence tool lays. */
  onFenceStyle: (style: FenceStyle) => void;
  /** The Fence tool turning lengths of fence into gates, or laying fence. */
  onFenceGate: (gate: boolean) => void;
  /** What the Pillar tool puts up. */
  onPillarStyle: (style: PillarStyle) => void;
  /** What the Floor tool lays. */
  onSurface: (surface: FloorSurface) => void;
  /** Railings drawn round every open edge upstairs, or not. */
  onAutoRailings: (on: boolean) => void;
  onDeleteMode: (mode: DeleteMode) => void;
  onDeleteFilter: (filter: DeleteFilter) => void;
  onUndo: () => void;
  onRedo: () => void;
}

const BUILD_TOOLS: { id: ToolId; label: string; emoji: string; key: string }[] = [
  { id: 'wall', label: 'Wall', emoji: '🧱', key: '1' },
  { id: 'door', label: 'Door', emoji: '🚪', key: '2' },
  { id: 'window', label: 'Window', emoji: '🪟', key: '3' },
  { id: 'floor', label: 'Floor', emoji: '⬛', key: '4' },
  { id: 'paint', label: 'Paint', emoji: '🎨', key: '5' },
  { id: 'stairs', label: 'Stairs', emoji: '🪜', key: '7' },
  { id: 'roof', label: 'Roof', emoji: '🏠', key: '9' },
  { id: 'fence', label: 'Fence', emoji: '🪵', key: '0' },
  { id: 'pillar', label: 'Pillar', emoji: '🏛️', key: '' },
  { id: 'pool', label: 'Pool', emoji: '🏊', key: '' },
  // Trees, plants and garden pieces: the Outdoor furniture, placed from Build.
  { id: 'outdoor', label: 'Outdoor', emoji: '🌳', key: '' },
];

/** The first piece in the palette, which Furnish starts on. */
const FIRST_FURNITURE = FURNITURE_CATALOG.find((def) => !def.buildTool)!.type;

const FIRST_TOOL_OF_MODE: Record<AppMode, ToolId> = {
  build: BUILD_TOOLS[0].id,
  // Placing furniture is all Furnish mode does, so there's no tool to pick: the palette is the tool.
  furnish: 'furniture',
  live: 'none',
};

const MODE_OF_TOOL: Partial<Record<ToolId, AppMode>> = {
  none: 'live',
  wall: 'build',
  door: 'build',
  window: 'build',
  floor: 'build',
  paint: 'build',
  stairs: 'build',
  roof: 'build',
  fence: 'build',
  pillar: 'build',
  pool: 'build',
  outdoor: 'build',
  furniture: 'furnish',
};

/** Where the menu search is remembered, so it's still there after a refresh. */
const SEARCH_KEY = 'house-builder-menu-search';

function loadSearch(): string {
  try {
    return localStorage.getItem(SEARCH_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveSearch(query: string) {
  try {
    localStorage.setItem(SEARCH_KEY, query);
  } catch {
    // Only the search box's text would be forgotten.
  }
}

/** Whether a search matches a name, a type or the tab it's in. Every word has to match somewhere. */
function matchesSearch(query: string, ...names: string[]): boolean {
  const haystack = names.join(' ').toLowerCase().replace(/-/g, ' ');
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** Band layout: Build's tools in labeled families, so the row reads by what each tool is for. */
/** Band layout: Furnish's categories, grouped and labeled the same way as Build's tools. */
const CATEGORY_GROUPS: { label: string; categories: FurnitureCategory[] }[] = [
  { label: 'Essentials', categories: ['seating', 'tables', 'beds', 'storage', 'kitchen', 'bathroom'] },
  { label: 'Fun', categories: ['electronics', 'hobbies', 'kids', 'pets'] },
  // Outdoor isn't here: in the band layout it's a Build tool.
  { label: 'Decorating', categories: ['lighting', 'plants', 'decor', 'wallart'] },
];

/** The Sims' function keys for its modes. */
const MODE_KEYS: Record<AppMode, string> = { live: 'F1', furnish: 'F2', build: 'F3' };

const TOOL_GROUPS: { label: string; tools: ToolId[] }[] = [
  { label: 'Structure', tools: ['wall', 'door', 'window', 'stairs', 'pillar'] },
  { label: 'Surfaces', tools: ['floor', 'paint'] },
  { label: 'Outside', tools: ['roof', 'fence', 'pool', 'outdoor'] },
];

/** Band layout: what the settings column calls each tool. */
const TOOL_NAMES: Partial<Record<ToolId, { label: string; emoji: string }>> = {
  ...Object.fromEntries(BUILD_TOOLS.map(({ id, label, emoji }) => [id, { label, emoji }])),
  move: { label: 'Move', emoji: '✋' },
  delete: { label: 'Delete', emoji: '🗑️' },
};

const PAINT_PRESETS = ['#f2e9da', '#f4d35e', '#ee964b', '#f95738', '#a7c957', '#5fa8d3', '#9d4edd', '#ffffff', '#4a4e69'];

export function createBuildToolbar(container: HTMLElement, callbacks: BuildToolbarCallbacks, options: { layout?: UiLayout } = {}) {
  container.innerHTML = '';
  container.className = 'build-dock';
  /** The ?ui=band layout: one band whose contents swap with the mode. */
  const band = options.layout === 'band';

  let activeMode: AppMode = 'build';
  let activeTool: ToolId = 'wall';
  /** The piece last picked, whose tab shows when you're not searching. */
  let activeFurniture: string | null = null;

  // --- Vertical rail: just the mode switch. Sims 2/3-style: one axis picks
  // the mode, the other (the shelf, to the right) shows that mode's tools. ---
  const rail = document.createElement('div');
  rail.className = 'panel rail';
  container.appendChild(rail);

  const modeRow = document.createElement('div');
  modeRow.className = 'rail-mode-row';
  rail.appendChild(modeRow);

  const modeButtons = new Map<AppMode, HTMLButtonElement>();
  const modes: { id: AppMode; label: string; emoji: string }[] = [
    { id: 'live', label: 'Live', emoji: '🚶' },
    { id: 'furnish', label: 'Furnish', emoji: '🪑' },
    { id: 'build', label: 'Build', emoji: '🏗️' },
  ];
  for (const mode of modes) {
    const btn = document.createElement('button');
    btn.className = 'mode-tab';
    btn.innerHTML = `<span class="emoji">${mode.emoji}</span><span>${mode.label}</span>`;
    btn.title = `${mode.label} (${MODE_KEYS[mode.id]})`;
    btn.onclick = () => {
      callbacks.onMode(mode.id);
      // The band layout comes back to the tool you left each mode on, rather than starting over.
      const firstTool = band ? lastToolOfMode[mode.id] : FIRST_TOOL_OF_MODE[mode.id];
      callbacks.onTool(firstTool);
      setActiveMode(mode.id);
      setActiveTool(firstTool);
    };
    modeButtons.set(mode.id, btn);
    modeRow.appendChild(btn);
  }

  const toolButtons = new Map<ToolId, HTMLButtonElement>();
  const lastToolOfMode: Record<AppMode, ToolId> = { ...FIRST_TOOL_OF_MODE };

  // --- Delete, Undo and Redo: their own panel beside the rail, shown in
  // Build and Furnish alike, and kept apart from the shelf's tool options. ---
  const editPanel = document.createElement('div');
  editPanel.className = 'panel edit-panel';
  container.appendChild(editPanel);

  const moveBtn = document.createElement('button');
  moveBtn.className = 'rail-tool-btn';
  moveBtn.title = 'Move (H): pick up a piece of furniture and put it somewhere else. R turns it, Esc puts it back.';
  moveBtn.innerHTML = `<span class="emoji">✋</span><span>Move</span>`;
  moveBtn.onclick = () => {
    callbacks.onTool('move');
    setActiveTool('move');
  };
  toolButtons.set('move', moveBtn);
  editPanel.appendChild(moveBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'rail-tool-btn delete-btn';
  deleteBtn.title = 'Delete (J or 8) — works on walls, floors, and furniture. Or point at furniture, a door or a window and press the Delete key.';
  deleteBtn.innerHTML = `<span class="emoji">🗑️</span><span>Delete</span>`;
  deleteBtn.onclick = () => {
    callbacks.onTool('delete');
    setActiveTool('delete');
  };
  toolButtons.set('delete', deleteBtn);
  editPanel.appendChild(deleteBtn);

  const historyRow = document.createElement('div');
  historyRow.className = 'rail-history-row';
  editPanel.appendChild(historyRow);

  const makeHistoryButton = (symbol: string, label: string, shortcut: string, onClick: () => void) => {
    const btn = document.createElement('button');
    btn.className = 'submode-btn history-btn';
    btn.title = `${label} (${shortcut})`;
    btn.innerHTML = `<span class="emoji">${symbol}</span><span>${label}</span>`;
    btn.onclick = onClick;
    btn.disabled = true;
    historyRow.appendChild(btn);
    return btn;
  };
  const undoBtn = makeHistoryButton('↩️', 'Undo', 'Cmd/Ctrl+Z', callbacks.onUndo);
  const redoBtn = makeHistoryButton('↪️', 'Redo', 'Shift+Cmd/Ctrl+Z', callbacks.onRedo);

  function setHistoryState(canUndo: boolean, canRedo: boolean) {
    undoBtn.disabled = !canUndo;
    redoBtn.disabled = !canRedo;
  }

  // --- Shelf: the active tool's own options, laid out horizontally to the
  // rail's right (hidden entirely for tools with nothing to configure). ---
  const shelf = document.createElement('div');
  shelf.className = 'panel shelf';
  container.appendChild(shelf);

  // --- Search, at the top of Build and Furnish alike. It finds furniture in
  // any tab, and Build's tools too, and keeps what you typed until you clear it. ---
  const searchRow = document.createElement('div');
  searchRow.className = 'toolbar-row search-row';
  shelf.appendChild(searchRow);
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'menu-search';
  searchInput.placeholder = '🔍 Search furniture and tools  ( / )';
  searchInput.setAttribute('aria-label', 'Search furniture and tools');
  searchInput.spellcheck = false;
  const clearSearchBtn = document.createElement('button');
  clearSearchBtn.className = 'menu-search-clear';
  clearSearchBtn.title = 'Clear the search (Esc)';
  clearSearchBtn.textContent = '✕';
  const noMatches = document.createElement('div');
  noMatches.className = 'menu-search-empty';
  noMatches.textContent = 'Nothing matches that';
  searchRow.append(searchInput, clearSearchBtn);
  let searchQuery = loadSearch().trim();
  searchInput.value = searchQuery;

  // --- Build mode's own tools: tiles in the shelf, same style and spot as
  // the furniture palette below — always visible while in Build mode. ---
  const buildToolRow = document.createElement('div');
  buildToolRow.className = 'toolbar-row build-tool-row';
  shelf.appendChild(buildToolRow);

  for (const tool of BUILD_TOOLS) {
    const btn = document.createElement('button');
    btn.className = 'furniture-btn';
    btn.title = tool.key ? `${tool.label} (${tool.key})` : tool.label;
    btn.innerHTML = `<span class="emoji">${tool.emoji}</span><span>${tool.label}</span>`;
    btn.onclick = () => {
      callbacks.onTool(tool.id);
      setActiveTool(tool.id);
    };
    toolButtons.set(tool.id, btn);
    buildToolRow.appendChild(btn);
  }

  // --- Wall mode toggle: draw one straight run, or a whole room's 4 walls ---
  const wallModeRow = document.createElement('div');
  wallModeRow.className = 'toolbar-row submode-row';
  shelf.appendChild(wallModeRow);

  const wallModeButtons = new Map<WallDrawMode, HTMLButtonElement>();
  const wallModes: { id: WallDrawMode; label: string; emoji: string; hint: string }[] = [
    { id: 'line', label: 'Line', emoji: '📏', hint: 'Drag to build one straight run of wall' },
    { id: 'room', label: 'Room', emoji: '⬜', hint: 'Drag a rectangle to build all 4 walls of a room' },
  ];
  for (const mode of wallModes) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = mode.hint;
    btn.innerHTML = `<span class="emoji">${mode.emoji}</span><span>${mode.label}</span>`;
    btn.onclick = () => {
      callbacks.onWallDrawMode(mode.id);
      setActiveWallMode(mode.id);
    };
    wallModeButtons.set(mode.id, btn);
    wallModeRow.appendChild(btn);
  }

  // --- Floor mode toggle: drag a rectangle of tiles, or fill bare ground like a paint bucket ---
  const floorModeRow = document.createElement('div');
  floorModeRow.className = 'toolbar-row submode-row';
  shelf.appendChild(floorModeRow);

  const floorModeButtons = new Map<FloorDrawMode, HTMLButtonElement>();
  const floorModes: { id: FloorDrawMode; label: string; emoji: string; hint: string }[] = [
    { id: 'drag', label: 'Drag', emoji: '📐', hint: 'Drag a rectangle of tiles' },
    { id: 'flood', label: 'Flood', emoji: '🌊', hint: 'Click to tile all connected bare ground, up to the walls' },
  ];
  for (const mode of floorModes) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = mode.hint;
    btn.innerHTML = `<span class="emoji">${mode.emoji}</span><span>${mode.label}</span>`;
    btn.onclick = () => {
      callbacks.onFloorDrawMode(mode.id);
      setActiveFloorMode(mode.id);
    };
    floorModeButtons.set(mode.id, btn);
    floorModeRow.appendChild(btn);
  }

  // --- What the floor is made of ---
  const surfaceRow = document.createElement('div');
  surfaceRow.className = 'toolbar-row submode-row';
  shelf.appendChild(surfaceRow);
  const surfaceButtons = new Map<FloorSurface, HTMLButtonElement>();
  for (const look of SURFACES) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = `${look.hint}. Drag over tiles already down to change them to it`;
    btn.innerHTML = `<span class="emoji">${look.emoji}</span><span>${look.label}</span>`;
    btn.onclick = () => {
      callbacks.onSurface(look.id);
      setActiveSurface(look.id);
    };
    surfaceButtons.set(look.id, btn);
    surfaceRow.appendChild(btn);
  }
  function setActiveSurface(active: FloorSurface) {
    for (const [id, btn] of surfaceButtons) btn.classList.toggle('active', id === active);
  }
  setActiveSurface('plain');

  // --- Kinds of pillar ---
  const pillarRow = document.createElement('div');
  pillarRow.className = 'toolbar-row submode-row';
  shelf.appendChild(pillarRow);
  const pillarButtons = new Map<PillarStyle, HTMLButtonElement>();
  const pillarStyles: { id: PillarStyle; label: string; emoji: string; hint: string }[] = [
    { id: 'wood', label: 'Wood post', emoji: '🪵', hint: 'A square wooden post' },
    { id: 'column', label: 'Column', emoji: '🏛️', hint: 'A round white column' },
    { id: 'stone', label: 'Stone', emoji: '🪨', hint: 'A stacked stone pier' },
    { id: 'steel', label: 'Steel', emoji: '⬛', hint: 'A thin dark steel post' },
  ];
  for (const style of pillarStyles) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = style.hint;
    btn.innerHTML = `<span class="emoji">${style.emoji}</span><span>${style.label}</span>`;
    btn.onclick = () => {
      callbacks.onPillarStyle(style.id);
      setActivePillar(style.id);
    };
    pillarButtons.set(style.id, btn);
    pillarRow.appendChild(btn);
  }
  function setActivePillar(active: PillarStyle) {
    for (const [id, btn] of pillarButtons) btn.classList.toggle('active', id === active);
  }
  setActivePillar('wood');

  // --- Window size: small and high, standard, or floor-to-ceiling ---
  const windowSizeRow = document.createElement('div');
  windowSizeRow.className = 'toolbar-row submode-row';
  shelf.appendChild(windowSizeRow);

  const windowSizeButtons = new Map<WindowSize, HTMLButtonElement>();
  const windowSizes: { id: WindowSize; label: string; emoji: string; hint: string }[] = [
    { id: 'small', label: 'Small', emoji: '🔲', hint: 'A narrow, high window, like in a bathroom' },
    { id: 'standard', label: 'Standard', emoji: '🪟', hint: 'A regular window' },
    { id: 'tall', label: 'Floor to ceiling', emoji: '🌅', hint: 'Glass almost the full height of the wall' },
  ];
  for (const size of windowSizes) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = size.hint;
    btn.innerHTML = `<span class="emoji">${size.emoji}</span><span>${size.label}</span>`;
    btn.onclick = () => {
      callbacks.onWindowSize(size.id);
      setActiveWindowSize(size.id);
    };
    windowSizeButtons.set(size.id, btn);
    windowSizeRow.appendChild(btn);
  }

  // --- Door style: an open doorway or arch, or a door that opens as pawns come through ---
  const doorStyleRow = document.createElement('div');
  doorStyleRow.className = 'toolbar-row submode-row';
  shelf.appendChild(doorStyleRow);

  const doorStyleButtons = new Map<DoorStyle, HTMLButtonElement>();
  const doorStyles: { id: DoorStyle; label: string; emoji: string; hint: string }[] = [
    { id: 'wood', label: 'Wood', emoji: '🚪', hint: 'A paneled wood door that swings open' },
    { id: 'glass', label: 'Glass', emoji: '🪟', hint: 'A door with a big glass pane' },
    { id: 'french', label: 'French', emoji: '🏛️', hint: 'A pair of glass doors that open from the middle' },
    { id: 'sliding', label: 'Sliding', emoji: '↔️', hint: 'A glass door that slides aside' },
    { id: 'barn', label: 'Barn', emoji: '🛖', hint: 'A plank door that rolls along a rail' },
    { id: 'saloon', label: 'Saloon', emoji: '🤠', hint: 'Two half doors that swing both ways' },
    { id: 'arch', label: 'Archway', emoji: '🌉', hint: 'An open arch, with no door' },
    { id: 'open', label: 'Doorway', emoji: '🔳', hint: 'A plain opening, with no door' },
  ];
  for (const style of doorStyles) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = style.hint;
    btn.innerHTML = `<span class="emoji">${style.emoji}</span><span>${style.label}</span>`;
    btn.onclick = () => {
      callbacks.onDoorStyle(style.id);
      setActiveDoorStyle(style.id);
    };
    doorStyleButtons.set(style.id, btn);
    doorStyleRow.appendChild(btn);
  }

  function setActiveDoorStyle(active: DoorStyle) {
    for (const [id, btn] of doorStyleButtons) btn.classList.toggle('active', id === active);
  }

  // --- Roof styles, for the whole house ---
  const roofStyleRow = document.createElement('div');
  roofStyleRow.className = 'toolbar-row submode-row';
  shelf.appendChild(roofStyleRow);

  const roofStyleButtons = new Map<RoofStyle, HTMLButtonElement>();
  const roofStyles: { id: RoofStyle; label: string; emoji: string; hint: string }[] = [
    { id: 'flat', label: 'Flat', emoji: '▬', hint: 'A flat roof' },
    { id: 'hip', label: 'Hip', emoji: '🔺', hint: 'Slopes up from every side to a ridge or a peak' },
    { id: 'gable', label: 'Gable', emoji: '🏠', hint: 'Two slopes meeting at a ridge along the long side, with the ends walled in' },
  ];
  for (const style of roofStyles) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = style.hint;
    btn.innerHTML = `<span class="emoji">${style.emoji}</span><span>${style.label}</span>`;
    btn.onclick = () => {
      callbacks.onRoofStyle(style.id);
      setActiveRoofStyle(style.id);
    };
    roofStyleButtons.set(style.id, btn);
    roofStyleRow.appendChild(btn);
  }

  // --- What the roof is covered in: pitched and flat roofs each have their own ---
  const roofCoveringRow = document.createElement('div');
  roofCoveringRow.className = 'toolbar-row submode-row';
  shelf.appendChild(roofCoveringRow);
  const pitchedCoverings: { id: RoofMaterial; label: string; emoji: string; hint: string }[] = [
    { id: 'slate', label: 'Slate', emoji: '🩶', hint: 'Gray slate shingles' },
    { id: 'asphalt', label: 'Asphalt', emoji: '⬛', hint: 'Dark asphalt shingles, like most houses' },
    { id: 'clay', label: 'Clay tile', emoji: '🧱', hint: 'Rounded terracotta tiles' },
    { id: 'shakes', label: 'Shakes', emoji: '🪵', hint: 'Split wooden shakes' },
    { id: 'metal', label: 'Metal', emoji: '🔩', hint: 'Standing-seam metal panels' },
    { id: 'thatch', label: 'Thatch', emoji: '🌾', hint: 'Thick straw thatch' },
  ];
  const flatCoverings: { id: FlatRoofFinish; label: string; emoji: string; hint: string }[] = [
    { id: 'gravel', label: 'Gravel', emoji: '🪨', hint: 'A gray gravel finish' },
    { id: 'membrane', label: 'Membrane', emoji: '⬜', hint: 'A smooth pale roofing membrane' },
    { id: 'green', label: 'Green roof', emoji: '🌱', hint: 'Low plants growing all over it' },
  ];
  const pitchedCoveringButtons = new Map<RoofMaterial, HTMLButtonElement>();
  const flatCoveringButtons = new Map<FlatRoofFinish, HTMLButtonElement>();
  const coveringButton = (label: string, emoji: string, hint: string, onClick: () => void) => {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = `${hint}, over the whole house`;
    btn.innerHTML = `<span class="emoji">${emoji}</span><span>${label}</span>`;
    btn.onclick = onClick;
    roofCoveringRow.appendChild(btn);
    return btn;
  };
  for (const covering of pitchedCoverings) {
    pitchedCoveringButtons.set(covering.id, coveringButton(covering.label, covering.emoji, covering.hint, () => {
      callbacks.onRoofCovering({ material: covering.id });
      setActiveRoofCovering({ ...roofCovering, material: covering.id });
    }));
  }
  for (const covering of flatCoverings) {
    flatCoveringButtons.set(covering.id, coveringButton(covering.label, covering.emoji, covering.hint, () => {
      callbacks.onRoofCovering({ flat: covering.id });
      setActiveRoofCovering({ ...roofCovering, flat: covering.id });
    }));
  }
  let roofCovering: { material: RoofMaterial; flat: FlatRoofFinish } = { material: 'slate', flat: 'gravel' };
  let roofIsFlat = true;
  function setActiveRoofCovering(covering: { material: RoofMaterial; flat: FlatRoofFinish }) {
    roofCovering = covering;
    for (const [id, btn] of pitchedCoveringButtons) {
      btn.classList.toggle('active', id === covering.material);
      btn.style.display = roofIsFlat ? 'none' : '';
    }
    for (const [id, btn] of flatCoveringButtons) {
      btn.classList.toggle('active', id === covering.flat);
      btn.style.display = roofIsFlat ? '' : 'none';
    }
  }

  function setActiveRoofStyle(active: RoofStyle) {
    for (const [id, btn] of roofStyleButtons) btn.classList.toggle('active', id === active);
    // Only the coverings for this kind of roof are on offer.
    roofIsFlat = active === 'flat';
    setActiveRoofCovering(roofCovering);
  }

  // --- Fences and railings ---
  const fenceRow = document.createElement('div');
  fenceRow.className = 'toolbar-row submode-row';
  shelf.appendChild(fenceRow);

  const fenceButtons = new Map<FenceStyle | 'gate' | 'auto', HTMLButtonElement>();
  const fenceStyles: { id: FenceStyle | 'gate' | 'auto'; label: string; emoji: string; hint: string }[] = [
    { id: 'picket', label: 'Picket', emoji: '🤍', hint: 'A low white picket fence' },
    { id: 'ranch', label: 'Ranch', emoji: '🐴', hint: 'Wooden posts and two rails' },
    { id: 'privacy', label: 'Privacy', emoji: '🚧', hint: 'Tall close boards nobody can see over' },
    { id: 'stone', label: 'Stone', emoji: '🪨', hint: 'A low stone wall' },
    { id: 'wood-rail', label: 'Wood railing', emoji: '🪵', hint: 'Wooden balusters and a handrail, for balconies. Tiles you lay upstairs from now on get it too' },
    { id: 'iron-rail', label: 'Iron railing', emoji: '⚫', hint: 'Thin black balusters. Tiles you lay upstairs from now on get it too' },
    { id: 'glass-rail', label: 'Glass railing', emoji: '🔷', hint: 'A clear glass panel and a metal rail. Tiles you lay upstairs from now on get it too' },
    { id: 'gate', label: 'Gate', emoji: '🚪', hint: 'Click a length of fence to make it a gate pawns walk through, or click a gate to make it fence again' },
    { id: 'auto', label: 'Auto-railings', emoji: '✨', hint: 'Tiles you lay upstairs from now on get a railing round their open edges and stairwells, drawn for you. Tiles already down keep theirs' },
  ];
  let fenceState = { style: 'picket' as FenceStyle, gate: false, auto: true };
  for (const style of fenceStyles) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = style.hint;
    btn.innerHTML = `<span class="emoji">${style.emoji}</span><span>${style.label}</span>`;
    btn.onclick = () => {
      if (style.id === 'auto') {
        callbacks.onAutoRailings(!fenceState.auto);
        setFenceState({ ...fenceState, auto: !fenceState.auto });
      } else if (style.id === 'gate') {
        callbacks.onFenceGate(!fenceState.gate);
        setFenceState({ ...fenceState, gate: !fenceState.gate });
      } else {
        callbacks.onFenceStyle(style.id);
        callbacks.onFenceGate(false);
        setFenceState({ ...fenceState, style: style.id, gate: false });
      }
    };
    fenceButtons.set(style.id, btn);
    fenceRow.appendChild(btn);
  }

  function setFenceState(state: { style: FenceStyle; gate: boolean; auto: boolean }) {
    fenceState = state;
    for (const [id, btn] of fenceButtons) {
      const on = id === 'auto' ? state.auto : id === 'gate' ? state.gate : !state.gate && id === state.style;
      btn.classList.toggle('active', on);
    }
  }

  // --- Kinds of stairs ---
  const stairsRow = document.createElement('div');
  stairsRow.className = 'toolbar-row submode-row';
  shelf.appendChild(stairsRow);

  const stairsButtons = new Map<string, HTMLButtonElement>();
  for (const def of STAIR_DEFS) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = STAIR_HINTS[def.type] ?? def.label;
    btn.innerHTML = `<span class="emoji">${def.emoji}</span><span>${def.label}</span>`;
    btn.onclick = () => {
      callbacks.onStairsType(def.type);
      setActiveStairs(def.type);
    };
    stairsButtons.set(def.type, btn);
    stairsRow.appendChild(btn);
  }

  function setActiveStairs(active: string) {
    for (const [id, btn] of stairsButtons) btn.classList.toggle('active', id === active);
  }

  // --- The Outdoor tool's pieces: trees, plants and garden things, as tiles ---
  const outdoorRow = document.createElement('div');
  outdoorRow.className = 'toolbar-row furniture-row outdoor-row';
  shelf.appendChild(outdoorRow);

  const outdoorButtons = new Map<string, HTMLButtonElement>();
  for (const def of FURNITURE_CATALOG.filter((each) => each.category === 'outdoor' && !each.buildTool)) {
    const btn = document.createElement('button');
    btn.className = 'furniture-btn';
    btn.title = def.label;
    btn.innerHTML = `<span class="emoji">${def.emoji}</span><span>${def.label}</span>`;
    btn.onclick = () => {
      callbacks.onOutdoorType(def.type);
      setActiveOutdoor(def.type);
    };
    outdoorButtons.set(def.type, btn);
    outdoorRow.appendChild(btn);
  }

  function setActiveOutdoor(active: string) {
    for (const [id, btn] of outdoorButtons) btn.classList.toggle('active', id === active);
  }

  // --- The Pool tool: pool or spa, and what to do with it: dig, or put in a ladder, stairs or a diving board ---
  const poolKindRow = document.createElement('div');
  poolKindRow.className = 'toolbar-row submode-row';
  shelf.appendChild(poolKindRow);
  const poolKindButtons = new Map<PoolKind, HTMLButtonElement>();
  const poolKinds: { id: PoolKind; label: string; emoji: string; hint: string }[] = [
    { id: 'pool', label: 'Pool', emoji: '🏊', hint: 'A deep pool to swim in. Drag to dig, Ctrl-drag to fill back in' },
    { id: 'spa', label: 'Spa', emoji: '♨️', hint: 'A shallow spa with a bench round the inside, to soak in. Drag to dig, Ctrl-drag to fill back in' },
  ];
  for (const kind of poolKinds) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = kind.hint;
    btn.innerHTML = `<span class="emoji">${kind.emoji}</span><span>${kind.label}</span>`;
    btn.onclick = () => {
      callbacks.onPoolKind(kind.id);
      setActivePoolKind(kind.id);
      callbacks.onPoolItem(null);
      setActivePoolItem(null);
    };
    poolKindButtons.set(kind.id, btn);
    poolKindRow.appendChild(btn);
  }
  function setActivePoolKind(active: PoolKind) {
    for (const [id, btn] of poolKindButtons) btn.classList.toggle('active', id === active);
  }
  setActivePoolKind('pool');

  const poolItemRow = document.createElement('div');
  poolItemRow.className = 'toolbar-row furniture-row outdoor-row';
  shelf.appendChild(poolItemRow);
  const poolItemButtons = new Map<string | null, HTMLButtonElement>();
  for (const item of [{ type: null, label: 'Dig', emoji: '⛏️', title: 'Dig a pool or spa, or Ctrl-drag to fill it back in' }, ...FURNITURE_CATALOG.filter((def) => def.pool).map((def) => ({ type: def.type, label: def.label, emoji: def.emoji, title: def.label }))]) {
    const btn = document.createElement('button');
    btn.className = 'furniture-btn';
    btn.title = item.title;
    btn.innerHTML = `<span class="emoji">${item.emoji}</span><span>${item.label}</span>`;
    btn.onclick = () => {
      callbacks.onPoolItem(item.type);
      setActivePoolItem(item.type);
    };
    poolItemButtons.set(item.type, btn);
    poolItemRow.appendChild(btn);
  }
  function setActivePoolItem(active: string | null) {
    for (const [id, btn] of poolItemButtons) btn.classList.toggle('active', id === active);
  }
  setActivePoolItem(null);

  // --- Furniture palette, one room's worth at a time ---
  const furnitureCategoryRow = document.createElement('div');
  furnitureCategoryRow.className = 'toolbar-row furniture-category-row';
  shelf.appendChild(furnitureCategoryRow);

  const furnitureCategoryButtons = new Map<FurnitureCategory, HTMLButtonElement>();
  for (const { id, label, emoji } of FURNITURE_CATEGORIES) {
    const btn = document.createElement('button');
    btn.className = 'furniture-category-btn';
    btn.title = label;
    btn.textContent = `${emoji} ${label}`;
    btn.onclick = () => {
      // Picking a tab means browsing, so a search gives way to it.
      setSearch('');
      // Whatever you were about to place is out of sight now, so the first piece in the room takes over.
      const first = FURNITURE_CATALOG.find((def) => def.category === id && !def.buildTool)!;
      pickFurniture(first.type);
    };
    furnitureCategoryButtons.set(id, btn);
    furnitureCategoryRow.appendChild(btn);
  }

  const furnitureRow = document.createElement('div');
  furnitureRow.className = 'toolbar-row furniture-row';
  shelf.appendChild(furnitureRow);
  shelf.appendChild(noMatches);

  const furnitureButtons = new Map<string, HTMLButtonElement>();
  /** The colors picked for pieces from their wheels, by type. Null is the piece's own color; nothing picked yet is white. */
  const pieceColors = new Map<string, string | null>();
  for (const def of FURNITURE_CATALOG) {
    if (def.buildTool) continue;
    const btn = document.createElement('button');
    btn.className = 'furniture-btn';
    btn.title = def.onTop ? `${def.label}: goes on a table, counter or shelf` : def.onWall ? `${def.label}: hangs on a wall` : def.onCeiling ? `${def.label}: hangs from the ceiling, indoors` : def.label;
    btn.innerHTML = `<span class="emoji">${def.emoji}</span><span>${def.label}</span>`;
    btn.onclick = () => {
      // Found from Build's search, it takes you over to Furnish to place it.
      if (activeMode !== 'furnish') {
        callbacks.onMode('furnish');
        setActiveMode('furnish');
      }
      pickFurniture(def.type);
    };
    if (isColorable(def)) {
      // Right-click for a wheel of colors to place it in. A drop on the tile, always there, says it has colors,
      // in the color it'll be placed in: white until another's picked.
      btn.title += '. Right-click to pick its color';
      const own = `#${def.color.toString(16).padStart(6, '0')}`;
      const dot = document.createElement('span');
      dot.className = 'piece-color-dot';
      dot.style.background = DEFAULT_PIECE_COLOR;
      btn.appendChild(dot);
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openColorWheel(e.clientX, e.clientY, {
          title: `${def.label}: ${colorPartName(def).toLowerCase()}`,
          colors: PIECE_COLORS,
          current: pieceColors.has(def.type) ? pieceColors.get(def.type) ?? undefined : DEFAULT_PIECE_COLOR,
          own,
          onPick: (color) => {
            pieceColors.set(def.type, color ?? null);
            dot.style.background = color ?? own;
            callbacks.onFurnitureColor(def.type, color);
            btn.click();
          },
        });
      });
    }
    furnitureButtons.set(def.type, btn);
    furnitureRow.appendChild(btn);
  }

  /** What's on show while searching: matching tools in Build, matching furniture from every tab, and a note if there's nothing. */
  function applySearch() {
    const searching = searchQuery !== '' && activeMode !== 'live';
    clearSearchBtn.style.visibility = searchQuery ? 'visible' : 'hidden';
    searchRow.style.display = activeMode === 'live' ? 'none' : 'flex';
    if (!searching) {
      noMatches.style.display = 'none';
      for (const btn of toolButtons.values()) btn.style.display = '';
      buildToolRow.style.display = activeMode === 'build' ? 'flex' : 'none';
      furnitureRow.style.display = activeMode === 'furnish' ? 'flex' : 'none';
      furnitureCategoryRow.style.display = activeMode === 'furnish' ? 'flex' : 'none';
      const shown = activeFurniture ?? FIRST_FURNITURE;
      const { category } = getFurnitureDef(shown);
      for (const [id, btn] of furnitureCategoryButtons) btn.classList.toggle('active', id === category);
      for (const [type, btn] of furnitureButtons) btn.style.display = getFurnitureDef(type).category === category ? '' : 'none';
      updateShelfVisibility();
      return;
    }
    let toolMatches = 0;
    if (activeMode === 'build') {
      for (const tool of BUILD_TOOLS) {
        const match = matchesSearch(searchQuery, tool.label, tool.id);
        toolButtons.get(tool.id)!.style.display = match ? '' : 'none';
        if (match) toolMatches++;
      }
    }
    buildToolRow.style.display = activeMode === 'build' && toolMatches > 0 ? 'flex' : 'none';
    let furnitureMatches = 0;
    for (const [type, btn] of furnitureButtons) {
      const def = getFurnitureDef(type);
      const tab = FURNITURE_CATEGORIES.find(({ id }) => id === def.category)!;
      const match = matchesSearch(searchQuery, def.label, def.type, tab.label, def.emoji);
      btn.style.display = match ? '' : 'none';
      if (match) furnitureMatches++;
    }
    for (const btn of furnitureCategoryButtons.values()) btn.classList.remove('active');
    furnitureCategoryRow.style.display = 'none';
    furnitureRow.style.display = furnitureMatches > 0 ? 'flex' : 'none';
    noMatches.style.display = toolMatches + furnitureMatches === 0 ? '' : 'none';
    updateShelfVisibility();
  }

  function setSearch(query: string) {
    searchQuery = query.trim();
    if (searchInput.value.trim() !== searchQuery) searchInput.value = query;
    saveSearch(searchQuery);
    applySearch();
  }

  searchInput.addEventListener('input', () => setSearch(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setSearch('');
      searchInput.blur();
    } else if (e.key === 'Enter') {
      // Takes the first thing it found.
      const rows = [buildToolRow, furnitureRow].filter((row) => row.style.display !== 'none');
      const first = rows.flatMap((row) => [...row.querySelectorAll<HTMLButtonElement>('button')]).find((btn) => btn.style.display !== 'none');
      first?.click();
      searchInput.blur();
    }
    e.stopPropagation();
  });
  clearSearchBtn.onclick = () => {
    setSearch('');
    searchInput.focus();
  };
  // Slash jumps to the search box from anywhere, like on a lot of websites.
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (e.key !== '/' || activeMode === 'live' || (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'))) return;
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  });

  /** Picking a piece also goes back to placing, say from Delete. */
  function pickFurniture(type: string) {
    callbacks.onFurnitureType(type);
    setActiveFurniture(type);
    if (activeTool !== 'furniture') {
      callbacks.onTool('furniture');
      setActiveTool('furniture');
    }
  }

  // --- Paint target toggle: wallpaper (walls) or flooring (tiles/carpet) ---
  const paintTargetRow = document.createElement('div');
  paintTargetRow.className = 'toolbar-row submode-row';
  shelf.appendChild(paintTargetRow);

  const paintTargetButtons = new Map<PaintTarget, HTMLButtonElement>();
  const paintTargets: { id: PaintTarget; label: string; emoji: string; hint: string }[] = [
    { id: 'wall', label: 'Walls', emoji: '🧱', hint: 'Paint wallpaper — walls, door frames, window frames' },
    { id: 'floor', label: 'Floors', emoji: '⬛', hint: 'Paint flooring — tile or carpet' },
  ];
  for (const target of paintTargets) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = target.hint;
    btn.innerHTML = `<span class="emoji">${target.emoji}</span><span>${target.label}</span>`;
    btn.onclick = () => {
      callbacks.onPaintTarget(target.id);
      setActivePaintTarget(target.id);
    };
    paintTargetButtons.set(target.id, btn);
    paintTargetRow.appendChild(btn);
  }

  // --- Paint method: brush what the cursor crosses, fill like a bucket, or pick up a color ---
  const paintMethodRow = document.createElement('div');
  paintMethodRow.className = 'toolbar-row submode-row';
  shelf.appendChild(paintMethodRow);

  const paintMethodButtons = new Map<PaintMethod, HTMLButtonElement>();
  const paintMethods: { id: PaintMethod; label: string; emoji: string; hint: string }[] = [
    { id: 'brush', label: 'Brush', emoji: '🖌️', hint: 'Paint whatever you click or drag across' },
    { id: 'bucket', label: 'Bucket', emoji: '🪣', hint: 'Click to fill everything connected that is the same color' },
    { id: 'sample', label: 'Eyedropper', emoji: '💧', hint: 'Click a wall or floor to pick up its color' },
  ];
  for (const method of paintMethods) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = method.hint;
    btn.innerHTML = `<span class="emoji">${method.emoji}</span><span>${method.label}</span>`;
    btn.onclick = () => {
      callbacks.onPaintMethod(method.id);
      setActivePaintMethod(method.id);
    };
    paintMethodButtons.set(method.id, btn);
    paintMethodRow.appendChild(btn);
  }

  // --- Paint colors ---
  const paintRow = document.createElement('div');
  paintRow.className = 'toolbar-row paint-row';
  shelf.appendChild(paintRow);

  const paintButtons = new Map<string, HTMLButtonElement>();
  for (const color of PAINT_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'paint-swatch';
    btn.style.backgroundColor = color;
    btn.title = color;
    btn.onclick = () => {
      callbacks.onPaintColor(color);
      setActivePaintColor(color);
      colorPicker.value = color;
    };
    paintButtons.set(color, btn);
    paintRow.appendChild(btn);
  }

  const colorPicker = document.createElement('input');
  colorPicker.type = 'color';
  colorPicker.className = 'paint-picker';
  colorPicker.title = 'Pick any color';
  colorPicker.value = PAINT_PRESETS[0];
  colorPicker.oninput = () => {
    callbacks.onPaintColor(colorPicker.value);
    setActivePaintColor(colorPicker.value);
  };
  paintRow.appendChild(colorPicker);

  // --- Delete filter toggle: anything at all, or furniture and nothing else ---
  const deleteFilterRow = document.createElement('div');
  deleteFilterRow.className = 'toolbar-row submode-row';
  shelf.appendChild(deleteFilterRow);

  const deleteFilterButtons = new Map<DeleteFilter, HTMLButtonElement>();
  const deleteFilters: { id: DeleteFilter; label: string; emoji: string; hint: string }[] = [
    { id: 'everything', label: 'Everything', emoji: '🏠', hint: 'Removes walls, floors, doors, windows and furniture' },
    { id: 'furniture', label: 'Furniture only', emoji: '🪑', hint: 'Removes furniture and leaves everything else alone' },
  ];
  for (const filter of deleteFilters) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = filter.hint;
    btn.innerHTML = `<span class="emoji">${filter.emoji}</span><span>${filter.label}</span>`;
    btn.onclick = () => {
      callbacks.onDeleteFilter(filter.id);
      setActiveDeleteFilter(filter.id);
    };
    deleteFilterButtons.set(filter.id, btn);
    deleteFilterRow.appendChild(btn);
  }

  // --- Delete mode toggle: sweep a whole area, or one click at a time ---
  const deleteModeRow = document.createElement('div');
  deleteModeRow.className = 'toolbar-row submode-row';
  shelf.appendChild(deleteModeRow);

  const deleteModeButtons = new Map<DeleteMode, HTMLButtonElement>();
  const deleteModes: { id: DeleteMode; label: string; emoji: string; hint: string }[] = [
    { id: 'area', label: 'Erase area', emoji: '🧹', hint: 'Drag a square, then let go to clear what\'s inside it (Esc cancels). A plain click removes one thing.' },
    { id: 'single', label: 'One at a time', emoji: '👆', hint: 'Each click removes exactly one thing' },
  ];
  for (const mode of deleteModes) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = mode.hint;
    btn.innerHTML = `<span class="emoji">${mode.emoji}</span><span>${mode.label}</span>`;
    btn.onclick = () => {
      callbacks.onDeleteMode(mode.id);
      setActiveDeleteMode(mode.id);
    };
    deleteModeButtons.set(mode.id, btn);
    deleteModeRow.appendChild(btn);
  }

  function setActiveMode(mode: AppMode) {
    activeMode = mode;
    for (const [id, btn] of modeButtons) btn.classList.toggle('active', id === mode);
    // Furnish mode's palette stays up the whole time, even while deleting, so a piece is always one click away.
    // Live mode can't edit the house, so nothing that does is on offer.
    editPanel.style.display = mode !== 'live' ? '' : 'none';
    if (band) {
      bandModeLabel.textContent = mode;
      shelf.dataset.mode = mode;
    }
    applySearch();
  }

  function setActiveTool(active: ToolId) {
    activeTool = active;
    if (active !== 'none' && activeMode !== 'live') lastToolOfMode[activeMode] = active;
    for (const [id, btn] of toolButtons) btn.classList.toggle('active', id === active);
    // In Furnish mode, the piece you'd place only lights up while you're placing.
    furnitureRow.classList.toggle('dimmed', active !== 'furniture');
    paintRow.style.display = active === 'paint' ? 'flex' : 'none';
    paintTargetRow.style.display = active === 'paint' ? 'flex' : 'none';
    paintMethodRow.style.display = active === 'paint' ? 'flex' : 'none';
    wallModeRow.style.display = active === 'wall' || active === 'fence' ? 'flex' : 'none';
    fenceRow.style.display = active === 'fence' ? 'flex' : 'none';
    floorModeRow.style.display = active === 'floor' ? 'flex' : 'none';
    surfaceRow.style.display = active === 'floor' ? 'flex' : 'none';
    pillarRow.style.display = active === 'pillar' ? 'flex' : 'none';
    poolKindRow.style.display = active === 'pool' ? 'flex' : 'none';
    poolItemRow.style.display = active === 'pool' ? 'flex' : 'none';
    windowSizeRow.style.display = active === 'window' ? 'flex' : 'none';
    doorStyleRow.style.display = active === 'door' ? 'flex' : 'none';
    roofStyleRow.style.display = active === 'roof' ? 'flex' : 'none';
    roofCoveringRow.style.display = active === 'roof' ? 'flex' : 'none';
    stairsRow.style.display = active === 'stairs' ? 'flex' : 'none';
    outdoorRow.style.display = active === 'outdoor' ? 'flex' : 'none';
    deleteModeRow.style.display = active === 'delete' ? 'flex' : 'none';
    deleteFilterRow.style.display = active === 'delete' ? 'flex' : 'none';
    updateShelfVisibility();
  }

  /** The shelf itself only takes up space (and shows its background) when
   * it actually has something visible in it — Live mode has nothing. */
  function updateShelfVisibility() {
    if (band) {
      updateBand();
      return;
    }
    const anyVisible = Array.from(shelf.children).some((el) => (el as HTMLElement).style.display !== 'none');
    shelf.style.display = anyVisible ? 'flex' : 'none';
  }

  /** Null when nothing is in hand: the room's pieces stay on show, with none picked. */
  function setActiveFurniture(active: string | null) {
    if (active === null) {
      for (const btn of furnitureButtons.values()) btn.classList.remove('active');
      return;
    }
    activeFurniture = active;
    for (const [type, btn] of furnitureButtons) btn.classList.toggle('active', type === active);
    applySearch();
  }

  // --- Band layout (?ui=band). The shelf becomes the band: mode name on its
  // edge, then Move/Delete/Undo, then the household (Live) or the catalog
  // (Build, Furnish), then the active tool's settings, then the tip. ---
  const bandModeLabel = document.createElement('div');
  const householdSlot = document.createElement('div');
  const catalogSection = document.createElement('div');
  const settingsSection = document.createElement('div');
  const settingsHeading = document.createElement('div');
  const inspectorSlot = document.createElement('div');
  const toolGroups: { el: HTMLElement; buttons: HTMLButtonElement[] }[] = [];
  const optionRows: [HTMLElement, string][] = [
    [fenceRow, 'Fence'],
    [wallModeRow, 'Shape'],
    [floorModeRow, 'Fill'],
    [surfaceRow, 'Surface'],
    [pillarRow, 'Kind'],
    [poolKindRow, 'Kind'],
    [poolItemRow, 'Items'],
    [windowSizeRow, 'Size'],
    [doorStyleRow, 'Style'],
    [roofStyleRow, 'Roof shape'],
    [roofCoveringRow, 'Covering'],
    [stairsRow, 'Kind'],
    // Tiles, like Furnish's pieces, so no label.
    [outdoorRow, ''],
    [paintTargetRow, 'Paint on'],
    [paintMethodRow, 'With'],
    [paintRow, 'Color'],
    [deleteFilterRow, 'Erase'],
    [deleteModeRow, 'How'],
  ];

  if (band) {
    container.classList.add('band-dock');
    rail.style.display = 'none';
    shelf.classList.add('band');
    bandModeLabel.className = 'band-mode-label';
    editPanel.className = 'band-section tool-strip';
    householdSlot.className = 'band-section household-slot';
    catalogSection.className = 'band-section catalog-section';
    settingsSection.className = 'band-section settings-section';
    settingsHeading.className = 'settings-heading';
    inspectorSlot.className = 'band-section inspector-slot';
    const inspectorHeading = document.createElement('div');
    inspectorHeading.className = 'band-section-heading';
    inspectorHeading.textContent = 'Tip';
    inspectorSlot.appendChild(inspectorHeading);

    catalogSection.append(searchRow, buildToolRow, furnitureCategoryRow, furnitureRow, noMatches);
    settingsSection.appendChild(settingsHeading);
    for (const [row, label] of optionRows) {
      if (!label) {
        settingsSection.appendChild(row);
        continue;
      }
      const el = document.createElement('span');
      el.className = 'option-label';
      el.textContent = label;
      row.prepend(el);
      settingsSection.appendChild(row);
    }
    // The Fence tool's nine buttons, in three labeled sets rather than one long wrap.
    for (const [before, label] of [['wood-rail', 'Railing'], ['gate', 'Also']] as const) {
      const lineBreak = document.createElement('span');
      lineBreak.className = 'option-break';
      const el = document.createElement('span');
      el.className = 'option-label';
      el.textContent = label;
      fenceRow.insertBefore(lineBreak, fenceButtons.get(before)!);
      fenceRow.insertBefore(el, fenceButtons.get(before)!);
    }
    // Under a "Railing" label, the buttons only need the material.
    for (const id of ['wood-rail', 'iron-rail', 'glass-rail'] as const) {
      const text = fenceButtons.get(id)!.lastElementChild!;
      text.textContent = text.textContent!.replace(' railing', '');
    }
    shelf.append(bandModeLabel, editPanel, householdSlot, catalogSection, settingsSection, inspectorSlot);

    for (const group of TOOL_GROUPS) {
      const el = document.createElement('div');
      el.className = 'tool-group';
      const label = document.createElement('div');
      label.className = 'tool-group-label';
      label.textContent = group.label;
      const tiles = document.createElement('div');
      tiles.className = 'tool-group-tiles';
      const buttons = group.tools.map((id) => toolButtons.get(id)!);
      tiles.append(...buttons);
      el.append(label, tiles);
      buildToolRow.appendChild(el);
      toolGroups.push({ el, buttons });
    }

    // Furnish's categories become tiles in labeled groups, just like Build's tools.
    for (const group of CATEGORY_GROUPS) {
      const el = document.createElement('div');
      el.className = 'tool-group';
      const label = document.createElement('div');
      label.className = 'tool-group-label';
      label.textContent = group.label;
      const tiles = document.createElement('div');
      tiles.className = 'tool-group-tiles';
      for (const id of group.categories) {
        const { label: text, emoji } = FURNITURE_CATEGORIES.find((c) => c.id === id)!;
        const btn = furnitureCategoryButtons.get(id)!;
        btn.className = 'furniture-btn';
        btn.innerHTML = `<span class="emoji">${emoji}</span><span>${text}</span>`;
        tiles.appendChild(btn);
      }
      el.append(label, tiles);
      furnitureCategoryRow.appendChild(el);
    }
    // A category in no group (Outdoor, which Build has instead) has no tile in Furnish.
    const grouped = new Set(CATEGORY_GROUPS.flatMap(({ categories }) => categories));
    for (const [id, btn] of furnitureCategoryButtons) if (!grouped.has(id)) btn.remove();
    furnitureCategoryRow.classList.add('build-tool-row');
  }

  /** Which sections of the band are up, and what the settings column is about. */
  function updateBand() {
    shelf.style.display = 'flex';
    const live = activeMode === 'live';
    householdSlot.style.display = live ? '' : 'none';
    catalogSection.style.display = live ? 'none' : '';
    for (const group of toolGroups) group.el.style.display = group.buttons.some((btn) => btn.style.display !== 'none') ? '' : 'none';
    // In Furnish the left column holds the search and the category tabs, and the
    // pieces of the picked category (or what the search found) fill the right
    // one. In Build, furniture that a search finds stays with the tools.
    const furnish = activeMode === 'furnish';
    const itemsHome = furnish ? settingsSection : catalogSection;
    if (furnitureRow.parentElement !== itemsHome) {
      if (furnish) settingsSection.appendChild(furnitureRow);
      else catalogSection.insertBefore(furnitureRow, noMatches);
    }
    const placing = furnish && activeTool === 'furniture';
    const anyOptions = optionRows.some(([row]) => row.style.display !== 'none');
    settingsSection.style.display = !live && (anyOptions || furnish) ? '' : 'none';
    const searching = searchQuery !== '';
    const category = FURNITURE_CATEGORIES.find(({ id }) => id === getFurnitureDef(activeFurniture ?? FIRST_FURNITURE).category)!;
    const subject = !placing
      ? TOOL_NAMES[activeTool]
      : searching
        ? { emoji: '🔍', label: `Found for “${searchQuery}”` }
        : category;
    settingsHeading.innerHTML = subject ? `<span class="emoji">${subject.emoji}</span><span>${subject.label}</span>` : '';
    settingsHeading.title = placing ? 'Pick a piece to place it' : 'The tool in hand: these settings are its own';
  }

  function setActivePaintColor(active: string) {
    for (const [color, btn] of paintButtons) btn.classList.toggle('active', color.toLowerCase() === active.toLowerCase());
    colorPicker.value = active;
  }

  function setActivePaintTarget(active: PaintTarget) {
    for (const [id, btn] of paintTargetButtons) btn.classList.toggle('active', id === active);
  }

  function setActivePaintMethod(active: PaintMethod) {
    for (const [id, btn] of paintMethodButtons) btn.classList.toggle('active', id === active);
  }

  function setActiveWallMode(active: WallDrawMode) {
    for (const [id, btn] of wallModeButtons) btn.classList.toggle('active', id === active);
  }

  function setActiveFloorMode(active: FloorDrawMode) {
    for (const [id, btn] of floorModeButtons) btn.classList.toggle('active', id === active);
  }

  function setActiveWindowSize(active: WindowSize) {
    for (const [id, btn] of windowSizeButtons) btn.classList.toggle('active', id === active);
  }

  function setActiveDeleteMode(active: DeleteMode) {
    for (const [id, btn] of deleteModeButtons) btn.classList.toggle('active', id === active);
  }

  function setActiveDeleteFilter(active: DeleteFilter) {
    for (const [id, btn] of deleteFilterButtons) btn.classList.toggle('active', id === active);
  }

  /** Switches both mode and tool together, e.g. for a keyboard shortcut that
   * jumps straight to a tool in the other mode. */
  function setActiveToolAnyMode(tool: ToolId) {
    // Move and Delete work in either editing mode, so from Live they go to Build.
    const mode = MODE_OF_TOOL[tool] ?? (activeMode === 'live' ? 'build' : undefined);
    if (mode) setActiveMode(mode);
    setActiveTool(tool);
  }

  setActiveMode(activeMode);
  setActiveTool(activeTool);
  paintRow.style.display = 'none';
  paintTargetRow.style.display = 'none';
  deleteModeRow.style.display = 'none';
  deleteFilterRow.style.display = 'none';
  setActiveFurniture(FIRST_FURNITURE);
  setActivePaintColor(PAINT_PRESETS[0]);
  setActivePaintTarget('wall');
  setActivePaintMethod('brush');
  setActiveWallMode('line');
  setActiveFloorMode('drag');
  setActiveWindowSize('standard');
  setActiveDoorStyle('wood');
  setActiveDeleteMode('area');
  setActiveDeleteFilter('everything');

  /** Same as clicking a mode's button, for its shortcut key. */
  function pressMode(mode: AppMode) {
    modeButtons.get(mode)!.click();
  }

  return { setActiveRoofCovering, pressMode, setActiveOutdoor, modeRow, householdSlot, inspectorSlot, setActiveRoofStyle, setActiveStairs, setFenceState, setActiveToolAnyMode, setActiveFurniture, setActivePaintColor, setActivePaintTarget, setActivePaintMethod, setActiveWallMode, setActiveDeleteMode, setHistoryState };
}

// ============================================================================
// View controls: camera + the wall-height view preference. A viewing concern,
// not a building one — kept in its own floating panel.
// ============================================================================

export interface ViewControlsCallbacks {
  onRotateCamera: (dir: 'cw' | 'ccw') => void;
  onZoom: (dir: 'in' | 'out') => void;
  onWallViewMode: (mode: WallViewMode) => void;
  onShowRooms: (visible: boolean) => void;
  /** Draws every walking pawn's route ahead over the house. */
  onShowPaths: (visible: boolean) => void;
  /** The Delete tool takes dirt, trash and dirty plates as well as what's built. */
  onSelectEverything: (on: boolean) => void;
  /** Whether the selected pawn's status stays up in Build and Furnish too, not just Live. */
  onShowStatuses: (visible: boolean) => void;
  onCenterCamera: () => void;
  /** Up or down a floor of the house. */
  onLevel: (direction: 'up' | 'down') => void;
}

/** What each floor of the house is called. */
const LEVEL_NAMES = ['Ground floor', 'Floor 2', 'Floor 3'];

/**
 * The wall views' icons: one little room drawn four ways, its walls stepping
 * down in the same order Home and End move through them. Roof on, every wall
 * full, the front walls cut low, every wall low.
 */
function wallViewIcon(mode: WallViewMode): string {
  const poly = (points: string, fill: string, stroke = '#633806') =>
    `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>`;
  const floor = poly('32,30 56,42 32,54 8,42', '#d3d1c7', '#5f5e5a');
  const backFull = poly('8,42 32,30 32,8 8,20', '#ef9f27') + poly('32,30 56,42 56,20 32,8', '#ba7517');
  const frontFull = poly('8,42 32,54 32,32 8,20', '#fac775') + poly('32,54 56,42 56,20 32,32', '#ef9f27');
  const backLow = poly('8,42 32,30 32,25 8,37', '#ef9f27') + poly('32,30 56,42 56,37 32,25', '#ba7517');
  const frontLow = poly('8,42 32,54 32,49 8,37', '#fac775') + poly('32,54 56,42 56,37 32,49', '#ef9f27');
  const roof = poly('8,20 32,32 32,-6', '#f0997b', '#712b13') + poly('32,32 56,20 32,-6', '#d85a30', '#712b13');
  const shapes = {
    roof: floor + backFull + frontFull + roof,
    full: floor + backFull + frontFull,
    cutaway: floor + backFull + frontLow,
    down: floor + backLow + frontLow,
  }[mode];
  return `<svg class="wall-view-icon" viewBox="5 -9 54 66" aria-hidden="true">${shapes}</svg>`;
}

export function createViewControls(container: HTMLElement, callbacks: ViewControlsCallbacks, options: { layout?: UiLayout } = {}) {
  const band = options.layout === 'band';
  container.innerHTML = '';
  container.className = 'panel view-panel';

  // --- Camera cross: zoom top/bottom, rotate left/right, laid out like a
  // plus sign so the direction each button moves the camera is obvious
  // without needing a label — the tooltip still carries the text. ---
  const cross = document.createElement('div');
  cross.className = 'view-cross';
  container.appendChild(cross);

  const zoomInBtn = makeIconButton('➕', 'Zoom in', 'scroll / +', () => callbacks.onZoom('in'));
  zoomInBtn.style.gridColumn = '2';
  zoomInBtn.style.gridRow = '1';

  const ccwBtn = makeIconButton('⟲', 'Rotate camera left', 'Q', () => callbacks.onRotateCamera('ccw'));
  ccwBtn.style.gridColumn = '1';
  ccwBtn.style.gridRow = '2';

  const cwBtn = makeIconButton('⟳', 'Rotate camera right', 'E', () => callbacks.onRotateCamera('cw'));
  cwBtn.style.gridColumn = '3';
  cwBtn.style.gridRow = '2';

  const zoomOutBtn = makeIconButton('➖', 'Zoom out', 'scroll / -', () => callbacks.onZoom('out'));
  zoomOutBtn.style.gridColumn = '2';
  zoomOutBtn.style.gridRow = '3';

  const centerBtn = makeIconButton('⌂', 'Center on house. Move the view with arrow keys, WASD, or right-drag', undefined, callbacks.onCenterCamera);
  centerBtn.style.gridColumn = '2';
  centerBtn.style.gridRow = '2';

  cross.append(zoomInBtn, ccwBtn, centerBtn, cwBtn, zoomOutBtn);

  // --- Which floor of the house you're on: up, its name, down. ---
  const levelRow = document.createElement('div');
  levelRow.className = 'level-row';
  container.appendChild(levelRow);
  const downBtn = makeIconButton('⬇', 'Down a floor', 'Page Down', () => callbacks.onLevel('down'));
  const levelLabel = document.createElement('span');
  levelLabel.className = 'level-label';
  const upBtn = makeIconButton('⬆', 'Up a floor', 'Page Up', () => callbacks.onLevel('up'));
  levelRow.append(downBtn, levelLabel, upBtn);

  /** Shows which floor you're on, and whether there's anywhere further up or down to go. */
  function setLevel(level: number, canGoUp: boolean) {
    levelLabel.textContent = LEVEL_NAMES[level] ?? `Floor ${level + 1}`;
    downBtn.disabled = level === 0;
    upBtn.disabled = !canGoUp;
    upBtn.title = canGoUp ? 'Up a floor (Page Up). Going above the top floor starts a new one' : 'The house is as tall as it goes';
  }
  setLevel(0, true);

  const wallViewRow = document.createElement('div');
  wallViewRow.className = 'view-mode-stack';
  container.appendChild(wallViewRow);

  const wallViewButtons = new Map<WallViewMode, HTMLButtonElement>();
  const wallViews: { id: WallViewMode; label: string; hint: string }[] = [
    { id: 'roof', label: 'Roof', hint: 'The finished house, with its roof on (Home and End step through the views)' },
    { id: 'full', label: 'Full walls', hint: 'Every wall stays full height (Home and End step through the views)' },
    { id: 'cutaway', label: 'See-through', hint: 'Near walls drop low so you can see inside (Home and End step through the views)' },
    { id: 'down', label: 'Walls down', hint: 'Every wall on this floor drops low, wherever it is and whichever way you look (Home and End step through the views)' },
  ];
  for (const view of wallViews) {
    const btn = document.createElement('button');
    btn.className = 'submode-btn';
    btn.title = view.hint;
    btn.innerHTML = `<span class="emoji">${wallViewIcon(view.id)}</span><span>${view.label}</span>`;
    btn.onclick = () => {
      callbacks.onWallViewMode(view.id);
      setActiveWallView(view.id);
    };
    wallViewButtons.set(view.id, btn);
    wallViewRow.appendChild(btn);
  }

  function setActiveWallView(active: WallViewMode) {
    for (const [id, btn] of wallViewButtons) btn.classList.toggle('active', id === active);
  }

  setActiveWallView('cutaway');

  const showRoomsBtn = document.createElement('button');
  showRoomsBtn.className = 'submode-btn';
  showRoomsBtn.title = 'Tint each fully enclosed room its own color';
  showRoomsBtn.innerHTML = `<span class="emoji">🏠</span><span>Show rooms</span>`;
  showRoomsBtn.onclick = () => {
    const visible = !showRoomsBtn.classList.contains('active');
    showRoomsBtn.classList.toggle('active', visible);
    callbacks.onShowRooms(visible);
  };
  container.appendChild(showRoomsBtn);

  const pathsBtn = document.createElement('button');
  pathsBtn.className = 'submode-btn';
  pathsBtn.title = "Draw where each pawn is walking: a trail of dots in its color, flowing toward a ring where it's headed";
  pathsBtn.innerHTML = `<span class="emoji">👣</span><span>Paths</span>`;
  pathsBtn.onclick = () => {
    const visible = !pathsBtn.classList.contains('active');
    pathsBtn.classList.toggle('active', visible);
    callbacks.onShowPaths(visible);
  };
  container.appendChild(pathsBtn);

  const everythingBtn = document.createElement('button');
  everythingBtn.className = 'submode-btn';
  everythingBtn.title = 'Let the Delete tool take dirt, trash and dirty plates too, by clicking them or dragging over them';
  everythingBtn.innerHTML = `<span class="emoji">🧹</span><span>Select everything</span>`;
  everythingBtn.onclick = () => {
    const on = !everythingBtn.classList.contains('active');
    everythingBtn.classList.toggle('active', on);
    callbacks.onSelectEverything(on);
  };
  container.appendChild(everythingBtn);

  const statusesBtn = document.createElement('button');
  statusesBtn.className = 'submode-btn';
  statusesBtn.title = "Keep the selected pawn's mood and needs on screen while building and furnishing too. Click a pawn to see theirs.";
  statusesBtn.innerHTML = `<span class="emoji">📊</span><span>Statuses</span>`;
  statusesBtn.onclick = () => {
    const visible = !statusesBtn.classList.contains('active');
    statusesBtn.classList.toggle('active', visible);
    callbacks.onShowStatuses(visible);
  };
  container.appendChild(statusesBtn);

  /** For when clicking a pawn turns statuses on. */
  function setStatusesShown(visible: boolean) {
    statusesBtn.classList.toggle('active', visible);
  }

  // Band: no Statuses button, and an icon-only 👁️‍🗨️ menu of mode controls,
  // starting with Show rooms. The button stays lit while any of them is on.
  // The caller places it (beside the 📁, under the camera).
  const specialViews = document.createElement('div');
  if (band) {
    statusesBtn.remove();
    specialViews.className = 'overflow-wrap special-views';
    const menu = document.createElement('div');
    menu.className = 'overflow-menu special-views-menu';
    const heading = document.createElement('div');
    heading.className = 'houses-heading';
    heading.textContent = 'Mode controls';
    const trigger = makeIconButton('👁️‍🗨️', 'Mode controls', undefined, () => menu.classList.toggle('open'));
    const views = [showRoomsBtn, pathsBtn, everythingBtn];
    for (const view of views) {
      view.className = 'overflow-menu-item special-view-item';
      view.addEventListener('click', () => trigger.classList.toggle('active', views.some((other) => other.classList.contains('active'))));
    }
    menu.append(heading, ...views);
    specialViews.append(trigger, menu);
    document.addEventListener('click', (e) => {
      if (!specialViews.contains(e.target as Node)) menu.classList.remove('open');
    });
  }

  return { setStatusesShown, setLevel, setWallView: setActiveWallView, specialViews };
}

// ============================================================================
// File controls: save/load/reset. Not a building tool, not a view
// preference — its own small panel.
// ============================================================================

/** A saved house, as the 📁 menu shows it. */
export interface HouseSummary {
  id: string;
  name: string;
  savedAt: number;
  pieces: number;
}

/** What a new house starts from. */
export type NewHouseStart = 'empty' | 'starter' | 'default' | 'copy';

export interface FileControlsCallbacks {
  onSave: () => void;
  onOpen: (id: string) => void;
  /** Starts a new house from bare ground, the starter house, the garden lot, or a copy of the one you're in. */
  onNew: (start: NewHouseStart) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** The saved houses, and which one you're in. */
  houses: () => { list: HouseSummary[]; currentId: string | null };
  /** Back to the title screen the game opens on. */
  onHome: () => void;
}

/** How long a save message stays up. A failure stays longer, since it needs reading. */
const MESSAGE_SECONDS = { ok: 2.2, error: 7 };
/** How long a 🗑️ waits for the second click that makes it go through. */
const DELETE_CONFIRM_SECONDS = 3;

/** When something was saved, the way you'd say it. */
export function savedWhen(time: number): string {
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return 'a minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const date = new Date(time);
  const today = new Date();
  const clock = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return `at ${clock}`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * The 📁 menu: the house you're in, saving it, your other saved houses to
 * switch to, rename or delete, and starting a new one.
 */
export function createFileControls(container: HTMLElement, callbacks: FileControlsCallbacks) {
  container.innerHTML = '';
  container.className = 'panel file-panel';

  const wrap = document.createElement('div');
  wrap.className = 'overflow-wrap';
  container.appendChild(wrap);

  const trigger = makeIconButton('📁', 'Your houses', undefined, () => {
    menu.classList.toggle('open');
    if (menu.classList.contains('open')) render();
  });
  wrap.appendChild(trigger);

  const menu = document.createElement('div');
  menu.className = 'overflow-menu houses-menu';
  wrap.appendChild(menu);

  // Beside the folder button: "Saved", or what went wrong.
  const message = document.createElement('div');
  message.className = 'save-message';
  message.setAttribute('role', 'status');
  wrap.appendChild(message);
  let messageTimer: number | undefined;

  let lastSaved: number | null = null;
  /** The house whose name is being typed in, if any. */
  let renaming: string | null = null;
  /** The house whose 🗑️ has been clicked once. */
  let deleting: string | null = null;
  let deleteTimer: number | undefined;

  function close() {
    menu.classList.remove('open');
    renaming = null;
    deleting = null;
  }

  function heading(text: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'houses-heading';
    el.textContent = text;
    return el;
  }

  function nameInput(house: HouseSummary): HTMLInputElement {
    const input = document.createElement('input');
    input.className = 'house-name-input';
    input.value = house.name;
    input.maxLength = 40;
    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      done = true;
      renaming = null;
      if (keep && input.value.trim() && input.value.trim() !== house.name) callbacks.onRename(house.id, input.value.trim());
      render();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish(false);
      }
    };
    input.onblur = () => finish(true);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    return input;
  }

  function smallButton(symbol: string, title: string, onClick: () => void, extra = ''): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `house-icon-btn ${extra}`.trim();
    btn.textContent = symbol;
    btn.title = title;
    btn.onclick = (e) => {
      e.stopPropagation();
      onClick();
    };
    return btn;
  }

  function houseRow(house: HouseSummary, isCurrent: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'house-row';
    row.classList.toggle('current', isCurrent);

    const main = document.createElement(isCurrent ? 'div' : 'button');
    main.className = 'house-row-main';
    if (!isCurrent) {
      main.title = `Open ${house.name}`;
      main.onclick = () => {
        close();
        callbacks.onOpen(house.id);
      };
    }
    if (renaming === house.id) {
      main.appendChild(nameInput(house));
    } else {
      const name = document.createElement('span');
      name.className = 'house-name';
      name.textContent = `${isCurrent ? '🏡' : '🏠'} ${house.name}`;
      main.appendChild(name);
    }
    const details = document.createElement('span');
    details.className = 'house-details';
    details.textContent = `${isCurrent ? "You're here · " : ''}${house.pieces} ${house.pieces === 1 ? 'piece' : 'pieces'} · saved ${savedWhen(house.savedAt)}`;
    main.appendChild(details);
    row.appendChild(main);

    const actions = document.createElement('div');
    actions.className = 'house-actions';
    actions.appendChild(
      smallButton('✏️', 'Rename', () => {
        renaming = house.id;
        deleting = null;
        render();
      }),
    );
    if (!isCurrent) {
      const confirming = deleting === house.id;
      actions.appendChild(
        smallButton(
          confirming ? 'Delete?' : '🗑️',
          confirming ? `Click again to delete ${house.name} for good` : `Delete ${house.name}`,
          () => {
            window.clearTimeout(deleteTimer);
            if (deleting === house.id) {
              deleting = null;
              callbacks.onDelete(house.id);
            } else {
              deleting = house.id;
              deleteTimer = window.setTimeout(() => {
                deleting = null;
                render();
              }, DELETE_CONFIRM_SECONDS * 1000);
            }
            render();
          },
          confirming ? 'confirm-delete' : '',
        ),
      );
    }
    row.appendChild(actions);
    return row;
  }

  function render() {
    const { list, currentId } = callbacks.houses();
    menu.innerHTML = '';
    const current = list.find((house) => house.id === currentId);
    const others = list.filter((house) => house.id !== currentId);

    menu.appendChild(heading('This house'));
    if (current) menu.appendChild(houseRow(current, true));
    else {
      const unsaved = document.createElement('div');
      unsaved.className = 'house-details house-unsaved';
      unsaved.textContent = 'Not saved yet. It saves on its own once you change something.';
      menu.appendChild(unsaved);
    }
    menu.appendChild(
      overflowMenuItem('💾', lastSaved === null ? 'Save now' : `Save now — saved ${savedWhen(lastSaved)}, and saves on its own as you go`, () => {
        close();
        callbacks.onSave();
      }),
    );

    if (others.length > 0) {
      menu.appendChild(heading('Your other houses'));
      const scroller = document.createElement('div');
      scroller.className = 'houses-list';
      for (const house of others) scroller.appendChild(houseRow(house, false));
      menu.appendChild(scroller);
    }

    menu.appendChild(heading('Start a new house'));
    const start = (symbol: string, label: string, how: NewHouseStart) =>
      overflowMenuItem(symbol, label, () => {
        close();
        callbacks.onNew(how);
      });
    menu.append(
      start('🆕', 'Empty plot — bare ground to build on from scratch', 'empty'),
      start('🏡', 'Starter house — a little furnished home with a bedroom, kitchen, bathroom and living room, the house a new game starts with', 'starter'),
      start('🌳', 'Garden lot — the big walled lot with gardens, trees and pets that new games used to start with', 'default'),
      start('📋', "Copy of this house — this one as it is now, as a new house to change", 'copy'),
    );

    menu.append(
      heading('Tiny Tenants'),
      overflowMenuItem('🏠', 'Start screen — back to the title screen the game opens on', () => {
        close();
        callbacks.onHome();
      }),
    );
  }

  document.addEventListener('click', (e) => {
    const target = e.target as Node;
    // A click that redrew the menu, like ✏️, has a target that's no longer on the page, but it was still inside.
    if (target.isConnected && !wrap.contains(target)) close();
  });

  return {
    /** A short note beside the folder button. */
    showMessage(text: string, kind: 'ok' | 'error') {
      message.textContent = text;
      message.classList.toggle('error', kind === 'error');
      message.classList.add('shown');
      window.clearTimeout(messageTimer);
      messageTimer = window.setTimeout(() => message.classList.remove('shown'), MESSAGE_SECONDS[kind] * 1000);
    },
    /** When the house was last saved, for the menu's Save line. */
    setLastSaved(time: number | null) {
      lastSaved = time;
      if (menu.classList.contains('open') && renaming === null) render();
    },
    /** Redraws the list, after a house is added, renamed or deleted. */
    refresh() {
      if (menu.classList.contains('open')) render();
    },
  };
}

function makeIconButton(symbol: string, label: string, key: string | undefined, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'icon-btn';
  btn.title = key ? `${label} (${key})` : label;
  btn.textContent = symbol;
  btn.onclick = onClick;
  return btn;
}

function overflowMenuItem(symbol: string, label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'overflow-menu-item';
  const [title] = label.split(' — ');
  btn.title = label;
  btn.innerHTML = `<span class="emoji">${symbol}</span><span>${title}</span>`;
  btn.onclick = onClick;
  return btn;
}
