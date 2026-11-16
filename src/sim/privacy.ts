import type { LevelPiece, World } from './world';
import { getFurnitureDef } from '../build/furnitureCatalog';
import type { Cell } from './pathfinding';
import type { Pawn } from './pawn';
import type { Relationships } from './relationships';

/** Below this, a pawn needs the toilet badly enough to barge in anyway. */
const DESPERATE_BLADDER = 8;
/** How much walking in on someone costs between them, more if they're not already friends, and more again with someone grouchy. */
const WALK_IN_HURT = { friends: -3, others: -8, grouchy: -12 };
const BUFF_SECONDS = { intruder: 25, occupant: 30 };
/** How long apart the lines of the scene are. */
const LINE_SECONDS = 1.3;

type Line = { pawn: Pawn; emoji: string; kind: 'say' | 'think'; at: number };

/**
 * Pawns' sense of privacy. Someone using a toilet, shower or bath has the room
 * to themselves: others won't choose to go in there, stop if they were on
 * their way, and won't head for a toilet while someone else is in that room.
 * Anyone who walks in anyway, because you sent them or they were desperate,
 * causes a scene: the one caught out yells, the one who walked in is
 * mortified and backs out, and it sours things between them.
 */
export class Privacy {
  private model: World;
  private relationships: Relationships;
  /** Who's using something private in each room right now. */
  private occupied = new Map<number, Pawn>();
  private lastRoom = new Map<Pawn, number>();
  /** The last square each pawn was on outside the room it's in now, to back out to. */
  private lastOutside = new Map<Pawn, Cell>();
  /** Who has already walked in on whom, so one visit makes one scene. */
  private caught = new Set<string>();
  private lines: Line[] = [];
  private clock = 0;

  constructor(model: World, relationships: Relationships) {
    this.model = model;
    this.relationships = relationships;
  }

  update(seconds: number, pawns: Pawn[]) {
    this.clock += seconds;
    this.occupied.clear();
    for (const pawn of pawns) {
      const piece = pawn.settledPiece;
      if (!piece || !getFurnitureDef(piece.type).private) continue;
      const room = this.roomOf(piece);
      if (room !== 0) this.occupied.set(room, pawn);
    }
    const occupants = new Set(this.occupied.values());
    for (const pair of [...this.caught]) if (!occupants.has(pawns.find((pawn) => pawn.info.id === pair.split('|')[0])!)) this.caught.delete(pair);

    for (const pawn of pawns) {
      const here = pawn.currentCell();
      const room = this.model.roomAt(here);
      const before = this.lastRoom.get(pawn);
      this.lastRoom.set(pawn, room);
      const occupant = this.occupied.get(room);
      if (before !== undefined && before !== room && occupant && occupant !== pawn) this.walkIn(occupant, pawn);
      else if (!occupant || occupant === pawn) this.lastOutside.set(pawn, here);
      this.turnBackIfHeadingIn(pawn, room);
    }
    this.speakLines();
  }

  /** Whether a pawn, choosing for itself, should stay away from this piece: it's in a room someone's using privately, or it's a toilet with someone else in the room already. */
  keepsOut(pawn: Pawn, piece: LevelPiece, pawns: Pawn[]): boolean {
    const room = this.roomOf(piece);
    if (room === 0) return false;
    const def = getFurnitureDef(piece.type);
    const desperate = (def.advertises.bladder ?? 0) > 0 && pawn.mind.needs.bladder < DESPERATE_BLADDER;
    const occupant = this.occupied.get(room);
    if (occupant && occupant !== pawn) return !desperate;
    if (!def.private) return false;
    const company = pawns.some((other) => other !== pawn && (this.roomAt(other.currentCell()) === room || this.roomAt(other.destinationCell()) === room));
    return company && !desperate;
  }

  /** Whether a square is somewhere this pawn wouldn't wander into right now. */
  isOffLimits(pawn: Pawn, cell: Cell): boolean {
    const occupant = this.occupied.get(this.roomAt(cell));
    return occupant !== undefined && occupant !== pawn;
  }

  /** Someone walked in. The one caught out reacts in character, the one who walked in is mortified, and if it wandered in by itself it backs out. */
  private walkIn(occupant: Pawn, intruder: Pawn) {
    const pair = `${occupant.info.id}|${intruder.info.id}`;
    if (this.caught.has(pair)) return;
    this.caught.add(pair);

    const friends = this.relationships.areFriends(occupant.info.id, intruder.info.id);
    const hurt = occupant.info.temperament === 'grouchy' ? WALK_IN_HURT.grouchy : friends ? WALK_IN_HURT.friends : WALK_IN_HURT.others;
    const became = this.relationships.adjust(occupant.info.id, intruder.info.id, hurt);

    const shy = occupant.info.personality === 'shy';
    const outburst = shy ? '😳' : occupant.info.temperament === 'grouchy' ? '🤬' : friends ? '😅' : '😠';
    this.queue(occupant, outburst, 'say', 0);
    this.queue(intruder, '😳', 'say', 0.3);
    this.queue(occupant, shy ? '🙈' : '🚪👉', 'say', LINE_SECONDS);
    this.queue(intruder, '🙏', 'say', LINE_SECONDS * 1.6);
    if (became === 'rivals') this.queue(occupant, '💢', 'think', LINE_SECONDS * 2.6);

    intruder.mind.addBuff('embarrassed', BUFF_SECONDS.intruder);
    occupant.mind.addBuff(shy || friends ? 'embarrassed' : 'cranky', BUFF_SECONDS.occupant);

    // Sent in by you, it carries on regardless. Otherwise it gets out of there.
    if (intruder.isWalking && !intruder.isStrolling) return;
    const back = this.lastOutside.get(intruder);
    if (back) intruder.strollTo(back);
  }

  /** A pawn wandering toward a room that's just become private thinks better of it and stops where it is. */
  private turnBackIfHeadingIn(pawn: Pawn, room: number) {
    if (!pawn.isStrolling) return;
    const heading = this.roomAt(pawn.destinationCell());
    const occupant = this.occupied.get(heading);
    if (heading === room || !occupant || occupant === pawn) return;
    if (pawn.mind.needs.bladder < DESPERATE_BLADDER && pawn.furniturePieceId !== null) return;
    pawn.think('🙊', 1.5);
    pawn.strollTo(pawn.currentCell());
  }

  private queue(pawn: Pawn, emoji: string, kind: 'say' | 'think', delay: number) {
    this.lines.push({ pawn, emoji, kind, at: this.clock + delay });
  }

  private speakLines() {
    const due = this.lines.filter((line) => line.at <= this.clock);
    if (due.length === 0) return;
    this.lines = this.lines.filter((line) => line.at > this.clock);
    for (const { pawn, emoji, kind } of due) pawn[kind](emoji, LINE_SECONDS + 0.4);
  }

  private roomOf(piece: LevelPiece): number {
    return this.model.roomAt(piece);
  }

  private roomAt(cell: Cell): number {
    return this.model.roomAt(cell);
  }
}
