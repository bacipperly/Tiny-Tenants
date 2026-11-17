import type { Cell, LevelPiece } from './world';
import { getFootprintCells, getFurnitureDef, isLit } from '../build/furnitureCatalog';
import type { FurnitureDef } from '../build/furnitureCatalog';
import type { Mess, MessKind } from './messes';
import { MESSES } from './messes';
import type { Pawn } from './pawn';
import type { Gesture } from './personality';
import type { PoolActivity, WayIn } from './swimming';
import type { PoolCell } from '../grid/gridModel';

/** One choice in a pie menu. With `children` it's a folder that opens a ring of its own. With `disabled` it shows, greyed out, saying why. */
export interface Interaction {
  label: string;
  emoji: string;
  act?: () => void;
  disabled?: string;
  children?: Interaction[];
}

/** What a pie menu shows: a title, the thing in the middle (an emoji, or a pawn's face in its color), and the choices around it. */
export interface InteractionMenu {
  title: string;
  emoji?: string;
  face?: string;
  items: Interaction[];
}

export type SocialKind = 'chat' | 'joke' | 'compliment' | 'gossip' | 'hug' | 'argue' | 'wave' | 'toss' | 'shove' | 'wrestle';

/** What the menus need from the household: who's who, what can be reached, and how to set things going. */
export interface InteractionContext {
  selected: Pawn | null;
  /** Why the selected pawn can't use a piece right now, or null if it can. */
  useBlocked(pawn: Pawn, piece: LevelPiece): string | null;
  isHavingMeal(pawn: Pawn): boolean;
  messes(): readonly Mess[];
  /** Why a mess can't be cleaned up, like there being no trash can, or null if it can. */
  cleanBlocked(mess: Mess): string | null;
  areFriends(a: Pawn, b: Pawn): boolean;
  areRivals(a: Pawn, b: Pawn): boolean;
  /** Why the selected pawn can't get to another pawn, or null if it can. */
  reachBlocked(pawn: Pawn, target: Pawn): string | null;
  /** Why the selected pawn can't roughhouse with another right now, like them being in bed, or null if it can. */
  roughBlocked(pawn: Pawn, target: Pawn): string | null;
  /** Why the selected pawn can't walk to a square, or null if it can. */
  walkBlocked(pawn: Pawn, cell: Cell): string | null;
  walk(cell: Cell): void;
  use(piece: LevelPiece, thoughts?: string[]): void;
  switchTo(piece: LevelPiece, on: boolean): void;
  /** Sends the selected pawn for a swim, a soak or a sit on the edge: near a square, a particular way in, or by a pool thing. */
  pool(activity: PoolActivity, options?: { near?: { x: number; z: number }; way?: WayIn; piece?: LevelPiece }): void;
  /** Whether a square is water, and which kind, or dry ground right beside some. */
  poolAt(cell: { x: number; z: number }): { water: PoolCell | null; edge: boolean; besideSpa: boolean; besidePool: boolean; waterAtEdge: boolean };
  /** Whether the selected pawn is in the water right now. */
  inWater(pawn: Pawn): boolean;
  /** Gets the selected pawn out of the water by a ladder, the stairs, or over the edge onto a square. */
  leavePool(by: { piece?: LevelPiece; near?: { x: number; z: number } }): void;
  clean(messId: string): void;
  social(target: Pawn, kind: SocialKind): void;
  gesture(gesture: Gesture, emoji: string): void;
  select(id: string): void;
}

