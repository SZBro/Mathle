// Tile elements. Each has data-id (index into the puzzle's tiles) and data-kind.
// A slot tile contains a .slot-zone that holds at most one number tile.

export function createTile(tile, id) {
  const el = document.createElement('div');
  el.className = `tile tile-${tile.kind}`;
  el.dataset.id = id;
  el.dataset.kind = tile.kind;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');

  switch (tile.kind) {
    case 'num':
      el.textContent = String(tile.value);
      el.setAttribute('aria-label', String(tile.value));
      break;
    case 'op':
      el.textContent = tile.value;
      el.setAttribute('aria-label', OP_NAMES[tile.value] ?? tile.value);
      break;
    case 'lparen':
      el.textContent = '(';
      el.setAttribute('aria-label', 'open parenthesis');
      break;
    case 'rparen':
      el.textContent = ')';
      el.setAttribute('aria-label', 'close parenthesis');
      break;
    case 'fn':
      el.append(span('fn-name', tile.value), helpButton(tile.value));
      el.setAttribute('aria-label', tile.value);
      break;
    case 'fnslot': {
      const zone = span('slot-zone');
      el.append(span('fn-name', tile.value), span('slot-paren', '('), zone, span('slot-paren', ')'),
        helpButton(tile.value));
      el.setAttribute('aria-label', `${tile.value} of one number`);
      break;
    }
    default:
      throw new Error(`Unknown tile kind: ${tile.kind}`);
  }
  return el;
}

const OP_NAMES = { '+': 'plus', '−': 'minus', '×': 'times', '÷': 'divided by', '^': 'to the power of' };

function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function helpButton(fn) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'help';
  btn.dataset.fn = fn;
  btn.textContent = '?';
  btn.setAttribute('aria-label', `What does ${fn} do?`);
  return btn;
}
