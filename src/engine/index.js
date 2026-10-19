// Entry point for the game and tools/solve.js.

import { tokenize, tilesFromString } from './tokenizer.js';
import { validate } from './validate.js';
import { parse } from './parser.js';
import { evaluate } from './evaluate.js';

export { tokenize, tilesFromString, validate, parse, evaluate };
export { formatNumber, printExpr } from './format.js';
export { quality, score } from './score.js';
export { OPS, FNS, MAX_MAGNITUDE } from './tiles.js';

// Structural check for the Submit button. Pass the puzzle's tiles to also check
// that every tile is used (tile ids are indexes into that array).
export function check(arrangement, { puzzleTiles } = {}) {
  const expectedTileIds = puzzleTiles?.map((_, i) => i);
  const errors = validate(tokenize(arrangement), { expectedTileIds });
  return { ok: errors.length === 0, errors };
}

// Validates, parses and evaluates.
//   { ok: true, value, steps }
//   { ok: false, errors }   structural problems (from check)
//   { ok: false, error }    a math error; does not use up the shot
export function run(arrangement, { puzzleTiles, steps = true } = {}) {
  const checked = check(arrangement, { puzzleTiles });
  if (!checked.ok) return checked;
  return evaluate(parse(tokenize(arrangement)), { steps });
}

// Convenience for tests, the solver and puzzle-file checks: run("(1 + 3) × 4").
export function runString(src, options) {
  return run(tilesFromString(src), options);
}
