import type { GridModelData } from '../grid/gridModel';
import { HOUSE_VERSION } from '../grid/house';
import type { House, HouseData } from '../grid/house';
import type { PawnInfo } from '../sim/pawn';
import type { PawnTraits } from '../sim/personality';
import type { Mess } from '../sim/messes';
import defaultHouse from './defaultHouse.json';
import starterHouse from './starterHouse.json';
import defaultHousehold from './defaultHousehold.json';

/** Where the one house was kept before there could be several. Read once to move it into the list, and otherwise left alone as a backup. */
const LEGACY_KEY = 'house-builder-save-v1';
const LEGACY_SAVED_AT_KEY = 'house-builder-saved-at';
/** The household from before each house had its own: the people in a game with no saved house yet, and the people a house saved before then moves in with. */
const HOUSEHOLD_KEY = 'house-builder-household-v1';
/** The list of saved houses, without the houses themselves. */
const HOUSES_KEY = 'house-builder-houses-v1';
/** Which house is being played. */
const CURRENT_KEY = 'house-builder-current-house';
const houseKey = (id: string) => `house-builder-house-${id}`;
/** Each house's own household: who lives there, how they get along, and the mess they've made. */
const householdKey = (id: string) => `house-builder-household-${id}`;

/** What the 📁 menu lists for each saved house. */
export interface HouseEntry {
  id: string;
  name: string;
  /** When it was last saved, in milliseconds. */
  savedAt: number;
  /** How many pieces of furniture it has, to tell houses apart at a glance. */
  pieces: number;
  /** How many people live there. Worked out when the list is read, not saved in it. */
  people: number;
}

export type SaveResult = { ok: true } | { ok: false; reason: string };

/** Every saved house, the one played most recently first. */
export function listHouses(): HouseEntry[] {
  moveOldSaveIn();
  try {
    const houses = JSON.parse(localStorage.getItem(HOUSES_KEY) ?? '[]') as HouseEntry[];
    return Array.isArray(houses) ? houses.map((house) => ({ ...house, people: householdOf(house.id).pawns.length })).sort((a, b) => b.savedAt - a.savedAt) : [];
  } catch {
    return [];
  }
}

/** The house being played, if it's been saved. */
export function currentHouse(): HouseEntry | null {
  // Before reading which house is current: the first time, moving the old save in is what sets it.
  const houses = listHouses();
  const id = localStorage.getItem(CURRENT_KEY);
  return houses.find((house) => house.id === id) ?? null;
}

/** Saves the house being played, and says whether it worked, and why not if it didn't. The first save makes it "My house". */
export function saveModel(house: House): SaveResult {
  const current = currentHouse();
  return current ? store(current.id, current.name, house) : createHouse(uniqueName('My house'), house);
}

/** Saves what's built now as a new house, which becomes the one being played. */
export function createHouse(name: string, house: House): SaveResult {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const result = store(id, name, house);
  if (result.ok) localStorage.setItem(CURRENT_KEY, id);
  return result;
}

/** Loads the house being played. False if there isn't one, or it couldn't be read. */
export function loadModel(house: House): boolean {
  const current = currentHouse();
  return current !== null && loadInto(current.id, house);
}

/** Switches to another saved house. */
export function openHouse(id: string, house: House): boolean {
  if (!loadInto(id, house)) return false;
  localStorage.setItem(CURRENT_KEY, id);
  return true;
}

export function renameHouse(id: string, name: string): SaveResult {
  const houses = listHouses();
  const house = houses.find((each) => each.id === id);
  if (!house) return { ok: false, reason: "that house isn't saved any more" };
  house.name = name.trim() || house.name;
  return writeList(houses);
}

/** Throws a saved house away for good. The one being played can't be. */
export function deleteHouse(id: string): SaveResult {
  if (localStorage.getItem(CURRENT_KEY) === id) return { ok: false, reason: "that's the house you're in" };
  const result = writeList(listHouses().filter((house) => house.id !== id));
  if (result.ok) {
    localStorage.removeItem(houseKey(id));
    localStorage.removeItem(householdKey(id));
  }
  return result;
}

