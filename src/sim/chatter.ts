import type { World } from './world';
import { NEEDS } from './needs';
import type { Cell } from './pathfinding';
import type { Pawn } from './pawn';
import { PERSONALITY_TRAITS, compatibility } from './personality';
import type { Relationships } from './relationships';

const TALK_RANGE_CELLS = 3;
const LINE_SECONDS = 1.8;
/** A little shorter than a line, so there's a beat before the other pawn answers. */
const BUBBLE_SECONDS = 1.5;
const SOLO_THOUGHT_SECONDS = { min: 10, max: 28 };
/** Using a piece gives a pawn more to think about. */
const FURNITURE_THOUGHT_SECONDS = { min: 3, max: 7 };
/** How often pawns near each other consider starting a conversation. */
const LOOK_AROUND_SECONDS = 1;
/** How often a thought is about the company a pawn is or isn't in, rather than anything else. */
const CHANCE_OF_COMPANY_THOUGHT = 0.6;
/** A need this low is what's on a pawn's mind, most of the time. */
const WANTS_SOMETHING_BELOW = 35;
const CHANCE_OF_WANT_THOUGHT = 0.7;
const SOCIAL_PER_LINE = 6;
const SOCIAL_FOR_A_GOOD_CHAT = 15;
/** How likely a chat is to go well between two pawns with nothing for or against each other. */
const BASE_CHAT_SUCCESS = 0.7;
const CHAT_SUCCESS_PER_COMPATIBILITY = 0.08;
/** How much getting on or not, from -100 to 100, adds to the chance. */
const CHAT_SUCCESS_PER_RELATIONSHIP = 0.003;
const GOOD_CHAT_RELATIONSHIP = 5;
const BAD_CHAT_RELATIONSHIP = -7;
const MOOD_AFTER_CHAT_SECONDS = 20;

/** Each conversation stays on one topic, so the emojis read like an exchange rather than a random list. */
const TOPICS = [
  ['🍕', '😋', '🍔', '🤤', '🍟'],
  ['⚽', '🏀', '🏆', '🎉', '😄'],
  ['🐶', '🐱', '🥰', '🐰', '💕'],
  ['☀️', '😎', '🌈', '🌸', '😊'],
  ['🎵', '💃', '🎶', '🕺', '🎉'],
  ['🎮', '🕹️', '😤', '😂', '🏆'],
  ['🤔', '💡', '😮', '👍', '😄'],
  ['👋', '😊', '❤️', '🤗', '😄'],
  ['👻', '😱', '😂', '🙈', '😅'],
];
const SQUABBLE = ['😤', '🙄', '😠', '💢', '😡'];
const SOLO_THOUGHTS = ['🍎', '🌸', '🎈', '⭐', '🦋', '🤔', '🎵', '😊', '🍦', '🌈', '💭', '🐝'];

/** How a conversation you started on purpose turns out, in place of how an ordinary chat would. */
export interface ChatOutcome {
  /** The chance it goes down well, before moods. */
  chance: number;
  good: number;
  bad: number;
  goodReply: string;
  badReply: string;
  /** A mood both are left in when it goes badly, like after an argument. */
  badMood?: 'cranky' | 'sad';
}

type Conversation = { speakers: [Pawn, Pawn]; lines: string[]; line: number; untilNextLine: number; outcome?: ChatOutcome };

/** Close enough to chat and in the same room, so nobody talks through a wall. */
export function areTogether(world: World, a: Cell, b: Cell): boolean {
  return a.level === b.level && Math.hypot(a.x - b.x, a.z - b.z) <= TALK_RANGE_CELLS && world.roomAt(a) === world.roomAt(b);
}

/** Decides when pawns have a thought of their own, when two nearby ones get talking, and how that goes. */
export class Chatter {
  private model: World;
  private relationships: Relationships;
  private random: () => number;
  private conversations: Conversation[] = [];
  private restingUntil = new Map<Pawn, number>();
  private nextSoloThought = new Map<Pawn, number>();
  private clock = 0;
  private nextLookAround = 0;

  constructor(model: World, relationships: Relationships, random: () => number = Math.random) {
    this.model = model;
    this.relationships = relationships;
    this.random = random;
  }

  update(seconds: number, pawns: Pawn[]) {
    this.clock += seconds;
    this.continueConversations(seconds, pawns);
    if (this.clock >= this.nextLookAround) {
      this.nextLookAround = this.clock + LOOK_AROUND_SECONDS;
      this.startConversations(pawns);
    }
    this.haveSoloThoughts(pawns);
  }

