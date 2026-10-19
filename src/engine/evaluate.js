// AST -> value, plus the step-by-step list for the Reveal screen.
//
// Children are evaluated before their parent, left to right, which matches the order
// a person works it out: in "1 × 2 + 3 × 4" it does 1 × 2, then 3 × 4, then +.
//
// With steps on, evaluation runs on a copy of the tree. After each operation the node
// is replaced by its value and the whole expression is printed again:
//   { text: "1 + 3 = 4", expr: "4 × 4 × 6 × 8", value: 4, tileId, tileIds }
// A group whose contents have become one number loses its parentheses (no step).
//
// Math errors come back as { ok: false, error: { code, message, tileId, tileIds } }.
// tileId is the operator/function tile; tileIds is the whole sub-expression.

import { FNS, MAX_MAGNITUDE, OPS } from './tiles.js';
import { formatNumber, printExpr } from './format.js';

class MathError extends Error {
  constructor(code, message, node) {
    super(message);
    this.code = code;
    this.tileId = node.tileId;
    this.tileIds = node.tileIds;
  }
}

export function evaluate(ast, { steps = true } = {}) {
  const root = steps ? structuredClone(ast) : ast;
  const log = steps ? [] : null;

  const onReduce = steps
    ? (node, value, isStep) => {
        const text = isStep ? `${printExpr(node)} = ${formatNumber(value)}` : null;
        const { tileId, tileIds } = node;
        for (const key of Object.keys(node)) delete node[key];
        Object.assign(node, { type: 'num', value, tileIds });
        if (isStep) log.push({ text, expr: printExpr(root), value, tileId, tileIds });
      }
    : null;

  try {
    const value = evalNode(root, onReduce);
    return { ok: true, value, steps: log };
  } catch (e) {
    if (!(e instanceof MathError)) throw e;
    return {
      ok: false,
      error: { code: e.code, message: e.message, tileId: e.tileId, tileIds: e.tileIds },
      steps: log,
    };
  }
}

function evalNode(node, onReduce) {
  switch (node.type) {
    case 'num':
      return node.value;

    case 'group': {
      const v = evalNode(node.expr, onReduce);
      onReduce?.(node, v, false);
      return v;
    }

    case 'bin': {
      const a = evalNode(node.left, onReduce);
      const b = evalNode(node.right, onReduce);
      const v = checkResult(applyOp(node, a, b), node);
      onReduce?.(node, v, true);
      return v;
    }

    case 'fn': {
      const x = evalNode(node.arg, onReduce);
      const v = checkResult(applyFn(node, x), node);
      onReduce?.(node, v, true);
      return v;
    }

    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

function applyOp(node, a, b) {
  if (node.op === '÷' && b === 0) {
    throw new MathError('divByZero', 'Division by zero.', node);
  }
  if (node.op === '^') {
    if (a === 0 && b < 0) {
      throw new MathError('divByZero', '0 to a negative power divides by zero.', node);
    }
    if (a < 0 && !Number.isInteger(b)) {
      throw new MathError('negativeFractionalPower',
        'A negative number can\'t be raised to a fractional power.', node);
    }
  }
  return OPS[node.op].apply(a, b);
}

function applyFn(node, x) {
  if (node.fn === '√' && x < 0) {
    throw new MathError('sqrtNegative', 'Can\'t take √ of a negative number.', node);
  }
  if ((node.fn === 'log₂' || node.fn === 'log₁₀') && x <= 0) {
    throw new MathError('logNonPositive', `Can't take ${node.fn} of zero or a negative number.`, node);
  }
  return FNS[node.fn].apply(x);
}

function checkResult(v, node) {
  if (Number.isNaN(v)) {
    throw new MathError('nonFinite', 'This step doesn\'t give a real number.', node);
  }
  if (!Number.isFinite(v) || Math.abs(v) > MAX_MAGNITUDE) {
    throw new MathError('tooBig', 'This number gets too big (over 1,000,000,000,000).', node);
  }
  return v;
}