/** What using a piece is called, by type where it has its own way, then by what pawns do at it. */
const VERB_BY_TYPE: Record<string, { label: string; emoji: string }> = {
  toilet: { label: 'Use the toilet', emoji: '🚽' },
  shower: { label: 'Take a shower', emoji: '🚿' },
  bathtub: { label: 'Take a bath', emoji: '🛁' },
  bed: { label: 'Sleep', emoji: '😴' },
  'double-bed': { label: 'Sleep', emoji: '😴' },
  sink: { label: 'Wash up', emoji: '🧼' },
  'counter-sink': { label: 'Wash up', emoji: '🧽' },
  fridge: { label: 'Get something to eat', emoji: '🍎' },
  stove: { label: 'Cook a meal', emoji: '🍳' },
  counter: { label: 'Make a snack', emoji: '🥪' },
  pantry: { label: 'Grab a snack', emoji: '🍪' },
  'apple-tree': { label: 'Pick an apple', emoji: '🍎' },
  mirror: { label: 'Check yourself out', emoji: '🪞' },
  'wall-mirror': { label: 'Check yourself out', emoji: '🪞' },
  'tall-wall-mirror': { label: 'Check your outfit', emoji: '🪞' },
  vanity: { label: 'Do your makeup', emoji: '💄' },
  dresser: { label: 'Change clothes', emoji: '👕' },
  'tall-dresser': { label: 'Change clothes', emoji: '👕' },
  'long-dresser': { label: 'Change clothes', emoji: '👕' },
  wardrobe: { label: 'Change clothes', emoji: '👗' },
  'small-wardrobe': { label: 'Change clothes', emoji: '👔' },
  armoire: { label: 'Change clothes', emoji: '👗' },
  'clothes-rack': { label: 'Try something on', emoji: '👚' },
  aquarium: { label: 'Watch the fish', emoji: '🐠' },
  'gerbil-cage': { label: 'Watch the gerbil', emoji: '🐹' },
  'parrot-cage': { label: 'Talk to the parrot', emoji: '🦜' },
  'lizard-tank': { label: 'Watch the lizard', emoji: '🦎' },
  'gecko-tank': { label: 'Watch the geckos', emoji: '🦎' },
  'pool-table': { label: 'Shoot pool', emoji: '🎱' },
  'rocking-horse': { label: 'Ride', emoji: '🐴' },
  'toy-box': { label: 'Play with toys', emoji: '🧸' },
  'toy-blocks': { label: 'Build a tower', emoji: '🧱' },
  dollhouse: { label: 'Play house', emoji: '🏠' },
  'train-set': { label: 'Play trains', emoji: '🚂' },
  'teddy-bear': { label: 'Hug the teddy', emoji: '🧸' },
  nightstand: { label: 'Read in bed', emoji: '📖' },
  'raised-garden': { label: 'Tend the garden', emoji: '🌱' },
  'garden-patch': { label: 'Tend the garden', emoji: '🌱' },
  'flower-bed': { label: 'Tend the flowers', emoji: '🌷' },
  'curio-cabinet': { label: 'Admire the keepsakes', emoji: '🏺' },
};

const VERB_BY_USE = {
  sit: { label: 'Sit', emoji: '🪑' },
  lie: { label: 'Lie down', emoji: '🛌' },
  inside: { label: 'Step in', emoji: '🚪' },
  stand: { label: 'Use', emoji: '✋' },
} as const;

const VERB_BY_ACTIVITY: Record<string, { label: string; emoji: string }> = {
  admire: { label: 'Admire', emoji: '😌' },
  peer: { label: 'Look closer', emoji: '👀' },
  warm: { label: 'Warm up', emoji: '🧣' },
  scrub: { label: 'Wash up', emoji: '🧼' },
  stir: { label: 'Cook', emoji: '🍳' },
  chop: { label: 'Prep food', emoji: '🔪' },
  rummage: { label: 'Look inside', emoji: '👀' },
  type: { label: 'Use', emoji: '💻' },
  play: { label: 'Play', emoji: '🎵' },
  watch: { label: 'Watch', emoji: '📺' },
  browse: { label: 'Browse', emoji: '📚' },
  primp: { label: 'Check yourself out', emoji: '🪞' },
  shoot: { label: 'Play', emoji: '🎱' },
  garden: { label: 'Play', emoji: '🧸' },
};

function verbFor(def: FurnitureDef): { label: string; emoji: string } {
  if (def.switchable) return def.switchable.use;
  return VERB_BY_TYPE[def.type] ?? (def.activity && VERB_BY_ACTIVITY[def.activity]) ?? VERB_BY_USE[def.use];
}

