import { calendarBounds } from './timeline-calendar.ts';
import { mediaType, relationId, validateTimeline, youtubeId } from './timeline-validation.mjs';
import type { TimelineEvent, TimelineFile, TimelineMediaItem, TimelinePayload } from './timeline-types.ts';

/** Pure adapter: the UI has no imports of event data, image filenames or individual event IDs. */
export function loadTimelineData(input: unknown): TimelinePayload {
  const validation = validateTimeline(input);
  if (validation.errors.length) throw new Error(validation.errors.slice(0, 4).join('\n'));
  const file = input as TimelineFile;
  const normalizeDate = (value: string) => value.includes('T') ? new Date(value).toISOString() : value;
  const events: TimelineEvent[] = file.events.map(event => ({
    id: event.id,
    title: event.title,
    date_start: normalizeDate(event.date_start),
    date_end: event.date_end ? normalizeDate(event.date_end) : null,
    precision: event.precision ?? (event.date_start.includes('T') ? 'time' : 'day'),
    summary: event.summary || event.intro || event.details?.[0] || '',
    theatres: event.theatres ?? [],
    actors: event.actors ?? [],
    category: event.category ?? [],
    verification: event.verification ?? 'unreviewed',
    sources: (event.sources ?? []).filter((source, index, all) => all.findIndex(other => other.url === source.url) === index)
      .map(source => ({ ...source, title: source.title || undefined,
        publisher: source.publisher || new URL(source.url).hostname.replace(/^www\./, '') })),
    ...(event.claims ? { claims: event.claims } : {}),
  }));
  const starts = events.map(event => event.date_start.slice(0, 10)).sort();
  const ends = events.map(event => (event.date_end ?? event.date_start).slice(0, 10)).sort();
  const today = new Date().toISOString().slice(0, 10);
  const scope_start = starts[0] ?? today;
  const scope_end = ends.at(-1) ?? today;
  const calendar = calendarBounds(events, { scope_start, scope_end }, file.calendar_end ?? '2028-12-31');
  const payload: TimelinePayload = {
    initial_event_id: file.initial_event_id,
    calendar,
    dataset: {
      title: file.title || 'Conflict timeline',
      version: file.schema_version ?? '2.0',
      cutoff: file.updated_at ?? scope_end,
      timezone: file.timezone ?? 'UTC',
      scope_start, scope_end,
      focus: file.description ?? '',
      granularity: file.granularity ?? '',
      methodology_notes: file.methodology_notes ?? [],
      verification_labels: file.verification_labels ?? {},
    },
    events, editorial: {}, research: {}, media: {}, relations: [],
  };
  for (const event of file.events) {
    if (event.importance !== undefined || event.theme || event.quote || event.editor_note) {
      payload.editorial[event.id] = {
        importance: event.importance,
        theme: event.theme, display_quote: event.quote, editor_note: event.editor_note,
      };
    }
    payload.research[event.id] = {
      deck: event.intro, source_digest: event.context, longform: event.details,
      key_facts: event.key_facts, search_aliases: event.search_aliases,
      reviewed_at: event.reviewed_at, research_note: event.research_note,
    };
    payload.media[event.id] = (event.media ?? []).map(item => {
      const kind = mediaType(item) as TimelineMediaItem['kind'];
      const isPicture = ['image', 'social'].includes(kind);
      return {
        kind,
        src: isPicture ? item.url : undefined,
        href: item.url,
        thumbnail: item.thumbnail_url ?? (kind === 'youtube' ? 'https://i.ytimg.com/vi/' + youtubeId(item.url) + '/hqdefault.jpg' : undefined),
        alt: item.caption || event.title,
        credit: item.credit,
        source_url: item.source_url,
        platform: item.platform ?? (kind === 'youtube' ? 'YouTube' : undefined),
        captions_url: item.captions_url,
      };
    });
    for (const relation of event.relationships ?? []) {
      payload.relations.push({
        id: relationId(event.id, relation), from: event.id, to: relation.to,
        type: relation.type ?? 'contextual_thread',
        label: relation.label || 'Related event',
        summary: relation.summary || '',
        confidence: relation.confidence ?? 'interpretive',
      });
    }
  }
  return payload;
}
