import { describe, expect, it } from 'vitest';
import { tokenize, tilesFromString } from '../src/engine/tokenizer.js';

describe('tokenize', () => {
  it('maps each tile to a token that keeps its tile id', () => {
    const tokens = tokenize([
      { id: 3, kind: 'lparen' },
      { id: 0, kind: 'num', value: 25 },
      { id: 5, kind: 'op', value: '×' },
      { id: 1, kind: 'fn', value: 'log₂' },
      { id: 2, kind: 'num', value: 8 },
      { id: 4, kind: 'rparen' },
    ]);
    expect(tokens).toEqual([
      { tileId: 3, type: 'lparen' },
      { tileId: 0, type: 'num', value: 25 },
      { tileId: 5, type: 'op', value: '×' },
      { tileId: 1, type: 'fn', value: 'log₂' },
      { tileId: 2, type: 'num', value: 8 },
      { tileId: 4, type: 'rparen' },
    ]);
  });

  it('tokenizes slot contents', () => {
    const [tok] = tokenize([{ id: 7, kind: 'fnslot', value: '√', inner: [{ id: 2, kind: 'num', value: 9 }] }]);
    expect(tok).toEqual({ tileId: 7, type: 'slot', value: '√', inner: [{ tileId: 2, type: 'num', value: 9 }] });
  });

  it('treats an empty slot as having no inner tokens', () => {
    const [tok] = tokenize([{ id: 0, kind: 'fnslot', value: 'log₂' }]);
    expect(tok.inner).toEqual([]);
  });

  it('normalizes ASCII operators and function names', () => {
    const tokens = tokenize([
      { id: 0, kind: 'op', value: '-' },
      { id: 1, kind: 'op', value: '*' },
      { id: 2, kind: 'op', value: '/' },
      { id: 3, kind: 'fn', value: 'sqrt' },
    ]);
    expect(tokens.map((t) => t.value)).toEqual(['−', '×', '÷', '√']);
  });

  it('rejects unknown tiles', () => {
    expect(() => tokenize([{ id: 0, kind: 'blob' }])).toThrow(/Unknown tile kind/);
    expect(() => tokenize([{ id: 0, kind: 'op', value: '%' }])).toThrow(/Unknown operator/);
    expect(() => tokenize([{ id: 0, kind: 'fn', value: 'sin' }])).toThrow(/Unknown function/);
  });
});

describe('tilesFromString', () => {
  it('reads numbers, operators and parentheses with ids in reading order', () => {
    expect(tilesFromString('(1 + 30) × 640')).toEqual([
      { id: 0, kind: 'lparen' },
      { id: 1, kind: 'num', value: 1 },
      { id: 2, kind: 'op', value: '+' },
      { id: 3, kind: 'num', value: 30 },
      { id: 4, kind: 'rparen' },
      { id: 5, kind: 'op', value: '×' },
      { id: 6, kind: 'num', value: 640 },
    ]);
  });

  it('reads decimals and needs no spaces', () => {
    expect(tilesFromString('2.5*4').map((t) => t.value)).toEqual([2.5, '×', 4]);
  });

  it('reads function tiles and slot tiles', () => {
    expect(tilesFromString('√9 log₁₀ 1000 log2(8) ∛[27]')).toEqual([
      { id: 0, kind: 'fn', value: '√' },
      { id: 1, kind: 'num', value: 9 },
      { id: 2, kind: 'fn', value: 'log₁₀' },
      { id: 3, kind: 'num', value: 1000 },
      { id: 4, kind: 'fn', value: 'log₂' },
      { id: 5, kind: 'lparen' },
      { id: 6, kind: 'num', value: 8 },
      { id: 7, kind: 'rparen' },
      { id: 8, kind: 'fnslot', value: '∛', inner: [{ id: 9, kind: 'num', value: 27 }] },
    ]);
  });

  it('prefers log10 over log1 + 0 style partial matches', () => {
    expect(tilesFromString('log10 100')[0]).toEqual({ id: 0, kind: 'fn', value: 'log₁₀' });
  });

  it('can build bad slots for validation tests', () => {
    expect(tilesFromString('√[]')[0].inner).toEqual([]);
    expect(tilesFromString('√[1 + 2]')[0].inner).toHaveLength(3);
  });

  it('rejects unknown characters and unclosed slots', () => {
    expect(() => tilesFromString('2 % 3')).toThrow(/Unexpected "%"/);
    expect(() => tilesFromString('√[9')).toThrow(/Missing "]"/);
  });
});
