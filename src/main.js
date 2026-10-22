import './style.css';
import puzzles from './puzzles.json';
import { dateKey, isDateKey, daysSinceLaunch, puzzleIndex, hashString, shuffle } from './daily.js';
import { getNotes, setNotes, getDay, saveDay, clearDay } from './storage.js';
import { submit, replay, savedPuzzle } from './result.js';
import { dailyPuzzle, newPracticeNumber, parsePracticeNumber, practicePuzzle } from './generate.js';
import { renderPlay } from './ui/play.js';
import { renderReveal } from './ui/reveal.js';
import { initAnalytics, track } from './analytics.js';

initAnalytics();

// ?practice=N plays practice puzzle N; a bare ?practice picks a new N from the clock.
// Practice is never saved and never locks anything.
// Dev overrides: ?date=2026-11-02 plays that day; ?puzzle=12 plays hand-made puzzle 12
// without saving or locking anything; ?reset forgets the day's result so it can be
// played again.
const params = new URLSearchParams(location.search);
const day = isDateKey(params.get('date')) ? params.get('date') : dateKey();
const dayNumber = daysSinceLaunch(day) + 1;

let practiceNumber = null;
if (params.has('practice')) {
  practiceNumber = parsePracticeNumber(params.get('practice')) ?? newPracticeNumber();
  // Put the number in the URL so a reload, or a shared link, gives the same puzzle.
  history.replaceState(null, '', `${location.pathname}?practice=${practiceNumber}`);
}
const practice = practiceNumber !== null;

// Today's puzzle is generated from the date. The hand-made list is the fallback if the
// generator ever comes up empty.
const byId = puzzles.find((p) => p.id === Number(params.get('puzzle')));
const puzzle = (practice ? practicePuzzle(practiceNumber) : byId ?? dailyPuzzle(day, dayNumber))
  ?? puzzles[puzzleIndex(day, puzzles.length)];

const [y, m, d] = day.split('-').map(Number);
document.getElementById('puzzle-no').textContent = practice ? 'Practice' : `#${dayNumber}`;
document.getElementById('puzzle-date').textContent = practice
  ? `#${practiceNumber}`
  : new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const rules = document.getElementById('rules');
document.getElementById('rules-open').addEventListener('click', () => {
  rules.showModal();
  track('rules-opened');
});
rules.addEventListener('click', (e) => {
  if (e.target === rules) rules.close(); // click on the backdrop
});

let app = document.getElementById('app');
const preview = practice || byId !== undefined;
if (params.has('reset') && !practice) clearDay(day);

// Practice scratch work lives only as long as the page.
let practiceNotes = '';
const notesFor = () => (practice ? practiceNotes : getNotes(day));

function showReveal(p, result) {
  // A fresh <main>: Play's tap and key handlers live on the old one, and on Reveal
  // they would still pull tiles out of the answer.
  const fresh = app.cloneNode(false);
  app.replaceWith(fresh);
  app = fresh;
  renderReveal(app, { puzzle: p, result, notes: notesFor(), practice });
  window.scrollTo(0, 0);
}

// Already played today: straight to Reveal, with the puzzle that was actually played.
const saved = preview ? null : getDay(day);
if (saved) {
  const played = savedPuzzle(saved, puzzles) ?? puzzle;
  showReveal(played, replay(played, saved));
} else {
  renderPlay(app, {
    puzzle,
    trayOrder: shuffle(puzzle.tiles.map((_, i) => i), hashString(practice ? puzzle.seed : `${day}#${puzzle.id}`)),
    notes: notesFor(),
    onNotes: (text) => {
      if (practice) practiceNotes = text;
      else setNotes(day, text);
    },
    practice,
    onSubmit: ({ arrangement }) => {
      const res = submit(puzzle, arrangement);
      if (!res.ok) return res; // a math error: Play shows it, the shot isn't used
      if (!preview) {
        saveDay(day, res.entry);
        track('played');
      }
      if (practice) track('practice-played');
      showReveal(puzzle, res.result);
      return res;
    },
  });
}
