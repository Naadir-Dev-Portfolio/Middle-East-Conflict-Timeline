import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTimeline, validDate, webUrl, youtubeId } from '../lib/timeline-validation.mjs';
import { loadTimelineData } from '../lib/timeline-data.ts';
import { createTimelineReader } from '../lib/timeline-client.ts';

const minimal = { id: 'example', date_start: '2026-01-01', title: 'Example event' };
const fixture = () => ({ events: [{ ...minimal }] });

test('the only three required event fields render with safe defaults and no connections', () => {
  const file = fixture(), before = structuredClone(file);
  assert.deepEqual(validateTimeline(file).errors, []);
  const data = loadTimelineData(file);
  assert.equal(data.events[0].verification, 'unreviewed');
  assert.deepEqual(data.events[0].sources, []);
  assert.deepEqual(data.events[0].theatres, []);
  assert.deepEqual(data.media.example, []);
  assert.deepEqual(data.relations, []);
  assert.equal(data.calendar.end, '2028-12-31');
  assert.deepEqual(file, before);
});

test('optional details, sources, captions and editorial properties come from the same record', () => {
  const file = fixture();
  Object.assign(file.events[0], {
    summary: 'Short summary', intro: 'Introduction', context: 'Context paragraph',
    details: ['First paragraph', 'Second paragraph'],
    importance: 5, theme: 'diplomacy', quote: 'An exact quote',
    key_facts: [{ label: 'Place', value: 'Islamabad' }],
    search_aliases: ['another spelling'],
    sources: [{ url: 'https://example.org/report' }],
    media: [{ url: 'https://example.org/photo.jpg' }],
  });
  const data = loadTimelineData(file);
  assert.equal(data.editorial.example.importance, 5);
  assert.equal(data.research.example.longform[1], 'Second paragraph');
  assert.equal(data.research.example.source_digest, 'Context paragraph');
  assert.equal(data.events[0].sources[0].publisher, 'example.org');
  assert.equal(data.media.example[0].alt, minimal.title);
  assert.equal(data.media.example[0].src, 'https://example.org/photo.jpg');
});

test('a future event and an earlier event expand the calendar without updating metadata', () => {
  const file = fixture();
  file.events.push({ ...minimal, id: 'future', date_start: '2029-04-07', date_end: '2030-03-01' });
  file.events.push({ ...minimal, id: 'earlier', date_start: '2010-02-01' });
  const data = loadTimelineData(file);
  assert.deepEqual(data.calendar, { start: '2010-02-01', end: '2030-03-01', recorded_through: '2030-03-01' });
});

test('timestamps retain the same instant after conversion to UTC', () => {
  const file = fixture();
  file.events[0].date_start = '2026-04-07T18:32:00-04:00';
  const data = loadTimelineData(file);
  assert.equal(data.events[0].date_start, '2026-04-07T22:32:00.000Z');
  assert.equal(data.events[0].precision, 'time');
  assert.equal(Date.parse(data.events[0].date_start), Date.parse(file.events[0].date_start));
});

test('calendar dates and timestamp offsets must be real and unambiguous', () => {
  for (const date of ['2024-02-29', '2026-04-07T23:32:00+01:00', '2026-04-07T23:32Z']) assert(validDate(date), date);
  for (const invalid of ['2026-02-29', '2026-04-31', '2026-13-01', 'tomorrow', '2026-04-07T25:00Z',
    '2026-04-07T23:60Z', '2026-04-07T12:00:00', '2026-04-07T12:00:00+16:00']) assert(!validDate(invalid), invalid);
});

test('duplicate IDs, reversed date ranges and invalid optional types are rejected', () => {
  const file = fixture();
  file.events.push({ ...minimal, date_end: '2025-01-01', importance: 8, details: [42] });
  const errors = validateTimeline(file).errors.join(' ');
  for (const message of ['duplicate event ID', 'before date_start', 'importance', 'details']) assert(errors.includes(message), message);
});

test('malformed records fail validation without throwing or modifying the file', () => {
  for (const file of [null, [], {}, { events: null }, { events: [null] }, { events: [{ ...minimal, media: [null], sources: [false], relationships: [null] }] }]) {
    const copy = structuredClone(file);
    assert(validateTimeline(file).errors.length > 0);
    assert.deepEqual(file, copy);
  }
});

test('unsafe URLs and local image paths cannot enter the remote-media format', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '/images/photo.jpg',
    'file:///C:/secret.txt', 'https://user:password@example.org/photo', 'https://example.org/has space.jpg']) assert(!webUrl(url), url);
  const file = fixture();
  file.events[0].media = [{ url: '/images/local.jpg' }];
  file.events[0].sources = [{ url: 'javascript:alert(1)' }];
  assert(validateTimeline(file).errors.length >= 2);
  assert.throws(() => loadTimelineData(file), /HTTP/);
});

