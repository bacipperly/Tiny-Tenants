/** Minutes in a day, which the clock counts round. */
export const MINUTES_PER_DAY = 24 * 60;
/** How fast the day goes by at normal speed: two minutes of the day each second, so a whole day in twelve minutes. */
const DAY_MINUTES_PER_SECOND = 2;
/** The speeds the clock can run at, which clicking it steps through. */
export const CLOCK_SPEEDS = [1, 4, 12] as const;
/** When the sun comes up and goes down, in hours. */
const SUNRISE = 6;
const SUNSET = 20;
/** A new game starts on a fresh morning. */
const START_OF_PLAY = 8 * 60;

/** How far into the night it is, from 0 in daylight to 1 in the dead of night, which everyone in the house feels. */
let night = 0;
/** Days gone by since the first day played, with the part of today gone by, for things that grow. */
let daysGoneBy = 0;

/** The day it is, counting from the first day played, with the part of today gone by: 2.5 is midday on the third day. */
export function gameDay(): number {
  return daysGoneBy;
}

/** How long a hedge takes to grow in, in days. */
export const GROW_DAYS = 3;

/** How grown in something planted on this day is: from a small start up to 1, full size. */
export function growth(plantedOn: number | undefined): number {
  if (plantedOn === undefined) return 1;
  const grown = Math.min(1, Math.max(0, (daysGoneBy - plantedOn) / GROW_DAYS));
  return 0.3 + 0.7 * grown;
}

/** How far into the night it is, from 0 in daylight to 1 in the dead of night. */
export function nightfall(): number {
  return night;
}

/**
 * The time of day, going round and round while the household lives: the sun
 * crosses the sky, evenings get dark, and at night the household gets sleepy.
 */
export class DayClock {
  /** Minutes since midnight. */
  minutes: number;
  /** Whole days gone by since the first day played. */
  day: number;
  /** One of CLOCK_SPEEDS. */
  speed: number = CLOCK_SPEEDS[0];

  constructor(minutes = START_OF_PLAY, day = 0) {
    this.minutes = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    this.day = Math.max(0, Math.floor(day));
    this.share();
  }

  update(seconds: number) {
    const minutes = this.minutes + seconds * DAY_MINUTES_PER_SECOND * this.speed;
    this.day += Math.floor(minutes / MINUTES_PER_DAY);
    this.minutes = minutes % MINUTES_PER_DAY;
    this.share();
  }

  /** Lets the rest of the game know the time: how dark it is, and what day. */
  private share() {
    night = this.nightfall;
    daysGoneBy = this.day + this.minutes / MINUTES_PER_DAY;
  }

  /** Steps to the next speed, back to normal after the fastest. */
  faster() {
    const index = CLOCK_SPEEDS.indexOf(this.speed as (typeof CLOCK_SPEEDS)[number]);
    this.speed = CLOCK_SPEEDS[(index + 1) % CLOCK_SPEEDS.length];
  }

  get hours(): number {
    return this.minutes / 60;
  }

  /** "7:30 AM". */
  get label(): string {
    const hour = Math.floor(this.hours);
    const minute = Math.floor(this.minutes % 60);
    const twelve = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelve}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  }

  /** ☀️ by day, 🌅 at either end of it, 🌙 at night. */
  get icon(): string {
    const light = this.daylight;
    if (light > 0.85) return '☀️';
    if (light > 0.05) return '🌅';
    return '🌙';
  }

  /** How far the sun has crossed the sky, from 0 at sunrise to 1 at sunset; outside that range at night. */
  get sunProgress(): number {
    return (this.hours - SUNRISE) / (SUNSET - SUNRISE);
  }

  /** How high the sun is: 1 at midday, 0 on the horizon, below 0 at night. */
  get sunHeight(): number {
    const progress = this.sunProgress;
    if (progress >= 0 && progress <= 1) return Math.sin(Math.PI * progress);
    // Below the horizon, deepest in the middle of the night.
    const intoNight = progress > 1 ? (this.hours - SUNSET) / (24 - SUNSET + SUNRISE) : (this.hours + 24 - SUNSET) / (24 - SUNSET + SUNRISE);
    return -Math.sin(Math.PI * intoNight);
  }

  /** How light it is outdoors: 1 in full day, 0 at night, easing through dawn and dusk. */
  get daylight(): number {
    return smoothstep(-0.12, 0.3, this.sunHeight);
  }

  /** How golden the light is, strongest when the sun is low in the sky. */
  get goldenHour(): number {
    return this.daylight * (1 - smoothstep(0.1, 0.45, this.sunHeight));
  }

  /** How far into the night it is: 0 by day, 1 once it's properly dark. */
  get nightfall(): number {
    return 1 - smoothstep(-0.25, 0.05, this.sunHeight);
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
