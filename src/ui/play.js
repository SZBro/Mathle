// The Play screen: goal card, answer row, validation, tile tray, notes, Submit.
//
// The DOM is the source of truth for where tiles are. SortableJS moves elements between
// the tray, the answer row and slot zones; tapping moves them too. After every move we
// read the answer row back into an arrangement and run the engine's structural check.

import Sortable from 'sortablejs';
import { check, tilesToString, FNS } from '../engine/index.js';
import { createTile } from './tiles.js';

export const GOALS = {
  largest: () => 'Make the <strong>largest</strong> number you can',
  smallest: () => 'Make the <strong>smallest</strong> number you can <span class="goal-sub">(negatives allowed)</span>',
  smallestPositive: () => 'Make the <strong>smallest</strong> number that is still <strong>above 0</strong>',
  closest: (goal) => `Get as <strong>close</strong> as you can to <span class="goal-target">${goal.target}</span>`,
};

// Errors that only mean "you aren't finished yet". Hidden while tiles remain in the
// tray, so building left to right doesn't flash red at every step.
const TRAILING = new Set(['operatorAtEnd', 'unclosedParen']);
const TRAILING_AT_LAST = new Set(['fnMissingOperand', 'slotContents']);

export function renderPlay(main, { puzzle, trayOrder, notes, onNotes, onSubmit }) {
  main.innerHTML = `
    <section class="card goal">
      <div class="goal-top">
        <span class="label">Today's goal</span>
        <span class="chip chip-${puzzle.difficulty}">${puzzle.difficulty}</span>
      </div>
      <p class="goal-text">${GOALS[puzzle.goal.type](puzzle.goal)}</p>
      <p class="goal-rule">Use every tile once. You get one submit.</p>
    </section>

    <section class="block">
      <div class="block-head">
        <h2>Your expression</h2>
        <button type="button" class="link" id="clear">Clear</button>
      </div>
      <div class="answer" id="answer" aria-label="Answer row"></div>
      <ul class="status" id="status" aria-live="polite"></ul>
    </section>

    <section class="block">
      <div class="block-head">
        <h2>Tiles</h2>
        <span class="count" id="left"></span>
      </div>
      <div class="tray" id="tray" aria-label="Unused tiles"></div>
    </section>

    <details class="notes" ${notes ? 'open' : ''}>
      <summary>Scratch work</summary>
      <textarea id="notes" rows="4" placeholder="Work it out here. Saved for today only."></textarea>
    </details>

    <button type="button" class="submit" id="submit" disabled>Submit</button>
  `;

  const $ = (sel) => main.querySelector(sel);
  const answer = $('#answer');
  const tray = $('#tray');
  const status = $('#status');
  const left = $('#left');
  const submit = $('#submit');

  // id -> element, and id -> position in the shuffled tray (for putting tiles back).
  const els = new Map();
  const homeIndex = new Map(trayOrder.map((id, i) => [id, i]));
  for (const id of trayOrder) {
    const el = createTile(puzzle.tiles[id], id);
    els.set(id, el);
    tray.append(el);
  }

  // --- Drag and drop -------------------------------------------------------------

  let dragging = false;
  const common = {
    animation: 160,
    forceFallback: true, // same feel on mouse and touch, and the dragged tile is styleable
    fallbackOnBody: true,
    fallbackClass: 'tile-drag',
    ghostClass: 'tile-ghost',
    chosenClass: 'tile-chosen',
    swapThreshold: 0.65,
    filter: '.help',
    preventOnFilter: false,
    delay: 120, // on touch, a short hold starts a drag so the page can still scroll
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
    onStart: () => {
      dragging = true;
      hideHelp();
    },
    onEnd: () => {
      // A click can follow the drop; let it see the flag first.
      setTimeout(() => { dragging = false; }, 0);
      update();
    },
  };

  Sortable.create(tray, { ...common, group: 'tiles' });
  Sortable.create(answer, { ...common, group: 'tiles' });
  for (const zone of main.querySelectorAll('.slot-zone')) {
    Sortable.create(zone, {
      ...common,
      group: {
        name: 'tiles',
        // A slot takes one number tile and nothing else.
        put: (to, _from, dragEl) =>
          dragEl.dataset.kind === 'num' && [...to.el.children].every((c) => c === dragEl),
      },
    });
  }

  // --- Tap to place --------------------------------------------------------------

  function tapTile(tile) {
    if (tile.parentElement === tray) placeFromTray(tile);
    else returnToTray(tile);
    tile.classList.remove('pop');
    void tile.offsetWidth; // restart the animation
    tile.classList.add('pop');
    update();
  }

  // Appends to the answer row, or fills a trailing empty slot with a number.
  function placeFromTray(tile) {
    const last = answer.lastElementChild;
    const zone = last?.dataset.kind === 'fnslot' ? last.querySelector('.slot-zone') : null;
    if (tile.dataset.kind === 'num' && zone && zone.children.length === 0) zone.append(tile);
    else answer.append(tile);
  }

  // Back to its original tray position. A slot tile keeps whatever it holds.
  function returnToTray(tile) {
    const home = homeIndex.get(Number(tile.dataset.id));
    const before = [...tray.children].find((el) => homeIndex.get(Number(el.dataset.id)) > home);
    tray.insertBefore(tile, before ?? null);
  }

  main.addEventListener('click', (e) => {
    const help = e.target.closest('.help');
    if (help) {
      e.stopPropagation();
      toggleHelp(help);
      return;
    }
    const tile = e.target.closest('.tile');
    if (tile && !dragging) tapTile(tile);
  });

  main.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!e.target.classList?.contains('tile')) return;
    e.preventDefault();
    tapTile(e.target);
    e.target.focus();
  });

  $('#clear').addEventListener('click', () => {
    for (const el of [...answer.querySelectorAll('.tile')].reverse()) {
      if (el.parentElement !== tray) returnToTray(el);
    }
    // Numbers inside slots were moved with their slot; pull them out too.
    for (const el of tray.querySelectorAll('.slot-zone .tile')) returnToTray(el);
    update();
  });

  // --- Validation ----------------------------------------------------------------

  function readTiles(container) {
    return [...container.children].map((el) => {
      const id = Number(el.dataset.id);
      const tile = { ...puzzle.tiles[id], id };
      if (tile.kind === 'fnslot') tile.inner = readTiles(el.querySelector('.slot-zone'));
      return tile;
    });
  }

  let badIds = new Set();

  function update() {
    const arrangement = readTiles(answer);
    const { ok, errors } = check(arrangement, { puzzleTiles: puzzle.tiles });
    const unused = errors.find((e) => e.code === 'unusedTiles');
    const lastId = arrangement.at(-1)?.id;

    const shown = errors.filter((e) => {
      if (e.code === 'unusedTiles' || e.code === 'empty') return false;
      if (!unused) return true;
      if (TRAILING.has(e.code)) return false;
      if (TRAILING_AT_LAST.has(e.code) && e.tileIds.includes(lastId)) return false;
      // An empty slot is "not filled yet" while tiles remain.
      if (e.code === 'slotContents' && e.tileIds.length === 1) return false;
      return true;
    });

    // Highlight the offending tiles; shake only the ones that just became bad.
    const nextBad = new Set(shown.flatMap((e) => e.tileIds));
    for (const [id, el] of els) {
      el.classList.toggle('bad', nextBad.has(id));
      el.classList.remove('bad-cause');
      if (nextBad.has(id) && !badIds.has(id)) {
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
      }
    }
    badIds = nextBad;

    const lines = [];
    for (const msg of new Set(shown.map((e) => e.message))) lines.push(['error', msg]);
    if (!lines.length) {
      if (arrangement.length === 0) lines.push(['info', 'Drag tiles into the box, or tap a tile to place it.']);
      else if (unused) lines.push(['info', `${count(unused.tileIds.length)} left to place.`]);
      else if (ok) lines.push(['ok', 'Looks good. Ready when you are: you only get one shot.']);
    }
    showStatus(lines);

    const remaining = unused ? unused.tileIds.length : 0;
    left.textContent = remaining ? `${count(remaining)} left` : 'all placed';
    submit.disabled = !ok;
    return { ok, arrangement };
  }

  function showStatus(lines) {
    status.replaceChildren(...lines.map(([kind, text]) => {
      const li = document.createElement('li');
      li.className = kind;
      li.textContent = text;
      return li;
    }));
  }

  // A math error from Submit. It shows where and why, but no values: the steps done
  // before the error would give away part of the answer. Moving any tile clears it
  // (update() redraws everything).
  function showMathError(error) {
    const ids = new Set(error.tileIds);
    for (const [id, el] of els) el.classList.toggle('bad', ids.has(id));
    const cause = els.get(error.tileId);
    if (cause) {
      cause.classList.add('bad-cause');
      cause.classList.remove('shake');
      void cause.offsetWidth;
      cause.classList.add('shake');
    }
    badIds = ids;
    showStatus([
      ['error', error.message],
      ['info', 'Your shot isn\'t used up. Rearrange the tiles and submit again.'],
    ]);
    submit.disabled = true; // the same arrangement would fail the same way
  }

  // --- Function help popover -----------------------------------------------------

  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.hidden = true;
  pop.setAttribute('role', 'tooltip');
  document.body.append(pop);
  let popFor = null;

  function toggleHelp(btn) {
    if (popFor === btn) return hideHelp();
    const fn = btn.dataset.fn;
    const slot = btn.closest('.tile').dataset.kind === 'fnslot';
    pop.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = slot ? `${fn}(□)` : fn;
    const what = document.createElement('span');
    what.textContent = slot
      ? ' holds exactly one number tile. '
      : ' applies to the next number, or to a whole ( … ) group. ';
    const ex = document.createElement('span');
    ex.className = 'popover-ex';
    ex.textContent = FNS[fn].help;
    pop.append(title, what, ex);
    pop.hidden = false;
    popFor = btn;

    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    pop.style.left = `${x}px`;
    pop.style.top = `${r.bottom + 8}px`;
  }

  function hideHelp() {
    pop.hidden = true;
    popFor = null;
  }

  document.addEventListener('click', (e) => {
    if (!pop.hidden && !pop.contains(e.target)) hideHelp();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideHelp();
  });
  window.addEventListener('scroll', hideHelp, { passive: true });
  window.addEventListener('resize', hideHelp);

  // --- Notes and Submit ----------------------------------------------------------

  const notesBox = $('#notes');
  notesBox.value = notes;
  notesBox.addEventListener('input', () => onNotes(notesBox.value));

  submit.addEventListener('click', () => {
    const { ok, arrangement } = update();
    if (!ok) return;
    const res = onSubmit({ arrangement, expr: tilesToString(arrangement) });
    if (res?.error) showMathError(res.error);
  });

  update();
}

function count(n) {
  return `${n} tile${n === 1 ? '' : 's'}`;
}
