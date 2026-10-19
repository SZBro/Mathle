// Offline solver. Uses the game's own tokenizer, validator, parser and evaluator, so it
// can never disagree with the game.
//
// Arrangements are handled in "flat" form: the puzzle's tiles in order, where a slot
// tile is always followed by the number it holds (see toArrangement).
//
//   exhaustive  every well-formed arrangement, identical tiles not repeated; proven best
//   heuristic   random restarts + local moves (swap, move, move a block); "best known"

import { evaluate, parse, tilesToString, tokenize, validate } from '../src/engine/index.js';
import { quality } from '../src/engine/score.js';
import { puzzleTilesWithIds, tileKey, toArrangement } from './puzzles.js';

export const DEFAULT_EXHAUSTIVE_MAX = 13;

export function solve(puzzle, {
  exhaustiveMax = DEFAULT_EXHAUSTIVE_MAX,
  iterations = 2_000_000,
  seed = 1,
} = {}) {
  const tiles = puzzleTilesWithIds(puzzle);
  const q = (v) => quality(puzzle.goal, v);
  const found = tiles.length <= exhaustiveMax
    ? exhaustive(tiles, q)
    : heuristic(tiles, q, { iterations, rng: mulberry32(seed) });
  if (!found.flat) return { expr: null, value: null, proven: found.proven, evaluated: found.evaluated };
  return {
    expr: tilesToString(toArrangement(found.flat)),
    value: found.value,
    proven: found.proven,
    evaluated: found.evaluated,
  };
}

// Median quality of random well-formed answers: what a player arranging tiles without a
// plan would get. Used to fill in `naive` when a puzzle doesn't have one.
export function randomNaive(puzzle, { samples = 501, seed = 1 } = {}) {
  const tiles = puzzleTilesWithIds(puzzle);
  const rng = mulberry32(seed);
  const results = [];
  for (let i = 0; i < samples * 5 && results.length < samples; i++) {
    const flat = randomArrangement(tiles, rng);
    const value = flat && valueOf(flat, true);
    if (value === null || value === undefined) continue;
    const qv = quality(puzzle.goal, value);
    if (Number.isFinite(qv)) results.push({ flat, value, q: qv });
  }
  if (!results.length) return null;
  results.sort((a, b) => a.q - b.q);
  const mid = results[Math.floor(results.length / 2)];
  return { expr: tilesToString(toArrangement(mid.flat)), value: mid.value };
}

// Evaluates a flat arrangement. Returns null for malformed input or a math error.
// `trusted` skips validation for arrangements built by the grammar walk below.
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
// tile groups in; `visit(flat)` returns true to stop the walk.
function walk(tiles, order, visit) {
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

function exhaustive(tiles, q) {
  let best = { flat: null, value: null, q: -Infinity, proven: true, evaluated: 0 };
  walk(tiles, (pools) => pools, (flat) => {
    best.evaluated++;
    const value = valueOf(flat, true);
    if (value === null) return false;
    const qv = q(value);
    if (qv > best.q) best = { ...best, flat: [...flat], value, q: qv };
    return false;
  });
  return best;
}

function randomArrangement(tiles, rng) {
  let found = null;
  walk(tiles, (pools) => shuffle([...pools], rng), (flat) => {
    found = [...flat];
    return true;
  });
  return found;
}

// ---- heuristic search ---------------------------------------------------------------

function heuristic(tiles, q, { iterations, rng }) {
  const stallLimit = 2000 + tiles.length * 200;
  let best = { flat: null, value: null, q: -Infinity, proven: false, evaluated: 0 };
  let cur = null;
  let stall = 0;

  const restart = () => {
    for (let tries = 0; tries < 50; tries++) {
      const flat = randomArrangement(tiles, rng);
      const value = valueOf(flat, true);
      best.evaluated++;
      if (value !== null) {
        cur = { flat, value, q: q(value) };
        stall = 0;
        return;
      }
    }
    cur = null;
  };

  restart();
  for (let i = 0; i < iterations; i++) {
    if (!cur || stall > stallLimit) {
      restart();
      if (!cur) continue;
    }
    const flat = mutate(cur.flat, rng);
    if (!flat) continue;
    const value = valueOf(flat);
    best.evaluated++;
    if (value === null) {
      stall++;
      continue;
    }
    const qv = q(value);
    if (qv > cur.q) stall = 0;
    else stall++;
    if (qv >= cur.q) cur = { flat, value, q: qv };
    if (qv > best.q) best = { ...best, flat, value, q: qv };
  }
  return best;
}

function mutate(flat, rng) {
  const n = flat.length;
  const out = [...flat];
  const r = rng();
  const i = Math.floor(rng() * n);
  if (r < 0.5) {
    // swap two tiles
    const j = Math.floor(rng() * n);
    if (i === j || tileKey(out[i]) === tileKey(out[j])) return null;
    [out[i], out[j]] = [out[j], out[i]];
  } else {
    // move a block of 1–3 tiles elsewhere
    const len = 1 + Math.floor(rng() * 3);
    if (i + len > n) return null;
    const block = out.splice(i, len);
    const j = Math.floor(rng() * (out.length + 1));
    if (j === i) return null;
    out.splice(j, 0, ...block);
  }
  return out;
}

// ---- utilities ----------------------------------------------------------------------

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Small seeded PRNG so solver runs are repeatable.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
