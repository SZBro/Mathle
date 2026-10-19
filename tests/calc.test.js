import { describe, expect, it } from 'vitest';
import { calc } from '../tools/calc.js';

describe('calc', () => {
  it('prints each step and the result, accepting ASCII aliases', () => {
    expect(calc('2 + 3 * 4')).toEqual({
      ok: true,
      lines: [
        '2 + 3 × 4',
        '  3 × 4 = 12    → 2 + 12',
        '  2 + 12 = 14   → 14',
        '',
        'Result: 14',
      ],
    });
  });

  it('accepts every alias', () => {
    const { ok, lines } = calc('sqrt 16 - cbrt 8 / log2 4 * log10 100');
    expect(ok).toBe(true);
    expect(lines[0]).toBe('√16 − ∛8 ÷ log₂ 4 × log₁₀ 100');
    expect(lines.at(-1)).toBe('Result: 2');
  });

  it('shows full precision when the display is rounded', () => {
    expect(calc('1 / 3').lines.at(-1)).toBe('Result: 0.33   (0.3333333333333333)');
  });

  it('marks the tile that caused a math error and its sub-expression', () => {
    const { ok, lines } = calc('1 / (2 - 2) + 5');
    expect(ok).toBe(false);
    expect(lines.slice(-3)).toEqual([
      'Math error: Division by zero.',
      '  1 ÷ ( 2 − 2 ) + 5',
      '  ~~^~~~~~~~~~~',
    ]);
  });

  it('marks the tiles in a validation error', () => {
    const { ok, lines } = calc('2 + * 3');
    expect(ok).toBe(false);
    expect(lines.slice(-3)).toEqual([
      'Not well-formed: Two operators in a row.',
      '  2 + × 3',
      '    ^ ^',
    ]);
  });

  it('marks a bad slot including its brackets', () => {
    const { lines } = calc('sqrt[1 + 2]');
    expect(lines.slice(-2)).toEqual(['  √[ 1 + 2 ]', '  ^^ ^ ^ ^ ^']);
  });

  it('reports text it cannot read', () => {
    expect(calc('2 % 3')).toEqual({ ok: false, lines: ['Can\'t read that: Unexpected "%" at position 2 in "2 % 3"'] });
  });
});
