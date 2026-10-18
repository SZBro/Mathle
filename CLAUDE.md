# Mathle

A daily, one-shot math puzzle website. The player is dealt a set of tiles (numbers,
operators, parentheses, functions) and a goal. They drag the tiles into one expression,
working the math out in their head or on paper, then submit **once**. The game reveals
the step-by-step calculation, the best known answer, and a score.

Course project: TCSS 490 Artifact 2. Keep `LOG.md` updated (see Workflow).

## Stack
- Plain HTML / CSS / JavaScript (ES modules), built with **Vite**. No framework.
- **SortableJS** for drag-and-drop with snapping. Tap-to-place is a fallback.
- **Vitest** for unit tests of the parser, evaluator and scorer.
- Deployed as a static site on **GitHub Pages**.
- Website first, but every screen must work at phone width (360px+).
- Never use `eval()` or `new Function()`. Write our own tokenizer and parser.

## Core rules
- One puzzle per day, picked from `src/puzzles.json` (30 hand-made puzzles for now).
  Day index = days since launch date (config constant) mod puzzle count.
- **Every tile must be used** (v1).
- **One shot.** No value is shown before submitting. After submitting, the day is
  locked (saved in localStorage).
- Puzzles have 8 tiles (easy) up to 25 tiles max (hard).
- Numbers range from 1 to 1000 and may be multi-digit. A number is a single tile.

## Tiles
| kind     | examples                     | notes |
|----------|------------------------------|-------|
| `num`    | `7`, `25`, `640`             | one tile per number |
| `op`     | `+` `−` `×` `÷` `^`          | binary only; `−` is never a negative sign in v1 |
| `lparen` / `rparen` | `(` `)`           | a puzzle may contain several pairs; all must be used |
| `fn`     | `√` `∛` `log₂` `log₁₀`       | applies to the **next operand**: one number, or a whole `( … )` group |
| `fnslot` | `√(□)` `log₂(□)`              | a function with built-in parentheses that holds **exactly one number tile** |

## Order of operations (highest first)
1. Parentheses and slot functions
2. Functions (`fn`), applied to the next operand only: `√9^2` = `(√9)^2` = 9
3. `^`, right-associative: `2^3^2` = `2^9`
4. `×` `÷`, left to right
5. `+` `−`, left to right

## Validation (before submit, reveals no values)
Submit stays disabled until the arrangement is well-formed. Show **which tile** is wrong
(highlight it) and **why**:
- unused tiles remain
- unbalanced or misordered parentheses, or empty `()`
- two operators in a row, or an operator at the start or end
- two operands with no operator between them (e.g. `7 12` or `) (`)
- a function not followed by an operand
- a slot function with anything other than one number inside

## Math errors (checked on submit; they do NOT use up the shot)
Evaluate; if any of these occur, highlight the tile or sub-expression where it happened,
explain why, and let the player fix it:
- division by zero
- `√` of a negative number (`∛` of a negative is fine)
- `log` of zero or a negative number
- any intermediate or final magnitude greater than 1e12 ("too big")
- a non-finite result (NaN or Infinity)

Decimals are allowed throughout. Compute at full precision; **display** to 2 decimal places.

## Goal types
- `largest`: biggest result
- `smallest`: lowest result (negatives allowed)
- `smallestPositive`: lowest result that is > 0 (≤ 0 scores 0%)
- `closest`: nearest to `target`

## Scoring (same formula for every goal)
Define quality `q(v)` per goal so that higher is better:
- largest: `v`
- smallest: `-v`
- smallestPositive: `v > 0 ? -v : -Infinity`
- closest: `-|v - target|`

`score = (q(player) - q(naive)) / (q(best) - q(naive))`, clamped to 0..1 and shown as a %.
`best` and `naive` come from the puzzle file. If the player beats `best`, show 100% plus
a "you beat the best known answer!" message, and log it to the console so I can update
the puzzle.

## Puzzle file format (`src/puzzles.json`)
```json
{
  "id": 1,
  "difficulty": "easy",
  "goal": { "type": "largest" },
  "tiles": [
    { "kind": "num", "value": 1 }, { "kind": "num", "value": 4 },
    { "kind": "num", "value": 6 }, { "kind": "num", "value": 8 },
    { "kind": "num", "value": 3 },
    { "kind": "op", "value": "×" }, { "kind": "op", "value": "×" },
    { "kind": "op", "value": "×" }, { "kind": "op", "value": "+" },
    { "kind": "lparen" }, { "kind": "rparen" }
  ],
  "best":  { "expr": "(1 + 3) × 4 × 6 × 8", "value": 768 },
  "naive": { "expr": "(1) + 4 × 6 × 8 × 3", "value": 577 },
  "hint": "Adding to your smallest number grows the product the most."
}
```
`closest` goals also carry `"target": 247`. Tiles are shown to the player shuffled.

## Offline solver (`tools/solve.js`, Node)
- Fills in `best` for each puzzle; I review the results before committing.
- Exhaustive search for puzzles up to about 10 tiles.
- Heuristic search (random restarts plus local swaps) for bigger puzzles; results are
  labelled "best known".
- Uses the same parser and evaluator as the game (shared module), so it never disagrees
  with the game.

## Screens
1. **Play**
   - header: Mathle, puzzle #, date, a "?" for rules
   - goal card (goal type, target if any, difficulty)
   - the tile tray (unplaced tiles)
   - the answer row, where tiles snap together magnetically, can be reordered by
     dragging, and wrap onto multiple lines for big puzzles
   - inline validation message
   - a notes box (plain textarea, saved per day)
   - the Submit button
   - each function tile has a "?" with a one-line explanation and an example
     (e.g. "log₂(8) = 3 because 2³ = 8")
2. **Reveal**
   - the player's expression evaluated step by step, one operation per line
   - the player's result
   - the best known answer and its value
   - the score % with a bar
   - the puzzle's hint
   - a countdown to the next puzzle
3. If today is already played, open straight to Reveal.

## Storage
localStorage key `mathle:v1`:
`{ days: { "YYYY-MM-DD": { puzzleId, expr, value, score } }, notes: { "YYYY-MM-DD": "..." } }`

## Later (not v1)
Three rounds per day; a practice mode (random small puzzles using the live solver, not
saved); a share button; user accounts and cross-device storage; more functions; optional
or wildcard tiles.

## Workflow
- Build in small steps and commit after each working step.
- Append to `LOG.md` after each step: what was planned, what changed, what broke, and
  what was decided.
- Parser, evaluator and scorer must have Vitest tests, including every error case above.
  Run the tests before each commit.
- Ask before adding dependencies beyond Vite, SortableJS and Vitest.
