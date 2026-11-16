import { savedWhen } from './toolbar';
import type { HouseSummary, NewHouseStart } from './toolbar';

export interface StartScreenCallbacks {
  /** The saved houses, and which one is loaded behind the start screen. */
  houses: () => { list: HouseSummary[]; currentId: string | null };
  /** Into the house that's already loaded behind the screen. */
  onContinue: () => void;
  onOpen: (id: string) => void;
  onNew: (start: Exclude<NewHouseStart, 'copy'>) => void;
  /** When the screen opens or closes, so the game can hide its menus and turn the view. */
  onShownChange: (shown: boolean) => void;
}

/** The ways to start a new house, as the start screen offers them. */
const NEW_HOUSES: { start: Exclude<NewHouseStart, 'copy'>; symbol: string; name: string; about: string }[] = [
  { start: 'starter', symbol: '🏡', name: 'Starter house', about: 'Furnished and ready to move into' },
  { start: 'default', symbol: '🌳', name: 'Garden lot', about: 'A big walled lot with gardens and pets' },
  { start: 'empty', symbol: '🟩', name: 'Empty lot', about: 'Bare ground to build from scratch' },
];

/** How long the screen takes to fade away, in milliseconds. Matches the CSS. */
const FADE_MS = 350;

/**
 * The title screen the game opens on: the name, Continue into the house you
 * were last in, a new house of one of three kinds, or another saved house.
 * The house it's on turns slowly behind it.
 */
export function createStartScreen(parent: HTMLElement, callbacks: StartScreenCallbacks) {
  const screen = document.createElement('div');
  screen.className = 'start-screen';
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-label', 'Tiny Tenants');
  parent.appendChild(screen);

  let shown = false;
  let fadeTimer: number | undefined;

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** Closes the screen, then does what was picked once it's out of the way. */
  function choose(action: () => void) {
    hide();
    action();
  }

  function render() {
    const { list, currentId } = callbacks.houses();
    const current = list.find((house) => house.id === currentId);
    const others = list.filter((house) => house.id !== currentId);
    screen.innerHTML = '';

    const card = el('div', 'start-card');
    screen.appendChild(card);

    const logo = el('div', 'start-logo');
    logo.append(el('div', 'start-logo-mark', '🏡'), el('h1', 'start-title', 'Tiny Tenants'), el('p', 'start-tagline', 'Build a home. Watch it get lived in.'));
    card.appendChild(logo);

    // The big button: back into the house you were in, or into the starter house the first time.
    const play = el('button', 'start-play');
    play.append(el('span', 'start-play-label', current ? '▶ Continue' : '▶ Move in'));
    play.append(
      el(
        'span',
        'start-play-details',
        current ? `${current.name} · ${current.pieces} ${current.pieces === 1 ? 'piece' : 'pieces'} · saved ${savedWhen(current.savedAt)}` : 'The starter house is ready for you',
      ),
    );
    play.onclick = () => choose(callbacks.onContinue);
    card.appendChild(play);

    card.appendChild(el('div', 'start-heading', 'New house'));
    const grid = el('div', 'start-new-grid');
    for (const kind of NEW_HOUSES) {
      const tile = el('button', 'start-new-tile');
      tile.title = `${kind.name}: ${kind.about.toLowerCase()}`;
      tile.append(el('span', 'start-new-symbol', kind.symbol), el('span', 'start-new-name', kind.name), el('span', 'start-new-about', kind.about));
      tile.onclick = () => choose(() => callbacks.onNew(kind.start));
      grid.appendChild(tile);
    }
    card.appendChild(grid);

    if (others.length > 0) {
      card.appendChild(el('div', 'start-heading', 'Your houses'));
      const houses = el('div', 'start-houses');
      for (const house of others) {
        const row = el('button', 'start-house');
        row.title = `Open ${house.name}`;
        row.append(el('span', 'start-house-name', `🏠 ${house.name}`), el('span', 'start-house-details', `${house.pieces} ${house.pieces === 1 ? 'piece' : 'pieces'} · ${savedWhen(house.savedAt)}`));
        row.onclick = () => choose(() => callbacks.onOpen(house.id));
        houses.appendChild(row);
      }
      card.appendChild(houses);
    }

    screen.appendChild(el('div', 'start-footer', 'Right-click to tell your tenants what to do · Q and E turn the camera · Enter to play'));
    return play;
  }

  function show() {
    window.clearTimeout(fadeTimer);
    const play = render();
    screen.classList.remove('leaving');
    screen.style.display = '';
    shown = true;
    callbacks.onShownChange(true);
    play.focus({ preventScroll: true });
  }

  function hide() {
    if (!shown) return;
    shown = false;
    screen.classList.add('leaving');
    fadeTimer = window.setTimeout(() => {
      screen.style.display = 'none';
      screen.classList.remove('leaving');
    }, FADE_MS);
    callbacks.onShownChange(false);
  }

  screen.addEventListener('keydown', (e) => {
    // Enter on a focused button presses it already; anywhere else on the screen it means Continue.
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) choose(callbacks.onContinue);
  });

  return {
    show,
    hide,
    get shown() {
      return shown;
    },
  };
}
