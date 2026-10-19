// Tokens -> AST, by recursive descent. Run validate() first; this throws on bad input.
//
//   expr    := term   (('+'|'−') term)*     left-assoc
//   term    := power  (('×'|'÷') power)*    left-assoc
//   power   := fnApp  ('^' power)?          right-assoc
//   fnApp   := FN fnApp | primary           a function takes only the next operand
//   primary := NUM | '(' expr ')' | SLOT
//
// Nodes:
//   { type: 'num',   value }
//   { type: 'bin',   op, left, right }
//   { type: 'fn',    fn, arg, slot }        slot: true for √(□)-style tiles
//   { type: 'group', expr }                 kept so steps can print the parentheses
// Every node has `tileIds` (all tiles it covers). bin/fn nodes also have `tileId`,
// the operator or function tile itself.

export function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const fail = (msg) => {
    throw new SyntaxError(`${msg} at token ${pos}. Run validate() before parse().`);
  };

  function binary(next, ops) {
    let left = next();
    while (peek()?.type === 'op' && ops.includes(peek().value)) {
      const opTok = tokens[pos++];
      const right = next();
      left = binNode(opTok, left, right);
    }
    return left;
  }

  const expr = () => binary(term, ['+', '−']);
  const term = () => binary(power, ['×', '÷']);

  function power() {
    const base = fnApp();
    if (peek()?.type === 'op' && peek().value === '^') {
      const opTok = tokens[pos++];
      return binNode(opTok, base, power());
    }
    return base;
  }

  function fnApp() {
    const tok = peek();
    if (tok?.type === 'fn') {
      pos++;
      const arg = fnApp();
      return { type: 'fn', fn: tok.value, arg, slot: false, tileId: tok.tileId, tileIds: [tok.tileId, ...arg.tileIds] };
    }
    return primary();
  }

  function primary() {
    const tok = tokens[pos++];
    if (!tok) fail('Unexpected end of expression');
    if (tok.type === 'num') {
      return { type: 'num', value: tok.value, tileIds: [tok.tileId] };
    }
    if (tok.type === 'slot') {
      const inner = tok.inner[0];
      if (tok.inner.length !== 1 || inner.type !== 'num') fail('Slot must hold one number');
      const arg = { type: 'num', value: inner.value, tileIds: [inner.tileId] };
      return { type: 'fn', fn: tok.value, arg, slot: true, tileId: tok.tileId, tileIds: [tok.tileId, inner.tileId] };
    }
    if (tok.type === 'lparen') {
      const inner = expr();
      const close = tokens[pos++];
      if (close?.type !== 'rparen') fail('Expected ")"');
      return { type: 'group', expr: inner, tileIds: [tok.tileId, ...inner.tileIds, close.tileId] };
    }
    fail(`Unexpected ${tok.type}`);
  }

  const ast = expr();
  if (pos !== tokens.length) fail('Unexpected extra tokens');
  return ast;
}

function binNode(opTok, left, right) {
  return {
    type: 'bin',
    op: opTok.value,
    left,
    right,
    tileId: opTok.tileId,
    tileIds: [...left.tileIds, opTok.tileId, ...right.tileIds],
  };
}
