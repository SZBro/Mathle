import { describe, expect, it } from 'vitest';
import { runString, tilesFromString, tilesToString } from '../src/engine/index.js';
import { checkPuzzle, checkPuzzles } from '../tools/check.js';
import { flattenTiles, formatPuzzles, loadPuzzles, toArrangement } from '../tools/puzzles.js';
import { randomNaive, solve } from '../tools/solver.js';

// Builds puzzle tiles from a tile list like "1 4 6 √[] ( )".
const tilesOf = (src) => tilesFromString(src).map(({ id, inner, ...t }) => t);

const example = {
  id: 1,
  difficulty: 'easy',
  goal: { type: 'largest' },
  tiles: tilesOf('1 4 6 8 3 × × × + ( )'),
  best: { expr: '(1 + 3) × 4 × 6 × 8', value: 768 },
  naive: { expr: '(1) + 4 × 6 × 8 × 3', value: 577 },
  hint: 'Adding to your smallest number grows the product the most.',
};

describe('tilesToString', () => {
  it.each([
    '(1 + 3) × 4 × 6 × 8',
    '√9 ^ 2',
    '√(9 + 7)',
    'log₂ 8 + log₁₀(10 × 10)',
    '√[9] + log₂[8]',
    '√√16',
    '((2))',
  ])('round-trips %s', (src) => {
    expect(tilesToString(tilesFromString(src))).toBe(src);
  });
});

describe('flat form', () => {
  it('a slot takes the tile after it', () => {
    const flat = flattenTiles(tilesFromString('√[9] + 1'));
    expect(flat.map((t) => t.kind)).toEqual(['fnslot', 'num', 'op', 'num']);
    expect(tilesToString(toArrangement(flat))).toBe('√[9] + 1');
  });
});

