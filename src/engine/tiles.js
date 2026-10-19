// Operator and function tables shared by the tokenizer, parser, evaluator and printer.
// Canonical symbols are the Unicode ones shown on tiles; ASCII aliases are accepted
// when reading expression strings (tests, solver, puzzle file).

export const OPS = {
  '+': { prec: 1, rightAssoc: false, apply: (a, b) => a + b },
  '−': { prec: 1, rightAssoc: false, apply: (a, b) => a - b },
  '×': { prec: 2, rightAssoc: false, apply: (a, b) => a * b },
  '÷': { prec: 2, rightAssoc: false, apply: (a, b) => a / b },
  '^': { prec: 3, rightAssoc: true, apply: (a, b) => Math.pow(a, b) },
};

export const OP_ALIASES = { '-': '−', '*': '×', '/': '÷' };

export const FNS = {
  '√': { apply: Math.sqrt, help: '√9 = 3 because 3² = 9' },
  '∛': { apply: Math.cbrt, help: '∛27 = 3 because 3³ = 27' },
  'log₂': { apply: Math.log2, help: 'log₂(8) = 3 because 2³ = 8' },
  'log₁₀': { apply: Math.log10, help: 'log₁₀(1000) = 3 because 10³ = 1000' },
};

export const FN_ALIASES = { sqrt: '√', cbrt: '∛', log2: 'log₂', log10: 'log₁₀' };

// Magnitudes above this are "too big" (intermediate or final).
export const MAX_MAGNITUDE = 1e12;

export function canonicalOp(symbol) {
  const op = OP_ALIASES[symbol] ?? symbol;
  if (!(op in OPS)) throw new Error(`Unknown operator: ${symbol}`);
  return op;
}

export function canonicalFn(symbol) {
  const fn = FN_ALIASES[symbol] ?? symbol;
  if (!(fn in FNS)) throw new Error(`Unknown function: ${symbol}`);
  return fn;
}

export function isLog(fn) {
  return fn === 'log₂' || fn === 'log₁₀';
}
