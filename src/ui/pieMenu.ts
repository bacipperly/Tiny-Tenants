import type { Interaction, InteractionMenu } from '../sim/interactions';

/** Most choices one ring shows. Past this, the top slot becomes "More…" and the rest go on the next page. */
const SLOTS = 8;
/** How far the choices sit from the middle, in pixels. */
const RING_RADIUS = 92;
/** Choices this far left or right of straight up or down are anchored by their inner end, so their labels run outward. */
const SIDEWAYS = 0.3;

/**
 * A ring of choices around where you clicked, with the thing you clicked on,
 * or the pawn's face, in the middle. Choices ending in "…" open a ring of
 * their own; clicking the middle goes back out of one. A choice that can't be
 * done right now is greyed out, and pointing at it says why. Escape, or a
 * click anywhere else, closes it.
 */
export function createPieMenu() {
  const root = document.createElement('div');
  root.className = 'pie-menu';
  root.style.display = 'none';
  document.body.appendChild(root);

  const center = document.createElement('button');
  center.className = 'pie-center';
  const caption = document.createElement('div');
  caption.className = 'pie-caption';
  root.append(center, caption);

  let menu: InteractionMenu | null = null;
  /** The folders opened so far, innermost last. */
  let trail: Interaction[] = [];
  let page = 0;
  let dismissedByClick = false;

  function close() {
    root.style.display = 'none';
    menu = null;
    trail = [];
    for (const slot of [...root.querySelectorAll('.pie-slot')]) slot.remove();
  }

  function open(clientX: number, clientY: number, opened: InteractionMenu) {
    menu = opened;
    trail = [];
    page = 0;
    root.style.display = 'block';
    // Kept far enough from the edges for the whole ring to fit.
    const margin = RING_RADIUS + 70;
    root.style.left = `${Math.max(margin, Math.min(window.innerWidth - margin, clientX))}px`;
    root.style.top = `${Math.max(RING_RADIUS + 30, Math.min(window.innerHeight - RING_RADIUS - 30, clientY))}px`;
    center.innerHTML = '';
    if (opened.face) {
      const face = document.createElement('span');
      face.className = 'pie-face';
      face.style.backgroundColor = opened.face;
      center.appendChild(face);
    } else {
      const emoji = document.createElement('span');
      emoji.className = 'pie-emoji';
      emoji.textContent = opened.emoji ?? '❔';
      center.appendChild(emoji);
    }
    render();
  }

  /** The choices on show: the innermost open folder's, or the top level's. */
  function current(): Interaction[] {
    return trail.length > 0 ? trail[trail.length - 1].children ?? [] : menu?.items ?? [];
  }

  function render() {
    for (const slot of [...root.querySelectorAll('.pie-slot')]) slot.remove();
    const items = current();
    const paged = items.length > SLOTS;
    const perPage = paged ? SLOTS - 1 : SLOTS;
    const pages = Math.max(1, Math.ceil(items.length / perPage));
    page = Math.min(page, pages - 1);
    const shown: Interaction[] = items.slice(page * perPage, page * perPage + perPage);
    // The top slot turns the page, and stays open to show it.
    const more: Interaction = { label: 'More…', emoji: '➕' };
    if (paged) shown.unshift(more);
    const title = trail.length > 0 ? trail[trail.length - 1].label.replace(/…$/, '') : menu?.title ?? '';
    caption.textContent = title;
    caption.classList.remove('pie-why');
    center.title = trail.length > 0 ? 'Back' : 'Close';

    shown.forEach((item, index) => {
      // Evenly round the ring, starting straight up and going clockwise, so the same choice always lands in the same place.
      const angle = -Math.PI / 2 + (index / shown.length) * Math.PI * 2;
      const x = Math.cos(angle) * RING_RADIUS;
      const y = Math.sin(angle) * RING_RADIUS;
      const slot = document.createElement('button');
      slot.className = 'pie-slot';
      const side = Math.cos(angle) > SIDEWAYS ? 'right' : Math.cos(angle) < -SIDEWAYS ? 'left' : 'middle';
      slot.classList.add(`pie-${side}`);
      if (item.disabled) {
        slot.classList.add('pie-disabled');
        slot.setAttribute('aria-disabled', 'true');
        slot.title = item.disabled;
      }
      const isFolder = (item.children?.length ?? 0) > 0;
      const label = isFolder && !item.label.endsWith('…') ? `${item.label}…` : item.label;
      slot.innerHTML = `<span class="pie-bead"></span><span class="emoji">${item.emoji}</span><span>${label}</span>`;
      slot.style.setProperty('--x', `${x}px`);
      slot.style.setProperty('--y', `${y}px`);
      slot.style.transitionDelay = `${index * 18}ms`;
      slot.onmouseenter = () => {
        caption.textContent = item.disabled ?? title;
        caption.classList.toggle('pie-why', Boolean(item.disabled));
      };
      slot.onmouseleave = () => {
        caption.textContent = title;
        caption.classList.remove('pie-why');
      };
      slot.onclick = () => {
        if (item.disabled) return;
        if (item === more) {
          page = (page + 1) % pages;
          render();
          return;
        }
        if (isFolder) {
          trail.push(item);
          page = 0;
          render();
          return;
        }
        close();
        item.act?.();
      };
      root.appendChild(slot);
      // Next frame, so it springs out from the middle rather than appearing in place.
      requestAnimationFrame(() => slot.classList.add('pie-open'));
    });
  }

  center.onclick = () => {
    if (trail.length === 0) {
      close();
      return;
    }
    trail.pop();
    page = 0;
    render();
  };

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (root.style.display !== 'none' && !root.contains(e.target as Node)) {
        close();
        dismissedByClick = true;
      }
    },
    { capture: true },
  );
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.style.display !== 'none') close();
  });

  /** True once, for the click that closed the menu, so that click does nothing else, like walking the pawn there. */
  function takeDismissal(): boolean {
    const was = dismissedByClick;
    dismissedByClick = false;
    return was;
  }

  return {
    open,
    close,
    takeDismissal,
    get isOpen() {
      return root.style.display !== 'none';
    },
  };
}
