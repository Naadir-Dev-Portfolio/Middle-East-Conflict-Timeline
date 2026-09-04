export type TimelineSource = {
  publisher: string;
  url: string;
  title?: string;
};

export type TimelineClaim = {
  claim: string;
  status: string;
};

export type TimelineEvent = {
  id: string;
  date_start: string;
  date_end: string | null;
  precision: string;
  title: string;
  summary: string;
  theatres: string[];
  actors: string[];
  category: string[];
  verification: string;
  sources: TimelineSource[];
  claims?: TimelineClaim[];
};

export type TimelineDataset = {
  title: string;
  version: string;
  cutoff: string;
  timezone: string;
  scope_start: string;
  scope_end: string;
  focus: string;
  granularity: string;
  methodology_notes: string[];
  verification_labels: Record<string, string>;
};

export type TimelineEditorial = {
  importance?: 1 | 2 | 3 | 4 | 5;
  theme?: 'military' | 'diplomacy' | 'energy' | 'signals' | 'context';
  display_quote?: string;
  editor_note?: string;
};

export type TimelineResearchFact = {
  label: string;
  value: string;
};

export type TimelineResearch = {
  display_title?: string;
  search_aliases?: string[];
  deck?: string;
  source_digest?: string;
  longform?: string[];
  key_facts?: TimelineResearchFact[];
  additional_sources?: TimelineSource[];
  reviewed_at?: string;
  research_note?: string;
};

export type TimelineMediaItem = {
  kind: 'image' | 'youtube' | 'video' | 'social' | 'document';
  src?: string;
  thumbnail?: string;
  href?: string;
  alt: string;
  credit?: string;
  source_url?: string;
  platform?: string;
  captions_url?: string;
};

export type TimelineRelation = {
  id: string;
  from: string;
  to: string;
  type:
    | 'retaliation'
    | 'precursor'
    | 'escalation'
    | 'deadline_response'
    | 'negotiation'
    | 'implementation'
    | 'breakdown'
    | 'contextual_thread';
  label: string;
  summary: string;
  confidence: 'documented' | 'strong_inference' | 'interpretive';
};

export type TimelinePayload = {
  initial_event_id?: string;
  dataset: TimelineDataset;
  calendar: { start: string; end: string; recorded_through: string };
  events: TimelineEvent[];
  editorial: Record<string, TimelineEditorial>;
  research: Record<string, TimelineResearch>;
  media: Record<string, TimelineMediaItem[]>;
  relations: TimelineRelation[];
};

/** The sole user-editable format, stored in data/timeline.json. */
export type TimelineFileMedia = {
  url: string;
  type?: TimelineMediaItem['kind'];
  caption?: string;
  credit?: string;
  source_url?: string;
  thumbnail_url?: string;
  platform?: string;
  captions_url?: string;
};

export type TimelineFileEvent = Pick<TimelineEvent, 'id' | 'date_start' | 'title'> &
  Partial<Omit<TimelineEvent, 'id' | 'date_start' | 'title' | 'sources'>> & {
    sources?: Array<{ url: string; publisher?: string; title?: string }>;
    intro?: string;
    context?: string;
    details?: string[];
    key_facts?: TimelineResearchFact[];
    search_aliases?: string[];
    reviewed_at?: string;
    research_note?: string;
    importance?: TimelineEditorial['importance'];
    theme?: TimelineEditorial['theme'];
    quote?: string;
    editor_note?: string;
    media?: TimelineFileMedia[];
    relationships?: Array<Pick<TimelineRelation, 'to'> & Partial<Omit<TimelineRelation, 'from' | 'to'>>>;
    revisions?: Array<{ date?: string; reason: string; previous?: Record<string, unknown>; sources?: TimelineSource[] }>;
  };

export type TimelineFile = {
  schema_version?: '2.0';
  title?: string;
  description?: string;
  granularity?: string;
  timezone?: string;
  updated_at?: string;
  calendar_end?: string;
  initial_event_id?: string;
  methodology_notes?: string[];
  verification_labels?: Record<string, string>;
  events: TimelineFileEvent[];
};
