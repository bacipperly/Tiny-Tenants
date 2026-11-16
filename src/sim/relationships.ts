const LIMIT = 100;
const FRIENDS_AT = 20;
const RIVALS_AT = -20;

/** How every pair of pawns feels about each other, from -100 to 100. Feelings go both ways, and are remembered with the household. */
export class Relationships {
  private scores: Map<string, number>;
  private onChange: () => void;

  constructor(saved: Record<string, number> | undefined, onChange: () => void) {
    this.scores = new Map(Object.entries(saved ?? {}));
    this.onChange = onChange;
  }

  get(first: string, second: string): number {
    return this.scores.get(this.key(first, second)) ?? 0;
  }

  /** Returns what these two have just become, if this took them over the line. */
  adjust(first: string, second: string, change: number): 'friends' | 'rivals' | null {
    const before = this.get(first, second);
    const after = Math.max(-LIMIT, Math.min(LIMIT, before + change));
    this.scores.set(this.key(first, second), after);
    this.onChange();
    if (before < FRIENDS_AT && after >= FRIENDS_AT) return 'friends';
    if (before > RIVALS_AT && after <= RIVALS_AT) return 'rivals';
    return null;
  }

  areFriends(first: string, second: string): boolean {
    return this.get(first, second) >= FRIENDS_AT;
  }

  areRivals(first: string, second: string): boolean {
    return this.get(first, second) <= RIVALS_AT;
  }

  /** Ids get reused, so a new pawn mustn't inherit an old one's friends. */
  forget(id: string) {
    for (const key of this.scores.keys()) {
      if (key.split('|').includes(id)) this.scores.delete(key);
    }
  }

  toJSON(): Record<string, number> {
    return Object.fromEntries(this.scores);
  }

  private key(first: string, second: string): string {
    return first < second ? `${first}|${second}` : `${second}|${first}`;
  }
}