describe('checkPuzzle', () => {
  const broken = (changes) => checkPuzzle({ ...example, ...changes }).errors;

  it('accepts the CLAUDE.md example', () => {
    expect(checkPuzzle(example)).toMatchObject({ errors: [], warnings: [] });
  });

  it('warns about unfinished puzzles', () => {
    const { errors, warnings } = checkPuzzle({ ...example, best: null, naive: null, hint: '' });
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(3);
  });

  it('catches a wrong stored value', () => {
    expect(broken({ best: { expr: '(1 + 3) × 4 × 6 × 8', value: 700 } })[0]).toMatch(/best.value is 700/);
  });

  it('catches an answer that uses the wrong tiles', () => {
    expect(broken({ best: { expr: '(1 + 3) × 4 × 6 × 9', value: 864 } })[0]).toMatch(/1 missing num:8, 1 extra num:9/);
    expect(broken({ best: { expr: '1 + 3 × 4 × 6 × 8', value: 577 } })[0]).toMatch(/missing lparen/);
  });

  it('catches malformed answers and math errors', () => {
    const p = { ...example, tiles: tilesOf('1 4 6 8 3 ÷ − × + ( )') };
    expect(checkPuzzle({ ...p, best: { expr: '(1 + 3) − × 4 ÷ 6 8', value: 0 }, naive: null }).errors[0]).toMatch(/malformed/);
    expect(checkPuzzle({ ...p, best: { expr: '1 + 3 × 4 ÷ (6 − 6)', value: 0 }, naive: null }).errors[0]).toMatch(/doesn't use exactly/);
    const q = { ...example, tiles: tilesOf('1 4 4 8 3 ÷ − × + ( )') };
    expect(checkPuzzle({ ...q, best: { expr: '1 + 3 × 8 ÷ (4 − 4)', value: 0 }, naive: null }).errors[0]).toMatch(/math error/);
  });

  it('catches best worse than naive', () => {
    expect(broken({ best: example.naive, naive: example.best })[0]).toMatch(/worse than naive/);
  });

  it('catches bad puzzle fields', () => {
    expect(broken({ difficulty: 'brutal' })[0]).toMatch(/difficulty/);
    expect(broken({ goal: { type: 'closest' } })[0]).toMatch(/target/);
    expect(broken({ tiles: tilesOf('1 + 2 × 3') }).join()).toMatch(/must have 8 to 25/);
    expect(broken({ tiles: [...example.tiles.slice(0, -1), { kind: 'num', value: 1001 }] }).join()).toMatch(/1 to 1000/);
    expect(broken({ tiles: [...example.tiles.slice(0, -1), { kind: 'op', value: '+' }] }).join()).toMatch(/same number of "\(" and "\)"/);
    expect(broken({ tiles: [...example.tiles, { kind: 'fnslot', value: '√', inner: [] }] }).join()).toMatch(/slot tiles must be empty/);
    const extraOps = [...example.tiles, { kind: 'op', value: '+' }, { kind: 'op', value: '+' }];
    expect(broken({ tiles: extraOps }).join()).toMatch(/needs 4 operators, not 6/);
  });

  it('catches duplicate ids', () => {
    expect(checkPuzzles([example, example]).at(-1).errors[0]).toMatch(/Duplicate puzzle ids: 1/);
  });
});

describe('solve', () => {
  it('exhaustive search finds the CLAUDE.md best answer', () => {
    const r = solve(example, { exhaustiveMax: 11 });
    expect(r).toMatchObject({ value: 768, proven: true });
    expect(runString(r.expr).value).toBe(768);
  });

  it('finds an exact 24 from 1 3 4 6', () => {
    const p = { ...example, goal: { type: 'closest', target: 24 }, tiles: tilesOf('1 3 4 6 ÷ − ÷ ( )') };
    const r = solve(p);
    expect(r.value).toBeCloseTo(24, 9);
    expect(r.expr).toBe('6 ÷ (1 − 3 ÷ 4)');
  });

  it('handles slot and function tiles', () => {
    const p = { ...example, goal: { type: 'largest' }, tiles: tilesOf('2 3 9 16 log₂[] √ + × −') };
    const r = solve(p);
    expect(r.proven).toBe(true);
    expect(runString(r.expr).value).toBe(r.value);
    expect(r.expr).toContain('log₂[');
  });

  it('skips arrangements with math errors', () => {
    // Several arrangements of these tiles divide by zero, e.g. 2 ÷ (1 − 1) − 2.
    const p = { ...example, goal: { type: 'largest' }, tiles: tilesOf('1 1 2 2 − − ÷ ( )') };
    const r = solve(p);
    expect(Number.isFinite(r.value)).toBe(true);
    expect(runString(r.expr).ok).toBe(true);
  });

  it('heuristic search reaches the exhaustive answer on a small puzzle', () => {
    const r = solve(example, { exhaustiveMax: 0, iterations: 20_000, seed: 7 });
    expect(r).toMatchObject({ value: 768, proven: false });
  });

  it('heuristic search is repeatable for a given seed', () => {
    const p = loadPuzzles().find((x) => x.tiles.length > 20);
    const a = solve(p, { iterations: 3000, seed: 3 });
    const b = solve(p, { iterations: 3000, seed: 3 });
    expect(a).toEqual(b);
    expect(runString(a.expr).value).toBe(a.value);
  });

  it('randomNaive returns a valid median answer', () => {
    const n = randomNaive(example, { samples: 101 });
    expect(runString(n.expr).value).toBe(n.value);
    expect(n.value).toBeLessThan(768);
  });
});

describe('src/puzzles.json', () => {
  const puzzles = loadPuzzles();

  it('has 30 puzzles with ids 1..30', () => {
    expect(puzzles.map((p) => p.id)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('passes the checker with no errors', () => {
    const errors = checkPuzzles(puzzles).flatMap((r) => r.errors.map((e) => `${r.label} ${e}`));
    expect(errors).toEqual([]);
  });

  it('is in the standard format (re-saving changes nothing)', async () => {
    const { readFileSync } = await import('node:fs');
    const { PUZZLES_PATH } = await import('../tools/puzzles.js');
    expect(readFileSync(PUZZLES_PATH, 'utf8').replace(/\r\n/g, '\n')).toBe(formatPuzzles(puzzles));
  });
});
