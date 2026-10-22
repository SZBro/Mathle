// Seeded puzzle generator. The same seed always gives the same puzzle, so every player
// gets the same daily puzzle without a server.
//
// A candidate is dealt from a recipe (8 or 9 tiles), every answer is listed with the
// shared enumerator, and quality filters throw out dull or broken candidates:
//   - most arrangements must run without a math error
//   - enough different results that the order matters
//   - the best answer is rare, and clearly better than a typical one
//   - values stay small enough to work out by hand
// `best` is the exhaustive best, so it is proven. `naive` is the median answer: a
// typical arrangement scores 0%, the best scores 100%.
//
// Changing anything here changes which puzzle a seed gives, so bump GENERATOR_VERSION
// when you do. Saved days keep a copy of their puzzle and aren't affected.

import { hashString, mulberry32 } from './daily.js';
import { allAnswers, toArrangement } from './engine/enumerate.js';
import { tilesToString } from './engine/index.js';
import { quality } from './engine/score.js';

export const GENERATOR_VERSION = 1;

const GOAL_TYPES = ['largest', 'smallest', 'smallestPositive', 'closest'];

// [weight, numbers, operators, extras]
const RECIPES = [
  [3, 4, 3, ['fn']],
  [2, 4, 3, ['fnslot']],
  [3, 4, 3, ['parens']],
  [2, 3, 2, ['parens', 'fn']],
];

const OP_WEIGHTS = [['+', 3], ['−', 3], ['×', 3], ['÷', 2], ['^', 1]];
const FN_WEIGHTS = [['√', 4], ['log₂', 3], ['∛', 1], ['log₁₀', 1]];

// Numbers each function gives a whole answer for. One is always dealt with the function.
const NICE_ARGS = {
  '√': [4, 9, 16, 25, 36, 49, 64],
  '∛': [8, 27, 64],
  'log₂': [2, 4, 8, 16, 32, 64],
  'log₁₀': [10, 100],
};

const MAX_VALUE = 1e6; // best and naive must stay readable
const MIN_ANSWERS_SHARE = 0.7; // at most 30% of arrangements may hit a math error
const MIN_DISTINCT = 12;
const MAX_BEST_SHARE = 0.08; // at most 8% of answers may reach the best value
const CLOSEST_TRIES = 6;

// Today's puzzle. `day` is "YYYY-MM-DD"; `number` becomes the puzzle id (#N).
export function dailyPuzzle(day, number) {
  const seed = `v${GENERATOR_VERSION}:${day}`;
  const p = generatePuzzle(hashString(seed));
  return p && { ...p, id: number, seed };
}

// Returns a puzzle, or null if no candidate passed the filters (very unlikely).
export function generatePuzzle(seed, { attempts = 200 } = {}) {
  const rand = mulberry32(seed);
  for (let i = 0; i < attempts; i++) {
    const tiles = dealTiles(rand);
    const goalType = pick(rand, GOAL_TYPES);
    const p = judge(tiles, goalType, rand);
    if (p) return { difficulty: 'easy', ...p };
  }
  return null;
}

// ---- dealing ------------------------------------------------------------------------

export function dealTiles(rand) {
  const [, numCount, opCount, extras] = weighted(rand, RECIPES.map((r) => [r, r[0]]));
  const tiles = [];

  const nums = new Set();
  while (nums.size < numCount) {
    // Mostly 1–12, sometimes a two-digit number.
    nums.add(rand() < 0.2 ? 13 + Math.floor(rand() * 38) : 1 + Math.floor(rand() * 12));
  }
  const numbers = [...nums];

  for (const extra of extras) {
    if (extra === 'parens') {
      tiles.push({ kind: 'lparen' }, { kind: 'rparen' });
    } else {
      const fn = weighted(rand, FN_WEIGHTS);
      tiles.push({ kind: extra, value: fn });
      const nice = NICE_ARGS[fn].filter((n) => !numbers.includes(n));
      numbers[Math.floor(rand() * numbers.length)] = pick(rand, nice);
    }
  }

  const ops = [];
  while (ops.length < opCount) {
    const op = weighted(rand, OP_WEIGHTS);
    if (op === '^' && ops.includes('^')) continue; // one power is plenty
    if (ops.filter((o) => o === op).length === 2) continue;
    ops.push(op);
  }

  return [
    ...numbers.map((value) => ({ kind: 'num', value })),
    ...ops.map((value) => ({ kind: 'op', value })),
    ...tiles,
  ];
}

// ---- judging ------------------------------------------------------------------------

// Applies the quality filters. Returns { goal, tiles, best, naive } or null.
export function judge(tiles, goalType, rand) {
  const withIds = tiles.map((t, id) => ({ ...t, id }));
  const { answers, total } = allAnswers(withIds);
  if (answers.length < total * MIN_ANSWERS_SHARE) return null;
  if (new Set(answers.map((a) => roundKey(a.value))).size < MIN_DISTINCT) return null;

  if (goalType !== 'closest') return rate(tiles, { type: goalType }, answers);

  // Aim between the middle and the top of the reachable whole-number results.
  const values = answers.map((a) => a.value).filter((v) => v >= 10 && v <= 999).sort((a, b) => a - b);
  if (values.length < answers.length / 4) return null;
  for (let i = 0; i < CLOSEST_TRIES; i++) {
    const at = values[Math.floor((0.5 + rand() * 0.45) * values.length)];
    const target = Math.max(10, Math.round(at) + Math.floor(rand() * 7) - 3);
    const p = rate(tiles, { type: 'closest', target }, answers);
    if (p) return p;
  }
  return null;
}

function rate(tiles, goal, answers) {
  const scored = answers
    .map((a) => ({ ...a, q: quality(goal, a.value) }))
    .filter((a) => Number.isFinite(a.q));
  if (scored.length < answers.length * 0.2) return null;

  // Ties keep walk order, so the same seed always picks the same expressions.
  const best = scored.reduce((b, a) => (a.q > b.q ? a : b));
  const sorted = [...scored].sort((a, b) => a.q - b.q);
  const naive = sorted[Math.floor(sorted.length / 2)];

  const tol = 1e-9 * Math.max(1, Math.abs(best.q));
  const atBest = scored.filter((a) => best.q - a.q <= tol).length;
  if (atBest > answers.length * MAX_BEST_SHARE) return null;
  if (best.q - naive.q <= tol) return null;
  if (Math.abs(best.value) > MAX_VALUE || Math.abs(naive.value) > MAX_VALUE) return null;
  // A tiny "positive" result is usually float noise, like (3 ÷ 7) × 7 − 3.
  if (goal.type === 'smallestPositive' && best.value < 1e-6) return null;

  return {
    goal,
    tiles,
    best: { expr: exprOf(best), value: best.value, proven: true },
    naive: { expr: exprOf(naive), value: naive.value },
  };
}

// ---- utilities ----------------------------------------------------------------------

const exprOf = (a) => tilesToString(toArrangement(a.flat));
const roundKey = (v) => Math.round(v * 1e6);
const pick = (rand, items) => items[Math.floor(rand() * items.length)];

// items: [[value, weight], ...]
function weighted(rand, items) {
  let r = rand() * items.reduce((s, [, w]) => s + w, 0);
  for (const [value, w] of items) {
    r -= w;
    if (r < 0) return value;
  }
  return items[items.length - 1][0];
}
