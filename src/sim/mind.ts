import type { Advertisement, Need } from './needs';
import { NEEDS, NEED_NAMES } from './needs';
import { BUFFS, TRAITS, traitsOf } from './personality';
import type { BuffId, PawnTraits } from './personality';

const FULL = 100;
const STARTING_NEED = { min: 55, max: 100 };
/** A piece advertising +50 restores 50 points over this long. */
const RELIEF_SECONDS = 10;
const RECURRING_BUFF_EVERY_SECONDS = { min: 60, max: 150 };
const RECURRING_BUFF_LASTS_SECONDS = { min: 25, max: 45 };
const UNCOMFORTABLE_BELOW = 15;
const CONTENT_ABOVE = 70;
/** How pleasant it is somewhere ordinary, before anything has been worked out. */
const ORDINARY_SURROUNDINGS = 65;
/** How quickly a need that comes from the surroundings catches up with them: about this many seconds to get most of the way. */
const SURROUNDINGS_SETTLE_SECONDS = 8;
const GROSSED_OUT_BELOW = 30;

/** What a pawn wants and how it feels, as opposed to where it is. Needs are forgotten on a refresh, the same as where it was standing. */
export class Mind {
  readonly needs: Record<Need, number>;
  private traits: PawnTraits;
  private random: () => number;
  private clock = 0;
  private buff: { id: BuffId; until: number } | null = null;
  private nextRecurringBuff: number;
  /** How pleasant it is where the pawn is right now, from 0 to 100. */
  private surroundings = ORDINARY_SURROUNDINGS;

  constructor(traits: PawnTraits, random: () => number = Math.random) {
    this.traits = traits;
    this.random = random;
    this.needs = Object.fromEntries(NEED_NAMES.map((need) => [need, NEEDS[need].fromSurroundings ? ORDINARY_SURROUNDINGS : this.between(STARTING_NEED)])) as Record<Need, number>;
    this.nextRecurringBuff = this.between(RECURRING_BUFF_EVERY_SECONDS);
  }

  /** Runs needs down, except any the pawn's furniture is filling up. Returns a mood that has just come over it, if any. */
  update(seconds: number, using: Advertisement | null): BuffId | null {
    this.clock += seconds;
    for (const need of NEED_NAMES) {
      const relief = using?.[need];
      if (NEEDS[need].fromSurroundings) this.fill(need, (this.surroundings - this.needs[need]) * Math.min(1, seconds / SURROUNDINGS_SETTLE_SECONDS));
      else if (relief) this.fill(need, (relief / RELIEF_SECONDS) * seconds);
      else this.fill(need, -(FULL / NEEDS[need].secondsToEmpty) * this.decayOf(need) * seconds);
    }
    if (this.buff && this.clock >= this.buff.until) this.buff = null;
    return this.startRecurringBuff();
  }

  /** How pleasant it is where the pawn is now, which its Environment need settles toward. */
  setSurroundings(pleasantness: number) {
    this.surroundings = Math.max(0, Math.min(FULL, pleasantness));
  }

  fill(need: Need, points: number) {
    this.needs[need] = Math.max(0, Math.min(FULL, this.needs[need] + points));
  }

  addBuff(id: BuffId, seconds: number) {
    this.buff = { id, until: this.clock + seconds };
  }

  hasBuff(id: BuffId): boolean {
    return this.buff?.id === id;
  }

  /** How much a chat means to this pawn right now: 1 is usual. */
  get chatEagerness(): number {
    return (this.buff && BUFFS[this.buff.id].chatEagerness) ?? 1;
  }

  /** How well a chat tends to go in this mood: 1 is usual. */
  get chatSuccess(): number {
    return (this.buff && BUFFS[this.buff.id].chatSuccess) ?? 1;
  }

  /**
   * How much this advertisement is worth to this pawn right now: for each need,
   * how far down it is, times what's on offer, times how much this pawn cares.
   * The shortfall is squared so that one badly low need beats several slightly
   * low ones.
   */
  utilityOf(advertisement: Advertisement): number {
    let utility = 0;
    for (const need of NEED_NAMES) {
      const relief = advertisement[need];
      if (!relief) continue;
      const shortfall = (FULL - this.needs[need]) / FULL;
      utility += shortfall * shortfall * relief * this.weightOf(need);
    }
    return utility;
  }

  /** The need that's furthest down. */
  get lowestNeed(): Need {
    return NEED_NAMES.reduce((lowest, need) => (this.needs[need] < this.needs[lowest] ? need : lowest));
  }

  /** Whether everything this piece fills is close to full. */
  isSatisfiedBy(advertisement: Advertisement): boolean {
    // A piece offering nothing, like a table with no food on it, can't have finished giving.
    return NEED_NAMES.some((need) => advertisement[need]) && NEED_NAMES.every((need) => !advertisement[need] || this.needs[need] >= FULL - 2);
  }

  get mood(): { label: string; emoji: string } {
    if (this.buff) return BUFFS[this.buff.id];
    const lowest = this.lowestNeed;
    if (lowest !== 'environment' && this.needs[lowest] < UNCOMFORTABLE_BELOW) return { label: 'Uncomfortable', emoji: '😣' };
    if (this.needs.environment < GROSSED_OUT_BELOW) return { label: 'Grossed Out', emoji: '🤢' };
    if (NEED_NAMES.every((need) => this.needs[need] > CONTENT_ABOVE)) return { label: 'Content', emoji: '😌' };
    return { label: 'Okay', emoji: '🙂' };
  }

  private decayOf(need: Need): number {
    return traitsOf(this.traits).reduce((rate, trait) => rate * (TRAITS[trait].needDecay?.[need] ?? 1), 1);
  }

  private weightOf(need: Need): number {
    const fromTraits = traitsOf(this.traits).reduce((weight, trait) => weight * (TRAITS[trait].needWeight?.[need] ?? 1), 1);
    return fromTraits * ((this.buff && BUFFS[this.buff.id].needWeight?.[need]) ?? 1);
  }

  /** Only a pawn with nothing else going on picks up a mood from its own nature. A later chat can still change it. */
  private startRecurringBuff(): BuffId | null {
    if (this.clock < this.nextRecurringBuff) return null;
    this.nextRecurringBuff = this.clock + this.between(RECURRING_BUFF_EVERY_SECONDS);
    if (this.buff) return null;
    const id = traitsOf(this.traits).map((trait) => TRAITS[trait].recurringBuff).find((buff) => buff);
    if (!id) return null;
    this.addBuff(id, this.between(RECURRING_BUFF_LASTS_SECONDS));
    return id;
  }

  private between({ min, max }: { min: number; max: number }): number {
    return min + this.random() * (max - min);
  }
}
