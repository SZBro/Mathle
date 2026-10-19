// Number display and expression printing. Values are kept at full precision elsewhere;
// this is display only.

import { isLog } from './tiles.js';

// Whole numbers print plainly ("24"), others to 2 decimals ("1.41"). Non-zero values
// that would round to 0.00 keep 2 significant figures ("0.0012") so a tiny positive
// result never shows as 0.
export function formatNumber(v) {
  if (v !== 0 && Math.abs(v) < 0.005) return String(Number(v.toPrecision(2)));
  const r = Math.round(v * 100) / 100;
  if (Object.is(r, -0)) return '0';
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

// Prints an AST in tile notation. Negative values that appear as operands are
// wrapped in parentheses so "−" is never mistaken for a sign: "(-7) × 2".
export function printExpr(node, isChild = false) {
  switch (node.type) {
    case 'num': {
      const s = formatNumber(node.value);
      return isChild && node.value < 0 && s !== '0' ? `(${s})` : s;
    }
    case 'group':
      // Once the contents are a single number the parentheses are no longer needed.
      if (node.expr.type === 'num') return printExpr(node.expr, isChild);
      return `(${printExpr(node.expr)})`;
    case 'bin':
      return `${printExpr(node.left, true)} ${node.op} ${printExpr(node.right, true)}`;
    case 'fn': {
      const arg = printExpr(node.arg, true);
      if (node.slot) return `${node.fn}(${arg})`;
      const gap = isLog(node.fn) && node.arg.type !== 'group' && !arg.startsWith('(') ? ' ' : '';
      return `${node.fn}${gap}${arg}`;
    }
    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}
