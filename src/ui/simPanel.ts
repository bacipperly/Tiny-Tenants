// ============================================================================
// Sandbox (?ui=band): Live mode's band, laid out as the UI doc's "Live: same
// band, labeled depth" page. Left to right, from who to what:
//   Identity      the selected pawn's portrait, name, mood and traits
//   Wants/Fears   always showing, whichever tab is open
//   Tabs          a labeled row (Needs, Relationships, Personality); the open
//                 one gets an underline, not a fill
//   Sub-views     a labeled selector, for tabs that have them
//   Detail        bounded, and scrolls inside itself
// Clicking a need opens an inspector above the band, beside what was clicked.
// It never covers the anchor, play carries on, and Esc closes it.
// ============================================================================

import { FURNITURE_CATALOG } from '../build/furnitureCatalog';
import { NEEDS, NEED_NAMES } from '../sim/needs';
import type { Need } from '../sim/needs';
import { TRAITS, TRAIT_AXES } from '../sim/personality';
import type { PawnTraits } from '../sim/personality';

const LOW_NEED = 30;
const MIDDLING_NEED = 60;
/** A need below this is something the pawn wants. */
const WANT_BELOW = 70;
/** A need below this is something it fears running out of. */
const FEAR_BELOW = 15;
const WANT_SLOTS = 4;
const FEAR_SLOTS = 3;
const FRIENDS_AT = 20;
const RIVALS_AT = -20;
/** How many pieces an inspector names as filling a need. */
const FILLED_BY_SHOWN = 6;

const WANT_WORDS: Record<Need, string> = {
  hunger: 'Eat',
  energy: 'Sleep',
  bladder: 'Toilet',
  hygiene: 'Wash',
  fun: 'Have fun',
  social: 'Chat',
  environment: 'Nicer room',
};

const AXIS_NAMES: Record<keyof PawnTraits, string> = {
  personality: 'Social',
  temperament: 'Temper',
  tidiness: 'Tidiness',
};

type TabId = 'needs' | 'relationships' | 'personality';
type RelationshipFilter = 'everyone' | 'friends' | 'rivals';

const TABS: { id: TabId; label: string; emoji: string }[] = [
  { id: 'needs', label: 'Needs', emoji: '📊' },
  { id: 'relationships', label: 'Relationships', emoji: '💞' },
  { id: 'personality', label: 'Personality', emoji: '🎭' },
];

const RELATIONSHIP_FILTERS: { id: RelationshipFilter; label: string }[] = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'friends', label: 'Friends' },
  { id: 'rivals', label: 'Rivals' },
];

