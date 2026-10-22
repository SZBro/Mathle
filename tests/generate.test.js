import { describe, expect, it } from 'vitest';
import { runString, tilesFromString } from '../src/engine/index.js';
import { quality, score } from '../src/engine/score.js';
import { dailyPuzzle, dealTiles, generatePuzzle, judge } from '../src/generate.js';
import { mulberry32 } from '../src/daily.js';
import { checkPuzzle } from '../tools/check.js';
import { solve } from '../tools/solver.js';

const tilesOf = (src) => tilesFromString(src).map(({ id, inner, ...t }) => t);
const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 9, 21 + i)).toISOString().slice(0, 10));
const puzzles = days.map((day, i) => dailyPuzzle(day, i + 4));

describe('dailyPuzzle', () => {
  it('gives the same puzzle for the same day', () => {
    expect(dailyPuzzle('2026-10-21', 4)).toEqual(dailyPuzzle('2026-10-21', 4));
  });

  it('gives different puzzles on different days', () => {
    const keys = new Set(puzzles.map((p) => JSON.stringify(p.tiles)));
    expect(keys.size).toBeGreaterThan(55);
  });

  it('carries its id and versioned seed', () => {
    expect(dailyPuzzle('2026-10-21', 4)).toMatchObject({ id: 4, seed: 'v1:2026-10-21', difficulty: 'easy' });
  });

  it('produces a puzzle every day, using every goal type', () => {
    expect(puzzles.every(Boolean)).toBe(true);
    expect(new Set(puzzles.map((p) => p.goal.type))).toEqual(new Set(['largest', 'smallest', 'smallestPositive', 'closest']));
  });

  it('passes the puzzle checker (no hint is the only warning)', () => {
    for (const p of puzzles) {
      const { errors, warnings } = checkPuzzle(p);
      expect(errors, p.seed).toEqual([]);
      expect(warnings, p.seed).toEqual(['hint is empty']);
    }
  });

  it('stores answers that run to their stored values', () => {
    for (const p of puzzles) {
      expect(runString(p.best.expr).value, p.seed).toBe(p.best.value);
      expect(runString(p.naive.expr).value, p.seed).toBe(p.naive.value);
    }
  });

  it('has a best that the exhaustive solver agrees with', () => {
    for (const p of puzzles.slice(0, 20)) {
      const solved = solve(p);
      expect(solved.proven).toBe(true);
      expect(quality(p.goal, solved.value)).toBeCloseTo(quality(p.goal, p.best.value), 9);
    }
  });

  it('scores best 100% and naive 0%', () => {
    for (const p of puzzles) {
      expect(score(p, p.best.value).percent).toBe(100);
      expect(score(p, p.naive.value).percent).toBe(0);
    }
  });
});

describe('dealTiles', () => {
  it('deals 8 or 9 tiles with one fewer operator than numbers', () => {
    const rand = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const tiles = dealTiles(rand);
      const count = (kind) => tiles.filter((t) => t.kind === kind).length;
      expect([8, 9]).toContain(tiles.length);
      expect(count('op')).toBe(count('num') - 1);
      expect(count('lparen')).toBe(count('rparen'));
      expect(tiles.filter((t) => t.value === '^').length).toBeLessThanOrEqual(1);
      expect(new Set(tiles.filter((t) => t.kind === 'num').map((t) => t.value)).size).toBe(count('num'));
    }
  });

  it('deals a number that suits the function', () => {
    const rand = mulberry32(9);
    for (let i = 0; i < 200; i++) {
      const tiles = dealTiles(rand);
      const nums = tiles.filter((t) => t.kind === 'num').map((t) => t.value);
      const fn = tiles.find((t) => t.kind === 'fn' || t.kind === 'fnslot')?.value;
      if (fn === '√') expect(nums.some((n) => Number.isInteger(Math.sqrt(n)))).toBe(true);
      if (fn === 'log₂') expect(nums.some((n) => Number.isInteger(Math.log2(n)))).toBe(true);
    }
  });
});

describe('judge (quality filters)', () => {
  const rand = () => 0.5;

  it('rejects tiles where most arrangements are math errors', () => {
    // 204 of 288 arrangements raise to a power that is too big, e.g. 40 ^ 30.
    expect(judge(tilesOf('40 30 20 ^ + ( ) log₂'), 'largest', rand)).toBeNull();
  });

  it('rejects tiles with too few different results', () => {
    expect(judge(tilesOf('1 2 3 4 + + + √'), 'largest', rand)).toBeNull();
  });

  it('rejects a goal whose best answer is common', () => {
    // Plenty of orders reach the smallest result here.
    expect(judge(tilesOf('2 3 4 5 × × × √'), 'smallest', rand)).toBeNull();
  });

  it('accepts a good puzzle and fills in best and naive', () => {
    const p = judge(tilesOf('1 4 6 8 3 × × × + ( )'), 'largest', rand);
    expect(p.best).toMatchObject({ value: 768, proven: true });
    expect(p.naive.value).toBeLessThan(768);
  });

  it('picks a closest target that is a whole number in range', () => {
    const closest = Array.from({ length: 40 }, (_, seed) => generatePuzzle(seed))
      .filter((p) => p.goal.type === 'closest');
    expect(closest.length).toBeGreaterThan(0);
    for (const p of closest) {
      expect(Number.isInteger(p.goal.target)).toBe(true);
      expect(p.goal.target).toBeGreaterThanOrEqual(10);
    }
  });
});