  /** Starts a particular exchange between two pawns right now, like a joke or a hug, taking over anything else either was saying. The actor speaks first. */
  startWith(actor: Pawn, target: Pawn, lines: string[], outcome?: ChatOutcome) {
    this.conversations = this.conversations.filter(({ speakers }) => !speakers.includes(actor) && !speakers.includes(target));
    actor.faceToward(target.currentCell());
    target.faceToward(actor.currentCell());
    this.conversations.push({ speakers: [actor, target], lines, line: 0, untilNextLine: 0, outcome });
  }

  /** A random topic's worth of chat, the way pawns chat by themselves. */
  randomTopic(length: number): string[] {
    return TOPICS[Math.floor(this.random() * TOPICS.length)].slice(0, length);
  }

  /** A quick "excuse me" as one pawn makes way for another. It's not a conversation, so nobody needs a rest after it. */
  excuseMe(walker: Pawn, stander: Pawn) {
    walker.say('🙏', BUBBLE_SECONDS);
    stander.say('😅', BUBBLE_SECONDS);
  }

  private continueConversations(seconds: number, pawns: Pawn[]) {
    this.conversations = this.conversations.filter((conversation) => {
      const [first, second] = conversation.speakers;
      const stillTogether = pawns.includes(first) && pawns.includes(second) && !first.isWalking && !second.isWalking;
      if (!stillTogether) {
        this.rest(first);
        this.rest(second);
        return false;
      }
      conversation.untilNextLine -= seconds;
      if (conversation.untilNextLine > 0) return true;
      if (conversation.line >= conversation.lines.length) {
        this.finish(conversation);
        this.rest(first);
        this.rest(second);
        return false;
      }
      const speaker = conversation.speakers[conversation.line % 2];
      speaker.say(conversation.lines[conversation.line], BUBBLE_SECONDS);
      first.mind.fill('social', SOCIAL_PER_LINE);
      second.mind.fill('social', SOCIAL_PER_LINE);
      conversation.line++;
      conversation.untilNextLine = LINE_SECONDS;
      return true;
    });
  }

  /** The one who was spoken to decides how it went, going by whether their natures get along, how they already feel about each other and what mood they're in. */
  private finish({ speakers: [actor, target], outcome }: Conversation) {
    if (outcome) {
      this.finishWith(actor, target, outcome);
      return;
    }
    const feeling = this.relationships.get(actor.info.id, target.info.id);
    const chance =
      (BASE_CHAT_SUCCESS + compatibility(actor.info, target.info) * CHAT_SUCCESS_PER_COMPATIBILITY + feeling * CHAT_SUCCESS_PER_RELATIONSHIP) *
      actor.mind.chatSuccess *
      target.mind.chatSuccess;
    if (this.random() < chance) {
      const becoming = this.relationships.adjust(actor.info.id, target.info.id, GOOD_CHAT_RELATIONSHIP);
      target.say(becoming === 'friends' ? '💕' : '😄', BUBBLE_SECONDS);
      if (becoming === 'friends') actor.say('💕', BUBBLE_SECONDS);
      for (const pawn of [actor, target]) {
        pawn.mind.fill('social', SOCIAL_FOR_A_GOOD_CHAT);
        if (!pawn.mind.hasBuff('cranky')) pawn.mind.addBuff('happy', MOOD_AFTER_CHAT_SECONDS);
      }
      return;
    }
    const becoming = this.relationships.adjust(actor.info.id, target.info.id, BAD_CHAT_RELATIONSHIP);
    target.say(becoming === 'rivals' ? '💢' : '😒', BUBBLE_SECONDS);
    actor.say(becoming === 'rivals' ? '💢' : '😢', BUBBLE_SECONDS);
    if (!actor.mind.hasBuff('cranky')) actor.mind.addBuff('sad', MOOD_AFTER_CHAT_SECONDS);
  }

  private finishWith(actor: Pawn, target: Pawn, outcome: ChatOutcome) {
    const feeling = this.relationships.get(actor.info.id, target.info.id);
    const chance = (outcome.chance + feeling * CHAT_SUCCESS_PER_RELATIONSHIP) * actor.mind.chatSuccess * target.mind.chatSuccess;
    if (this.random() < chance) {
      const becoming = this.relationships.adjust(actor.info.id, target.info.id, outcome.good);
      target.say(becoming === 'friends' ? '💕' : outcome.goodReply, BUBBLE_SECONDS);
      if (becoming === 'friends') actor.say('💕', BUBBLE_SECONDS);
      for (const pawn of [actor, target]) pawn.mind.fill('social', SOCIAL_FOR_A_GOOD_CHAT);
      return;
    }
    const becoming = this.relationships.adjust(actor.info.id, target.info.id, outcome.bad);
    target.say(becoming === 'rivals' ? '💢' : outcome.badReply, BUBBLE_SECONDS);
    if (becoming === 'rivals') actor.say('💢', BUBBLE_SECONDS);
    if (outcome.badMood) for (const pawn of [actor, target]) pawn.mind.addBuff(outcome.badMood, MOOD_AFTER_CHAT_SECONDS);
  }

