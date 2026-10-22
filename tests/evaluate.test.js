import { describe, expect, it } from 'vitest';
import { runString, tilesFromString, run } from '../src/engine/index.js';
import { formatNumber } from '../src/engine/format.js';

const valueOf = (src) => {
  const r = runString(src);
  if (!r.ok) throw new Error(`Expected ok for ${src}: ${JSON.stringify(r)}`);
  return r.value;
};
const errorOf = (src) => runString(src).error;

describe('evaluate: values', () => {
  it.each([
    ['7', 7],
    ['(1 + 3) × 4 × 6 × 8', 768],
    ['(1) + 4 × 6 × 8 × 3', 577],
    ['1 + 2 × 3', 7],
    ['8 − 3 − 2', 3],
    ['8 ÷ 4 ÷ 2', 1],
    ['2 ^ 3 ^ 2', 512],
    ['√9 ^ 2', 9],
    ['√(9 + 7)', 4],
    ['√√16', 2],
    ['∛27', 3],
    ['∛(0 − 27)', -3],
    ['log₂ 8', 3],
    ['log₁₀ 1000', 3],
    ['log₂(4 × 8)', 5],
    ['√[9] + log₂[8]', 6],
    ['3 − 10', -7],
    ['7 ÷ 2', 3.5],
    ['(0 − 2) ^ 3', -8],
    ['2 ^ (0 − 1)', 0.5],
    ['2 ^ (3 + 1)', 16],
    ['2 ^ (1 + 1) × 3', 12],
    ['3 × 2 ^ (1 + 2)', 24],
    ['2 ^ (1 + 1) ^ 2', 16],
    ['(1 + 2) ^ (4 − 2)', 9],
    ['2 ^ √(9 + 7)', 16],
    ['1000 ^ 4', 1e12],
  ])('%s = %s', (src, expected) => {
    expect(valueOf(src)).toBeCloseTo(expected, 12);
  });

  it('keeps full precision', () => {
    expect(valueOf('1 ÷ 3')).toBe(1 / 3);
    expect(valueOf('√2')).toBe(Math.SQRT2);
  });
});

describe('evaluate: math errors highlight where they happened', () => {
  it('division by zero', () => {
    expect(errorOf('5 ÷ (3 − 3)')).toMatchObject({ code: 'divByZero', tileId: 1, tileIds: [0, 1, 2, 3, 4, 5, 6] });
  });

  it('0 to a negative power counts as division by zero', () => {
    expect(errorOf('0 ^ (1 − 2)')).toMatchObject({ code: 'divByZero', tileId: 1 });
  });

  it('√ of a negative', () => {
    expect(errorOf('1 + √(2 − 5)')).toMatchObject({ code: 'sqrtNegative', tileId: 2, tileIds: [2, 3, 4, 5, 6, 7] });
  });

  it('√ slot of a negative cannot happen (slot holds one positive tile), but √ of a negative group can', () => {
    expect(errorOf('√(1 − 2)').code).toBe('sqrtNegative');
  });

  it('∛ of a negative is fine', () => {
    expect(valueOf('∛(1 − 9)')).toBe(-2);
  });

  it('log of zero', () => {
    expect(errorOf('log₂(3 − 3)')).toMatchObject({ code: 'logNonPositive', tileId: 0 });
  });

  it('log of a negative', () => {
    expect(errorOf('log₁₀(3 − 5)')).toMatchObject({ code: 'logNonPositive', tileId: 0 });
  });

  it('final value too big', () => {
    expect(errorOf('1000 ^ 4 + 1')).toMatchObject({ code: 'tooBig', tileId: 3 });
  });

  it('intermediate value too big, even if the final value would be small', () => {
    expect(errorOf('1000 ^ 5 ÷ 1000 ^ 5')).toMatchObject({ code: 'tooBig', tileId: 1 });
  });

  it('negative too big', () => {
    expect(errorOf('1 − 1000 ^ 5').code).toBe('tooBig');
  });

  it('overflow to Infinity is reported as too big', () => {
    expect(errorOf('10 ^ 400').code).toBe('tooBig');
  });

  it('negative base with a fractional exponent', () => {
    expect(errorOf('(0 − 8) ^ (1 ÷ 3)')).toMatchObject({ code: 'negativeFractionalPower', tileId: 5 });
  });

  it('non-finite (NaN) results', async () => {
    // No v1 tile combination produces NaN past the checks above, so test the guard directly.
    const { evaluate } = await import('../src/engine/evaluate.js');
    const ast = { type: 'bin', op: '−', tileId: 1, tileIds: [0, 1, 2],
      left: { type: 'num', value: NaN, tileIds: [0] }, right: { type: 'num', value: 1, tileIds: [2] } };
    expect(evaluate(ast).error).toMatchObject({ code: 'nonFinite', tileId: 1 });
  });

  it('every error has a message', () => {
    for (const src of ['1 ÷ 0', '√(0 − 1)', 'log₂(0 − 1)', '1000 ^ 5', '(0 − 1) ^ (1 ÷ 2)']) {
      expect(errorOf(src).message).toBeTruthy();
    }
  });

  it('returns the steps done before the error', () => {
    const r = runString('2 × 3 + 1 ÷ 0');
    expect(r.steps.map((s) => s.text)).toEqual(['2 × 3 = 6']);
  });
});

