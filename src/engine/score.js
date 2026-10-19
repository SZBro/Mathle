// Scoring, the same formula for every goal type.
//
// quality q(v) is defined per goal so that higher is always better:
//   largest           v
//   smallest          -v
//   smallestPositive  v > 0 ? -v : -Infinity
//   closest           -|v - target|
//
//   score = (q(player) - q(naive)) / (q(best) - q(naive)), clamped to 0..1
//
// Pure: no logging. The caller logs when beatBest is true so the puzzle can be updated.

// Values this close (relative) count as equal, so float noise like
// 768.0000000000001 neither "beats" nor falls short of 768.
const EPSILON = 1e-9;

export function quality(goal, v) {
  switch (goal.type) {
    case 'largest':
      return v;
    case 'smallest':
      return -v;
    case 'smallestPositive':
      return v > 0 ? -v : -Infinity;
    case 'closest':
      if (typeof goal.target !== 'number') throw new Error('A closest goal needs a numeric target.');
      return -Math.abs(v - goal.target);
    default:
      throw new Error(`Unknown goal type: ${goal.type}`);
  }
}

// Returns { score, percent, beatBest, matchedBest }.
//   score   0..1 at full precision
//   percent whole number for display; rounds down so only a true best shows 100
export function score(puzzle, playerValue) {
  const { goal } = puzzle;
  const qPlayer = quality(goal, playerValue);
  const qBest = quality(goal, puzzle.best.value);
  const qNaive = quality(goal, puzzle.naive.value);

  if (!Number.isFinite(qBest) || !Number.isFinite(qNaive)) {
    throw new Error(`Puzzle ${puzzle.id}: best and naive must be valid answers for "${goal.type}".`);
  }
  if (qBest < qNaive) {
    throw new Error(`Puzzle ${puzzle.id}: best is worse than naive.`);
  }

  const tolerance = EPSILON * Math.max(1, Math.abs(qBest));
  const beatBest = qPlayer - qBest > tolerance;
  const matchedBest = !beatBest && Math.abs(qPlayer - qBest) <= tolerance;

  let s;
  if (beatBest || matchedBest) s = 1;
  else if (qBest === qNaive) s = 0; // player is below a best that equals naive
  else s = Math.min(1, Math.max(0, (qPlayer - qNaive) / (qBest - qNaive)));

  return { score: s, percent: s === 1 ? 100 : Math.floor(s * 100), beatBest, matchedBest };
}
