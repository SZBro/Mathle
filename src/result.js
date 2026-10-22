// Between Play and Reveal: submitting an arrangement, and rebuilding a saved day.
// No DOM here, so it's tested directly.

import { run, score, tilesToString, tilesFromString } from './engine/index.js';

// Runs a submitted arrangement.
//   { ok: false, error }   math error; nothing is saved and the shot isn't used
//   { ok: false, errors }  structural problems (Submit should have been disabled)
//   { ok: true, entry, result }
// entry is what gets saved; result is what Reveal shows. The entry keeps a copy of the
// puzzle, so Reveal never depends on regenerating it.
export function submit(puzzle, arrangement) {
  const res = run(arrangement, { puzzleTiles: puzzle.tiles });
  if (!res.ok) return res;
  const scored = score(puzzle, res.value);
  const entry = { puzzleId: puzzle.id, expr: tilesToString(arrangement), value: res.value, score: scored.score, puzzle };
  return { ok: true, entry, result: { expr: entry.expr, tiles: arrangement, value: res.value, steps: res.steps, ...scored } };
}

// The puzzle a saved day was played with: its own copy if it has a usable one, else
// (days saved before puzzles were generated) the hand-made puzzle with its id.
export function savedPuzzle(entry, handMade) {
  const p = entry.puzzle;
  const usable = p && typeof p === 'object' && Array.isArray(p.tiles) && p.goal
    && typeof p.best?.value === 'number' && typeof p.naive?.value === 'number';
  if (usable) return p;
  return handMade.find((h) => h.id === entry.puzzleId) ?? null;
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
