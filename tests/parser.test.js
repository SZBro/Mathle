import { describe, expect, it } from 'vitest';
import { tokenize, tilesFromString } from '../src/engine/tokenizer.js';
import { parse } from '../src/engine/parser.js';

const parseStr = (src) => parse(tokenize(tilesFromString(src)));

// Compact S-expression view of the tree, for readable assertions.
function show(node) {
  switch (node.type) {
    case 'num': return String(node.value);
    case 'bin': return `(${node.op} ${show(node.left)} ${show(node.right)})`;
    case 'fn': return `(${node.fn}${node.slot ? '[]' : ''} ${show(node.arg)})`;
    case 'group': return `{${show(node.expr)}}`;
  }
}

describe('parse: precedence and associativity', () => {
  it.each([
    ['1 + 2 × 3', '(+ 1 (× 2 3))'],
    ['1 × 2 + 3', '(+ (× 1 2) 3)'],
    ['8 − 3 − 2', '(− (− 8 3) 2)'],
    ['8 ÷ 4 ÷ 2', '(÷ (÷ 8 4) 2)'],
    ['8 ÷ 4 × 2', '(× (÷ 8 4) 2)'],
    ['2 ^ 3 ^ 2', '(^ 2 (^ 3 2))'],
    ['2 × 3 ^ 2', '(× 2 (^ 3 2))'],
    ['(1 + 2) × 3', '(× {(+ 1 2)} 3)'],
    ['√9 ^ 2', '(^ (√ 9) 2)'],
    ['2 ^ √9', '(^ 2 (√ 9))'],
    ['√(9 + 7)', '(√ {(+ 9 7)})'],
    ['√9 + 7', '(+ (√ 9) 7)'],
    ['√√16', '(√ (√ 16))'],
    ['log₂ 8 × 2', '(× (log₂ 8) 2)'],
    ['√[9] ^ 2', '(^ (√[] 9) 2)'],
    ['√ log₂[256]', '(√ (log₂[] 256))'],
    ['((2))', '{{2}}'],
  ])('%s → %s', (src, expected) => {
    expect(show(parseStr(src))).toBe(expected);
  });
});

describe('parse: tile ids', () => {
  it('records the operator tile and all covered tiles', () => {
    const ast = parseStr('(1 + 2) × 3');
    expect(ast.tileId).toBe(5);
    expect(ast.tileIds).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(ast.left.tileIds).toEqual([0, 1, 2, 3, 4]);
    expect(ast.left.expr.tileId).toBe(2);
  });

  it('records function and slot tiles', () => {
    const fn = parseStr('√9');
    expect(fn).toMatchObject({ tileId: 0, tileIds: [0, 1] });
    const slot = parseStr('√[9]');
    expect(slot).toMatchObject({ tileId: 0, tileIds: [0, 1], slot: true });
  });
});

describe('parse: rejects malformed input (validate first)', () => {
  it.each(['', '1 +', '(1', '1 2', '1)', '√', '√[]'])('%j', (src) => {
    expect(() => parseStr(src)).toThrow(SyntaxError);
  });
});