/** A name no other house has: "House 2", "House 3" and so on. */
export function uniqueName(base: string): string {
  const taken = new Set(listHouses().map((house) => house.name));
  if (!taken.has(base)) return base;
  let number = 2;
  while (taken.has(`${base} ${number}`)) number++;
  return `${base} ${number}`;
}

export function hasSave(): boolean {
  return currentHouse() !== null;
}

/** When the house being played was last saved, if it ever has been. */
export function lastSavedAt(): number | null {
  return currentHouse()?.savedAt ?? null;
}

function store(id: string, name: string, house: House): SaveResult {
  const data = house.toJSON();
  const json = JSON.stringify(data);
  try {
    localStorage.setItem(houseKey(id), json);
  } catch (error) {
    return { ok: false, reason: storageProblem(error) };
  }
  // Some browsers, in private windows, accept the save and keep nothing.
  if (localStorage.getItem(houseKey(id)) !== json) return { ok: false, reason: "the browser didn't keep it" };
  const houses = listHouses().filter((house) => house.id !== id);
  houses.push({ id, name, savedAt: Date.now(), pieces: house.furnitureCount(), people: 0 });
  return writeList(houses);
}

function writeList(houses: HouseEntry[]): SaveResult {
  try {
    // The people count is read from each household, so it isn't kept in the list.
    localStorage.setItem(HOUSES_KEY, JSON.stringify(houses.map(({ people: _people, ...entry }) => entry)));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: storageProblem(error) };
  }
}

function loadInto(id: string, house: House): boolean {
  const raw = localStorage.getItem(houseKey(id));
  if (!raw) return false;
  try {
    house.loadJSON(upgrade(JSON.parse(raw) as GridModelData | HouseData));
    return true;
  } catch {
    return false;
  }
}

function storageProblem(error: unknown): string {
  const full = error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
  return full ? "the browser's storage for this game is full. Deleting a house you don't need makes room" : "the browser wouldn't let the game store it";
}

/** The first time, the one house saved before there could be several becomes "My house", the house being played. */
function moveOldSaveIn() {
  if (localStorage.getItem(HOUSES_KEY) !== null) return;
  const old = localStorage.getItem(LEGACY_KEY);
  if (!old) return;
  const id = 'my-house';
  try {
    const data = JSON.parse(old) as GridModelData;
    localStorage.setItem(houseKey(id), old);
    const savedAt = Number(localStorage.getItem(LEGACY_SAVED_AT_KEY)) || Date.now();
    localStorage.setItem(HOUSES_KEY, JSON.stringify([{ id, name: 'My house', savedAt, pieces: data.furniture?.length ?? 0 }]));
    localStorage.setItem(CURRENT_KEY, id);
  } catch {
    // Left where it was, to try again next time.
  }
}

/** The big walled lot with gardens and pets that new games used to start with, which "Garden lot" starts from. */
export function loadDefaultHouse(house: House) {
  house.loadJSON(upgrade(structuredClone(defaultHouse) as GridModelData));
}

/** The house a fresh game starts with, and the one "Starter house" starts from: a little furnished home with everything a household needs. */
export function loadStarterHouse(house: House) {
  house.loadJSON(upgrade(structuredClone(starterHouse) as HouseData));
}

/**
 * Brings an older save up to date.
 * - Before version 2, a desk came with a computer built in. Now they're
 *   separate pieces, so each old desk gets a computer set on it, and nobody's
 *   computer disappears.
 * - Before version 3, a house was one floor, saved on its own. Now it's a
 *   list of floors, and an older house is the ground floor.
 */
function upgrade(data: GridModelData | HouseData): HouseData {
  if ('levels' in data) return { ...data, version: HOUSE_VERSION, levels: data.levels.map(upgradeFloor) };
  return { version: HOUSE_VERSION, levels: [upgradeFloor(data)] };
}

function upgradeFloor(data: GridModelData): GridModelData {
  if ((data.version ?? 1) >= 2) return data;
  const computers = data.furniture
    .filter((piece) => piece.type === 'desk')
    .map((desk) => ({ id: `${desk.id}-computer`, type: 'computer', x: desk.x, z: desk.z, rotation: desk.rotation }));
  return { ...data, furniture: [...data.furniture, ...computers], version: 2 };
}

