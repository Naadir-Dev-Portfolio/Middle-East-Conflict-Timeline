import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarBounds } from '../lib/timeline-calendar.ts';
import { normalizeSearchText, eventSearchText, matchesSearch, searchRelevance } from '../lib/timeline-search.ts';

const snapshot = { scope_start: '2020-01-03', scope_end: '2026-08-31' };
test('empty calendar extends through 2028 without altering recorded coverage or the input', () => {
  const records = [{ date_start: '2026-04-13', date_end: null }];
  const copy = structuredClone(records);
  assert.deepEqual(calendarBounds(records, snapshot, '2028-12-31'), {
    start: '2020-01-03', end: '2028-12-31', recorded_through: '2026-08-31',
  });
  assert.deepEqual(records, copy);
  assert.equal(records.length, 1);
});
test('an inserted event or date range beyond 2028 expands the calendar with no code change', () => {
  assert.deepEqual(calendarBounds([{ date_start: '2019-01-01' },
    { date_start: '2029-01-04', date_end: '2030-02-01' }], snapshot, '2028-12-31'), {
    start: '2019-01-01', end: '2030-02-01', recorded_through: '2030-02-01',
  });
  assert.equal(calendarBounds([], snapshot, '2028-12-31').end, '2028-12-31');
});

const event = { id: '2026-04-13-example', date_start: '2026-04-13', date_end: null,
  title: 'U.S. naval blockade of Iranian ports begins', summary: 'Ships near the Strait of Hormuz.',
  theatres: ['Iran'], actors: ['United States'], category: ['maritime'], sources: [] };
test('US, U.S., USA and United States find the same event; common Hormuz spelling also works', () => {
  const text = eventSearchText(event);
  for (const query of ['US blockade', 'U.S. blockade', 'USA blockade', 'United States naval blockade', 'Hourmuz']) {
    assert(matchesSearch(text, query), query);
  }
  assert(!matchesSearch(text, 'Russia blockade'));
});
test('MoU, punctuation and accents normalize without changing display titles', () => {
  assert.equal(normalizeSearchText('14-point MoU'), normalizeSearchText('14 point Memorandum of Understanding'));
  assert.equal(normalizeSearchText('J.D. Vance in Bürgenstock'), 'jd vance in burgenstock');
  assert.equal(event.title, 'U.S. naval blockade of Iranian ports begins');
});
test('optional aliases, key facts and research citations improve retrieval without requiring relations', () => {
  const text = eventSearchText(event, { search_aliases: ['initial first blockade'],
    key_facts: [{ label: 'Start time', value: '14:00 UTC' }], reviewed_at: '2026-09-02',
    additional_sources: [{ publisher: 'Joint Maritime Information Center', url: 'https://example.org/advisory', title: 'Blockade advisory' }] });
  assert(matchesSearch(text, 'initial US blockade'));
  assert(matchesSearch(text, '14 00'));
  assert(matchesSearch(text, 'Joint Maritime advisory'));
  assert(searchRelevance(event, undefined, 'naval blockade') > searchRelevance({ ...event, title: 'Diplomatic talks' }, undefined, 'naval blockade'));
});
