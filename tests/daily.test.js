import { describe, it, expect } from 'vitest';
import {
  LAUNCH_DATE, dateKey, isDateKey, daysSinceLaunch, puzzleIndex, hashString, shuffle,
  msUntilNextDay, formatCountdown,
} from '../src/daily.js';

describe('dates', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('recognises date keys', () => {
    expect(isDateKey('2026-10-18')).toBe(true);
    expect(isDateKey('2026-1-8')).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });

  it('counts days since launch', () => {
    expect(daysSinceLaunch(LAUNCH_DATE)).toBe(0);
    expect(daysSinceLaunch('2026-10-19')).toBe(1);
    expect(daysSinceLaunch('2026-10-17')).toBe(-1);
    // Across the US and EU DST changes.
    expect(daysSinceLaunch('2026-11-02')).toBe(15);
    expect(daysSinceLaunch('2027-03-29')).toBe(162);
  });

  it('wraps the puzzle index in both directions', () => {
    expect(puzzleIndex(LAUNCH_DATE, 30)).toBe(0);
    expect(puzzleIndex('2026-11-17', 30)).toBe(0);
    expect(puzzleIndex('2026-11-16', 30)).toBe(29);
    expect(puzzleIndex('2026-10-17', 30)).toBe(29);
  });
});

describe('shuffle', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it('is a permutation', () => {
    expect([...shuffle(items, 42)].sort((a, b) => a - b)).toEqual(items);
  });

  it('repeats for the same seed and differs for another', () => {
    expect(shuffle(items, hashString('2026-10-18#1'))).toEqual(shuffle(items, hashString('2026-10-18#1')));
    expect(shuffle(items, hashString('2026-10-18#1'))).not.toEqual(shuffle(items, hashString('2026-10-19#2')));
  });

  it('does not change its input', () => {
    const copy = [...items];
    shuffle(items, 7);
    expect(items).toEqual(copy);
  });
});

describe('countdown', () => {
  it('counts down to the next local midnight', () => {
    expect(msUntilNextDay(new Date(2026, 9, 18, 23, 59, 0))).toBe(60000);
    expect(msUntilNextDay(new Date(2026, 9, 18, 0, 0, 0))).toBe(86400000);
  });

  it('lands on midnight of the next day every day of a year (covers DST here)', () => {
    for (let i = 0; i < 366; i++) {
      const now = new Date(2026, 0, 1 + i, 12, 30);
      const next = new Date(now.getTime() + msUntilNextDay(now));
      expect([next.getHours(), next.getMinutes(), next.getSeconds()]).toEqual([0, 0, 0]);
      expect(next.getDate()).toBe(new Date(2026, 0, 2 + i).getDate());
    }
  });

  it('formats as hh:mm:ss', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(-5)).toBe('00:00:00');
    expect(formatCountdown(1)).toBe('00:00:01');
    expect(formatCountdown(86400000)).toBe('24:00:00');
    expect(formatCountdown((3 * 3600 + 7 * 60 + 9) * 1000)).toBe('03:07:09');
  });
});
