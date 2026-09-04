import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacentEventIndex, dayAtX, xAtDay, zoomCamera, panCamera, wheelScale, rulerScale,
  scaleForSpan, packCards, MIN_TIMELINE_SCALE, MAX_TIMELINE_SCALE,
  MIN_READING_SCALE, MAX_READING_SCALE, stepReadingScale,
} from '../lib/timeline-math.ts';

const close = (actual, expected, epsilon = 1e-8) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);

test('reading text reaches exactly 30%, reverses, and stops at both limits', () => {
  let scale = 1;
  for (const expected of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
    scale = stepReadingScale(scale, -1);
    assert.equal(scale, expected);
  }
  assert.equal(scale, MIN_READING_SCALE);
  assert.equal(stepReadingScale(scale, -1), MIN_READING_SCALE);
  for (let i = 0; i < 7; i++) scale = stepReadingScale(scale, 1);
  assert.equal(scale, 1);
  for (let i = 0; i < 20; i++) scale = stepReadingScale(scale, 1);
  assert.equal(scale, MAX_READING_SCALE);
  assert.equal(stepReadingScale(scale, 1), MAX_READING_SCALE);
  assert.equal(stepReadingScale(scale, -1), 1.7);
});

test('event navigation continues from blank days and preserves same-day records', () => {
  const days = [0, 4, 4, 8];
  assert.equal(adjacentEventIndex(days, -1, 6, 1), 3);
  assert.equal(adjacentEventIndex(days, -1, 6, -1), 2);
  assert.equal(adjacentEventIndex(days, 1, 4, 1), 2);
  assert.equal(adjacentEventIndex(days, -1, -10, -1), 0);
  assert.equal(adjacentEventIndex(days, -1, 100, 1), 3);
  assert.equal(adjacentEventIndex([], -1, 1, 1), -1);
});

test('wheel zoom preserves the exact pointer date at multiple sizes and scales', () => {
  for (const width of [390, 600, 1280, 1920, 2560]) {
    for (const scale of [0.08, 0.48, 2.75, 8, 40, 96, 800, 1920]) {
      for (const fraction of [0, 0.1, 0.37, 0.5, 0.83, 1]) {
        for (const centerDay of [0, 200, 1500, 2400]) {
          let camera = { centerDay, width, scale };
          const x = width * fraction;
          const anchor = dayAtX(camera, x);
          for (let i = 0; i < 40; i++) {
            camera = zoomCamera(camera, wheelScale(camera.scale, i < 20 ? -60 : 60), x);
            close(dayAtX(camera, x), anchor);
          }
        }
      }
    }
  }
});

test('zoom in/out round-trip has no cumulative scroll rounding', () => {
  let camera = { centerDay: 2347.12345, width: 1280, scale: 8 };
  const original = { ...camera };
  for (let i = 0; i < 500; i++) {
    camera = zoomCamera(camera, camera.scale * 1.25, 927);
    camera = zoomCamera(camera, camera.scale / 1.25, 927);
  }
  close(camera.centerDay, original.centerDay);
  close(camera.scale, original.scale);
});

test('ruler scrub anchors to pointer-down and reverses exactly', () => {
  const start = { centerDay: 2347, width: 1280, scale: 20 };
  const x = 372;
  const day = dayAtX(start, x);
  for (const distance of [-900, -300, 0, 120, 600, 0]) {
    const next = zoomCamera(start, rulerScale(start.scale, distance), x, day);
    close(dayAtX(next, x), day);
    if (distance === 0) close(next.centerDay, start.centerDay);
  }
});

test('scale limits, line-wheel normalization and gentle single-notch zoom', () => {
  const camera = { centerDay: 2347, width: 1280, scale: 20 };
  assert.equal(zoomCamera(camera, 1e9).scale, MAX_TIMELINE_SCALE);
  assert.equal(zoomCamera(camera, 0).scale, MIN_TIMELINE_SCALE);
  close(wheelScale(20, 3, 1), wheelScale(20, 48, 0));
  assert.ok(wheelScale(1, -1000) < 1.13);
});

test('fit all includes both endpoints even in a narrow viewport', () => {
  for (const width of [390, 600, 1280, 2560]) {
    const camera = { width, scale: scaleForSpan(width, 2432), centerDay: 1216 };
    close(xAtDay(camera, 0), 32);
    close(xAtDay(camera, 2432), width - 32);
  }
});

test('panning is bounded and does not change scale', () => {
  const camera = { centerDay: 500, width: 1280, scale: 10 };
  assert.equal(panCamera(camera, 100, 2432).centerDay, 510);
  assert.equal(panCamera(camera, -1e9, 2432).centerDay, 0);
  assert.equal(panCamera(camera, 1e9, 2432).centerDay, 2432);
  assert.equal(panCamera(camera, 100, 2432).scale, 10);
});

test('card packing never overlaps, including largest cards and same-day events', () => {
  for (const scale of [0.3, 0.4, 0.6, 0.9, 1, 1.3, 1.6]) {
    for (const rows of [1, 2, 4]) {
      const cards = Array.from({ length: 60 }, (_, i) => ({
        id: String(i), x: Math.floor(i / 3) * 80, width: (i % 3 ? 270 : 330) * scale,
        importance: i % 5 + 1, candidate: true, preferredRow: i % rows, selected: i === 30,
      }));
      const layout = packCards(cards, rows);
      assert.ok(layout.has('30'), 'Selected event must have a visible card');
      for (let row = 0; row < rows; row++) {
        const assigned = cards.filter((c) => layout.get(c.id) === row).sort((a, b) => a.x - b.x);
        for (let i = 1; i < assigned.length; i++) {
          const previous = assigned[i - 1], current = assigned[i];
          assert.ok(current.x - current.width / 2 >= previous.x + previous.width / 2 + 18);
        }
      }
    }
  }
});
