// Checks puzzle data against CLAUDE.md, running every stored answer through the engine.
// Errors mean the puzzle is broken; warnings mean it is unfinished (no best, no hint).

import { runString, tilesFromString } from '../src/engine/index.js';
import { score } from '../src/engine/score.js';
import { FNS, OPS } from '../src/engine/tiles.js';
import { flattenTiles, tileKey } from './puzzles.js';

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const GOALS = ['largest', 'smallest', 'smallestPositive', 'closest'];
const KINDS = ['num', 'op', 'lparen', 'rparen', 'fn', 'fnslot'];
export const MIN_TILES = 8;
export const MAX_TILES = 25;

export function checkPuzzles(puzzles) {
  const results = puzzles.map(checkPuzzle);
  const ids = puzzles.map((p) => p.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) results.push({ id: null, errors: [`Duplicate puzzle ids: ${[...new Set(dupes)].join(', ')}`], warnings: [] });
  return results;
}

export function checkPuzzle(p) {
  const errors = [];
  const warnings = [];
  const label = `#${p.id}`;

  if (!Number.isInteger(p.id)) errors.push('id must be an integer');
  if (!DIFFICULTIES.includes(p.difficulty)) errors.push(`difficulty must be one of ${DIFFICULTIES.join(', ')}`);

  const goal = p.goal ?? {};
  if (!GOALS.includes(goal.type)) errors.push(`goal.type must be one of ${GOALS.join(', ')}`);
  if (goal.type === 'closest' && typeof goal.target !== 'number') errors.push('closest goal needs a numeric goal.target');
  if (goal.type !== 'closest' && 'target' in goal) warnings.push('goal.target is ignored unless the goal is closest');

  const tiles = Array.isArray(p.tiles) ? p.tiles : [];
  if (tiles.length < MIN_TILES || tiles.length > MAX_TILES) {
    errors.push(`has ${tiles.length} tiles; must have ${MIN_TILES} to ${MAX_TILES}`);
  }
  let tilesOk = true;
  tiles.forEach((t, i) => {
    const bad = (msg) => { errors.push(`tile ${i}: ${msg}`); tilesOk = false; };
    if (!KINDS.includes(t.kind)) return bad(`unknown kind "${t.kind}"`);
    if (t.kind === 'num' && !(Number.isInteger(t.value) && t.value >= 1 && t.value <= 1000)) bad('numbers must be whole numbers from 1 to 1000');
    if (t.kind === 'op' && !(t.value in OPS)) bad(`unknown operator "${t.value}"`);
    if ((t.kind === 'fn' || t.kind === 'fnslot') && !(t.value in FNS)) bad(`unknown function "${t.value}"`);
    if (t.kind === 'fnslot' && t.inner) bad('slot tiles must be empty in the puzzle file');
  });
  const count = (kind) => tiles.filter((t) => t.kind === kind).length;
  if (count('lparen') !== count('rparen')) errors.push('needs the same number of "(" and ")" tiles');
  // A slot and the number inside it make one operand, so operands = number tiles.
  if (count('op') !== count('num') - 1) errors.push(`has ${count('num')} numbers, so it needs ${count('num') - 1} operators, not ${count('op')}`);
  if (count('fnslot') > count('num')) errors.push('has more slot tiles than numbers to fill them');

  if (tilesOk) {
    const want = keyCounts(tiles);
    for (const which of ['best', 'naive']) {
      const answer = p[which];
      if (answer == null) {
        warnings.push(`${which} is not filled in yet (run npm run solve)`);
        continue;
      }
      errors.push(...checkAnswer(which, answer, want));
    }
  }

  if (!errors.length && p.best && p.naive) {
    try {
      score(p, p.best.value);
    } catch (e) {
      errors.push(e.message.replace(/^Puzzle \S+: /, ''));
    }
  }

  if (!p.hint) warnings.push('hint is empty');

  return { id: p.id, label, errors, warnings };
}

function checkAnswer(which, answer, want) {
  const errors = [];
  if (typeof answer.expr !== 'string') return [`${which}.expr is missing`];

  let arrangement;
  try {
    arrangement = tilesFromString(answer.expr);
  } catch (e) {
    return [`${which}.expr can't be read: ${e.message}`];
  }

  const got = keyCounts(flattenTiles(arrangement));
  const diff = diffCounts(want, got);
  if (diff) return [`${which}.expr "${answer.expr}" doesn't use exactly the puzzle's tiles (${diff})`];

  const r = runString(answer.expr, { steps: false });
  if (r.errors) return [`${which}.expr "${answer.expr}" is malformed: ${r.errors.map((e) => e.message).join(' ')}`];
  if (!r.ok) return [`${which}.expr "${answer.expr}" has a math error: ${r.error.message}`];

  const tolerance = 1e-9 * Math.max(1, Math.abs(r.value));
  if (typeof answer.value !== 'number' || Math.abs(r.value - answer.value) > tolerance) {
    errors.push(`${which}.value is ${answer.value} but "${answer.expr}" = ${r.value}`);
  }
  return errors;
}

function keyCounts(tiles) {
  const counts = new Map();
  for (const t of tiles) counts.set(tileKey(t), (counts.get(tileKey(t)) ?? 0) + 1);
  return counts;
}

function diffCounts(want, got) {
  const parts = [];
  for (const key of new Set([...want.keys(), ...got.keys()])) {
    const d = (got.get(key) ?? 0) - (want.get(key) ?? 0);
    if (d > 0) parts.push(`${d} extra ${key}`);
    if (d < 0) parts.push(`${-d} missing ${key}`);
  }
  return parts.join(', ');
}
