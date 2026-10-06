import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEventDate } from '../lib/resolveDate.js';

const cases = [
  ['Ideation 101: October 30th, Thursday', '2025-10-28T18:00:00Z', { month: 10, day: 30, weekdayStated: 'Thursday' }, '2025-10-30'],
  ['Potluck: November 12th, Tuesday', '2024-11-08T18:00:00Z', { month: 11, day: 12, weekdayStated: 'Tuesday' }, '2024-11-12'],
  ['TODAY 6-7pm', '2025-03-18T18:00:00Z', { relativeTerm: 'today' }, '2025-03-18'],
  ['tomorrow', '2025-03-18T18:00:00Z', { relativeTerm: 'tomorrow' }, '2025-03-19'],
  ['January 15th, year rolls over', '2025-12-20T18:00:00Z', { month: 1, day: 15 }, '2026-01-15'],
  ['Game Night: Wednesday, October 7th', '2026-10-03T18:00:00Z', { month: 10, day: 7, weekdayStated: 'Wednesday' }, '2026-10-07'],
  ['this Friday', '2026-10-05T18:00:00Z', { relativeTerm: 'this friday' }, '2026-10-09'],
  ['next Friday', '2026-10-05T18:00:00Z', { relativeTerm: 'next friday' }, '2026-10-16'],
];

for (const [label, postedAt, fields, expected] of cases) {
  test(`resolves ${label} -> ${expected}`, () => {
    const { date, reason } = resolveEventDate(fields, postedAt);
    assert.equal(date, expected, reason ?? undefined);
  });
}

test('uses stated weekday to pick the year (Friday, October 30th posted 2025 -> 2026)', () => {
  const { date } = resolveEventDate(
    { month: 10, day: 30, weekdayStated: 'Friday' },
    '2025-10-28T18:00:00Z',
  );
  assert.equal(date, '2026-10-30');
});

test('rejects when no candidate year matches the stated weekday', () => {
  const { date, reason } = resolveEventDate(
    { month: 10, day: 30, weekdayStated: 'Monday' },
    '2025-10-28T18:00:00Z',
  );
  assert.equal(date, null);
  assert.match(reason, /no year matches Monday/);
});

test('rejects unresolvable dates instead of guessing', () => {
  const { date } = resolveEventDate({ relativeTerm: '' }, '2025-03-18T18:00:00Z');
  assert.equal(date, null);
});

test('without a weekday, rejects dates more than 120 days after posting', () => {
  const { date } = resolveEventDate(
    { month: 1, day: 1, year: 2027 },
    '2025-03-18T18:00:00Z',
  );
  assert.equal(date, null);
});
