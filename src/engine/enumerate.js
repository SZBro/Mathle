// Every well-formed arrangement of a set of tiles. Shared by the offline solver and the
// in-browser puzzle generator, so both see exactly the answers the game accepts.
//
// Arrangements are handled in "flat" form: tiles in order, where a slot tile is always
// followed by the number it holds (see toArrangement).

import { evaluate } from './evaluate.js';
import { parse } from './parser.js';
import { canonicalFn, canonicalOp } from './tiles.js';
import { tokenize } from './tokenizer.js';
import { validate } from './validate.js';

// Identical tiles share a key: "num:7", "op:×", "lparen", "fn:√", "fnslot:log₂".
export function tileKey(tile) {
  switch (tile.kind) {
    case 'num': return `num:${tile.value}`;
    case 'op': return `op:${canonicalOp(tile.value)}`;
    case 'fn':
    case 'fnslot': return `${tile.kind}:${canonicalFn(tile.value)}`;
    default: return tile.kind;
  }
}

// Flat form -> an arrangement the game can run: each slot takes the tile after it.
export function toArrangement(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i++) {
    const t = flat[i];
    if (t.kind === 'fnslot') {
      out.push({ ...t, inner: i + 1 < flat.length ? [flat[++i]] : [] });
    } else {
      out.push(t);
    }
  }
  return out;
}

// Evaluates a flat arrangement. Returns null for malformed input or a math error.
// `trusted` skips validation for arrangements built by walk() below.
export function valueOf(flat, trusted = false) {
  const tokens = tokenize(toArrangement(flat));
  if (!trusted && validate(tokens).length) return null;
  const r = evaluate(parse(tokens), { steps: false });
  return r.ok ? r.value : null;
}

// ---- grammar walk -------------------------------------------------------------------
// What the last placed tile allows next, mirroring validate.js.
const START = 0, OPERAND = 1, OP = 2, OPEN = 3, FN = 4, SLOT = 5;

function step(state, kind) {
  const { prev, depth } = state;
  if (prev === SLOT) return kind === 'num' ? { prev: OPERAND, depth } : null;
  if (prev === OPERAND) {
    if (kind === 'op') return { prev: OP, depth };
    if (kind === 'rparen' && depth > 0) return { prev: OPERAND, depth: depth - 1 };
    return null;
  }
  // START, OP, OPEN, FN: an operand must come next
  if (kind === 'num') return { prev: OPERAND, depth };
  if (kind === 'lparen') return { prev: OPEN, depth: depth + 1 };
  if (kind === 'fn') return { prev: FN, depth };
  if (kind === 'fnslot') return { prev: SLOT, depth };
  return null;
}

// Groups identical tiles so the walk never tries two orders of the same tiles.
function makePools(tiles) {
  const pools = new Map();
  for (const t of tiles) {
    const key = tileKey(t);
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key).push(t);
  }
  return [...pools.values()];
}

// Depth-first walk over well-formed arrangements. `order(pools)` picks the order to try
// tile groups in; `visit(flat)` returns true to stop the walk. `flat` is reused, so
// copy it to keep it.
export function walk(tiles, order, visit) {
  const pools = makePools(tiles);
  const n = tiles.length;
  const seq = [];
  const left = { num: 0, fn: 0, lparen: 0 };
  for (const t of tiles) if (t.kind in left) left[t.kind]++;

  function go(state) {
    if (seq.length === n) return state.depth === 0 && state.prev === OPERAND ? visit(seq) : false;
    // Every remaining fn and "(" needs a number somewhere after it.
    if (state.prev === OPERAND && left.num === 0 && (left.fn || left.lparen)) return false;
    for (const pool of order(pools)) {
      if (!pool.length) continue;
      const kind = pool[pool.length - 1].kind;
      const next = step(state, kind);
      if (!next) continue;
      const tile = pool.pop();
      seq.push(tile);
      if (kind in left) left[kind]--;
      const stop = go(next);
      if (kind in left) left[kind]++;
      seq.pop();
      pool.push(tile);
      if (stop) return true;
    }
    return false;
  }
  go({ prev: START, depth: 0 });
}

// Every well-formed arrangement, evaluated.
//   { answers: [{ flat, value }], total, errors }
// answers holds the ones without a math error; total counts all well-formed ones.
export function allAnswers(tiles) {
  const answers = [];
  let total = 0;
  walk(tiles, (pools) => pools, (flat) => {
    total++;
    const value = valueOf(flat, true);
    if (value !== null) answers.push({ flat: [...flat], value });
    return false;
  });
  return { answers, total, errors: total - answers.length };
}
