// Structural checks run before submit. Never evaluates anything, so it can't leak values.
// Returns a list of { code, tileIds, message }; an empty list means the arrangement parses.

// What the previous token was, as far as adjacency rules care.
const START = 'start';
const OPERAND = 'operand'; // num, slot, or ')': something that ends a value
const OP = 'op';
const OPEN = 'open';
const FN = 'fn';

export function validate(tokens, { expectedTileIds } = {}) {
  const errors = [];
  const add = (code, tileIds, message) => errors.push({ code, tileIds, message });

  if (expectedTileIds) {
    const used = new Set(usedTileIds(tokens));
    const unused = expectedTileIds.filter((id) => !used.has(id));
    if (unused.length) {
      add('unusedTiles', unused,
        `${unused.length} tile${unused.length === 1 ? '' : 's'} still unused. Every tile must be used.`);
    }
  }

  if (tokens.length === 0) {
    add('empty', [], 'Place some tiles to build an expression.');
    return errors;
  }

  let prev = START;
  let prevTok = null;
  const openStack = [];

  for (const tok of tokens) {
    const startsOperand = tok.type === 'num' || tok.type === 'slot' || tok.type === 'lparen' || tok.type === 'fn';

    if (startsOperand && prev === OPERAND) {
      add('missingOperator', [prevTok.tileId, tok.tileId], 'These two need an operator between them.');
    }

    switch (tok.type) {
      case 'num':
        prev = OPERAND;
        break;

      case 'slot':
        if (tok.inner.length !== 1 || tok.inner[0].type !== 'num') {
          add('slotContents', [tok.tileId, ...tok.inner.flatMap(innerIds)],
            `${tok.value}(□) must hold exactly one number tile.`);
        }
        prev = OPERAND;
        break;

      case 'fn':
        prev = FN;
        break;

      case 'lparen':
        openStack.push(tok);
        prev = OPEN;
        break;

      case 'rparen':
        if (prev === OPEN) {
          add('emptyParens', [prevTok.tileId, tok.tileId], 'These parentheses have nothing inside.');
        } else if (prev === OP) {
          add('operatorBeforeClose', [prevTok.tileId], 'An operator needs a number after it, not ")".');
        } else if (prev === FN) {
          add('fnMissingOperand', [prevTok.tileId], `${prevTok.value} needs a number or "( … )" after it.`);
        }
        if (openStack.length === 0) {
          add('unmatchedClose', [tok.tileId], 'This ")" has no matching "(" before it.');
        } else {
          openStack.pop();
        }
        prev = OPERAND;
        break;

      case 'op':
        if (prev === START) {
          add('operatorAtStart', [tok.tileId], 'An expression can\'t start with an operator.');
        } else if (prev === OP) {
          add('doubleOperator', [prevTok.tileId, tok.tileId], 'Two operators in a row.');
        } else if (prev === OPEN) {
          add('operatorAfterOpen', [tok.tileId], 'An operator needs a number before it, not "(".');
        } else if (prev === FN) {
          add('fnMissingOperand', [prevTok.tileId], `${prevTok.value} needs a number or "( … )" after it.`);
        }
        prev = OP;
        break;

      default:
        throw new Error(`Unknown token type: ${tok.type}`);
    }
    prevTok = tok;
  }

  if (prev === OP) {
    add('operatorAtEnd', [prevTok.tileId], 'An expression can\'t end with an operator.');
  } else if (prev === FN) {
    add('fnMissingOperand', [prevTok.tileId], `${prevTok.value} needs a number or "( … )" after it.`);
  }
  for (const open of openStack) {
    add('unclosedParen', [open.tileId], 'This "(" is never closed.');
  }

  return errors;
}

function innerIds(tok) {
  return tok.type === 'slot' ? [tok.tileId, ...tok.inner.flatMap(innerIds)] : [tok.tileId];
}

export function usedTileIds(tokens) {
  return tokens.flatMap(innerIds);
}
