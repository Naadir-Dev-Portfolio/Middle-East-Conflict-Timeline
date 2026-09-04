import type { TimelineEvent, TimelineResearch } from './timeline-types';

/** Match common spellings and abbreviations without changing historical display text. */
export function normalizeSearchText(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replaceAll('.', '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/\b(?:united states(?: of america)?|usa|us)\b/g, 'united states')
    .replace(/\b(?:memorandum(?: of understanding)?|mou)\b/g, 'memorandum')
    .replace(/\b(?:hourmuz|hormouz|ormuz)\b/g, 'hormuz')
    .replace(/\s+/g, ' ');
}

export function eventSearchText(event: TimelineEvent, research?: TimelineResearch) {
  return normalizeSearchText([
    event.id, event.title, research?.display_title, event.summary,
    research?.deck, research?.source_digest, ...(research?.search_aliases ?? []),
    ...(research?.longform ?? []),
    ...(research?.key_facts ?? []).flatMap(fact => [fact.label, fact.value]),
    ...event.theatres, ...event.actors, ...event.category,
    ...[...event.sources, ...(research?.additional_sources ?? [])]
      .flatMap(source => [source.publisher, source.title]),
  ].filter(Boolean).join(' '));
}

export function matchesSearch(text: string, query: string) {
  return normalizeSearchText(query).split(' ').filter(Boolean).every(term => text.includes(term));
}

export function searchRelevance(event: TimelineEvent, research: TimelineResearch | undefined, query: string) {
  const phrase = normalizeSearchText(query);
  if (!phrase) return 0;
  const title = normalizeSearchText(research?.display_title ?? event.title);
  const terms = phrase.split(' ');
  return (title.includes(phrase) ? 10 : 0) + terms.filter(term => title.includes(term)).length;
}