describe('evaluate: steps', () => {
  const stepsOf = (src) => runString(src).steps.map((s) => [s.text, s.expr]);

  it('one operation per line, reprinting the expression', () => {
    expect(stepsOf('(1 + 3) × 4 × 6 × 8')).toEqual([
      ['1 + 3 = 4', '4 × 4 × 6 × 8'],
      ['4 × 4 = 16', '16 × 6 × 8'],
      ['16 × 6 = 96', '96 × 8'],
      ['96 × 8 = 768', '768'],
    ]);
  });

  it('works left to right in human order', () => {
    expect(stepsOf('1 × 2 + 3 × 4')).toEqual([
      ['1 × 2 = 2', '2 + 3 × 4'],
      ['3 × 4 = 12', '2 + 12'],
      ['2 + 12 = 14', '14'],
    ]);
  });

  it('right-associative powers go right to left', () => {
    expect(stepsOf('2 ^ 3 ^ 2')).toEqual([
      ['3 ^ 2 = 9', '2 ^ 9'],
      ['2 ^ 9 = 512', '512'],
    ]);
  });

  it('keeps parentheses until their contents are one number', () => {
    expect(stepsOf('(1 + 2 × 3) × 2')).toEqual([
      ['2 × 3 = 6', '(1 + 6) × 2'],
      ['1 + 6 = 7', '7 × 2'],
      ['7 × 2 = 14', '14'],
    ]);
  });

  it('shows functions and slots', () => {
    expect(stepsOf('√9 ^ 2 + log₂[8]')).toEqual([
      ['√9 = 3', '3 ^ 2 + log₂(8)'],
      ['3 ^ 2 = 9', '9 + log₂(8)'],
      ['log₂(8) = 3', '9 + 3'],
      ['9 + 3 = 12', '12'],
    ]);
    expect(stepsOf('log₁₀ 1000 + √(9 + 7)')).toEqual([
      ['log₁₀ 1000 = 3', '3 + √(9 + 7)'],
      ['9 + 7 = 16', '3 + √16'],
      ['√16 = 4', '3 + 4'],
      ['3 + 4 = 7', '7'],
    ]);
  });

  it('wraps negative operands in parentheses', () => {
    expect(stepsOf('(3 − 10) × 2')).toEqual([
      ['3 − 10 = -7', '(-7) × 2'],
      ['(-7) × 2 = -14', '-14'],
    ]);
  });

  it('a single number has no steps', () => {
    expect(runString('(7)').steps).toEqual([]);
  });

  it('each step records the tiles of its sub-expression', () => {
    const [first] = runString('(1 + 3) × 4').steps;
    expect(first).toMatchObject({ value: 4, tileId: 2, tileIds: [1, 2, 3] });
  });

  it('can skip steps for speed', () => {
    expect(runString('2 + 3', { steps: false })).toEqual({ ok: true, value: 5, steps: null });
  });
});

describe('run', () => {
  it('returns validation errors instead of evaluating', () => {
    const r = runString('1 + + 2');
    expect(r.ok).toBe(false);
    expect(r.errors[0].code).toBe('doubleOperator');
  });

  it('checks unused tiles against the puzzle', () => {
    const puzzleTiles = [{}, {}, {}, {}];
    const r = run(tilesFromString('1 + 2'), { puzzleTiles });
    expect(r.errors).toEqual([expect.objectContaining({ code: 'unusedTiles', tileIds: [3] })]);
  });

  it('a math error is not a validation error', () => {
    const r = runString('1 ÷ 0');
    expect(r).toMatchObject({ ok: false, error: { code: 'divByZero' } });
    expect(r.errors).toBeUndefined();
  });
});

describe('formatNumber', () => {
  it.each([
    [24, '24'],
    [3.5, '3.50'],
    [Math.SQRT2, '1.41'],
    [2.9999999999, '3'],
    [-7, '-7'],
    [0, '0'],
    [0.0012345, '0.0012'],
    [-0.0012345, '-0.0012'],
    [1e12, '1000000000000'],
  ])('%s → %s', (v, expected) => {
    expect(formatNumber(v)).toBe(expected);
  });
});
