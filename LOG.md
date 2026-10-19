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

**Next.** Scorer, then the puzzle file and the solver.

## 2026-10-18 — Step 2: scorer

**Planned.** Add `score.js` using the CLAUDE.md formula, with tests for every goal type.

**Changed.**
- `src/engine/score.js`: `quality(goal, v)` and `score(puzzle, value)`, which returns
  `{ score, percent, beatBest, matchedBest }`. Both are exported from `index.js`.
- `tests/score.test.js` (17 tests): each goal type, clamping at both ends, beating best,
  smallestPositive at ≤ 0, closest from either side of the target, and edge cases.
  The suite now has 145 tests.

**Broke.** Nothing.

**Decided.**
- `score()` doesn't log anything. It returns `beatBest`, and the Reveal screen will log
  the "beat the best known answer" message. That keeps the solver and tests quiet.
- Values within a relative 1e-9 of best count as matching it, so float noise like
  `√2 ^ 2 = 2.0000000000000004` doesn't count as beating best.
- `percent` rounds down (99.6% shows 99), so only a true best shows 100%.
- If best equals naive, matching it scores 100% and anything worse scores 0%.
- The target lives in the goal: `"goal": { "type": "closest", "target": 247 }`.
- Bad puzzle data throws an error: best worse than naive, or a smallestPositive best or
  naive that isn't positive. The puzzle checker will catch these.

**Next.** `src/puzzles.json` and a puzzle checker that confirms each `best`/`naive` value
matches its `expr`, then the solver.

## 2026-10-18 — Step 3: puzzle file, checker and solver

**Planned.** Draft 30 puzzles in `src/puzzles.json`, write a checker that runs every
stored answer through the engine, and write the offline solver from CLAUDE.md.

**Changed.**
- `tilesToString()` in the tokenizer (the inverse of `tilesFromString`), so the solver can
  write answers back to the file.
- `tools/puzzles.js`: load/save `puzzles.json` (one field per line, four tiles per line),
  tile keys, and the solver's "flat" form, where a slot tile is followed by its number.
- `tools/check.js` + `tools/check-puzzles.js` (`npm run check-puzzles`). Errors: bad
  fields, tile count outside 8–25, numbers outside 1–1000, unbalanced paren tiles, wrong
  operator count, an answer that doesn't use exactly the puzzle's tiles, a malformed
  answer or math error, a stored value that doesn't match its expression, and best worse
  than naive. Warnings: best/naive/hint missing.
- `tools/solver.js` + `tools/solve.js` (`npm run solve -- --write`). Exhaustive search
  walks only well-formed arrangements (the grammar is built in, so it never tries
  `7 12` or `+ )`) and never tries two orders of identical tiles. The heuristic search
  uses random restarts plus swap, move and block-move steps, with a seeded random-number
  generator so runs repeat exactly. Both evaluate with the game's own engine.
- `src/puzzles.json`: 30 drafts (10 easy, 10 medium, 10 hard; 8–25 tiles; all four goal
  types), with best and naive filled in by the solver and hints written from the bests.
- `tests/tools.test.js` (26 tests): round-tripping, every checker error, solver
  correctness on known puzzles, repeatability, and a test that the real `puzzles.json`
  passes the checker. The suite now has 171 tests.

**Broke.**
- I miscounted operands: a slot plus its number is one operand, so N number tiles always
  need N − 1 operators. This broke a solver pruning rule and one test puzzle. Fixed, and
  the checker now reports a wrong operator count.