/** Pieces that can be used more than one way: a folder of what to watch, read or play, each with its own thoughts. */
const FLAVORS: Record<string, { label: string; emoji: string; options: { label: string; emoji: string; thoughts: string[] }[] }> = {};
const TV_SHOWS = {
  label: 'Watch TV',
  emoji: '📺',
  options: [
    { label: 'A comedy', emoji: '😂', thoughts: ['😂', '🤣', '📺'] },
    { label: 'Sports', emoji: '🏈', thoughts: ['🏈', '⚽', '🏆'] },
    { label: 'A cooking show', emoji: '🍳', thoughts: ['🍳', '🤤', '📺'] },
    { label: 'A nature show', emoji: '🦁', thoughts: ['🦁', '🐘', '🌿'] },
    { label: 'A scary movie', emoji: '👻', thoughts: ['👻', '😱', '🙈'] },
  ],
};
const COMPUTER_USES = {
  label: 'Use the computer',
  emoji: '💻',
  options: [
    { label: 'Play games', emoji: '🎮', thoughts: ['🎮', '🕹️', '😤'] },
    { label: 'Browse the web', emoji: '🌐', thoughts: ['🌐', '🤔', '😂'] },
    { label: 'Chat online', emoji: '💬', thoughts: ['💬', '😄', '💕'] },
    { label: 'Write', emoji: '📝', thoughts: ['📝', '🤔', '💡'] },
  ],
};
const BOOKS = {
  label: 'Read',
  emoji: '📚',
  options: [
    { label: 'A mystery', emoji: '🔍', thoughts: ['🔍', '🕵️', '😮'] },
    { label: 'A romance', emoji: '💕', thoughts: ['💕', '😍', '📖'] },
    { label: 'Science fiction', emoji: '🚀', thoughts: ['🚀', '👽', '🤯'] },
    { label: 'A cookbook', emoji: '🥘', thoughts: ['🥘', '🤤', '📖'] },
  ],
};
FLAVORS.tv = TV_SHOWS;
FLAVORS['big-tv'] = TV_SHOWS;
FLAVORS.computer = COMPUTER_USES;
FLAVORS.laptop = { ...COMPUTER_USES, label: 'Use the laptop' };
FLAVORS.bookshelf = BOOKS;
FLAVORS['small-bookshelf'] = BOOKS;
FLAVORS.piano = {
  label: 'Play the piano',
  emoji: '🎹',
  options: [
    { label: 'Something classical', emoji: '🎼', thoughts: ['🎼', '🎹', '😌'] },
    { label: 'Something jazzy', emoji: '🎷', thoughts: ['🎷', '🎶', '😎'] },
    { label: 'A silly tune', emoji: '🎵', thoughts: ['🎵', '😜', '🎶'] },
  ],
};
FLAVORS.radio = {
  label: 'Listen to the radio',
  emoji: '📻',
  options: [
    { label: 'Pop', emoji: '🎤', thoughts: ['🎤', '💃', '🎶'] },
    { label: 'Rock', emoji: '🎸', thoughts: ['🎸', '🤘', '😎'] },
    { label: 'Talk radio', emoji: '🗣️', thoughts: ['🗣️', '🤔', '😮'] },
  ],
};

const CLEAN_VERB: Record<MessKind, { label: string; emoji: string }> = {
  dishes: { label: 'Clear the dishes', emoji: '🍽️' },
  trash: { label: 'Pick up the trash', emoji: '🗑️' },
  puddle: { label: 'Mop up the puddle', emoji: '🧽' },
  dirt: { label: 'Scrub the footprints', emoji: '🧽' },
};

/** Whether a piece offers a pawn anything at all to do with it. A rug, a ceiling light or a desk doesn't. */
function isUsable(def: FurnitureDef): boolean {
  return Boolean(def.food || def.switchable || FLAVORS[def.type] || Object.values(def.advertises).some((value) => value));
}

function cleanItem(context: InteractionContext, mess: Mess): Interaction {
  const verb = CLEAN_VERB[mess.kind];
  return { ...verb, disabled: context.cleanBlocked(mess) ?? undefined, act: () => context.clean(mess.id) };
}

