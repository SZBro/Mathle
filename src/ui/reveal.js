// The Reveal screen: the player's answer and result, the score bar, the steps, the
// best known answer, the hint and a countdown to the next puzzle (or, in practice
// mode, buttons for another practice puzzle and back to today's).
//
// `result` comes from submit() or replay() in result.js:
//   { expr, tiles, value, steps, score, percent, beatBest, matchedBest }

import { formatNumber } from '../engine/index.js';
import { msUntilNextDay, formatCountdown } from '../daily.js';
import { createTile } from './tiles.js';
import { GOALS } from './play.js';

export function renderReveal(main, { puzzle, result, notes, practice = false }) {
  const { goal } = puzzle;
  const tier = result.percent === 100 ? 'top' : result.percent >= 60 ? 'mid' : 'low';

  main.innerHTML = `
    <section class="card result">
      <span class="label">Your answer</span>
      <div class="expr-tiles" id="expr" aria-label="Your expression"></div>
      <p class="result-value"><span class="eq">=</span> <span id="value"></span></p>
      <p class="result-sub" id="sub"></p>
    </section>

    <section class="block">
      <div class="block-head">
        <h2>Score</h2>
        <span class="score-pct score-${tier}" id="pct"></span>
      </div>
      <div class="bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${result.percent}"
        aria-label="Score"><div class="bar-fill score-${tier}" id="fill"></div></div>
      <p class="score-msg" id="msg"></p>
    </section>

    <section class="block">
      <div class="block-head"><h2>Step by step</h2></div>
      <ol class="steps" id="steps"></ol>
    </section>

    <section class="block">
      <div class="block-head">
        <h2>${puzzle.best.proven ? 'Best possible answer' : 'Best known answer'}</h2>
      </div>
      <div class="card best">
        <p class="best-expr" id="best-expr"></p>
        <p class="best-value"><span class="eq">=</span> <span id="best-value"></span></p>
      </div>
    </section>

    <section class="card hint">
      <span class="label">Hint</span>
      <p id="hint"></p>
    </section>

    ${practice ? `
    <section class="practice-actions">
      <a class="submit" href="${location.pathname}?practice">New practice puzzle</a>
      <a class="secondary" href="${location.pathname}">Back to today's puzzle</a>
    </section>` : `
    <section class="countdown">
      <span class="label">Next puzzle in</span>
      <p class="clock" id="clock"></p>
      <a class="secondary" href="${location.pathname}?practice">Practice while you wait</a>
    </section>`}

    ${notes ? `<details class="notes"><summary>Your scratch work</summary><pre class="notes-text" id="notes"></pre></details>` : ''}
  `;

  const $ = (sel) => main.querySelector(sel);

  // Your answer
  const expr = $('#expr');
  for (const tile of result.tiles) expr.append(staticTile(tile));
  if (!result.tiles.length) expr.remove();
  $('#value').textContent = formatNumber(result.value);
  $('#sub').innerHTML = GOALS[goal.type](goal);
  if (goal.type === 'closest') {
    const off = Math.abs(result.value - goal.target);
    $('#sub').append(document.createElement('br'),
      off === 0 ? 'Right on target.' : `You were off by ${formatNumber(off)}.`);
  }

  // Score
  $('#pct').textContent = `${result.percent}%`;
  $('#msg').textContent = scoreMessage(puzzle, result);
  // Start empty so the bar grows in.
  const fill = $('#fill');
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${result.percent}%`; }));

  if (result.beatBest) {
    console.log(`Mathle: puzzle ${puzzle.id}, you beat the best known answer!`, {
      puzzleId: puzzle.id,
      expr: result.expr,
      value: result.value,
      previousBest: puzzle.best,
    });
  }

  // Steps: one operation per line, with what's left of the expression under it.
  const steps = $('#steps');
  if (!result.steps.length) {
    const li = document.createElement('li');
    li.className = 'step-none';
    li.textContent = result.tiles.length ? 'No operations: the answer is a single number.' : 'Steps unavailable.';
    steps.append(li);
  }
  result.steps.forEach((step, i) => {
    const li = document.createElement('li');
    const op = document.createElement('span');
    op.className = 'step-op';
    op.textContent = step.text;
    li.append(op);
    if (i < result.steps.length - 1) {
      const rest = document.createElement('span');
      rest.className = 'step-rest';
      rest.textContent = `→ ${step.expr}`;
      li.append(rest);
    }
    steps.append(li);
  });

  // Best answer
  $('#best-expr').textContent = puzzle.best.expr.replace(/\[([^\]]*)\]/g, '($1)'); // √[9] -> √(9)
  $('#best-value').textContent = formatNumber(puzzle.best.value);

  $('#hint').textContent = puzzle.hint ?? '';
  if (!puzzle.hint) $('.hint').remove();
  if (notes) $('#notes').textContent = notes;

  if (practice) return;

  // Countdown to local midnight. Recomputed each tick, so a sleeping laptop catches up.
  const clock = $('#clock');
  const tick = () => {
    if (!clock.isConnected) return clearInterval(timer);
    const ms = msUntilNextDay();
    // msUntilNextDay never reaches 0 (at midnight it's a full day again), so watch
    // for the date changing instead.
    if (new Date().getDate() !== startDate) {
      clearInterval(timer);
      clock.innerHTML = `<a class="submit new-puzzle" href="${location.pathname}">Play the new puzzle</a>`;
      return;
    }
    clock.textContent = formatCountdown(ms);
  };
  const startDate = new Date().getDate();
  const timer = setInterval(tick, 1000);
  tick();
}

function scoreMessage(puzzle, result) {
  if (result.beatBest) return 'You beat the best known answer!';
  if (result.matchedBest) return puzzle.best.proven ? 'Perfect: that\'s the best possible answer.' : 'You matched the best known answer!';
  if (puzzle.goal.type === 'smallestPositive' && result.value <= 0) return 'The result has to be above 0 to score.';
  if (result.percent >= 60) return 'Close to the best. See how below.';
  return 'Compare with the best answer below.';
}

// A tile for display only: no focus, no drag, no help badge.
function staticTile(tile) {
  const el = createTile(tile, tile.id ?? 0);
  el.removeAttribute('tabindex');
  el.removeAttribute('role');
  el.classList.add('tile-static');
  for (const help of el.querySelectorAll('.help')) help.remove();
  if (tile.kind === 'fnslot') {
    const zone = el.querySelector('.slot-zone');
    for (const inner of tile.inner ?? []) zone.append(staticTile(inner));
  }
  return el;
}
