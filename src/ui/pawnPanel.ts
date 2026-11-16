import type { PawnInfo } from '../sim/pawn';
import { TRAITS, TRAIT_AXES } from '../sim/personality';
import type { PawnTraits } from '../sim/personality';

const MAX_NAME_LENGTH = 16;

export interface PawnPanelCallbacks {
  onSelect: (id: string) => void;
  /** Double-clicking a pawn: bring it into view. */
  onFocus: (id: string) => void;
  onEdit: (id: string, name: string, color: string, traits: PawnTraits) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

/** The bar of pawns along the bottom. Click to choose one, double-click to go to them, and in Live mode, pencil to edit them. */
export function createPawnPanel(container: HTMLElement, callbacks: PawnPanelCallbacks) {
  container.innerHTML = '';
  container.className = 'panel pawn-panel';

  const list = document.createElement('div');
  list.className = 'pawn-list';
  container.appendChild(list);

  const count = document.createElement('div');
  count.className = 'pawn-count';
  list.appendChild(count);

  const addBtn = document.createElement('button');
  addBtn.className = 'pawn-add-btn';
  addBtn.title = 'Add a pawn';
  addBtn.textContent = '+';
  addBtn.onclick = () => {
    closeEditor();
    callbacks.onAdd();
  };
  list.appendChild(addBtn);

  const chips = new Map<string, { chip: HTMLDivElement; dot: HTMLDivElement; name: HTMLDivElement }>();
  let currentPawns: PawnInfo[] = [];
  let editor: { id: string; element: HTMLDivElement } | null = null;

  function buildChip(pawn: PawnInfo) {
    const chip = document.createElement('div');
    chip.className = 'pawn-chip';
    chip.onclick = () => callbacks.onSelect(pawn.id);
    chip.ondblclick = () => callbacks.onFocus(pawn.id);

    const dot = document.createElement('div');
    dot.className = 'pawn-dot';

    const name = document.createElement('div');
    name.className = 'pawn-chip-name';

    const editBtn = document.createElement('button');
    editBtn.className = 'pawn-edit-btn';
    editBtn.title = 'Edit this pawn';
    editBtn.textContent = '✏️';
    editBtn.onclick = (e) => {
      // Otherwise the click would also select the pawn, and a quick second one would move the camera.
      e.stopPropagation();
      callbacks.onSelect(pawn.id);
      openEditor(pawn);
    };
    editBtn.ondblclick = (e) => e.stopPropagation();

    chip.append(dot, name, editBtn);
    // The + always stays at the very end.
    list.insertBefore(chip, addBtn);
    chips.set(pawn.id, { chip, dot, name });
  }

  /** Changes wait in the editor until Done, so Cancel really does put everything back. */
  function openEditor(pawn: PawnInfo) {
    closeEditor();
    const element = document.createElement('div');
    element.className = 'pawn-editor';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'pawn-color';
    colorInput.title = 'Change color';
    colorInput.value = pawn.color;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'pawn-name';
    nameInput.value = pawn.name;
    nameInput.maxLength = MAX_NAME_LENGTH;

    const traits: PawnTraits = { personality: pawn.personality, temperament: pawn.temperament, tidiness: pawn.tidiness };
    const traitRows = TRAIT_AXES.map(({ key, choices }) => {
      const row = document.createElement('div');
      row.className = 'pawn-trait-row';
      const btns = choices.map((choice) => {
        const btn = document.createElement('button');
        btn.className = 'pawn-trait-btn';
        btn.textContent = `${TRAITS[choice].emoji} ${TRAITS[choice].label}`;
        btn.classList.toggle('active', traits[key] === choice);
        btn.onclick = () => {
          (traits[key] as string) = choice;
          btns.forEach((other) => other.classList.toggle('active', other === btn));
        };
        return btn;
      });
      row.append(...btns);
      return row;
    });

    const save = () => {
      // A blank name doesn't stick: the pawn keeps the one it had.
      callbacks.onEdit(pawn.id, nameInput.value.trim() || pawn.name, colorInput.value, traits);
      closeEditor();
    };
    nameInput.onkeydown = (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') closeEditor();
    };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'pawn-editor-remove';
    removeBtn.textContent = 'Remove this pawn';
    // The lot always keeps at least one pawn.
    removeBtn.disabled = currentPawns.length <= 1;
    removeBtn.onclick = () => {
      closeEditor();
      callbacks.onRemove(pawn.id);
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'submode-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = closeEditor;

    const doneBtn = document.createElement('button');
    doneBtn.className = 'submode-btn pawn-editor-done';
    doneBtn.textContent = 'Done';
    doneBtn.onclick = save;

    const fields = document.createElement('div');
    fields.className = 'pawn-editor-row';
    fields.append(colorInput, nameInput);

    const buttons = document.createElement('div');
    buttons.className = 'pawn-editor-row';
    buttons.append(cancelBtn, doneBtn);

    element.append(fields, ...traitRows, removeBtn, buttons);
    container.appendChild(element);
    editor = { id: pawn.id, element };

    // Lines up with the pawn's chip, and sits above whichever row that chip is in, staying inside the bar's edges.
    const chipBox = chips.get(pawn.id)!.chip.getBoundingClientRect();
    const barBox = container.getBoundingClientRect();
    const left = Math.max(0, Math.min(chipBox.left - barBox.left, barBox.width - element.offsetWidth));
    element.style.left = `${left}px`;
    element.style.bottom = `${barBox.bottom - chipBox.top + 8}px`;
    nameInput.focus();
    nameInput.select();
  }

  function closeEditor() {
    editor?.element.remove();
    editor = null;
  }

  function setEditable(editable: boolean) {
    container.classList.toggle('read-only', !editable);
    closeEditor();
  }

  /** Updates chips in place rather than redrawing them, so nothing flickers when a selection changes. */
  function render(pawns: PawnInfo[], selectedId: string) {
    currentPawns = pawns;
    count.textContent = `👥 ${pawns.length}`;
    count.title = `${pawns.length} ${pawns.length === 1 ? 'pawn' : 'pawns'}`;
    for (const [id, { chip }] of chips) {
      if (pawns.some((pawn) => pawn.id === id)) continue;
      chip.remove();
      chips.delete(id);
    }
    for (const pawn of pawns) {
      if (!chips.has(pawn.id)) buildChip(pawn);
      const { chip, dot, name } = chips.get(pawn.id)!;
      dot.style.backgroundColor = pawn.color;
      name.textContent = pawn.name;
      name.title = pawn.name;
      chip.classList.toggle('active', pawn.id === selectedId);
    }
  }

  return { render, setEditable };
}
