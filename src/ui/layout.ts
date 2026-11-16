// ============================================================================
// Which screen layout to use, picked with ?ui= in the address.
//   ?ui=band (or nothing): one fixed anchor (camera, floors, wall views and
//   menus) at the bottom left, the Live/Furnish/Build column beside it, and one
//   band whose contents swap with the mode: the Sim panel in Live, the catalog
//   in Build and Furnish. Tools are grouped and labeled, and the active tool's
//   settings sit in their own column under its name.
//   ?ui=classic: the earlier layout, kept for comparing.
// In Band the Classic | Band switch lives in the anchor's 👁️‍🗨️ menu; in Classic
// it floats top right.
// ============================================================================

export type UiLayout = 'classic' | 'band';

const LAYOUTS: { id: UiLayout; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'band', label: 'Band' },
];

export const UI_LAYOUT: UiLayout = readLayout();

function readLayout(): UiLayout {
  const asked = new URLSearchParams(window.location.search).get('ui');
  return LAYOUTS.some(({ id }) => id === asked) ? (asked as UiLayout) : 'band';
}

/** A small Classic | Band switch, so the layouts are one click apart. Each is a plain link: a reload builds the page fresh. */
export function createLayoutSwitch(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'layout-switch';
  el.title = 'Switch layout (reloads the page)';
  const label = document.createElement('span');
  label.textContent = 'UI';
  el.appendChild(label);
  for (const { id, label: text } of LAYOUTS) {
    const link = document.createElement('a');
    const url = new URL(window.location.href);
    url.searchParams.set('ui', id);
    link.href = url.toString();
    link.textContent = text;
    link.classList.toggle('active', id === UI_LAYOUT);
    el.appendChild(link);
  }
  return el;
}
