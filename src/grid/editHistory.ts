import type { House, HouseData } from './house';

const MAX_STEPS = 100;

/** Undo and redo using saved copies of the whole house, recorded once per finished action. */
export class EditHistory {
  private past: string[] = [];
  private future: string[] = [];
  private current: string;
  private house: House;

  onChange: (() => void) | null = null;
  /** Has the last say on a finished action: false puts the house back the way it was, and nothing is recorded. */
  allow: (() => boolean) | null = null;

  constructor(house: House) {
    this.house = house;
    this.current = this.snapshot();
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Call when an action finishes; does nothing if the house didn't actually change. */
  commit() {
    if (this.snapshot() === this.current) return;
    if (this.allow && !this.allow()) {
      this.restore(this.current);
      return;
    }
    // `allow` may have tidied up after the action, so this is taken after it.
    const latest = this.snapshot();
    this.past.push(this.current);
    if (this.past.length > MAX_STEPS) this.past.shift();
    this.future = [];
    this.current = latest;
    this.onChange?.();
  }

  /** Forgets every step, for when a different house is opened: undoing back into the last one would mix the two. */
  reset() {
    this.past = [];
    this.future = [];
    this.current = this.snapshot();
    this.onChange?.();
  }

  undo() {
    this.commit();
    const previous = this.past.pop();
    if (previous === undefined) return;
    this.future.push(this.current);
    this.restore(previous);
  }

  redo() {
    const next = this.future.pop();
    if (next === undefined) return;
    this.past.push(this.current);
    this.restore(next);
  }

  private snapshot(): string {
    return JSON.stringify(this.house.toJSON());
  }

  private restore(state: string) {
    this.house.loadJSON(JSON.parse(state) as HouseData);
    // Room numbers can change on load, so compare later edits against what's actually in the model now.
    this.current = this.snapshot();
    this.onChange?.();
  }
}