/** What the selected pawn can do with a piece. Null if there's nothing, so the click just walks there instead. */
export function pieceMenu(context: InteractionContext, piece: LevelPiece): InteractionMenu | null {
  const pawn = context.selected;
  const def = getFurnitureDef(piece.type);
  const items: Interaction[] = [];
  if (!pawn) return null;
  if (isUsable(def)) {
    const lit = isLit(piece);
    const blocked =
      (def.switchable && !lit ? 'The fire’s out' : null) ??
      (def.food && context.isHavingMeal(pawn) ? 'Already has something to eat' : null) ??
      context.useBlocked(pawn, piece);
    const flavor = FLAVORS[def.type];
    if (flavor) {
      items.push({
        label: flavor.label,
        emoji: flavor.emoji,
        disabled: blocked ?? undefined,
        children: flavor.options.map((option) => ({ label: option.label, emoji: option.emoji, act: () => context.use(piece, option.thoughts) })),
      });
    } else {
      // A fire that's out still offers warming up, greyed out, so it's clear lighting it comes first.
      items.push({ ...verbFor(def), disabled: blocked ?? undefined, act: () => context.use(piece) });
    }
    if (def.switchable) {
      const { on, off } = def.switchable;
      const reach = context.useBlocked(pawn, piece);
      items.push(lit ? { ...off, disabled: reach ?? undefined, act: () => context.switchTo(piece, false) } : { ...on, disabled: reach ?? undefined, act: () => context.switchTo(piece, true) });
    }
  }
  // Anything left lying on it or under it.
  const cells = getFootprintCells(piece.type, piece.x, piece.z, piece.rotation);
  for (const mess of context.messes()) {
    if (mess.host === piece.id || ((mess.level ?? 0) === piece.level && cells.some(({ x, z }) => x === mess.x && z === mess.z))) items.push(cleanItem(context, mess));
  }
  // The ways into a pool.
  if (def.pool === 'over') items.push({ label: 'Dive in', emoji: '🤸', act: () => context.pool('swim', { piece }) });
  // In the water, a ladder or the stairs is the way out; on dry ground, the way in.
  const swimming = context.inWater(pawn);
  if (def.pool === 'edge') items.push(swimming ? { label: 'Climb out', emoji: '🪜', act: () => context.leavePool({ piece }) } : { label: 'Climb in', emoji: '🪜', act: () => context.pool('swim', { piece }) });
  if (def.pool === 'inside') items.push(swimming ? { label: 'Walk out', emoji: '🛝', act: () => context.leavePool({ piece }) } : { label: 'Walk in', emoji: '🛝', act: () => context.pool('swim', { piece }) });
  if (items.length === 0) return null;
  return { title: def.label, emoji: def.emoji, items };
}

/** Clicking the floor or the yard: somewhere to send the selected pawn. */
export function groundMenu(context: InteractionContext, cell: Cell): InteractionMenu | null {
  const pawn = context.selected;
  if (!pawn) return null;
  const place = cell.level === 0 ? context.poolAt(cell) : { water: null, edge: false, besideSpa: false, besidePool: false, waterAtEdge: false };
  const { water, edge, besideSpa, besidePool, waterAtEdge } = place;
  if (water || edge) {
    // At any edge of a pool or spa: in or out right here. Elsewhere, in for a swim or a soak, or a sit on the edge.
    const items: Interaction[] = [];
    const wet = context.inWater(pawn);
    if (wet && (edge || waterAtEdge)) items.push({ label: 'Climb out here', emoji: '🧗', act: () => context.leavePool({ near: cell }) });
    if (!wet && (besidePool || (water?.kind === 'pool' && waterAtEdge))) items.push({ label: 'Get in here', emoji: '🪜', act: () => context.pool('swim', { near: cell, way: 'climb' }) });
    if (!wet && water?.kind !== 'spa' && (besidePool || water)) {
      items.push({ label: 'Swim', emoji: '🏊', act: () => context.pool('swim', { near: cell }) });
      items.push({ label: 'Jump in here', emoji: '💦', act: () => context.pool('swim', { near: cell, way: 'edge' }) });
    }
    if (water?.kind === 'spa' || besideSpa) items.push({ label: besideSpa || waterAtEdge ? 'Soak here' : 'Soak', emoji: '♨️', act: () => context.pool('soak', { near: cell }) });
    items.push({ label: 'Sit on the edge', emoji: '🦶', act: () => context.pool('edge', { near: cell }) });
    if (!water) items.push({ label: 'Go here', emoji: '🚶', disabled: context.walkBlocked(pawn, cell) ?? undefined, act: () => context.walk(cell) });
    return { title: water?.kind === 'spa' ? 'Spa' : 'Pool', emoji: water?.kind === 'spa' ? '♨️' : '🏊', items };
  }
  return {
    title: 'Here',
    emoji: '📍',
    items: [{ label: 'Go here', emoji: '🚶', disabled: context.walkBlocked(pawn, cell) ?? undefined, act: () => context.walk(cell) }],
  };
}

