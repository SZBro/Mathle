import { describe, it, expect } from 'vitest';
import puzzles from '../src/puzzles.json';
import { submit, replay, savedPuzzle } from '../src/result.js';
import { dailyPuzzle } from '../src/generate.js';
import { tilesFromString } from '../src/engine/index.js';

// Maps tilesFromString's ids onto the puzzle's tile indexes, the way the Play screen
// hands over an arrangement.
function arrange(puzzle, src) {
  const free = puzzle.tiles.map((t, i) => ({ t, i }));
  const take = (tile) => {
    const k = free.findIndex(({ t }) => t.kind === tile.kind && t.value === tile.value);
    if (k < 0) throw new Error(`No tile left for ${JSON.stringify(tile)}`);
    const [{ i }] = free.splice(k, 1);
    const out = { ...puzzle.tiles[i], id: i };
    if (tile.inner) out.inner = tile.inner.map(take);
    return out;
  };
  return tilesFromString(src).map(take);
}

const p1 = puzzles.find((p) => p.id === 1);

describe('submit', () => {
  it('scores and builds a saved entry', () => {
    const res = submit(p1, arrange(p1, p1.best.expr));
    expect(res.ok).toBe(true);
    expect(res.entry).toEqual({ puzzleId: 1, expr: p1.best.expr, value: p1.best.value, score: 1, puzzle: p1 });
    expect(res.result.percent).toBe(100);
    expect(res.result.steps.length).toBeGreaterThan(0);
  });

  it('returns a math error without an entry', () => {
    const puzzle = {
      id: 99,
      goal: { type: 'largest' },
      tiles: tilesFromString('4 ÷ (2 − 2)'),
      best: { value: 4 },
      naive: { value: 1 },
    };
    const res = submit(puzzle, arrange(puzzle, '4 ÷ (2 − 2)'));
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('divByZero');
    expect(res.entry).toBeUndefined();
  });

  it('rejects an arrangement that leaves tiles unused', () => {
    const res = submit(p1, arrange(p1, '1 + 4'));
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === 'unusedTiles')).toBe(true);
  });
});

describe('replay', () => {
  it.each(puzzles.map((p) => [p.id, p]))('puzzle %i: best and naive replay to their saved value', (_id, p) => {
    for (const answer of [p.best, p.naive]) {
      const { entry } = submit(p, arrange(p, answer.expr));
      const r = replay(p, entry);
      expect(r.value).toBe(entry.value);
      expect(r.steps.at(-1)?.value ?? r.value).toBe(entry.value);
      expect(r.percent).toBe(entry.score === 1 ? 100 : Math.floor(entry.score * 100));
    }
  });

  it('keeps the saved score even if the puzzle changed', () => {
    const r = replay(p1, { puzzleId: 1, expr: p1.naive.expr, value: p1.naive.value, score: 0.42 });
    expect(r.percent).toBe(42);
  });

  it('still shows the saved value when the expression is unreadable', () => {
    const r = replay(p1, { puzzleId: 1, expr: '((', value: 700, score: 0.6 });
    expect(r.value).toBe(700);
    expect(r.steps).toEqual([]);
    expect(r.tiles).toEqual([]);
  });
});

describe('savedPuzzle', () => {
  const generated = dailyPuzzle('2026-10-21', 4);

  it('uses the copy saved with the day', () => {
    const { entry } = submit(generated, arrange(generated, generated.best.expr));
    expect(savedPuzzle(JSON.parse(JSON.stringify(entry)), puzzles)).toEqual(generated);
  });

  it('falls back to the hand-made puzzle for days saved before generation', () => {
    expect(savedPuzzle({ puzzleId: 1, expr: '1', value: 1, score: 0 }, puzzles)).toBe(p1);
  });

  it('ignores a damaged copy', () => {
    expect(savedPuzzle({ puzzleId: 1, puzzle: { tiles: 'x' } }, puzzles)).toBe(p1);
    expect(savedPuzzle({ puzzleId: 99, puzzle: null }, puzzles)).toBeNull();
  });
});
