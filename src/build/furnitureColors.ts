import type { FurnitureDef } from './furnitureCatalog';

/** The colors a piece can be given before it's placed, like a bed's bedding. */
export const PIECE_COLORS: { label: string; color: string }[] = [
  { label: 'White', color: '#f1ede4' },
  { label: 'Pink', color: '#e8a0b0' },
  { label: 'Red', color: '#c94a4a' },
  { label: 'Orange', color: '#e8935a' },
  { label: 'Yellow', color: '#efcf62' },
  { label: 'Green', color: '#86b874' },
  { label: 'Teal', color: '#5fb3b0' },
  { label: 'Blue', color: '#7ea4d4' },
  { label: 'Purple', color: '#a98ad0' },
  { label: 'Charcoal', color: '#55565e' },
];

/** What a colorable piece is placed in until another color is picked for it: the wheel's white. */
export const DEFAULT_PIECE_COLOR = PIECE_COLORS[0].color;

/** Upholstered seats, whose fabric takes the color. Wooden chairs, stools and benches keep their wood. */
const FABRIC_SEATS = new Set(['sofa', 'armchair', 'sectional', 'booth', 'desk-chair']);
const RUGS = new Set(['rug', 'runner']);

/** Whether a piece can be given a color from its wheel: beds (the bedding), upholstered seats (the fabric) and rugs. */
export function isColorable(def: FurnitureDef): boolean {
  return def.category === 'beds' || FABRIC_SEATS.has(def.type) || RUGS.has(def.type);
}

/** What the color changes on a piece, for the wheel's title. */
export function colorPartName(def: FurnitureDef): string {
  if (def.category === 'beds') return 'Bedding';
  if (FABRIC_SEATS.has(def.type)) return 'Fabric';
  return 'Color';
}
