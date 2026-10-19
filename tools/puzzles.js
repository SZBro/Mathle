// Reading and writing src/puzzles.json, plus tile helpers shared by the checker and solver.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonicalFn, canonicalOp } from '../src/engine/tiles.js';

export const PUZZLES_PATH = fileURLToPath(new URL('../src/puzzles.json', import.meta.url));

export function loadPuzzles(path = PUZZLES_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function savePuzzles(puzzles, path = PUZZLES_PATH) {
  writeFileSync(path, formatPuzzles(puzzles));
}

// Identical tiles share a key: "num:7", "op:×", "lparen", "fn:√", "fnslot:log₂".
export function tileKey(tile) {
  switch (tile.kind) {
    case 'num': return `num:${tile.value}`;
    case 'op': return `op:${canonicalOp(tile.value)}`;
    case 'fn':
    case 'fnslot': return `${tile.kind}:${canonicalFn(tile.value)}`;
    default: return tile.kind;
  }
}

// An arrangement with slot contents pulled out, in reading order.
export function flattenTiles(arrangement) {
  return arrangement.flatMap((t) =>
    t.kind === 'fnslot' ? [{ ...t, inner: undefined }, ...flattenTiles(t.inner ?? [])] : [t]);
}

// The solver's flat form: a slot tile is always followed by the number it holds.
export function toArrangement(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i++) {
    const t = flat[i];
    if (t.kind === 'fnslot') {
      out.push({ ...t, inner: i + 1 < flat.length ? [flat[++i]] : [] });
    } else {
      out.push(t);
    }
  }
  return out;
}

// Puzzle tiles with ids (their index), as the game will place them.
export function puzzleTilesWithIds(puzzle) {
  return puzzle.tiles.map((t, i) => ({ ...t, id: i }));
}

// Pretty-prints with one top-level field per line and tiles four to a line, so the
// file stays readable and diffs stay small.
export function formatPuzzles(puzzles) {
  const body = puzzles.map((p) => {
    const fields = Object.entries(p).map(([k, v]) => {
      if (k === 'tiles') {
        const rows = [];
        for (let i = 0; i < v.length; i += 4) rows.push(v.slice(i, i + 4).map(inline).join(', '));
        return `    "tiles": [\n      ${rows.join(',\n      ')}\n    ]`;
      }
      return `    ${JSON.stringify(k)}: ${inline(v)}`;
    });
    return `  {\n${fields.join(',\n')}\n  }`;
  });
  return `[\n${body.join(',\n')}\n]\n`;
}

function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v && typeof v === 'object') {
    return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }`;
  }
  return JSON.stringify(v);
}
