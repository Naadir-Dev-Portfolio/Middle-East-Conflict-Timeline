const VERIFICATION = new Set(['confirmed', 'legal_diplomatic', 'attribution_disputed', 'official_claim', 'unverified_contradicted', 'unreviewed']);
const THEMES = new Set(['military', 'diplomacy', 'energy', 'signals', 'context']);
const MEDIA = new Set(['image', 'youtube', 'video', 'social', 'document']);
const RELATIONS = new Set(['retaliation', 'precursor', 'escalation', 'deadline_response', 'negotiation', 'implementation', 'breakdown', 'contextual_thread']);
const CONFIDENCE = new Set(['documented', 'strong_inference', 'interpretive']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const stableId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);

/** Dates are calendar days, or ISO timestamps with an explicit UTC offset. */
export function validDate(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/);
  if (!match) return false;
  const midnight = Date.parse(match[1] + 'T00:00:00Z');
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== match[1]) return false;
  if (match[2] && (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59)) return false;
  if (match[5] && match[5] !== 'Z') {
    const hours = Number(match[5].slice(1, 3)), minutes = Number(match[5].slice(4));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return false;
  }
  return Number.isFinite(Date.parse(value));
}

export function webUrl(value) {
  if (typeof value !== 'string' || value.trim() !== value) return false;
  for (let index = 0; index < value.length; index++) if (value.charCodeAt(index) <= 32) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function youtubeId(value) {
  if (!webUrl(value)) return null;
  const url = new URL(value);
  const host = url.hostname.replace(/^www\./, '');
  if (!['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const id = host === 'youtu.be' ? parts[0]
    : url.pathname === '/watch' ? url.searchParams.get('v')
      : ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : null;
  return /^[\w-]{11}$/.test(id ?? '') ? id : null;
}

export function mediaType(item) {
  if (item.type) return item.type;
  if (youtubeId(item.url)) return 'youtube';
  try {
    if (/\.(mp4|webm|ogv)$/i.test(new URL(item.url).pathname)) return 'video';
    if (/\.pdf$/i.test(new URL(item.url).pathname)) return 'document';
  } catch { /* Validation reports malformed URLs. */ }
  return 'image';
}

export function relationId(from, relation) {
  return relation.id ?? [from, relation.type ?? 'contextual_thread', relation.to].join('--');
}

/** Validate the one editable file without changing it. Only id, date_start and title are required per event. */
export function validateTimeline(file) {
  const errors = [], warnings = [];
  const counts = { events: 0, dossiers: 0, mediaEvents: 0, media: 0, relations: 0, revisions: 0 };
  const fail = (label, message) => errors.push(label + ': ' + message);
  const list = (value, label) => {
    if (!Array.isArray(value)) { fail(label, 'must be an array'); return []; }
    return value;
  };
  const optionalText = (entry, keys, label) => {
    for (const key of keys) if (entry[key] !== undefined && typeof entry[key] !== 'string') fail(label, key + ' must be text');
  };
  const textList = (value, label) => {
    if (list(value, label).some(item => !nonempty(item))) fail(label, 'must contain non-empty text values');
  };
  const date = (value, label, dayOnly = false) => {
    if (!validDate(value) || (dayOnly && value.length !== 10)) fail(label, dayOnly
      ? 'must be a real YYYY-MM-DD date' : 'must be YYYY-MM-DD or an ISO timestamp with Z or a UTC offset');
  };
  const sources = (value, label) => {
    for (const [index, source] of list(value, label).entries()) {
      if (!object(source)) { fail(label + '[' + index + ']', 'must be an object'); continue; }
      if (!webUrl(source.url)) fail(label + '[' + index + ']', 'url must be an HTTP(S) URL');
      optionalText(source, ['publisher', 'title'], label + '[' + index + ']');
    }
  };

  if (!object(file)) return { errors: ['timeline.json must be an object with an events array'], warnings, counts };
  if (file.schema_version !== undefined && file.schema_version !== '2.0') fail('schema_version', 'expected "2.0"');
  optionalText(file, ['title', 'description', 'granularity', 'timezone'], 'timeline');
  if (file.calendar_end !== undefined) date(file.calendar_end, 'calendar_end', true);
  if (file.updated_at !== undefined) date(file.updated_at, 'updated_at');
  if (file.methodology_notes !== undefined) textList(file.methodology_notes, 'methodology_notes');
  if (file.verification_labels !== undefined && (!object(file.verification_labels)
    || Object.values(file.verification_labels).some(value => !nonempty(value)))) fail('verification_labels', 'must map labels to descriptions');
  if (file.timezone !== undefined) {
    try { new Intl.DateTimeFormat('en', { timeZone: file.timezone }).format(); }
    catch { fail('timezone', 'must be an IANA timezone such as UTC or Europe/London'); }
  }

  const events = list(file.events, 'events');
  counts.events = events.length;
  const ids = new Set();
  for (const [index, event] of events.entries()) {
    if (!object(event)) { fail('events[' + index + ']', 'must be an object'); continue; }
    const label = nonempty(event.id) ? event.id : 'events[' + index + ']';
    if (!stableId(event.id)) fail(label, 'id must be stable text using letters, digits, hyphens, underscores or dots');
    if (ids.has(event.id)) fail(label, 'duplicate event ID');
    ids.add(event.id);
    if (!nonempty(event.title)) fail(label, 'title is required');
    date(event.date_start, label + ' date_start');
    if (event.date_end != null) {
      date(event.date_end, label + ' date_end');
      if (Date.parse(event.date_end) < Date.parse(event.date_start)) fail(label, 'date_end is before date_start');
    }
    optionalText(event, ['precision', 'summary', 'intro', 'context', 'quote', 'editor_note', 'research_note'], label);
    for (const field of ['theatres', 'actors', 'category', 'details', 'search_aliases']) {
      if (event[field] !== undefined) textList(event[field], label + ' ' + field);
    }
    if (event.verification !== undefined && !VERIFICATION.has(event.verification)) fail(label, 'unknown verification "' + event.verification + '"');
    if (event.importance !== undefined && (!Number.isInteger(event.importance) || event.importance < 1 || event.importance > 5)) fail(label, 'importance must be an integer from 1 to 5');
    if (event.theme !== undefined && !THEMES.has(event.theme)) fail(label, 'unknown theme');
    if (event.reviewed_at !== undefined) date(event.reviewed_at, label + ' reviewed_at', true);
    if (event.sources !== undefined) sources(event.sources, label + ' sources');
    if (!event.sources?.length) warnings.push(label + ': no source attached yet');
    if (Array.isArray(event.details) && event.details.length) counts.dossiers++;
    if (event.key_facts !== undefined) {
      for (const fact of list(event.key_facts, label + ' key_facts')) {
        if (!object(fact) || !nonempty(fact.label) || !nonempty(fact.value)) fail(label, 'key_facts require label and value text');
      }
    }
    if (event.claims !== undefined) {
      for (const claim of list(event.claims, label + ' claims')) {
        if (!object(claim) || !nonempty(claim.claim) || !nonempty(claim.status)) fail(label, 'claims require claim and status text');
      }
    }
    if (event.media !== undefined) {
      const items = list(event.media, label + ' media');
      if (items.length) counts.mediaEvents++;
      counts.media += items.length;
      for (const [mediaIndex, item] of items.entries()) {
        const mediaLabel = label + ' media[' + mediaIndex + ']';
        if (!object(item)) { fail(mediaLabel, 'must be an object with a url'); continue; }
        if (!webUrl(item.url)) fail(mediaLabel, 'url must be an HTTP(S) URL, not a local file');
        if (!MEDIA.has(mediaType(item))) fail(mediaLabel, 'unknown media type');
        if (mediaType(item) === 'youtube' && !youtubeId(item.url)) fail(mediaLabel, 'requires a valid YouTube video URL');
        optionalText(item, ['caption', 'credit', 'platform'], mediaLabel);
        for (const field of ['thumbnail_url', 'source_url', 'captions_url']) {
          if (item[field] !== undefined && !webUrl(item[field])) fail(mediaLabel, field + ' must be an HTTP(S) URL');
        }
      }
    }
    if (event.revisions !== undefined) {
      const revisions = list(event.revisions, label + ' revisions');
      counts.revisions += revisions.length;
      for (const revision of revisions) {
        if (!object(revision)) { fail(label, 'each revision must be an object'); continue; }
        if (!nonempty(revision.reason)) fail(label, 'revision reason is required');
        if (revision.date !== undefined) date(revision.date, label + ' revision date', true);
        if (revision.previous !== undefined && !object(revision.previous)) fail(label, 'revision previous must be an object');
        if (revision.sources !== undefined) sources(revision.sources, label + ' revision sources');
      }
    }
  }

  if (file.initial_event_id !== undefined && !ids.has(file.initial_event_id)) warnings.push('initial_event_id does not exist; the newest event will be selected instead');
  const relationIds = new Set();
  for (const event of events.filter(object)) {
    if (event.relationships === undefined) continue;
    for (const relation of list(event.relationships, event.id + ' relationships')) {
      counts.relations++;
      const label = event.id + ' relationship';
      if (!object(relation)) { fail(label, 'must be an object with a to event ID'); continue; }
      const id = relationId(event.id, relation);
      if (!stableId(id) || relationIds.has(id)) fail(label, 'requires a unique stable ID (or unique to/type pair)');
      relationIds.add(id);
      if (!ids.has(relation.to)) fail(label, 'to must reference an existing event: ' + relation.to);
      if (event.id === relation.to) fail(label, 'cannot link an event to itself');
      if (relation.type !== undefined && !RELATIONS.has(relation.type)) fail(label, 'unknown relation type');
      if (relation.confidence !== undefined && !CONFIDENCE.has(relation.confidence)) fail(label, 'unknown confidence');
      optionalText(relation, ['label', 'summary'], label);
    }
  }
  return { errors, warnings, counts };
}
