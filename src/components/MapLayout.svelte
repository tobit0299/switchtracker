<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Gemeinsames Layout von Stellenkarte und Unternehmenskarte:
   * links Steuerung und Tabelle, rechts die Karte, dazwischen eine ziehbare Kante.
   */
  let { list, map }: { list: Snippet; map: Snippet } = $props();

  const WIDTH_KEY = 'switchtracker.listWidth';
  const readWidth = () => { try { return Number(localStorage.getItem(WIDTH_KEY)) || 440; } catch { return 440; } };
  let listWidth = $state(readWidth());
  let layoutEl: HTMLDivElement;

  function clampWidth(w: number) {
    const max = Math.max(320, (layoutEl?.clientWidth ?? window.innerWidth) - 280);
    return Math.round(Math.min(max, Math.max(320, w)));
  }
  function saveWidth() { try { localStorage.setItem(WIDTH_KEY, String(listWidth)); } catch { /* privater Modus */ } }

  function startResize(e: PointerEvent) {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const left = layoutEl.getBoundingClientRect().left;
    const onMove = (ev: PointerEvent) => (listWidth = clampWidth(ev.clientX - left));
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      saveWidth();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }

  function resizeKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === 'ArrowLeft') listWidth = clampWidth(listWidth - step);
    else if (e.key === 'ArrowRight') listWidth = clampWidth(listWidth + step);
    else return;
    e.preventDefault();
    saveWidth();
  }
</script>

<div class="maplayout" bind:this={layoutEl} style:--list-w="{listWidth}px">
  <section class="list layer">{@render list()}</section>

  <!-- Fokussierbarer Trenner (ARIA „separator“ mit Wert) ist ein bedienbares Element -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="splitter"
    role="separator"
    aria-orientation="vertical"
    aria-label="Breite von Tabelle und Karte ändern"
    aria-valuenow={listWidth}
    aria-valuemin={320}
    tabindex="0"
    title="Ziehen, um die Karte zu vergrößern oder zu verkleinern"
    onpointerdown={startResize}
    onkeydown={resizeKey}
  ></div>

  <section class="mapcol">{@render map()}</section>
</div>

<style>
  .maplayout {
    display: grid;
    grid-template-columns: var(--list-w) 6px 1fr;
    height: 100%;
  }
  .list { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--panel); }
  .splitter {
    cursor: col-resize; background: var(--border); position: relative; touch-action: none;
    outline: 2px solid transparent; outline-offset: -2px;
  }
  .splitter::after {
    content: ''; position: absolute; top: 50%; left: 1px; width: 4px; height: 32px; margin-top: -16px;
    border-left: 1px solid var(--border-strong); border-right: 1px solid var(--border-strong);
  }
  .splitter:hover, .splitter:focus-visible { background: var(--accent); }
  .splitter:focus-visible { outline-color: var(--focus); }
  .mapcol { position: relative; min-height: 0; min-width: 0; }

  /* Bausteine, die beide Karten-Ansichten in ihren Snippets verwenden */
  .maplayout :global(.controls) { display: flex; flex-direction: column; gap: 12px; padding: 16px 16px 12px; }
  .maplayout :global(.head) { margin-top: 4px; gap: 0; }
  .maplayout :global(.lbl) { font-size: 12px; letter-spacing: 0.32px; color: var(--muted); }
  .maplayout :global(.filters) { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); }
  .maplayout :global(.filters input[type='search']) { grid-column: 1 / -1; }
  .maplayout :global(.table-wrap) { flex: 1; overflow: auto; border-top: 1px solid var(--border); }
  /* kompakte Tabelle: etwas weniger Innenabstand als die volle Carbon-Tabelle */
  .maplayout :global(.table-wrap th), .maplayout :global(.table-wrap td) { padding-left: 12px; padding-right: 12px; }
  .maplayout :global(.table-wrap td.act) { width: 1px; padding: 0 4px; }
  .maplayout :global(.table-wrap th.nr), .maplayout :global(.table-wrap td.nr) { width: 1px; padding: 0 0 0 12px; text-align: center; }
  .maplayout :global(.empty) { padding: 24px 16px; text-align: center; cursor: default; }
  .maplayout :global(.sr) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  /* Nummer in der Tabelle, gleiche Optik wie der Marker auf der Karte */
  .maplayout :global(.pin) {
    display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 5px;
    border-radius: 11px; background: var(--pin, #0f62fe); color: #fff; font-size: 11px; font-weight: 600;
  }
  .maplayout :global(.pin.nopin) { background: transparent; color: var(--muted); box-shadow: inset 0 0 0 1px var(--border-strong); }
  .maplayout :global(tr.selected .pin:not(.nopin)) { box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--text); }
  .maplayout :global(.info) {
    position: absolute; left: 16px; bottom: 44px; width: min(400px, calc(100% - 32px));
    display: flex; flex-direction: column; gap: 4px; padding: 16px;
    background: var(--panel); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }
  .maplayout :global(.facts) { display: flex; gap: 16px; flex-wrap: wrap; }
  .maplayout :global(.actions) { margin-top: 8px; }
  @media (max-width: 800px) {
    .maplayout { grid-template-columns: 1fr; grid-template-rows: auto 60vh; height: auto; }
    .splitter { display: none; }
    .maplayout :global(.table-wrap) { max-height: 50vh; }
  }
</style>
