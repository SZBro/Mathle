import './style.css';
import puzzles from './puzzles.json';
import { dateKey, isDateKey, daysSinceLaunch, puzzleIndex, hashString, shuffle } from './daily.js';
import { getNotes, setNotes } from './storage.js';
import { renderPlay } from './ui/play.js';

// Dev overrides: ?date=2026-11-02 plays that day; ?puzzle=12 plays puzzle id 12.
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

renderPlay(document.getElementById('app'), {
  puzzle,
  trayOrder: shuffle(puzzle.tiles.map((_, i) => i), hashString(`${day}#${puzzle.id}`)),
  notes: getNotes(day),
  onNotes: (text) => setNotes(day, text),
  onSubmit: ({ expr, arrangement }) => {
    // The Reveal screen comes next; for now just report what was submitted.
    console.log('Mathle submit:', expr, arrangement);
  },
});
