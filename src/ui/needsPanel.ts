import { NEEDS, NEED_NAMES } from '../sim/needs';
import type { Need } from '../sim/needs';
import { TRAITS, traitsOf } from '../sim/personality';
import type { PawnTraits } from '../sim/personality';

const LOW_NEED = 30;
const MIDDLING_NEED = 60;

export interface NeedsPanelView {
  name: string;
  traits: PawnTraits;
  needs: Record<Need, number>;
  mood: { label: string; emoji: string };
  friends: string[];
  rivals: string[];
}

/** How the selected pawn is doing: its mood, what it needs, and who it gets along with. */
export function createNeedsPanel(container: HTMLElement) {
  container.className = 'panel needs-panel';

  const heading = document.createElement('div');
  heading.className = 'needs-heading';
  const traitsLine = document.createElement('div');
  traitsLine.className = 'needs-traits';
  const moodLine = document.createElement('div');
  moodLine.className = 'needs-mood';
  container.append(heading, traitsLine, moodLine);

  const fills = new Map<Need, HTMLDivElement>();
  for (const need of NEED_NAMES) {
    const row = document.createElement('div');
    row.className = 'need-row';
    const label = document.createElement('div');
    label.className = 'need-label';
    label.textContent = `${NEEDS[need].emoji} ${NEEDS[need].label}`;
    const bar = document.createElement('div');
    bar.className = 'need-bar';
    const fill = document.createElement('div');
    fill.className = 'need-fill';
    bar.appendChild(fill);
    row.append(label, bar);
    container.appendChild(row);
    fills.set(need, fill);
  }

  const relationshipsLine = document.createElement('div');
  relationshipsLine.className = 'needs-relationships';
  container.appendChild(relationshipsLine);

  function update(view: NeedsPanelView) {
    heading.textContent = view.name;
    traitsLine.textContent = traitsOf(view.traits).map((trait) => `${TRAITS[trait].emoji} ${TRAITS[trait].label}`).join('  ');
    moodLine.textContent = `${view.mood.emoji} ${view.mood.label}`;
    for (const need of NEED_NAMES) {
      const fill = fills.get(need)!;
      const value = view.needs[need];
      fill.style.width = `${value}%`;
      fill.style.backgroundColor = value < LOW_NEED ? '#e0614f' : value < MIDDLING_NEED ? '#ecb33c' : '#6fbf5e';
    }
    const lines = [view.friends.length > 0 ? `💕 ${view.friends.join(', ')}` : '', view.rivals.length > 0 ? `💢 ${view.rivals.join(', ')}` : ''];
    relationshipsLine.textContent = lines.filter(Boolean).join('  ');
  }

  function setVisible(visible: boolean) {
    container.style.display = visible ? '' : 'none';
  }

  return { update, setVisible };
}
