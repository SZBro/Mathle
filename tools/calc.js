// npm run calc -- "2 + 3 * 4"
//
// Evaluates one expression with the game's engine and prints each step and the result,
// or the error with a marker under the tile that caused it. Accepts the ASCII aliases
// * / - sqrt cbrt log2 log10, and √[9] for a slot tile. Quote the expression so the
// shell doesn't expand "*".

import { pathToFileURL } from 'node:url';
import { formatNumber, runString, tilesFromString, tilesToString } from '../src/engine/index.js';

// Returns { lines, ok } so it can be tested without a process.
export function calc(src) {
  let tiles;
  try {
    tiles = tilesFromString(src);
  } catch (e) {
    return { ok: false, lines: [`Can't read that: ${e.message}`] };
  }

  const lines = [tilesToString(tiles)];
  const r = runString(src);

  if (r.errors) {
    for (const e of r.errors) {
      lines.push('', `Not well-formed: ${e.message}`, ...marker(tiles, e.tileIds));
    }
    return { ok: false, lines };
  }

  const width = Math.max(0, ...r.steps.map((s) => s.text.length));
  for (const s of r.steps) lines.push(`  ${s.text.padEnd(width)}   → ${s.expr}`);

  if (!r.ok) {
    lines.push('', `Math error: ${r.error.message}`, ...marker(tiles, r.error.tileIds, r.error.tileId));
    return { ok: false, lines };
  }

  const shown = formatNumber(r.value);
  const full = String(r.value);
  lines.push('', `Result: ${shown}${full !== shown ? `   (${full})` : ''}`);
  return { ok: true, lines };
}

// The expression with one tile per segment, and a line underneath:
// "^" under the culprit tile, "~" under the rest of the sub-expression.
function marker(tiles, tileIds, culprit) {
  const segments = toSegments(tiles);
  const ids = new Set(tileIds);
  let top = '';
  let bottom = '';
  segments.forEach(({ text, id }, i) => {
    const gap = i ? ' ' : '';
    const mark = id === culprit || (culprit === undefined && ids.has(id)) ? '^' : ids.has(id) ? '~' : ' ';
    const prevMarked = culprit !== undefined && i && ids.has(segments[i - 1].id) && ids.has(id);
    top += gap + text;
    bottom += (gap && prevMarked ? '~' : gap) + mark.repeat(text.length);
  });
  return [`  ${top}`, `  ${bottom.trimEnd()}`];
}

function toSegments(tiles) {
  return tiles.flatMap((t) => t.kind === 'fnslot'
    ? [{ text: `${t.value}[`, id: t.id }, ...toSegments(t.inner), { text: ']', id: t.id }]
    : [{ text: tilesToString([t]), id: t.id }]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const src = process.argv.slice(2).join(' ').trim();
  if (!src) {
    console.log('Usage: npm run calc -- "2 + 3 * 4"');
    console.log('Aliases: * / - sqrt cbrt log2 log10, and sqrt[9] for a slot tile.');
    process.exit(1);
  }
  const { ok, lines } = calc(src);
  console.log(lines.join('\n'));
  process.exit(ok ? 0 : 1);
}
