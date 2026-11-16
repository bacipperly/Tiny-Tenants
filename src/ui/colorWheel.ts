/**
 * A ring of colored wedges that opens where you right-click, one wedge for
 * each color, with the piece's own color in the middle to go back to. Hovering
 * a wedge names it; clicking picks it. A click anywhere else, Escape, or
 * another right-click closes it.
 */

const SVG = 'http://www.w3.org/2000/svg';
const OUTER = 78;
const INNER = 34;
/** How far a wedge pops out while it's pointed at. */
const POP = 7;

export interface ColorWheelOptions {
  title: string;
  colors: { label: string; color: string }[];
  /** The color picked now, if any. */
  current: string | undefined;
  /** The piece's own color, shown in the middle. */
  own: string;
  onPick: (color: string | undefined) => void;
}

let open: { root: HTMLElement; close: () => void } | null = null;

export function closeColorWheel() {
  open?.close();
}

export function openColorWheel(clientX: number, clientY: number, options: ColorWheelOptions) {
  closeColorWheel();
  const root = document.createElement('div');
  root.className = 'color-wheel';
  const size = (OUTER + POP) * 2;
  // Kept on screen, with room for the title underneath.
  const margin = OUTER + POP + 8;
  root.style.left = `${Math.max(margin, Math.min(window.innerWidth - margin, clientX))}px`;
  root.style.top = `${Math.max(margin, Math.min(window.innerHeight - margin - 30, clientY))}px`;

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`);
  root.appendChild(svg);

  const label = document.createElement('div');
  label.className = 'color-wheel-label';
  const showLabel = (text: string) => (label.textContent = text);
  showLabel(options.title);
  root.appendChild(label);

  const count = options.colors.length;
  options.colors.forEach(({ label: name, color }, index) => {
    // The first wedge is centred at the top, and they go round clockwise.
    const from = ((index - 0.5) / count) * Math.PI * 2 - Math.PI / 2;
    const to = ((index + 0.5) / count) * Math.PI * 2 - Math.PI / 2;
    const middle = (from + to) / 2;
    const wedge = document.createElementNS(SVG, 'path');
    wedge.setAttribute('d', wedgePath(from, to));
    wedge.setAttribute('fill', color);
    wedge.classList.add('color-wheel-wedge');
    if (color === options.current) wedge.classList.add('current');
    wedge.style.setProperty('--pop-x', `${Math.cos(middle) * POP}px`);
    wedge.style.setProperty('--pop-y', `${Math.sin(middle) * POP}px`);
    wedge.setAttribute('role', 'button');
    wedge.setAttribute('aria-label', name);
    wedge.addEventListener('pointerenter', () => showLabel(color === options.current ? `${name} (picked)` : name));
    wedge.addEventListener('pointerleave', () => showLabel(options.title));
    wedge.addEventListener('click', () => pick(color));
    svg.appendChild(wedge);
  });

  // The middle: the piece's own color, to go back to.
  const middle = document.createElementNS(SVG, 'circle');
  middle.setAttribute('r', String(INNER - 4));
  middle.setAttribute('fill', options.own);
  middle.classList.add('color-wheel-middle');
  if (options.current === undefined) middle.classList.add('current');
  middle.setAttribute('role', 'button');
  middle.setAttribute('aria-label', 'Its own color');
  middle.addEventListener('pointerenter', () => showLabel(options.current === undefined ? 'Its own color (picked)' : 'Its own color'));
  middle.addEventListener('pointerleave', () => showLabel(options.title));
  middle.addEventListener('click', () => pick(undefined));
  svg.appendChild(middle);
  const back = document.createElementNS(SVG, 'text');
  back.textContent = '↩';
  back.setAttribute('text-anchor', 'middle');
  back.setAttribute('dominant-baseline', 'central');
  back.classList.add('color-wheel-back');
  svg.appendChild(back);

  function pick(color: string | undefined) {
    options.onPick(color);
    close();
  }

  const onDocumentPointer = (e: PointerEvent) => {
    if (!root.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  function close() {
    root.remove();
    document.removeEventListener('pointerdown', onDocumentPointer, true);
    window.removeEventListener('keydown', onKey);
    if (open?.root === root) open = null;
  }
  // After this right-click is done, so it doesn't close the wheel it just opened.
  setTimeout(() => {
    document.addEventListener('pointerdown', onDocumentPointer, true);
    window.addEventListener('keydown', onKey);
  });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  document.body.appendChild(root);
  open = { root, close };
}

/** One wedge of the ring, between two angles. */
function wedgePath(from: number, to: number): string {
  const point = (radius: number, angle: number) => `${(Math.cos(angle) * radius).toFixed(2)} ${(Math.sin(angle) * radius).toFixed(2)}`;
  const gap = 0.012;
  const a = from + gap;
  const b = to - gap;
  const large = b - a > Math.PI ? 1 : 0;
  return `M ${point(OUTER, a)} A ${OUTER} ${OUTER} 0 ${large} 1 ${point(OUTER, b)} L ${point(INNER, b)} A ${INNER} ${INNER} 0 ${large} 0 ${point(INNER, a)} Z`;
}
