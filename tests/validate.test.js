import { describe, expect, it } from 'vitest';
import { tokenize, tilesFromString } from '../src/engine/tokenizer.js';
import { validate } from '../src/engine/validate.js';

const errorsOf = (src, options) => validate(tokenize(tilesFromString(src)), options);
const codesOf = (src, options) => errorsOf(src, options).map((e) => e.code);

describe('validate: well-formed', () => {
  it.each([
    '7',
    '(1 + 3) × 4 × 6 × 8',
    '2 ^ 3 ^ 2',
    '√9 ^ 2',
    '√√16',
    '√ log₂ 256',
    '√(9 + 7)',
    '√[9] + log₂[8]',
    '((2))',
    '(1 + 2) × (3 + 4)',
  ])('%s', (src) => {
    expect(errorsOf(src)).toEqual([]);
  });
});

describe('validate: errors point at the right tiles', () => {
  it('unused tiles remain', () => {
    const errors = errorsOf('1 + 2', { expectedTileIds: [0, 1, 2, 3, 4] });
    expect(errors).toEqual([expect.objectContaining({ code: 'unusedTiles', tileIds: [3, 4] })]);
    expect(errors[0].message).toMatch(/2 tiles still unused/);
  });

  it('counts tiles inside slots as used', () => {
    expect(errorsOf('√[9] + 1', { expectedTileIds: [0, 1, 2, 3] })).toEqual([]);
  });

  it('empty arrangement', () => {
    expect(codesOf('')).toEqual(['empty']);
  });

  it('unclosed parenthesis', () => {
    expect(errorsOf('(1 + 2')).toEqual([expect.objectContaining({ code: 'unclosedParen', tileIds: [0] })]);
  });

  it('unmatched closing parenthesis', () => {
    expect(errorsOf('1 + 2)')).toEqual([expect.objectContaining({ code: 'unmatchedClose', tileIds: [3] })]);
  });

  it('misordered parentheses: ) before (', () => {
    // ") 1 + 2 (" — the ")" has no partner, the "(" is never closed
    expect(codesOf(') 1 + 2 (')).toEqual(['unmatchedClose', 'missingOperator', 'missingOperator', 'unclosedParen']);
  });

  it('empty parentheses', () => {
    expect(errorsOf('1 + ()')).toContainEqual(expect.objectContaining({ code: 'emptyParens', tileIds: [2, 3] }));
  });

  it('two operators in a row', () => {
    expect(errorsOf('1 + × 2')).toEqual([expect.objectContaining({ code: 'doubleOperator', tileIds: [1, 2] })]);
  });

  it('operator at the start', () => {
    expect(errorsOf('− 1 + 2')).toEqual([expect.objectContaining({ code: 'operatorAtStart', tileIds: [0] })]);
  });

  it('operator at the end', () => {
    expect(errorsOf('1 + 2 ×')).toEqual([expect.objectContaining({ code: 'operatorAtEnd', tileIds: [3] })]);
  });

  it('operator right after "("', () => {
    expect(errorsOf('(+ 1)')).toEqual([expect.objectContaining({ code: 'operatorAfterOpen', tileIds: [1] })]);
  });

  it('operator right before ")"', () => {
    expect(errorsOf('(1 +)')).toEqual([expect.objectContaining({ code: 'operatorBeforeClose', tileIds: [2] })]);
  });

  it('two numbers with no operator', () => {
    expect(errorsOf('7 12')).toEqual([expect.objectContaining({ code: 'missingOperator', tileIds: [0, 1] })]);
  });

  it(') ( with no operator', () => {
    expect(errorsOf('(1) (2)')).toEqual([expect.objectContaining({ code: 'missingOperator', tileIds: [2, 3] })]);
  });

  it('number then function with no operator', () => {
    expect(codesOf('2 √9')).toEqual(['missingOperator']);
  });

  it('number then slot with no operator', () => {
    expect(codesOf('2 √[9]')).toEqual(['missingOperator']);
  });

  it('function at the end', () => {
    expect(errorsOf('2 + √')).toEqual([expect.objectContaining({ code: 'fnMissingOperand', tileIds: [2] })]);
  });

  it('function followed by an operator', () => {
    expect(errorsOf('√ + 2')).toEqual([expect.objectContaining({ code: 'fnMissingOperand', tileIds: [0] })]);
  });

  it('function followed by ")"', () => {
    expect(errorsOf('(2 × log₂)')).toEqual([expect.objectContaining({ code: 'fnMissingOperand', tileIds: [3] })]);
  });

  it('empty slot', () => {
    expect(errorsOf('√[] + 1')).toContainEqual(expect.objectContaining({ code: 'slotContents', tileIds: [0] }));
  });

  it('slot with more than one tile', () => {
    expect(errorsOf('√[1 + 2]')).toEqual([expect.objectContaining({ code: 'slotContents', tileIds: [0, 1, 2, 3] })]);
  });

  it('slot holding a non-number tile', () => {
    expect(codesOf('√[(]')).toEqual(['slotContents']);
  });

  it('every error has a message', () => {
    for (const e of errorsOf('+ ( ) √')) expect(e.message).toBeTruthy();
  });
});
