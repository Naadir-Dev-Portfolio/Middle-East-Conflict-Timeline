type DatedRecord = { date_start: string; date_end?: string | null };

/** Empty calendar space is a display setting, never a fabricated event or research cutoff. */
export function calendarBounds(
  events: DatedRecord[],
  snapshot: { scope_start: string; scope_end: string },
  extendThrough: string,
) {
  let start = snapshot.scope_start;
  let latest = snapshot.scope_end;
  for (const event of events) {
    const first = event.date_start.slice(0, 10);
    const last = (event.date_end ?? event.date_start).slice(0, 10);
    if (first < start) start = first;
    if (last > latest) latest = last;
  }
  return { start, end: latest > extendThrough ? latest : extendThrough, recorded_through: latest };
}
