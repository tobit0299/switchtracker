<script lang="ts">
  import Draggable from 'carbon-icons-svelte/lib/Draggable.svelte';
  import { onMount } from 'svelte';
  import { COLUMNS, DEFAULT_OVERVIEW_COLUMNS, columnByKey, type ColumnKey } from '../lib/columns';
  import { setSetting } from '../lib/repo';
  import { store } from '../lib/store.svelte';

  let { onclose }: { onclose: () => void } = $props();

  type Item = { key: ColumnKey; label: string; visible: boolean };

  /** sichtbare Spalten in ihrer Reihenfolge, danach die ausgeblendeten */
  function itemsFor(visible: ColumnKey[]): Item[] {
    const shown = visible.map(k => ({ key: k, label: columnByKey.get(k)!.label, visible: true }));
    const hidden = COLUMNS.filter(c => !visible.includes(c.key)).map(c => ({ key: c.key, label: c.label, visible: false }));
    return [...shown, ...hidden];
  }

  // svelte-ignore state_referenced_locally
  let items = $state<Item[]>(itemsFor(store.overviewColumns));
  let dragIndex = $state<number | null>(null);
  let dialog: HTMLDialogElement;
  const visibleCount = $derived(items.filter(i => i.visible).length);

  onMount(() => dialog.showModal());

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it);
  }

  function onDragOver(e: DragEvent, i: number) {
    e.preventDefault();
    if (dragIndex == null || dragIndex === i) return;
    move(dragIndex, i);
    dragIndex = i;
  }

  // Tastatur-Alternative zum Ziehen: Alt + Pfeil hoch/runter
  function onKey(e: KeyboardEvent, i: number) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const to = e.key === 'ArrowUp' ? i - 1 : i + 1;
    move(i, to);
    requestAnimationFrame(() => (dialog.querySelectorAll<HTMLElement>('li')[to] ?? null)?.focus());
  }

  async function apply() {
    await setSetting('overviewColumns', items.filter(i => i.visible).map(i => i.key));
    dialog.close();
  }
</script>

<dialog bind:this={dialog} onclose={onclose} aria-labelledby="colpicker-title">
  <div class="body">
    <h2 id="colpicker-title">Spalten auswählen</h2>
    <p class="muted small">Häkchen setzt die Sichtbarkeit. Zum Umsortieren am Griff ziehen oder mit Alt + Pfeiltasten verschieben.</p>
    <ul>
      {#each items as it, i (it.key)}
        <!-- Listeneintrag ist per Maus ziehbar und per Tastatur verschiebbar -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <li
          draggable="true"
          tabindex="0"
          aria-label="{it.label}, Position {i + 1} von {items.length}"
          class:dragging={dragIndex === i}
          ondragstart={e => { dragIndex = i; e.dataTransfer?.setData('text/plain', it.key); }}
          ondragover={e => onDragOver(e, i)}
          ondragend={() => (dragIndex = null)}
          ondrop={e => e.preventDefault()}
          onkeydown={e => onKey(e, i)}
        >
          <span class="handle" aria-hidden="true"><Draggable size={16} /></span>
          <label class="row grow">
            <input type="checkbox" bind:checked={it.visible} disabled={it.visible && visibleCount === 1} />
            {it.label}
          </label>
        </li>
      {/each}
    </ul>
  </div>
  <footer>
    <button class="ghost" onclick={() => (items = itemsFor(DEFAULT_OVERVIEW_COLUMNS))}>Standard</button>
    <span class="grow"></span>
    <button class="secondary" onclick={() => dialog.close()}>Abbrechen</button>
    <button onclick={apply}>Übernehmen</button>
  </footer>
</dialog>

<style>
  dialog { width: min(420px, calc(100vw - 32px)); }
  .body { padding: 16px 16px 8px; display: flex; flex-direction: column; gap: 8px; }
  ul { list-style: none; margin: 8px 0 0; padding: 0; max-height: 60vh; overflow: auto; }
  li {
    display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 8px;
    border-bottom: 1px solid var(--border); background: var(--panel); cursor: grab;
    outline: 2px solid transparent; outline-offset: -2px;
  }
  li:focus-visible { outline-color: var(--focus); }
  li:hover { background: var(--hover); }
  li.dragging { opacity: 0.5; }
  .handle { display: flex; color: var(--muted); }
  label { cursor: pointer; }
  footer { display: flex; align-items: center; gap: 8px; padding: 16px; }
</style>
