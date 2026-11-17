import type { Need } from './needs';

export type Personality = 'shy' | 'easygoing' | 'outgoing';
export type Temperament = 'playful' | 'mellow' | 'grouchy';
export type Tidiness = 'neat' | 'normal' | 'sloppy';
export type Trait = Personality | Temperament | Tidiness;

export interface PawnTraits {
  personality: Personality;
  temperament: Temperament;
  tidiness: Tidiness;
}

export type Gesture = 'hop' | 'spin' | 'wiggle' | 'bow' | 'slump' | 'stomp' | 'wave';
export type BuffId = 'cranky' | 'giddy' | 'happy' | 'sad' | 'embarrassed';

type Range = { min: number; max: number };
export type IdleFlavor = { emoji: string; bubble: 'say' | 'think'; gesture: Gesture };

interface SocialTraits {
  /** Each second a free pawn is near someone. A conversation's chance is the average of the two. */
  chanceToStartTalking: number;
  restAfterTalkingSeconds: Range;
  conversationLines: Range;
  /** When it gets moving and has nobody around, how often it goes to find someone. */
  chanceToSeekCompany: number;
  /** Leaves when someone's close by, and strolls to where nobody is. */
  avoidsCompany: boolean;
  /** Keeps its strolls to where someone is, once it has found them. */
  staysWithCompany: boolean;
  /** How a piece's popularity counts when choosing one: above 0 is drawn to a piece others are near, below 0 is put off by it. */
  furnitureCrowdPull: number;
  thoughtsInCompany: string[];
  thoughtsAlone: string[];
}

export const PERSONALITY_TRAITS: Record<Personality, SocialTraits> = {
  shy: {
    chanceToStartTalking: 0.04,
    restAfterTalkingSeconds: { min: 30, max: 70 },
    conversationLines: { min: 2, max: 3 },
    chanceToSeekCompany: 0,
    avoidsCompany: true,
    staysWithCompany: false,
    furnitureCrowdPull: -2,
    thoughtsInCompany: ['😳', '🙈', '😰', '😶'],
    thoughtsAlone: ['😌', '📖', '🍃', '🎧'],
  },
  easygoing: {
    chanceToStartTalking: 0.35,
    restAfterTalkingSeconds: { min: 8, max: 20 },
    conversationLines: { min: 2, max: 5 },
    chanceToSeekCompany: 0.2,
    avoidsCompany: false,
    staysWithCompany: false,
    furnitureCrowdPull: 0,
    thoughtsInCompany: [],
    thoughtsAlone: [],
  },
  outgoing: {
    chanceToStartTalking: 0.7,
    restAfterTalkingSeconds: { min: 3, max: 8 },
    conversationLines: { min: 3, max: 5 },
    chanceToSeekCompany: 0.75,
    avoidsCompany: false,
    staysWithCompany: true,
    furnitureCrowdPull: 1.5,
    thoughtsInCompany: ['😄', '🥳', '💬', '🤗'],
    thoughtsAlone: ['🥺', '👀', '🥲', '🙋'],
  },
};

interface TraitDef {
  label: string;
  emoji: string;
  /** How quickly a need runs down, compared to other pawns. */
  needDecay?: Partial<Record<Need, number>>;
  /** How much a need counts when choosing what to do, compared to other pawns. */
  needWeight?: Partial<Record<Need, number>>;
  /** What this pawn does now and then with nothing it needs to do. */
  idleFlavors?: IdleFlavor[];
  /** A mood that comes over this pawn from time to time. */
  recurringBuff?: BuffId;
}

export const TRAITS: Record<Trait, TraitDef> = {
  shy: {
    label: 'Shy',
    emoji: '🙈',
    needDecay: { social: 0.5 },
    needWeight: { social: 0.4 },
    idleFlavors: [{ emoji: '🫣', bubble: 'think', gesture: 'bow' }],
  },
  easygoing: { label: 'Easygoing', emoji: '🙂' },
  outgoing: {
    label: 'Outgoing',
    emoji: '🎉',
    needDecay: { social: 1.6 },
    needWeight: { social: 1.6 },
    idleFlavors: [
      { emoji: '👋', bubble: 'say', gesture: 'wiggle' },
      { emoji: '🎶', bubble: 'say', gesture: 'hop' },
    ],
  },
  playful: {
    label: 'Playful',
    emoji: '🤹',
    needDecay: { fun: 1.5 },
    needWeight: { fun: 1.5 },
    recurringBuff: 'giddy',
    idleFlavors: [
      { emoji: '🤹', bubble: 'think', gesture: 'hop' },
      { emoji: '🎈', bubble: 'think', gesture: 'spin' },
      { emoji: '😜', bubble: 'think', gesture: 'wiggle' },
    ],
  },
  mellow: { label: 'Mellow', emoji: '🍃' },
  grouchy: {
    label: 'Grouchy',
    emoji: '😤',
    needDecay: { fun: 0.8 },
    needWeight: { fun: 0.6 },
    recurringBuff: 'cranky',
    idleFlavors: [
      { emoji: '😮‍💨', bubble: 'think', gesture: 'slump' },
      { emoji: '😤', bubble: 'think', gesture: 'stomp' },
      { emoji: '🙄', bubble: 'think', gesture: 'slump' },
    ],
  },
  neat: {
    label: 'Neat',
    emoji: '🧹',
    needDecay: { hygiene: 1.3 },
    needWeight: { hygiene: 2.5, environment: 2.5 },
    idleFlavors: [{ emoji: '🧹', bubble: 'think', gesture: 'bow' }],
  },
  normal: { label: 'Normal', emoji: '🧺' },
  sloppy: {
    label: 'Sloppy',
    emoji: '🪰',
    needDecay: { hygiene: 0.7 },
    needWeight: { hygiene: 0.1, environment: 0.15 },
    idleFlavors: [{ emoji: '🪰', bubble: 'think', gesture: 'wiggle' }],
  },
};

