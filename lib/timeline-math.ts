/** The calendar camera is expressed in days, never rounded DOM scroll pixels. */
export type TimelineCamera = {
  centerDay: number;
  scale: number;
  width: number;
};

export const MIN_TIMELINE_SCALE = 0.08;
export const MAX_TIMELINE_SCALE = 1920;
export const MIN_READING_SCALE = 0.3;
export const MAX_READING_SCALE = 1.8;

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Exact ten-percent steps keep both reading controls reversible at their limits. */
export function stepReadingScale(value: number, direction: -1 | 1) {
  return Math.round(clamp(value + direction * 0.1, MIN_READING_SCALE, MAX_READING_SCALE) * 10) / 10;
}

export function dayAtX(camera: TimelineCamera, x: number) {
  return camera.centerDay + (x - camera.width / 2) / camera.scale;
}

export function xAtDay(camera: TimelineCamera, day: number) {
  return (day - camera.centerDay) * camera.scale + camera.width / 2;
}

/** Keep the precise (including fractional) day at x stationary while scaling. */
export function zoomCamera(
  camera: TimelineCamera,
  requestedScale: number,
  x = camera.width / 2,
  anchorDay = dayAtX(camera, x),
): TimelineCamera {
  const scale = clamp(requestedScale, MIN_TIMELINE_SCALE, MAX_TIMELINE_SCALE);
  return {
    ...camera,
    scale,
    centerDay: anchorDay - (x - camera.width / 2) / scale,
  };
}

export function panCamera(camera: TimelineCamera, pixels: number, totalDays: number) {
  return {
    ...camera,
    // The first and last recorded days can both reach the centre of the view.
    centerDay: clamp(camera.centerDay + pixels / camera.scale, 0, totalDays),
  };
}

/** From a blank calendar day, continue chronologically instead of restarting the ledger. */
export function adjacentEventIndex(days: number[], selectedIndex: number, cursorDay: number, direction: -1 | 1) {
  if (!days.length) return -1;
  if (selectedIndex >= 0) return clamp(selectedIndex + direction, 0, days.length - 1);
  const next = days.findIndex(day => day > cursorDay);
  if (next < 0) return days.length - 1;
  return clamp(direction === 1 ? next : next - 1, 0, days.length - 1);
}

export function wheelScale(scale: number, delta: number, deltaMode = 0) {
  const pixels = delta * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1);
  // At most 13% per wheel event; trackpad deltas retain their finer resolution.
  return scale * Math.exp(-clamp(pixels, -120, 120) * 0.001);
}

export function rulerScale(startScale: number, distance: number) {
  return startScale * Math.exp(distance / 520);
}

export function scaleForSpan(width: number, days: number, padding = 64) {
  return clamp(
    Math.max(1, width - padding) / Math.max(1, days),
    MIN_TIMELINE_SCALE,
    MAX_TIMELINE_SCALE,
  );
}

export type CardCandidate = {
  id: string;
  x: number;
  width: number;
  importance: number;
  candidate: boolean;
  preferredRow: number;
  selected?: boolean;
};

/** Pack real card intervals, leaving every unlabelled event available as a point. */
export function packCards(items: CardCandidate[], rowCount: number, gap = 18) {
  const occupied: Array<Array<{ left: number; right: number }>> = Array.from(
    { length: rowCount }, () => [],
  );
  const result = new Map<string, number>();
  const priority = [...items].sort((a, b) =>
    Number(Boolean(b.selected)) - Number(Boolean(a.selected)) ||
    b.importance - a.importance || a.x - b.x || a.id.localeCompare(b.id),
  );
  for (const item of priority) {
    if (!item.candidate) continue;
    const left = item.x - item.width / 2;
    const right = item.x + item.width / 2;
    const order = Array.from({ length: rowCount }, (_, i) =>
      (item.preferredRow + i) % rowCount,
    );
    const row = order.find((index) => occupied[index].every((other) =>
      right + gap <= other.left || left >= other.right + gap,
    ));
    if (row === undefined) continue;
    occupied[row].push({ left, right });
    result.set(item.id, row);
  }
  return result;
}