export interface HouseholdData {
  pawns: (Omit<PawnInfo, keyof PawnTraits> & Partial<PawnTraits>)[];
  selectedId: string;
  relationships?: Record<string, number>;
  /** What's been left lying about the house. */
  messes?: Mess[];
}

/** Saves the household of the house being played, or, before there's a saved house, the household a new game starts with. */
export function saveHousehold(data: HouseholdData) {
  const id = localStorage.getItem(CURRENT_KEY);
  try {
    localStorage.setItem(id ? householdKey(id) : HOUSEHOLD_KEY, JSON.stringify(data));
  } catch {
    // Only who the pawns are and how they get along would be lost, which isn't worth interrupting play for.
  }
}

/** The household of the house being played. */
export function loadHousehold(): HouseholdData {
  const id = currentHouse()?.id;
  return id ? householdOf(id) : sharedHousehold();
}

/**
 * The people who live in a saved house. A house saved before each house had
 * its own household moves in with the one everyone used to share, so nobody
 * disappears.
 */
function householdOf(id: string): HouseholdData {
  return readHousehold(householdKey(id)) ?? sharedHousehold();
}

/** The household from before each house had its own, or with nobody saved yet, the couple a new game's starter house starts with. */
function sharedHousehold(): HouseholdData {
  return readHousehold(HOUSEHOLD_KEY) ?? newHousehold('starter');
}

function readHousehold(key: string): HouseholdData | null {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? 'null') as HouseholdData | null;
    return data && Array.isArray(data.pawns) && data.pawns.length > 0 ? data : null;
  } catch {
    return null;
  }
}

/** How many people a new house starts with: the whole household on the Garden lot, and a couple anywhere else. */
const NEW_HOUSE_PEOPLE = 2;

/** Who moves into a new house. The Garden lot gets the default household; a Starter house or Empty lot gets its first two. */
export function newHousehold(start: 'empty' | 'starter' | 'default'): HouseholdData {
  const everyone = structuredClone(defaultHousehold) as HouseholdData;
  if (start === 'default') return everyone;
  const pawns = everyone.pawns.slice(0, NEW_HOUSE_PEOPLE);
  return { pawns, selectedId: pawns[0].id };
}

/** What an exported house file says it is, so a file that isn't one can be turned away. */
const EXPORT_KIND = 'tiny-tenants-house';

/** A house saved as a file: the house and the people who live there, to carry to another browser or computer. */
export interface HouseFile {
  kind: typeof EXPORT_KIND;
  version: 1;
  name: string;
  exportedAt: number;
  house: HouseData;
  household: HouseholdData;
}

/** The house being played, with its household, as a file's worth of text. */
export function exportHouse(name: string, house: House, household: HouseholdData): string {
  const file: HouseFile = { kind: EXPORT_KIND, version: 1, name, exportedAt: Date.now(), house: house.toJSON(), household };
  return JSON.stringify(file);
}

/**
 * Reads a house file and saves it as a new house, under its own name or one
 * like it, which becomes the house being played. Says who lives there, or
 * why the file couldn't be used. If it can't be, the house you were in is
 * opened again.
 */
export function importHouse(text: string, house: House): { ok: true; name: string; household: HouseholdData } | { ok: false; reason: string } {
  let file: HouseFile;
  try {
    file = JSON.parse(text) as HouseFile;
  } catch {
    return { ok: false, reason: "that file isn't a house file" };
  }
  if (file?.kind !== EXPORT_KIND || !file.house || typeof file.house !== 'object') return { ok: false, reason: "that file isn't a Tiny Tenants house" };
  const previous = currentHouse()?.id;
  const goBack = () => {
    if (previous) openHouse(previous, house);
  };
  try {
    house.loadJSON(upgrade(file.house));
  } catch {
    goBack();
    return { ok: false, reason: "the house in that file couldn't be read" };
  }
  const name = uniqueName((file.name || 'Imported house').slice(0, 40));
  const result = createHouse(name, house);
  if (!result.ok) {
    goBack();
    return result;
  }
  const people = file.household && Array.isArray(file.household.pawns) && file.household.pawns.length > 0 ? file.household : newHousehold('starter');
  return { ok: true, name, household: people };
}