/** How messy each kind of pawn is, and how much mess gets to it. */
export const TIDINESS_HABITS: Record<Tidiness, {
  /** The chance of a spill after a shower, scraps left from cooking, and so on. Muddy footprints are a bit less likely than this, per step. */
  messChance: number;
  /** The chance of leaving the plate where it ate instead of washing it up. */
  leavesDishes: number;
  /** How much a mess spoils somewhere for this pawn: 1 is usual. */
  bothered: number;
}> = {
  neat: { messChance: 0.15, leavesDishes: 0.03, bothered: 1.8 },
  normal: { messChance: 0.45, leavesDishes: 0.3, bothered: 1 },
  sloppy: { messChance: 0.85, leavesDishes: 0.8, bothered: 0.3 },
};

export const TRAIT_AXES: { key: keyof PawnTraits; choices: Trait[] }[] = [
  { key: 'personality', choices: ['shy', 'easygoing', 'outgoing'] },
  { key: 'temperament', choices: ['playful', 'mellow', 'grouchy'] },
  { key: 'tidiness', choices: ['neat', 'normal', 'sloppy'] },
];

export const BUFFS: Record<BuffId, { label: string; emoji: string; needWeight?: Partial<Record<Need, number>>; chatEagerness?: number; chatSuccess?: number }> = {
  cranky: { label: 'Cranky', emoji: '😤', chatEagerness: 3, chatSuccess: 0.4 },
  giddy: { label: 'Giddy', emoji: '🤪', needWeight: { fun: 2 } },
  happy: { label: 'Happy', emoji: '😊', chatSuccess: 1.2 },
  sad: { label: 'Sad', emoji: '😢', needWeight: { social: 0.5 } },
  embarrassed: { label: 'Embarrassed', emoji: '😳', chatEagerness: 0.5, chatSuccess: 0.8 },
};

/** How well an actor's trait goes down with a target's, read as "actor|target". Anything missing makes no difference either way. */
const COMPATIBILITY: Partial<Record<`${Trait}|${Trait}`, number>> = {
  'neat|neat': 1.5,
  'neat|sloppy': -2,
  'sloppy|neat': -2,
  'sloppy|sloppy': 1.5,
  'outgoing|outgoing': 2,
  'outgoing|shy': -1.5,
  'shy|outgoing': -1.5,
  'shy|shy': 1,
  'playful|playful': 1.5,
  'playful|grouchy': -1.5,
  'grouchy|playful': -1.5,
  'mellow|grouchy': 0.5,
};

export function traitsOf(pawn: PawnTraits): Trait[] {
  return [pawn.personality, pawn.temperament, pawn.tidiness];
}

export function compatibility(actor: PawnTraits, target: PawnTraits): number {
  let score = 0;
  for (const actorTrait of traitsOf(actor)) {
    for (const targetTrait of traitsOf(target)) score += COMPATIBILITY[`${actorTrait}|${targetTrait}`] ?? 0;
  }
  return score;
}

function randomChoice<T>(choices: readonly T[]): T {
  return choices[Math.floor(Math.random() * choices.length)];
}

/** Keeps whichever traits are already valid and picks the rest at random, so pawns from before a trait existed get one and keep it. */
export function completeTraits(traits: Partial<PawnTraits>): PawnTraits {
  const pick = <K extends keyof PawnTraits>(key: K): PawnTraits[K] => {
    const { choices } = TRAIT_AXES.find((axis) => axis.key === key)!;
    const value = traits[key];
    return (value && choices.includes(value) ? value : randomChoice(choices)) as PawnTraits[K];
  };
  return { personality: pick('personality'), temperament: pick('temperament'), tidiness: pick('tidiness') };
}
