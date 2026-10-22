import { describe, expect, it } from 'vitest';
import { run, tilesFromString, tilesToString } from '../src/engine/index.js';
import { allAnswers, tileKey, toArrangement } from '../src/engine/enumerate.js';

// Builds tiles with ids from a tile list like "1 4 6 √[] ( )".
const tilesOf = (src) => tilesFromString(src).map(({ inner, ...t }) => t);
const exprs = (r) => r.answers.map((a) => tilesToString(toArrangement(a.flat))).sort();

describe('allAnswers', () => {
  it('lists every order of distinct numbers and operators', () => {
    // 3! number orders × 2! operator orders
    const r = allAnswers(tilesOf('1 2 3 + ×'));
    expect(r).toMatchObject({ total: 12, errors: 0 });
    expect(exprs(r)).toContain('3 × 1 + 2');
  });

  it('never lists the same expression twice for identical tiles', () => {
    const r = allAnswers(tilesOf('2 2 3 + +'));
    expect(r.total).toBe(3); // 2 + 2 + 3, 2 + 3 + 2, 3 + 2 + 2
    expect(new Set(exprs(r)).size).toBe(3);
  });

  it('places parentheses, functions and slots only where they are legal', () => {
    expect(exprs(allAnswers(tilesOf('1 2 + ( )')))).toEqual(['(1 + 2)', '(1) + 2', '(2 + 1)', '(2) + 1', '1 + (2)', '2 + (1)']);
    expect(exprs(allAnswers(tilesOf('4 9 + √')))).toEqual(['4 + √9', '9 + √4', '√4 + 9', '√9 + 4']);
    expect(exprs(allAnswers(tilesOf('4 9 + √[]')))).toEqual(['4 + √[9]', '9 + √[4]', '√[4] + 9', '√[9] + 4']);
  });

  it('counts math errors but leaves them out of the answers', () => {
    const r = allAnswers(tilesOf('1 1 2 − ÷ ( )'));
    expect(r.errors).toBeGreaterThan(0); // e.g. 2 ÷ (1 − 1)
    expect(r.answers.length + r.errors).toBe(r.total);
  });

  it('agrees with the game on every answer', () => {
    const tiles = tilesOf('3 7 8 ^ ÷ − ( ) √');
    for (const { flat, value } of allAnswers(tiles).answers) {
      const res = run(toArrangement(flat), { puzzleTiles: tiles, steps: false });
      expect(res.ok).toBe(true);
      expect(res.value).toBe(value);
    }
  });
});

describe('tileKey', () => {
  it('matches identical tiles and ASCII aliases', () => {
    expect(tileKey({ kind: 'op', value: '*' })).toBe(tileKey({ kind: 'op', value: '×' }));
    expect(tileKey({ kind: 'num', value: 7 })).not.toBe(tileKey({ kind: 'num', value: 8 }));
    expect(tileKey({ kind: 'fn', value: '√' })).not.toBe(tileKey({ kind: 'fnslot', value: '√' }));
  });
});
