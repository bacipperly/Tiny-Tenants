export type Need = 'hunger' | 'energy' | 'bladder' | 'hygiene' | 'fun' | 'social' | 'environment';

/** How much relief a piece of furniture, or another pawn, offers for each need. */
export type Advertisement = Partial<Record<Need, number>>;

/**
 * `fromSurroundings` needs don't run down by themselves: they settle toward how
 * pleasant it is where the pawn is, so a tidy, decorated room fills them and
 * a mess drags them down.
 */
export const NEEDS: Record<Need, { label: string; emoji: string; secondsToEmpty: number; want: string; fromSurroundings?: boolean }> = {
  hunger: { label: 'Hunger', emoji: '🍕', secondsToEmpty: 720, want: '🍕' },
  energy: { label: 'Energy', emoji: '⚡', secondsToEmpty: 1200, want: '😴' },
  bladder: { label: 'Bladder', emoji: '🚽', secondsToEmpty: 600, want: '🚽' },
  hygiene: { label: 'Hygiene', emoji: '🫧', secondsToEmpty: 960, want: '🧼' },
  fun: { label: 'Fun', emoji: '🎈', secondsToEmpty: 480, want: '🥱' },
  social: { label: 'Social', emoji: '💬', secondsToEmpty: 480, want: '🥺' },
  environment: { label: 'Environment', emoji: '🏡', secondsToEmpty: Infinity, want: '🤢', fromSurroundings: true },
};

export const NEED_NAMES = Object.keys(NEEDS) as Need[];