  private startConversations(pawns: Pawn[]) {
    const free = pawns.filter((pawn) => !pawn.isWalking && !this.isTalking(pawn) && this.clock >= (this.restingUntil.get(pawn) ?? 0));
    for (const first of free) {
      if (this.isTalking(first)) continue;
      const second = free.find((other) => other !== first && !this.isTalking(other) && this.canTalk(first, other));
      if (!second) continue;
      const traits = [first, second].map((pawn) => PERSONALITY_TRAITS[pawn.info.personality]);
      if (this.random() > ((traits[0].chanceToStartTalking + traits[1].chanceToStartTalking) / 2) * this.eagerness(first, second)) continue;

      const isSquabble = first.mind.hasBuff('cranky') || second.mind.hasBuff('cranky');
      const topic = isSquabble ? SQUABBLE : TOPICS[Math.floor(this.random() * TOPICS.length)];
      // The shyer one sets how long it goes on.
      const minLines = Math.min(traits[0].conversationLines.min, traits[1].conversationLines.min);
      const maxLines = Math.min(traits[0].conversationLines.max, traits[1].conversationLines.max);
      const length = minLines + Math.floor(this.random() * (maxLines - minLines + 1));
      first.faceToward(second.currentCell());
      second.faceToward(first.currentCell());
      this.conversations.push({ speakers: [first, second], lines: topic.slice(0, length), line: 0, untilNextLine: 0 });
    }
  }

  /** Friends and the lonely are quicker to chat, rivals slower, and a cranky pawn looks for a fight. */
  private eagerness(first: Pawn, second: Pawn): number {
    const feeling = this.relationships.get(first.info.id, second.info.id) / 100;
    const loneliness = (200 - first.mind.needs.social - second.mind.needs.social) / 200;
    return (1 + feeling) * (1 + loneliness) * Math.max(first.mind.chatEagerness, second.mind.chatEagerness);
  }

  private canTalk(first: Pawn, second: Pawn): boolean {
    return areTogether(this.model, first.currentCell(), second.currentCell());
  }

  private soloThoughtsFor(pawn: Pawn, pawns: Pawn[]): string[] {
    if (pawn.furnitureThoughts) return pawn.furnitureThoughts;
    const { lowestNeed, needs } = pawn.mind;
    if (needs[lowestNeed] < WANTS_SOMETHING_BELOW && this.random() < CHANCE_OF_WANT_THOUGHT) return [NEEDS[lowestNeed].want];
    const hasCompany = pawns.some((other) => other !== pawn && this.canTalk(pawn, other));
    const { thoughtsInCompany, thoughtsAlone } = PERSONALITY_TRAITS[pawn.info.personality];
    const companyThoughts = hasCompany ? thoughtsInCompany : thoughtsAlone;
    return companyThoughts.length > 0 && this.random() < CHANCE_OF_COMPANY_THOUGHT ? companyThoughts : SOLO_THOUGHTS;
  }

  private haveSoloThoughts(pawns: Pawn[]) {
    for (const pawn of pawns) {
      const due = this.nextSoloThought.get(pawn);
      const spacing = pawn.furnitureThoughts ? FURNITURE_THOUGHT_SECONDS : SOLO_THOUGHT_SECONDS;
      // Sitting down part-way through a long wait shouldn't mean finishing that wait.
      if (due === undefined || due > this.clock + spacing.max) {
        this.nextSoloThought.set(pawn, this.clock + this.between(spacing));
      } else if (this.clock >= due) {
        this.nextSoloThought.set(pawn, this.clock + this.between(spacing));
        if (this.isTalking(pawn)) continue;
        const thoughts = this.soloThoughtsFor(pawn, pawns);
        pawn.think(thoughts[Math.floor(this.random() * thoughts.length)], BUBBLE_SECONDS);
      }
    }
  }

  isTalking(pawn: Pawn): boolean {
    return this.conversations.some(({ speakers }) => speakers.includes(pawn));
  }

  private rest(pawn: Pawn) {
    this.restingUntil.set(pawn, this.clock + this.between(PERSONALITY_TRAITS[pawn.info.personality].restAfterTalkingSeconds));
  }

  private between({ min, max }: { min: number; max: number }): number {
    return min + this.random() * (max - min);
  }
}
