// node tools/solve.js [--id N] [--write] [--iterations N] [--seed N] [--exhaustive-max N]
//
// Solves each puzzle and prints what it found next to the stored best. With --write it
// updates src/puzzles.json: `best` is replaced only when the solver beats it (or it is
// missing), and `naive` is filled in only when missing. Review the diff before committing.

import { quality } from '../src/engine/score.js';
import { formatNumber } from '../src/engine/format.js';
import { loadPuzzles, savePuzzles } from './puzzles.js';
import { DEFAULT_EXHAUSTIVE_MAX, randomNaive, solve } from './solver.js';

const args = parseArgs(process.argv.slice(2));
const puzzles = loadPuzzles();
const targets = args.id ? puzzles.filter((p) => p.id === Number(args.id)) : puzzles;
if (!targets.length) {
  console.error(`No puzzle with id ${args.id}`);
  process.exit(1);
}

let changed = 0;
for (const p of targets) {
  const started = Date.now();
  const found = solve(p, {
    exhaustiveMax: Number(args['exhaustive-max'] ?? DEFAULT_EXHAUSTIVE_MAX),
    iterations: Number(args.iterations ?? 2_000_000),
    seed: Number(args.seed ?? p.id),
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const method = found.proven ? 'exhaustive' : 'best known';
  const goal = p.goal.type + (p.goal.type === 'closest' ? ` ${p.goal.target}` : '');

  let note = '';
  if (found.expr === null) {
    note = 'NO VALID ANSWER FOUND';
  } else if (!p.best) {
    note = 'new';
  } else {
    const d = quality(p.goal, found.value) - quality(p.goal, p.best.value);
    const tol = 1e-9 * Math.max(1, Math.abs(p.best.value));
    note = d > tol ? `beats stored ${formatNumber(p.best.value)}` : d < -tol ? `worse than stored ${formatNumber(p.best.value)}` : 'same as stored';
  }
  console.log(`#${p.id} ${p.difficulty} ${goal} (${p.tiles.length} tiles, ${method}, ${found.evaluated} tried, ${secs}s)`);
  console.log(`   ${found.expr} = ${found.value === null ? '—' : formatNumber(found.value)}   [${note}]`);

  if (args.write && found.expr !== null && (note === 'new' || note.startsWith('beats'))) {
    p.best = { expr: found.expr, value: found.value, proven: found.proven };
    changed++;
  }
  if (args.write && !p.naive) {
    const naive = randomNaive(p, { seed: p.id });
    if (naive) {
      p.naive = naive;
      changed++;
      console.log(`   naive: ${naive.expr} = ${formatNumber(naive.value)}`);
    }
  }
}

if (args.write) {
  if (changed) savePuzzles(puzzles);
  console.log(`\n${changed} field(s) updated in src/puzzles.json. Review with git diff, then run npm run check-puzzles.`);
}

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    const m = /^--([\w-]+)$/.exec(list[i]);
    if (!m) continue;
    const next = list[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[m[1]] = next;
      i++;
    } else {
      out[m[1]] = true;
    }
  }
  return out;
}
