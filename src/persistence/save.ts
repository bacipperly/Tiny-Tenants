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
const HOUSEHOLD_KEY = 'house-builder-household-v1';
/** The list of saved houses, without the houses themselves. */
const HOUSES_KEY = 'house-builder-houses-v1';
/** Which house is being played. */
const CURRENT_KEY = 'house-builder-current-house';
const houseKey = (id: string) => `house-builder-house-${id}`;

/** What the 📁 menu lists for each saved house. */
export interface HouseEntry {
  id: string;
  name: string;
  /** When it was last saved, in milliseconds. */
  savedAt: number;
  /** How many pieces of furniture it has, to tell houses apart at a glance. */
  pieces: number;
}

export type SaveResult = { ok: true } | { ok: false; reason: string };

/** Every saved house, the one played most recently first. */
export function listHouses(): HouseEntry[] {
  moveOldSaveIn();
  try {
    const houses = JSON.parse(localStorage.getItem(HOUSES_KEY) ?? '[]') as HouseEntry[];
    return Array.isArray(houses) ? houses.sort((a, b) => b.savedAt - a.savedAt) : [];
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
  if (result.ok) localStorage.removeItem(houseKey(id));
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
  houses.push({ id, name, savedAt: Date.now(), pieces: house.furnitureCount() });
  return writeList(houses);
}

function writeList(houses: HouseEntry[]): SaveResult {
  try {
    localStorage.setItem(HOUSES_KEY, JSON.stringify(houses));
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

export function saveHousehold(data: HouseholdData) {
  try {
    localStorage.setItem(HOUSEHOLD_KEY, JSON.stringify(data));
  } catch {
    // Only who the pawns are and how they get along would be lost, which isn't worth interrupting play for.
  }
}

export function loadHousehold(): HouseholdData | null {
  try {
    const data = JSON.parse(localStorage.getItem(HOUSEHOLD_KEY) ?? 'null') as HouseholdData | null;
    // With nobody saved yet, the game starts with the default household.
    return data && data.pawns.length > 0 ? data : (structuredClone(defaultHousehold) as HouseholdData);
  } catch {
    return null;
  }
}
