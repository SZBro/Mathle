// node tools/check-puzzles.js  — exits 1 if any puzzle has errors.

import { loadPuzzles } from './puzzles.js';
import { checkPuzzles } from './check.js';

const results = checkPuzzles(loadPuzzles());
let errorCount = 0;
let warningCount = 0;

for (const r of results) {
  for (const e of r.errors) console.log(`ERROR   ${r.label ?? ''} ${e}`);
  for (const w of r.warnings) console.log(`warning ${r.label} ${w}`);
  errorCount += r.errors.length;
  warningCount += r.warnings.length;
}

console.log(`\n${results.length} puzzles checked: ${errorCount} errors, ${warningCount} warnings.`);
process.exit(errorCount ? 1 : 0);
