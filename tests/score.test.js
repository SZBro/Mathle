import { describe, expect, it } from 'vitest';
import { quality, score } from '../src/engine/score.js';
import { runString } from '../src/engine/index.js';

const puzzle = (goal, best, naive) => ({ id: 0, goal, best: { value: best }, naive: { value: naive } });

describe('quality', () => {
  it('higher is better for every goal', () => {
    expect(quality({ type: 'largest' }, 5)).toBe(5);
    expect(quality({ type: 'smallest' }, -5)).toBe(5);
    expect(quality({ type: 'smallestPositive' }, 0.5)).toBe(-0.5);
    expect(quality({ type: 'smallestPositive' }, 0)).toBe(-Infinity);
    expect(quality({ type: 'smallestPositive' }, -3)).toBe(-Infinity);
    expect(quality({ type: 'closest', target: 247 }, 250)).toBe(-3);
    expect(quality({ type: 'closest', target: 247 }, 244)).toBe(-3);
  });

  it('rejects unknown goals and a closest goal without a target', () => {
    expect(() => quality({ type: 'middle' }, 1)).toThrow(/Unknown goal/);
    expect(() => quality({ type: 'closest' }, 1)).toThrow(/target/);
  });
});

describe('score: largest (the CLAUDE.md example puzzle)', () => {
  const p = puzzle({ type: 'largest' }, 768, 577);

  it('best scores 100%, naive scores 0%', () => {
    expect(score(p, 768)).toEqual({ score: 1, percent: 100, beatBest: false, matchedBest: true });
    expect(score(p, 577)).toMatchObject({ score: 0, percent: 0 });
  });

  it('scales linearly between naive and best', () => {
    expect(score(p, (768 + 577) / 2)).toMatchObject({ score: 0.5, percent: 50 });
  });

  it('clamps below naive to 0', () => {
    expect(score(p, 10)).toMatchObject({ score: 0, percent: 0, beatBest: false });
  });

  it('beating best shows 100% and flags it', () => {
    expect(score(p, 800)).toEqual({ score: 1, percent: 100, beatBest: true, matchedBest: false });
  });

  it('agrees with the engine on the example answers', () => {
    expect(runString('(1 + 3) × 4 × 6 × 8').value).toBe(768);
    expect(runString('(1) + 4 × 6 × 8 × 3').value).toBe(577);
  });
});

describe('score: smallest (negatives allowed)', () => {
  const p = puzzle({ type: 'smallest' }, -100, 20);

  it('scores toward the lowest value', () => {
    expect(score(p, -100).percent).toBe(100);
    expect(score(p, 20).percent).toBe(0);
    expect(score(p, -40).score).toBeCloseTo(0.5);
    expect(score(p, 50).score).toBe(0);
    expect(score(p, -101).beatBest).toBe(true);
  });
});

describe('score: smallestPositive', () => {
  const p = puzzle({ type: 'smallestPositive' }, 0.25, 10);

  it('scores toward the lowest positive value', () => {
    expect(score(p, 0.25).percent).toBe(100);
    expect(score(p, 10).percent).toBe(0);
    expect(score(p, 5.125).score).toBeCloseTo(0.5);
    expect(score(p, 0.1).beatBest).toBe(true);
  });

  it('zero or negative scores 0%', () => {
    expect(score(p, 0)).toMatchObject({ score: 0, percent: 0, beatBest: false });
    expect(score(p, -0.5)).toMatchObject({ score: 0, percent: 0, beatBest: false });
  });

  it('rejects a puzzle whose best or naive is not positive', () => {
    expect(() => score(puzzle({ type: 'smallestPositive' }, 0, 10), 1)).toThrow(/valid answers/);
    expect(() => score(puzzle({ type: 'smallestPositive' }, 1, -2), 1)).toThrow(/valid answers/);
  });
});

describe('score: closest', () => {
  const p = puzzle({ type: 'closest', target: 247 }, 246, 207);

  it('scores by distance, from either side', () => {
    expect(score(p, 246).percent).toBe(100);
    expect(score(p, 248).percent).toBe(100); // same distance as best
    expect(score(p, 207).percent).toBe(0);
    expect(score(p, 287).percent).toBe(0); // 40 away on the other side
    expect(score(p, 267.5).score).toBeCloseTo(0.5);
  });

  it('hitting the target exactly beats a best that missed', () => {
    expect(score(p, 247)).toMatchObject({ percent: 100, beatBest: true });
  });
});

describe('score: edge cases', () => {
  it('float noise counts as matching best, not beating it', () => {
    const p = puzzle({ type: 'largest' }, 2, 1);
    expect(score(p, Math.SQRT2 ** 2)).toMatchObject({ score: 1, beatBest: false, matchedBest: true });
  });

  it('percent rounds down so only a true best shows 100', () => {
    const p = puzzle({ type: 'largest' }, 1000, 0);
    expect(score(p, 999.6).percent).toBe(99);
  });

  it('best equal to naive: matching gets 100%, anything worse gets 0%', () => {
    const p = puzzle({ type: 'largest' }, 50, 50);
    expect(score(p, 50).percent).toBe(100);
    expect(score(p, 49).percent).toBe(0);
    expect(score(p, 51).beatBest).toBe(true);
  });

  it('rejects a puzzle whose best is worse than naive', () => {
    expect(() => score(puzzle({ type: 'largest' }, 10, 20), 15)).toThrow(/worse than naive/);
  });
});
