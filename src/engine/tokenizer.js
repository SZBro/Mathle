// Tiles -> tokens.
//
// An arrangement is the ordered list of tiles the player placed. Every tile has an `id`
// (its index in the puzzle's `tiles` array). A slot tile holds the tiles dropped into it:
//   { id: 4, kind: 'fnslot', value: '√', inner: [{ id: 2, kind: 'num', value: 9 }] }
//
// Each token keeps the id of the tile it came from so errors and steps can point back
// at tiles.

import { canonicalOp, canonicalFn, FN_ALIASES, FNS, isLog, OP_ALIASES, OPS } from './tiles.js';

export function tokenize(arrangement) {
  return arrangement.map(tileToToken);
}

function tileToToken(tile) {
  const base = { tileId: tile.id };
  switch (tile.kind) {
    case 'num':
      return { ...base, type: 'num', value: tile.value };
    case 'op':
      return { ...base, type: 'op', value: canonicalOp(tile.value) };
    case 'lparen':
      return { ...base, type: 'lparen' };
    case 'rparen':
      return { ...base, type: 'rparen' };
    case 'fn':
      return { ...base, type: 'fn', value: canonicalFn(tile.value) };
    case 'fnslot':
      return {
        ...base,
        type: 'slot',
        value: canonicalFn(tile.value),
        inner: (tile.inner ?? []).map(tileToToken),
      };
    default:
      throw new Error(`Unknown tile kind: ${tile.kind}`);
  }
}

// Reads an expression string into an arrangement of tiles with ids 0, 1, 2, ...
// in reading order. Used by tests, the solver, and to check puzzle-file answers.
//   "(1 + 3) × 4"  "2 ^ 3 ^ 2"  "√9 ^ 2"  "log2(8)"  "√[9]" (slot holding 9)
export function tilesFromString(src) {
  const fnNames = [...Object.keys(FNS), ...Object.keys(FN_ALIASES)]
    .sort((a, b) => b.length - a.length);
  const opChars = new Set([...Object.keys(OPS), ...Object.keys(OP_ALIASES)]);
  let i = 0;
  let nextId = 0;

  const skipSpace = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };

  function readList(stop) {
    const out = [];
    for (;;) {
      skipSpace();
      if (i >= src.length) {
        if (stop) throw new SyntaxError(`Missing "${stop}" in "${src}"`);
        return out;
      }
      if (src[i] === stop) {
        i++;
        return out;
      }
      out.push(readTile());
    }
  }

  function readTile() {
    const ch = src[i];
    const num = /^(\d+(\.\d+)?|\.\d+)/.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      return { id: nextId++, kind: 'num', value: Number(num[0]) };
    }
    if (ch === '(') {
      i++;
      return { id: nextId++, kind: 'lparen' };
    }
    if (ch === ')') {
      i++;
      return { id: nextId++, kind: 'rparen' };
    }
    if (opChars.has(ch)) {
      i++;
      return { id: nextId++, kind: 'op', value: canonicalOp(ch) };
    }
    const name = fnNames.find((n) => src.startsWith(n, i));
    if (name) {
      i += name.length;
      const id = nextId++;
      skipSpace();
      if (src[i] === '[') {
        i++;
        return { id, kind: 'fnslot', value: canonicalFn(name), inner: readList(']') };
      }
      return { id, kind: 'fn', value: canonicalFn(name) };
    }
    throw new SyntaxError(`Unexpected "${ch}" at position ${i} in "${src}"`);
  }

  return readList(null);
}

// The inverse of tilesFromString: "(1 + 3) × 4", "√9 ^ 2", "log₂ 8", "√[9]".
export function tilesToString(arrangement) {
  let out = '';
  let prev = null;
  for (const tile of arrangement) {
    const tight = prev && (
      prev.kind === 'lparen' || tile.kind === 'rparen' ||
      (prev.kind === 'fn' && (!isLog(prev.value) || tile.kind === 'lparen'))
    );
    if (prev && !tight) out += ' ';
    out += tileText(tile);
    prev = tile;
  }
  return out;
}

function tileText(tile) {
  switch (tile.kind) {
    case 'num': return String(tile.value);
    case 'op': return canonicalOp(tile.value);
    case 'lparen': return '(';
    case 'rparen': return ')';
    case 'fn': return canonicalFn(tile.value);
    case 'fnslot': return `${canonicalFn(tile.value)}[${tilesToString(tile.inner ?? [])}]`;
    default: throw new Error(`Unknown tile kind: ${tile.kind}`);
  }
}