export interface SimPanelView {
  id: string;
  name: string;
  color: string;
  traits: PawnTraits;
  needs: Record<Need, number>;
  mood: { label: string; emoji: string };
  others: { id: string; name: string; color: string; score: number }[];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function needColor(value: number): string {
  return value < LOW_NEED ? '#e0614f' : value < MIDDLING_NEED ? '#ecb33c' : '#6fbf5e';
}

/** A round face in the pawn's color, with the same blinking eyes as the household column's. */
function portrait(color: string, className: string): HTMLDivElement {
  const face = el('div', `pawn-dot ${className}`);
  face.style.backgroundColor = color;
  return face;
}

/** What fills a need, by the pieces that offer the most of it. */
function filledBy(need: Need): string[] {
  if (NEEDS[need].fromSurroundings) return [];
  const seen = new Set<string>();
  return FURNITURE_CATALOG.filter((def) => (def.advertises[need] ?? 0) > 0)
    .sort((a, b) => (b.advertises[need] ?? 0) - (a.advertises[need] ?? 0))
    .filter((def) => !seen.has(def.label) && seen.add(def.label))
    .slice(0, FILLED_BY_SHOWN)
    .map((def) => `${def.emoji} ${def.label}`);
}

/**
 * `band` is where the panel's columns go (the band's household slot), and
 * `inspectorHome` is where an inspector floats, outside the band so the band's
 * edges don't clip it.
 */
export function createSimPanel(band: HTMLElement, inspectorHome: HTMLElement) {
  let tab: TabId = 'needs';
  let filter: RelationshipFilter = 'everyone';
  let last: SimPanelView | null = null;

  // --- Identity ---
  const identity = el('div', 'band-section sim-identity');
  const identityHeading = el('div', 'band-section-heading', 'Who');
  let face = portrait('#cccccc', 'sim-portrait');
  const moodBadge = el('div', 'sim-mood-badge');
  const faceWrap = el('div', 'sim-portrait-wrap');
  faceWrap.append(face, moodBadge);
  const nameEl = el('div', 'sim-name');
  const moodEl = el('div', 'sim-mood');
  const traitsEl = el('div', 'sim-traits');
  identity.append(identityHeading, faceWrap, nameEl, moodEl, traitsEl);

  // --- Wants and Fears ---
  const motivation = el('div', 'band-section sim-motivation');
  const wantsLabel = el('div', 'band-section-heading', 'Wants');
  const wantsRow = el('div', 'sim-slots');
  const fearsLabel = el('div', 'band-section-heading', 'Fears');
  const fearsRow = el('div', 'sim-slots fears');
  motivation.append(wantsLabel, wantsRow, fearsLabel, fearsRow);
  let motivationKey = '';

  // --- Tabs, sub-views and detail ---
  const detailSection = el('div', 'band-section sim-detail-section');
  const tabRow = el('div', 'sim-tab-row');
  tabRow.setAttribute('role', 'tablist');
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  for (const { id, label, emoji } of TABS) {
    const btn = el('button', 'sim-tab');
    btn.setAttribute('role', 'tab');
    btn.innerHTML = `<span class="emoji">${emoji}</span><span>${label}</span>`;
    btn.onclick = () => {
      tab = id;
      closeInspector();
      showTab();
    };
    tabRow.appendChild(btn);
    tabButtons.set(id, btn);
  }

  const subViewRow = el('div', 'sim-subview-row');
  subViewRow.appendChild(el('span', 'option-label', 'Show'));
  const filterButtons = new Map<RelationshipFilter, HTMLButtonElement>();
  for (const { id, label } of RELATIONSHIP_FILTERS) {
    const btn = el('button', 'sim-subview', label);
    btn.onclick = () => {
      filter = id;
      showTab();
    };
    subViewRow.appendChild(btn);
    filterButtons.set(id, btn);
  }

  const detail = el('div', 'sim-detail');

  // Needs: a mood meter on the left, then the bars in two columns.
  const needsView = el('div', 'sim-needs');
  const moodMeter = el('div', 'sim-mood-meter');
  const moodMeterFill = el('div', 'sim-mood-meter-fill');
  moodMeter.appendChild(moodMeterFill);
  const moodMeterWrap = el('div', 'sim-mood-meter-wrap');
  const moodMeterEmoji = el('div', 'sim-mood-meter-emoji');
  moodMeterWrap.append(moodMeterEmoji, moodMeter, el('div', 'sim-mood-meter-label', 'Mood'));
  const needGrid = el('div', 'sim-need-grid');
  const needFills = new Map<Need, HTMLDivElement>();
  for (const need of NEED_NAMES) {
    const row = el('button', 'sim-need-row');
    row.title = `${NEEDS[need].label}: click for what fills it`;
    const label = el('span', 'sim-need-label', `${NEEDS[need].emoji} ${NEEDS[need].label}`);
    const bar = el('span', 'need-bar');
    const fill = el('div', 'need-fill');
    bar.appendChild(fill);
    row.append(label, bar);
    row.onclick = () => openNeedInspector(need, row);
    needGrid.appendChild(row);
    needFills.set(need, fill);
  }
  needsView.append(moodMeterWrap, needGrid);

  const relationshipsView = el('div', 'sim-relationships');
  let relationshipsKey = '';
  const personalityView = el('div', 'sim-personality');
  let personalityKey = '';

  detail.append(needsView, relationshipsView, personalityView);
  detailSection.append(tabRow, subViewRow, detail);
  band.append(identity, motivation, detailSection);

  // --- Inspector ---
  const inspector = el('div', 'sim-inspector');
  inspector.setAttribute('role', 'dialog');
  inspector.style.display = 'none';
  inspectorHome.appendChild(inspector);
  let inspecting: { need: Need; trigger: HTMLElement } | null = null;

  function openNeedInspector(need: Need, trigger: HTMLElement) {
    if (inspecting?.need === need) {
      closeInspector();
      return;
    }
    inspecting = { need, trigger };
    trigger.classList.add('inspecting');
    for (const other of needGrid.children) if (other !== trigger) other.classList.remove('inspecting');
    renderInspector();
    inspector.style.display = '';
    placeInspector();
  }

  function renderInspector() {
    if (!inspecting || !last) return;
    const { need } = inspecting;
    const value = Math.round(last.needs[need]);
    const def = NEEDS[need];
    inspector.innerHTML = '';
    const head = el('div', 'sim-inspector-head');
    head.append(el('span', 'sim-inspector-title', `${def.emoji} ${def.label}`), el('span', 'sim-inspector-value', `${value} / 100`));
    const close = el('button', 'sim-inspector-close', '✕');
    close.title = 'Close (Esc)';
    close.onclick = closeInspector;
    head.appendChild(close);
    inspector.appendChild(head);
    if (def.fromSurroundings) {
      inspector.appendChild(el('div', 'sim-inspector-line', 'Settles toward how pleasant the room is: tidy, decorated rooms fill it, and messes drag it down.'));
    } else {
      const minutes = Math.max(1, Math.round((def.secondsToEmpty * (value / 100)) / 60));
      inspector.appendChild(el('div', 'sim-inspector-line', value <= 0 ? 'Empty.' : `Runs out in about ${minutes} min with nothing to fill it.`));
      const pieces = filledBy(need);
      if (need === 'social') inspector.appendChild(el('div', 'sim-inspector-line', 'Filled by chatting with someone.'));
      if (pieces.length > 0) {
        inspector.appendChild(el('div', 'option-label', 'Filled by'));
        const list = el('div', 'sim-inspector-pieces');
        for (const piece of pieces) list.appendChild(el('span', 'sim-inspector-piece', piece));
        inspector.appendChild(list);
      }
    }
  }

  /** Above the band, lined up with what was clicked, and never further left than the band, so the anchor stays clear. */
  function placeInspector() {
    if (!inspecting) return;
    const bandBox = band.closest('.band')?.getBoundingClientRect() ?? band.getBoundingClientRect();
    const triggerBox = inspecting.trigger.getBoundingClientRect();
    const width = inspector.offsetWidth;
    const left = Math.max(bandBox.left, Math.min(triggerBox.left, window.innerWidth - width - 16));
    inspector.style.left = `${left}px`;
    inspector.style.bottom = `${window.innerHeight - bandBox.top + 10}px`;
  }

  function closeInspector() {
    if (!inspecting) return;
    inspecting.trigger.classList.remove('inspecting');
    inspecting = null;
    inspector.style.display = 'none';
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && inspecting) {
      closeInspector();
      e.stopPropagation();
    }
  }, true);
  window.addEventListener('resize', placeInspector);

  function showTab() {
    for (const [id, btn] of tabButtons) {
      btn.classList.toggle('active', id === tab);
      btn.setAttribute('aria-selected', String(id === tab));
    }
    for (const [id, btn] of filterButtons) btn.classList.toggle('active', id === filter);
    subViewRow.style.display = tab === 'relationships' ? '' : 'none';
    needsView.style.display = tab === 'needs' ? '' : 'none';
    relationshipsView.style.display = tab === 'relationships' ? '' : 'none';
    personalityView.style.display = tab === 'personality' ? '' : 'none';
    relationshipsKey = '';
    personalityKey = '';
    if (last) update(last);
  }

  function renderMotivation(view: SimPanelView) {
    const wants = NEED_NAMES.filter((need) => view.needs[need] < WANT_BELOW)
      .sort((a, b) => view.needs[a] - view.needs[b])
      .slice(0, WANT_SLOTS);
    const rivals = view.others.filter((other) => other.score <= RIVALS_AT).sort((a, b) => a.score - b.score);
    const nearlyEmpty = NEED_NAMES.filter((need) => !NEEDS[need].fromSurroundings && view.needs[need] < FEAR_BELOW);
    const fears = [
      ...nearlyEmpty.map((need) => ({ emoji: '⚠️', word: NEEDS[need].label, title: `${NEEDS[need].label} is nearly empty` })),
      ...rivals.map((rival) => ({ emoji: '💢', word: rival.name, title: `Rival: ${rival.name}` })),
    ].slice(0, FEAR_SLOTS);
    const friend = view.others.filter((other) => other.score >= FRIENDS_AT).sort((a, b) => b.score - a.score)[0];
    const key = `${wants.join()}|${fears.map((fear) => fear.word).join()}|${friend?.id}`;
    if (key === motivationKey) return;
    motivationKey = key;

    wantsRow.innerHTML = '';
    for (let i = 0; i < WANT_SLOTS; i++) {
      const need = wants[i];
      if (!need) {
        wantsRow.appendChild(el('div', 'sim-slot empty'));
        continue;
      }
      const slot = el('div', 'sim-slot');
      const word = need === 'social' && friend ? `Chat with ${friend.name}` : WANT_WORDS[need];
      slot.title = `${NEEDS[need].label} is low: ${word.toLowerCase()}`;
      slot.append(el('span', 'emoji', NEEDS[need].emoji), el('span', 'sim-slot-word', word));
      wantsRow.appendChild(slot);
    }
    fearsRow.innerHTML = '';
    for (let i = 0; i < FEAR_SLOTS; i++) {
      const fear = fears[i];
      if (!fear) {
        fearsRow.appendChild(el('div', 'sim-slot empty'));
        continue;
      }
      const slot = el('div', 'sim-slot');
      slot.title = fear.title;
      slot.append(el('span', 'emoji', fear.emoji), el('span', 'sim-slot-word', fear.word));
      fearsRow.appendChild(slot);
    }
  }

  function renderRelationships(view: SimPanelView) {
    const shown = view.others
      .filter((other) => filter === 'everyone' || (filter === 'friends' ? other.score >= FRIENDS_AT : other.score <= RIVALS_AT))
      .sort((a, b) => b.score - a.score);
    const key = `${view.id}|${filter}|${shown.map((other) => `${other.id}:${other.name}:${other.color}:${Math.round(other.score)}`).join()}`;
    if (key === relationshipsKey) return;
    relationshipsKey = key;
    relationshipsView.innerHTML = '';
    if (shown.length === 0) {
      const none = { everyone: 'Nobody else lives here yet.', friends: 'No friends yet. Chatting builds them.', rivals: 'No rivals. Everyone gets along.' }[filter];
      relationshipsView.appendChild(el('div', 'sim-empty', none));
      return;
    }
    for (const other of shown) {
      const score = Math.round(other.score);
      const card = el('div', 'sim-relationship');
      card.title = `${view.name} and ${other.name}: ${score > 0 ? '+' : ''}${score}`;
      const bar = el('div', 'sim-score-bar');
      const fill = el('div', 'sim-score-fill');
      const half = Math.min(50, Math.abs(score) / 2);
      fill.style.left = score >= 0 ? '50%' : `${50 - half}%`;
      fill.style.width = `${half}%`;
      fill.style.backgroundColor = score >= FRIENDS_AT ? '#6fbf5e' : score <= RIVALS_AT ? '#e0614f' : '#b5ab97';
      bar.appendChild(fill);
      const tag = score >= FRIENDS_AT ? '💕' : score <= RIVALS_AT ? '💢' : '';
      card.append(portrait(other.color, 'sim-relationship-face'), el('div', 'sim-relationship-name', `${other.name} ${tag}`.trim()), bar);
      relationshipsView.appendChild(card);
    }
  }

  function renderPersonality(view: SimPanelView) {
    const key = `${view.id}|${view.traits.personality}|${view.traits.temperament}|${view.traits.tidiness}`;
    if (key === personalityKey) return;
    personalityKey = key;
    personalityView.innerHTML = '';
    for (const { key: axis, choices } of TRAIT_AXES) {
      const row = el('div', 'sim-trait-scale');
      row.appendChild(el('span', 'option-label', AXIS_NAMES[axis]));
      const track = el('div', 'sim-trait-track');
      for (const choice of choices) {
        const stop = el('span', 'sim-trait-stop', `${TRAITS[choice].emoji} ${TRAITS[choice].label}`);
        stop.classList.toggle('active', view.traits[axis] === choice);
        track.appendChild(stop);
      }
      row.appendChild(track);
      personalityView.appendChild(row);
    }
    personalityView.appendChild(el('div', 'sim-empty', 'Change these with the ✏️ beside the pawn’s name.'));
  }

  function update(view: SimPanelView) {
    last = view;
    // Identity
    if (face.dataset.color !== view.color) {
      const fresh = portrait(view.color, 'sim-portrait');
      fresh.dataset.color = view.color;
      face.replaceWith(fresh);
      face = fresh;
    }
    moodBadge.textContent = view.mood.emoji;
    nameEl.textContent = view.name;
    nameEl.title = view.name;
    moodEl.textContent = view.mood.label;
    traitsEl.textContent = TRAIT_AXES.map(({ key }) => TRAITS[view.traits[key]].emoji + ' ' + TRAITS[view.traits[key]].label).join(' · ');

    renderMotivation(view);

    // Needs
    let total = 0;
    for (const need of NEED_NAMES) {
      const value = view.needs[need];
      total += value;
      const fill = needFills.get(need)!;
      fill.style.width = `${value}%`;
      fill.style.backgroundColor = needColor(value);
    }
    const average = total / NEED_NAMES.length;
    moodMeterFill.style.height = `${average}%`;
    moodMeterFill.style.backgroundColor = needColor(average);
    moodMeterEmoji.textContent = view.mood.emoji;
    moodMeter.title = `${view.mood.label}: needs average ${Math.round(average)}`;

    if (tab === 'relationships') renderRelationships(view);
    if (tab === 'personality') renderPersonality(view);
    // Another pawn's needs, or the same need moving: an open inspector keeps up.
    if (inspecting) renderInspector();
  }

  function setVisible(visible: boolean) {
    if (!visible) closeInspector();
  }

  showTab();
  return { update, setVisible, closeInspector };
}