- Draft #20 had one operator too many; the new check caught it.
- First solver run showed several bad drafts: closest targets out of reach (#2, #17, #22),
  smallestPositive puzzles with `÷` that just divide down toward 0 (down to 4.7e-9:
  #14, #19, #24, #29), and largest puzzles stuck at the 1e12 cap where best can't be
  beaten (#21 at exactly 1e12, #26). I redesigned them: new target for #2, a `^` for
  #17/#22, no `÷` in those smallestPositive puzzles, no `^` in #21, and #26 became
  closest 10000.

**Decided.**
- Exhaustive search goes up to **13 tiles** (CLAUDE.md said about 10): 13 tiles takes
  about 4 s. Bigger puzzles use 2M heuristic steps (about 2–3 s each) and are marked
  `"proven": false`, i.e. best known.
- A second pass with another seed and 3× the steps matched every heuristic best except
  #28, where it did worse (the first result was kept). So the heuristic bests look
  stable, but they aren't proven.
- `best` gets a `"proven"` field (true for exhaustive).
- **naive = the median result of 501 random well-formed arrangements**, i.e. what
  placing tiles without a plan gets you. A random placement scores about 0%. (For
  smallestPositive the median is taken over positive results only.)
- `solve --write` replaces `best` only if it finds a better one, and fills `naive` only
  if it's missing.
- Largest puzzles with `^` (#6, #11, #16) end up chasing the 1e12 limit. I left these
  as they are, since "too big" acts as a hazard, but they're worth a look.
- `puzzles.json` is left uncommitted for review (CLAUDE.md: "I review the results before
  committing"). The puzzle tests need it, so commit it after review.

**Next.** UI: Play screen with tile tray, answer row (SortableJS), validation messages.

## 2026-10-18 — Step 4: command-line calculator

**Planned.** `tools/calc.js` around `runString`, for checking expressions by hand:
`npm run calc -- "2 + 3 * 4"`.

**Changed.**
- `tools/calc.js`: prints the expression in tile notation, then one line per step
  (`3 × 4 = 12   → 2 + 12`), then the result, with full precision when the display is
  rounded. On an error it prints the message and the expression one tile per segment,
  with `^` under the tile that caused it and `~` under the rest of the sub-expression.
  Exits 1 on any error. Accepts `* / - sqrt cbrt log2 log10` and `sqrt[9]` for slots;
  these aliases already worked in `tilesFromString`.
- `npm run calc` script; `tests/calc.test.js` (7 tests). The suite now has 178 tests.

**Broke.** Nothing.

**Decided.** For validation errors only the named tiles are marked (`^ ^`); for math
errors the marker runs unbroken under the whole sub-expression. The expression needs
quotes on the command line so the shell doesn't expand `*`.

`src/puzzles.json` is still uncommitted, waiting for review.

## 2026-10-18 — Step 5: puzzle file committed

**Planned.** Commit `src/puzzles.json` after review.

**Changed.** Committed the 30 puzzles: 10 easy, 10 medium, 10 hard. Goals: 13 closest,
6 smallest, 6 smallestPositive, 5 largest. 16 bests are proven by exhaustive search
(all puzzles of 13 tiles or fewer); the other 14 are best known from the heuristic
search. `npm run check-puzzles` reports 0 errors and 0 warnings, and all 178 tests pass.

**Broke.** Nothing.

**Decided.** The file was reviewed and accepted as written. The committed tree now has
everything the puzzle tests need.

## 2026-10-18 — Step 6: Play screen

**Planned.** The Play screen from CLAUDE.md: header, goal card, answer row with SortableJS
snapping plus tap-to-place, inline validation from the engine that highlights the bad
tiles, a notes box, and Submit (it only logs the expression for now; Reveal is next).
I described the layout and style first and got an OK: one column (max 560px), a light
"paper" look with an indigo accent and automatic dark mode, and tiles colour-coded by
kind (numbers neutral, operators blue, parentheses grey, functions purple).

**Changed.**
- Added **SortableJS** (dependency, on the approved list).
- `index.html`: header (Mathle, puzzle #, date, `?` rules dialog) and `#app`.
- `src/main.js`: picks today's puzzle, shuffles the tray, wires notes and Submit.
  Dev overrides: `?date=YYYY-MM-DD` and `?puzzle=<id>`.
- `src/daily.js`: `LAUNCH_DATE = 2026-10-18`, `dateKey`, `daysSinceLaunch` (UTC
  midnights, so DST never shifts it), `puzzleIndex` (wraps), and a seeded shuffle
  (FNV-1a hash + mulberry32).
- `src/storage.js`: `mathle:v1` load/save with every access in try/catch; notes per day.
- `src/ui/tiles.js`: tile elements (`data-id`, `data-kind`); function tiles get a `?`
  badge; slot tiles contain a `.slot-zone`.
- `src/ui/play.js`: the screen. The DOM is the source of truth; after every move the
  answer row is read back into an arrangement and run through `check()`.
- `src/style.css`; `tests/daily.test.js` (7 tests). The suite now has 185 tests.
- `.claude/launch.json` for the dev server (port 5173).

**Broke.** Nothing in the code. The browser tool's one-step drag doesn't trigger
SortableJS's fallback drag, so I checked dragging with stepped pointer events in the
page: reordering, pulling a number out of a slot, and a slot refusing an operator all work.

**Decided.**
- Sortable runs in fallback mode (`forceFallback`) so mouse and touch behave the same.
  On touch a 120 ms hold starts a drag, so a quick swipe still scrolls the page.
- Tap a tray tile to append it to the answer row; a number tapped right after an empty
  slot goes into the slot. Tap a placed tile to send it back to its original tray spot
  (a slot keeps its number). "Clear" returns everything.
- A slot zone accepts only one number tile. A slot can be filled while it's still in
  the tray.
- While tiles remain in the tray, "not finished yet" errors are hidden (operator at the
  end, unclosed `(`, function or empty slot at the end, empty slot) so building left to
  right doesn't flash red. Every other error shows at once, with all its tiles outlined
  in red; newly bad tiles shake once.
- The header number is the day number (days since launch + 1), not the puzzle id, since
  puzzles repeat after 30 days.
- The tray shuffle is seeded by date + puzzle id, so a reload keeps the same order.
- The in-progress arrangement isn't saved across reloads (not in the spec); notes are.

**Next.** Reveal screen: evaluate on submit (math errors don't use up the shot), show
the steps, best answer, score and countdown, and lock the day.

## 2026-10-18 — Step 7: Wordle-style restyle

**Planned.** The indigo "paper" palette felt heavy. Restyle to something closer to
Wordle: lighter, simpler and more playful. CSS and header markup only; no behaviour changes.

**Changed.**
- `src/style.css`: white page; flat tiles with 4px corners in bold Helvetica (no
  monospace, no drop shadows).
  - Numbers are white with a grey border (like a filled Wordle square).
  - Operators are light-grey "keyboard keys"; parentheses are a paler grey.
  - Functions are Wordle yellow with white text.
  - Green is the main accent: the Submit button, the target number and "ready" messages.
  - Difficulty chips are green, yellow or grey for easy, medium or hard.
  - Section labels are small uppercase grey text with letter spacing.
  - The shake is Wordle-style; tapping a tile gives a small pop.
  - Dark mode uses Wordle's dark palette (#121213, #3a3a3c, #538d4e, #b59f3b).
- `index.html`: the header is now a full-width bar with a hairline under it. The title
  is centred, puzzle # and date sit on the left, and `?` is on the right.

**Broke.** Nothing. Checked at phone width in light and dark mode.

**Decided.** Error red stays (Wordle has no red), but softer. Disabled Submit is a grey
key rather than a faded green.

## 2026-10-18 — Step 8: plain function tiles

**Planned.** Drop the yellow on function tiles; the `?` badge already marks them.

**Changed.** `src/style.css`: function and slot tiles use the same grey "key" style as
operators. The empty slot is a dashed square on the page background so it stays visible
on the grey tile.

**Broke.** Nothing.

**Decided.** Green is now the only accent colour. Yellow is free for later, e.g. a
"close to best" score on the Reveal screen.