test('YouTube thumbnails and players need only a normal video URL in the event', () => {
  const file = fixture();
  file.events[0].media = [{ url: 'https://www.youtube.com/watch?v=rI-wNMWmMec&t=140' }];
  const item = loadTimelineData(file).media.example[0];
  assert.equal(item.kind, 'youtube');
  assert.equal(item.thumbnail, 'https://i.ytimg.com/vi/rI-wNMWmMec/hqdefault.jpg');
  assert(item.href.endsWith('&t=140'));
  for (const url of ['https://youtu.be/rI-wNMWmMec', 'https://www.youtube-nocookie.com/embed/rI-wNMWmMec',
    'https://www.youtube.com/shorts/rI-wNMWmMec', 'https://www.youtube.com/live/rI-wNMWmMec']) assert.equal(youtubeId(url), 'rI-wNMWmMec');
  for (const url of ['https://youtube.com.evil.test/watch?v=rI-wNMWmMec', 'https://youtube.com/watch?v=missing',
    'https://youtube.com/user/rI-wNMWmMec']) assert.equal(youtubeId(url), null);
});

test('direct videos and PDFs are recognized without hardcoded event logic', () => {
  const file = fixture();
  file.events[0].media = [{ url: 'https://example.org/report.mp4' }, { url: 'https://example.org/statement.pdf' }];
  const media = loadTimelineData(file).media.example;
  assert.equal(media[0].kind, 'video');
  assert.equal(media[1].kind, 'document');
  assert.equal(media[0].src, undefined);
});

test('connections belong to their event, infer their origin, and default to an interpretive link', () => {
  const file = fixture();
  file.events.push({ ...minimal, id: 'next', date_start: '2026-01-02', relationships: [{ to: 'example' }] });
  const link = loadTimelineData(file).relations[0];
  assert.equal(link.from, 'next');
  assert.equal(link.to, 'example');
  assert.equal(link.id, 'next--contextual_thread--example');
  assert.equal(link.confidence, 'interpretive');
  file.events.unshift({ ...minimal, id: 'older', date_start: '2025-01-01' });
  assert.equal(loadTimelineData(file).relations[0].id, link.id);
});

test('dangling, self-referential and duplicate links are rejected', () => {
  const file = fixture();
  file.events[0].relationships = [{ to: 'missing' }, { to: 'example' }, { to: 'missing' }];
  const errors = validateTimeline(file).errors.join(' ');
  for (const message of ['existing event', 'itself', 'unique stable ID']) assert(errors.includes(message), message);
});

test('empty event arrays and missing optional metadata are supported', () => {
  assert.deepEqual(validateTimeline({ events: [] }).errors, []);
  assert.equal(loadTimelineData({ events: [] }).events.length, 0);
  const file = fixture();
  file.calendar_end = '2028-02-30';
  file.timezone = 'not-a-zone';
  assert(validateTimeline(file).errors.some(error => error.includes('calendar_end')));
  assert(validateTimeline(file).errors.some(error => error.includes('timezone')));
});

test('the repository dataset is valid, self-contained and contains only remote media URLs', () => {
  const file = JSON.parse(readFileSync(new URL('../data/timeline.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateTimeline(file).errors, []);
  const data = loadTimelineData(file);
  assert.equal(data.events.length, file.events.length);
  assert(!JSON.stringify(file).includes('/images/events/'));
  assert(!JSON.stringify(file).includes('public/images'));
  for (const event of file.events) for (const item of event.media ?? []) assert(webUrl(item.url));
});

test('unchanged responses preserve object identity, selected-state consumers and transfer no new data', async () => {
  const requests = [];
  let count = 0;
  const read = createTimelineReader(async (url, options) => {
    requests.push({ url, options });
    return count++ === 0 ? new Response(JSON.stringify(fixture()), { headers: { etag: '"first"' } }) : new Response(null, { status: 304 });
  });
  const first = await read(), again = await read();
  assert.equal(first, again);
  assert.equal(requests[1].options.headers['If-None-Match'], '"first"');
  assert.equal(requests[0].url, '/timeline.json');
});

test('a partially written or invalid file cannot replace the last valid data or ETag', async () => {
  const requests = [], responses = [
    new Response(JSON.stringify(fixture()), { headers: { etag: '"valid"' } }),
    new Response('{"events":[', { headers: { etag: '"partial"' } }),
    new Response(JSON.stringify({ events: [{ ...minimal, date_start: 'wrong' }] }), { headers: { etag: '"invalid"' } }),
    new Response(null, { status: 304 }),
  ];
  const read = createTimelineReader(async (_url, options) => { requests.push(options); return responses.shift(); });
  const original = await read();
  await assert.rejects(read(), /not valid JSON/);
  await assert.rejects(read(), /date_start/);
  assert.equal(await read(), original);
  assert.equal(requests[3].headers['If-None-Match'], '"valid"');
});

test('appending to the same file is picked up on the next read, with no build step', async () => {
  const file = fixture();
  let text = JSON.stringify(file);
  const read = createTimelineReader(async () => new Response(text));
  const first = await read();
  file.events.push({ id: 'new-event', date_start: '2031-01-01T14:00:00Z', title: 'A new record' });
  text = JSON.stringify(file);
  const next = await read();
  assert.equal(next.events.length, 2);
  assert.equal(next.calendar.end, '2031-01-01');
  assert.equal(first.events.length, 1);
});

test('a missing file is an explicit error, and Windows UTF-8 BOMs are accepted', async () => {
  const missing = createTimelineReader(async () => new Response('missing', { status: 503 }));
  await assert.rejects(missing(), /503/);
  const withBom = createTimelineReader(async () => new Response('\uFEFF' + JSON.stringify(fixture())));
  assert.equal((await withBom()).events.length, 1);
});
