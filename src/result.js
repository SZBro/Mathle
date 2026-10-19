// Between Play and Reveal: submitting an arrangement, and rebuilding a saved day.
// No DOM here, so it's tested directly.

import { run, score, tilesToString, tilesFromString } from './engine/index.js';

// Runs a submitted arrangement.
//   { ok: false, error }   math error; nothing is saved and the shot isn't used
//   { ok: false, errors }  structural problems (Submit should have been disabled)
//   { ok: true, entry, result }
// entry is what gets saved; result is what Reveal shows.
export function submit(puzzle, arrangement) {
  const res = run(arrangement, { puzzleTiles: puzzle.tiles });
  if (!res.ok) return res;
  const scored = score(puzzle, res.value);
  const entry = { puzzleId: puzzle.id, expr: tilesToString(arrangement), value: res.value, score: scored.score };
  return { ok: true, entry, result: { expr: entry.expr, tiles: arrangement, value: res.value, steps: res.steps, ...scored } };
}

// Rebuilds the Reveal data from a saved entry by running its expression again.
// The saved value and score are what the player got, so they win over a re-score
// (the puzzle's best may have been improved since). If the expression no longer
// runs, Reveal still shows the saved value, just without steps.
export function replay(puzzle, entry) {
  let tiles = [];
  let steps = [];
  try {
    const parsed = tilesFromString(entry.expr);
    const res = run(parsed);
    if (res.ok) {
      tiles = parsed;
      steps = res.steps;
    }
  } catch {
    // Unreadable expression: show the saved value only.
  }
  const rescored = score(puzzle, entry.value);
  const s = typeof entry.score === 'number' ? entry.score : rescored.score;
  return {
    expr: entry.expr,
    tiles,
    value: entry.value,
    steps,
    score: s,
    percent: s === 1 ? 100 : Math.floor(s * 100),
    beatBest: rescored.beatBest,
    matchedBest: rescored.matchedBest,
  };
}
