# Mathle build log

## 2026-10-18 — Step 1: math engine (tokenizer, validator, parser, evaluator)

**Planned.** Build the shared engine the game and the offline solver will both use, with
Vitest tests and no UI. I proposed the file layout and data flow first and got an OK:

```
arrangement ─tokenize─▶ tokens ─validate─▶ errors[]  (no values revealed)
                                   │ ok
                                   ▼
                                 parse ─▶ AST ─evaluate─▶ { value, steps } | { error }
```

**Changed.**
- `package.json` with Vite and Vitest (dev dependencies only), plus `.gitignore`.
- `src/engine/tiles.js`: operator/function tables, ASCII aliases, the 1e12 limit.
- `src/engine/tokenizer.js`: `tokenize(arrangement)` turns tiles into tokens that keep
  their `tileId`. `tilesFromString("(1 + 3) × 4")` reads an expression string into tiles,
  for tests, the solver and checking puzzle-file answers.
- `src/engine/validate.js`: a single left-to-right scan covering every structural rule in
  CLAUDE.md. Each error is `{ code, tileIds, message }`.
- `src/engine/parser.js`: a recursive-descent parser. Nodes carry `tileIds` (the whole
  sub-expression) and `tileId` (the operator or function tile).
- `src/engine/evaluate.js`: children are evaluated first, left to right. Each operation
  is checked for math errors, then recorded as a step, `{ text: "1 + 3 = 4",
  expr: "4 × 4 × 6 × 8", value, tileId, tileIds }`, by replacing the node with its value
  in a cloned tree and printing the whole expression again. `{ steps: false }` skips this
  so the solver runs fast.
- `src/engine/format.js`: number display and expression printing.
- `src/engine/index.js`: `check()`, `run()`, `runString()`.
- Tests (128): tokenizer, validator (every structural error), parser (precedence,
  associativity, tile ids), evaluator (values, every math error, steps, display).

**Broke.** Steps printed `√(16)` and `(7) × 2`: the parentheses were only dropped after
the step's expression had already been printed. I fixed this in the printer, which now
leaves out the parentheses around a group that holds a single number.

**Decided.**
- Slot tiles are written `√[9]` in strings so they can't be confused with `√(9)` (a
  function tile followed by paren tiles).
- Nested functions are allowed: `√√16`, `√ log₂[256]`.
- Display: whole numbers print plainly (`24`), others to 2 decimals (`1.41`). Values that
  would round to 0.00 keep 2 significant figures (`0.0012`), so a tiny positive result in
  a smallestPositive puzzle never shows as `0`.
- Negative values shown as operands are wrapped in parentheses: `(-7) × 2`.
- Extra math errors: `negativeFractionalPower` (e.g. `(0 − 8) ^ (1 ÷ 3)`), and `0 ^ negative`
  is reported as division by zero. An overflow to Infinity is reported as `tooBig`; only
  NaN is `nonFinite`.
- A math error result also returns the steps completed before the error.
- Validation returns every error at once (not just the first) so the UI can highlight
  them all. "Unused tiles" is checked when the puzzle's tiles are passed in.

**Next.** Scorer (`score.js`) with tests, then the puzzle file and the solver.
