import './style.css';
import puzzles from './puzzles.json';
import { dateKey, isDateKey, daysSinceLaunch, puzzleIndex, hashString, shuffle } from './daily.js';
import { getNotes, setNotes, getDay, saveDay, clearDay } from './storage.js';
import { submit, replay } from './result.js';
import { renderPlay } from './ui/play.js';
import { renderReveal } from './ui/reveal.js';

// Dev overrides: ?date=2026-11-02 plays that day; ?puzzle=12 plays puzzle id 12 without
// saving or locking anything; ?reset forgets the day's result so it can be played again.
const params = new URLSearchParams(location.search);
const day = isDateKey(params.get('date')) ? params.get('date') : dateKey();
const byId = puzzles.find((p) => p.id === Number(params.get('puzzle')));
const puzzle = byId ?? puzzles[puzzleIndex(day, puzzles.length)];

const dayNumber = daysSinceLaunch(day) + 1;
const [y, m, d] = day.split('-').map(Number);
document.getElementById('puzzle-no').textContent = `#${dayNumber}`;
document.getElementById('puzzle-date').textContent =
  new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const rules = document.getElementById('rules');
document.getElementById('rules-open').addEventListener('click', () => rules.showModal());
rules.addEventListener('click', (e) => {
  if (e.target === rules) rules.close(); // click on the backdrop
});

const app = document.getElementById('app');
const preview = byId !== undefined;
if (params.has('reset')) clearDay(day);

function showReveal(p, result) {
  renderReveal(app, { puzzle: p, result, notes: getNotes(day) });
  window.scrollTo(0, 0);
}

// Already played today: straight to Reveal, with the puzzle that was actually played.
const saved = preview ? null : getDay(day);
if (saved) {
  const played = puzzles.find((p) => p.id === saved.puzzleId) ?? puzzle;
  showReveal(played, replay(played, saved));
} else {
  renderPlay(app, {
    puzzle,
    trayOrder: shuffle(puzzle.tiles.map((_, i) => i), hashString(`${day}#${puzzle.id}`)),
    notes: getNotes(day),
    onNotes: (text) => setNotes(day, text),
    onSubmit: ({ arrangement }) => {
      const res = submit(puzzle, arrangement);
      if (!res.ok) return res; // a math error: Play shows it, the shot isn't used
      if (!preview) saveDay(day, res.entry);
      showReveal(puzzle, res.result);
      return res;
    },
  });
}