/** Cleaning up a mess that was clicked on directly. */
export function messMenu(context: InteractionContext, mess: Mess): InteractionMenu | null {
  if (!context.selected) return null;
  return { title: MESSES[mess.kind].label, emoji: MESSES[mess.kind].emoji, items: [cleanItem(context, mess)] };
}

/** The things to do in character that a pawn clicked on itself can do. */
const GESTURES: { label: string; emoji: string; gesture: Gesture }[] = [
  { label: 'Wave', emoji: '👋', gesture: 'wiggle' },
  { label: 'Dance', emoji: '💃', gesture: 'spin' },
  { label: 'Jump for joy', emoji: '🎉', gesture: 'hop' },
  { label: 'Take a bow', emoji: '🙇', gesture: 'bow' },
  { label: 'Stomp', emoji: '😤', gesture: 'stomp' },
  { label: 'Sigh', emoji: '😮‍💨', gesture: 'slump' },
];

/** Clicking the pawn you're controlling: something to do on the spot. */
export function selfMenu(context: InteractionContext, pawn: Pawn): InteractionMenu {
  const busy = pawn.isOnFurniture ? 'Get up first' : pawn.isWalking ? 'Busy walking' : undefined;
  return {
    title: pawn.info.name,
    face: pawn.info.color,
    items: GESTURES.map(({ label, emoji, gesture }) => ({ label, emoji, disabled: busy, act: () => context.gesture(gesture, emoji) })),
  };
}

/**
 * Clicking another pawn: what the selected one can do with them. Hugs and
 * gossip are for friends, so they're greyed out until then and gone for
 * rivals. Selecting them comes last.
 */
export function pawnMenu(context: InteractionContext, target: Pawn): InteractionMenu | null {
  const actor = context.selected;
  if (!actor || actor === target) return null;
  const friends = context.areFriends(actor, target);
  const rivals = context.areRivals(actor, target);
  const reach = context.reachBlocked(actor, target) ?? undefined;
  const social = (kind: SocialKind, label: string, emoji: string, disabled?: string): Interaction => ({ label, emoji, disabled: reach ?? disabled, act: () => context.social(target, kind) });
  const talk: Interaction[] = [
    social('chat', 'Chat', '💬'),
    social('joke', 'Tell a joke', '😂'),
    social('compliment', 'Compliment', '😊'),
  ];
  if (!rivals) talk.push(social('gossip', 'Gossip', '🤫', friends ? undefined : 'Only friends share gossip'));
  const items: Interaction[] = [{ label: 'Talk', emoji: '💬', children: talk, disabled: reach }];
  if (!rivals) items.push(social('hug', 'Bear hug', '🤗', friends ? undefined : 'Not close enough for a hug yet'));
  // Throwing each other about: great fun between friends, and a good way to make an enemy.
  const rough = reach ?? context.roughBlocked(actor, target) ?? undefined;
  items.push({
    label: 'Roughhouse',
    emoji: '🤼',
    disabled: rough,
    children: [
      { label: 'Toss', emoji: '🤾', disabled: rough, act: () => context.social(target, 'toss') },
      { label: 'Shove', emoji: '🫸', disabled: rough, act: () => context.social(target, 'shove') },
      { label: 'Wrestle', emoji: '🤼', disabled: rough, act: () => context.social(target, 'wrestle') },
    ],
  });
  items.push(social('argue', 'Argue', '💢'));
  // Waving works from across the room, so it doesn't need a way over.
  items.push({ label: 'Wave', emoji: '👋', act: () => context.social(target, 'wave') });
  items.push({ label: `Select ${target.info.name}`, emoji: '👆', act: () => context.select(target.info.id) });
  return { title: target.info.name, face: target.info.color, items };
}
