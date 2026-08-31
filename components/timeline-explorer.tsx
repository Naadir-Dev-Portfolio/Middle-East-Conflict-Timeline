'use client';

import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clipboard,
  ExternalLink,
  Filter,
  Info,
  Landmark,
  Menu,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Ship,
  Sparkles,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type TimelineSource = {
  publisher: string;
  url: string;
};

type TimelineClaim = {
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

export type TimelinePayload = {
  dataset: {
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
  events: TimelineEvent[];
};

type RegionGroup = {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  matches: string[];
};

const REGIONS: RegionGroup[] = [
  {
    id: 'all',
    label: 'All theatres',
    shortLabel: 'All',
    color: '#d98c2e',
    matches: [],
  },
  {
    id: 'iran',
    label: 'Iran',
    shortLabel: 'Iran',
    color: '#d98c2e',
    matches: ['Iran', 'Tehran', 'Kharg Island', 'Larak Island', 'Minab'],
  },
  {
    id: 'united-states',
    label: 'United States',
    shortLabel: 'U.S.',
    color: '#5f91b5',
    matches: ['United States'],
  },
  {
    id: 'israel',
    label: 'Israel',
    shortLabel: 'Israel',
    color: '#7f70b0',
    matches: ['Israel'],
  },
  {
    id: 'gaza',
    label: 'Gaza / Palestine',
    shortLabel: 'Gaza',
    color: '#bc6956',
    matches: ['Gaza', 'Rafah', 'West Bank', 'Palestine'],
  },
  {
    id: 'lebanon',
    label: 'Lebanon',
    shortLabel: 'Lebanon',
    color: '#4f9378',
    matches: ['Lebanon', 'Beirut'],
  },
  {
    id: 'yemen',
    label: 'Yemen',
    shortLabel: 'Yemen',
    color: '#a88442',
    matches: ['Yemen'],
  },
  {
    id: 'iraq',
    label: 'Iraq',
    shortLabel: 'Iraq',
    color: '#9b795b',
    matches: ['Iraq', 'Iraqi Kurdistan', 'Erbil'],
  },
  {
    id: 'gulf',
    label: 'Gulf states',
    shortLabel: 'Gulf',
    color: '#478e95',
    matches: [
      'Bahrain',
      'Kuwait',
      'Oman',
      'Qatar',
      'Saudi Arabia',
      'United Arab Emirates',
      'Al Minhad Air Base',
    ],
  },
  {
    id: 'maritime',
    label: 'Maritime routes',
    shortLabel: 'Maritime',
    color: '#327f91',
    matches: ['Strait of Hormuz', 'Red Sea', 'Persian Gulf'],
  },
];

const VERIFICATION_STYLES: Record<
  string,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  confirmed: {
    label: 'Confirmed',
    className: 'border-emerald-700/20 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
  legal_diplomatic: {
    label: 'Legal / diplomatic',
    className: 'border-sky-700/20 bg-sky-50 text-sky-800',
    icon: Landmark,
  },
  attribution_disputed: {
    label: 'Attribution disputed',
    className: 'border-amber-700/20 bg-amber-50 text-amber-800',
    icon: ShieldAlert,
  },
  official_claim: {
    label: 'Official claim',
    className: 'border-violet-700/20 bg-violet-50 text-violet-800',
    icon: Info,
  },
  unverified_contradicted: {
    label: 'Unverified / contradicted',
    className: 'border-rose-700/20 bg-rose-50 text-rose-800',
    icon: ShieldAlert,
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  airstrike: 'Airstrikes',
  assassination: 'Assassinations',
  ceasefire: 'Ceasefires',
  diplomacy: 'Diplomacy',
  drone_attack: 'Drone attacks',
  energy: 'Energy',
  escalation: 'Escalation',
  legal: 'Legal',
  maritime: 'Maritime',
  mediation: 'Mediation',
  military: 'Military',
  missile_attack: 'Missile attacks',
  nuclear: 'Nuclear',
  retaliation: 'Retaliation',
  sanctions: 'Sanctions',
  shipping: 'Shipping',
};

const FEATURED_CATEGORIES = [
  'military',
  'diplomacy',
  'airstrike',
  'maritime',
  'missile_attack',
  'ceasefire',
  'nuclear',
  'legal',
];

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeDate(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function formatDate(value: string, precision = 'day') {
  const date = safeDate(value);
  if (precision === 'year') return String(date.getUTCFullYear());
  if (precision === 'month') {
    return new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatCutoff(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
    timeZoneName: 'short',
  }).format(new Date(value));
}

function eventMatchesRegion(event: TimelineEvent, region: RegionGroup) {
  if (region.id === 'all') return true;
  return event.theatres.some((theatre) => region.matches.includes(theatre));
}

function accentForEvent(event: TimelineEvent, activeRegion: string) {
  const selected = REGIONS.find((region) => region.id === activeRegion);
  if (selected && selected.id !== 'all') return selected.color;
  return (
    REGIONS.slice(1).find((region) => eventMatchesRegion(event, region))?.color ??
    '#7b817f'
  );
}

function verificationFor(value: string) {
  return (
    VERIFICATION_STYLES[value] ?? {
      label: titleCase(value),
      className: 'border-stone-300 bg-stone-100 text-stone-700',
      icon: Info,
    }
  );
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function EventStatus({ value }: { value: string }) {
  const status = verificationFor(value);
  const Icon = status.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${status.className}`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {status.label}
    </span>
  );
}

function EmptyState({ reset }: { reset: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#c9bfaf] bg-[#fffdf8] px-6 py-16 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#ede7db] text-[#766d60]">
        <Search className="size-5" />
      </span>
      <h3 className="mt-4 font-[Georgia,serif] text-2xl text-[#172127]">
        No events match this view
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#746d62]">
        Try a broader theatre, another year, or remove one of the active filters.
      </p>
      <Button className="mt-5" variant="outline" onClick={reset}>
        <RotateCcw /> Reset filters
      </Button>
    </div>
  );
}

function EventDetail({
  event,
  data,
  copied,
  onCopy,
}: {
  event: TimelineEvent;
  data: TimelinePayload;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="pb-10">
      <div className="relative h-52 overflow-hidden border-b border-white/10 bg-[#102028] sm:h-64">
        <img
          src="/atlas-map.png"
          alt="Editorial map texture with linked nodes across the region"
          className="h-full w-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d151a] via-[#0d151a]/20 to-transparent" />
        <div className="absolute inset-x-5 bottom-5 flex flex-wrap items-end justify-between gap-3 text-white sm:inset-x-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
              Event record
            </p>
            <p className="mt-1 font-mono text-sm">
              {formatDate(event.date_start, event.precision)}
              {event.date_end ? ` — ${formatDate(event.date_end)}` : ''}
            </p>
          </div>
          <EventStatus value={event.verification} />
        </div>
      </div>

      <div className="px-5 pt-6 sm:px-7">
        <div className="flex flex-wrap gap-2">
          {event.theatres.map((theatre) => (
            <Badge
              key={theatre}
              variant="secondary"
              className="bg-[#ede7db] text-[#554f46]"
            >
              {theatre}
            </Badge>
          ))}
        </div>

        <h2 className="mt-4 font-[Georgia,serif] text-3xl leading-[1.08] tracking-[-0.025em] text-[#172127] sm:text-4xl">
          {event.title}
        </h2>
        <p className="mt-4 text-[15px] leading-7 text-[#5f594f]">
          {event.summary}
        </p>

        <div className="mt-6 rounded-xl border border-[#d9d2c5] bg-[#f7f2e8] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#926122]" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6d4a20]">
                Verification note
              </p>
              <p className="mt-1.5 text-sm leading-6 text-[#625b50]">
                {data.dataset.verification_labels[event.verification] ??
                  'See the cited sources for the record’s verification context.'}
              </p>
            </div>
          </div>
        </div>

        {event.claims && event.claims.length > 0 ? (
          <section className="mt-7" aria-labelledby="claims-heading">
            <h3
              id="claims-heading"
              className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#777064]"
            >
              Claims retained in the record
            </h3>
            <div className="mt-3 space-y-2">
              {event.claims.map((claim) => (
                <div
                  key={`${claim.claim}-${claim.status}`}
                  className="rounded-xl border border-amber-700/15 bg-amber-50/70 p-4"
                >
                  <p className="text-sm leading-6 text-[#554f46]">{claim.claim}</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                    Status · {titleCase(claim.status)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-7 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#777064]">
              Actors
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {event.actors.map((actor) => (
                <span
                  key={actor}
                  className="rounded-lg border border-[#d9d2c5] bg-white px-2.5 py-1.5 text-xs text-[#554f46]"
                >
                  {actor}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#777064]">
              Event types
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {event.category.map((category) => (
                <span
                  key={category}
                  className="rounded-lg bg-[#172127] px-2.5 py-1.5 text-xs text-white"
                >
                  {CATEGORY_LABELS[category] ?? titleCase(category)}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 border-t border-[#d9d2c5] pt-7" aria-labelledby="sources-heading">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9a6826]">
                Evidence trail
              </p>
              <h3 id="sources-heading" className="mt-1 font-[Georgia,serif] text-2xl">
                Sources
              </h3>
            </div>
            <span className="font-mono text-xs text-[#777064]">
              {event.sources.length.toString().padStart(2, '0')}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {event.sources.map((source, index) => (
              <a
                key={`${source.url}-${index}`}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-xl border border-[#d9d2c5] bg-white p-3.5 transition hover:border-[#ad9e88] hover:shadow-[0_8px_22px_rgba(34,32,27,.06)]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#ede7db] font-mono text-[10px] font-semibold text-[#665e52]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#2b3337]">
                    {source.publisher}
                  </span>
                  <span className="block truncate text-xs text-[#7b7469]">
                    {sourceHost(source.url)}
                  </span>
                </span>
                <ExternalLink className="ml-auto size-4 shrink-0 text-[#9a6826] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            ))}
          </div>
        </section>

        <Button className="mt-7 w-full" variant="outline" onClick={onCopy}>
          {copied ? <Check /> : <Clipboard />}
          {copied ? 'Event link copied' : 'Copy link to this event'}
        </Button>
      </div>
    </div>
  );
}

function MethodologyPanel({ data }: { data: TimelinePayload }) {
  const verificationEntries = Object.entries(data.dataset.verification_labels);
  return (
    <div className="px-5 pb-10 sm:px-7">
      <div className="overflow-hidden rounded-2xl border border-[#d9d2c5] bg-[#172127] text-white">
        <div className="relative h-40">
          <img
            src="/atlas-map.png"
            alt="Abstract editorial map of the region"
            className="h-full w-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#172127] via-[#172127]/70 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
              Dataset v{data.dataset.version}
            </p>
            <p className="mt-1 font-[Georgia,serif] text-2xl">How to read the ledger</p>
          </div>
        </div>
      </div>

      <section className="mt-7">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#777064]">
          Scope
        </h3>
        <p className="mt-2 text-sm leading-6 text-[#5f594f]">{data.dataset.focus}</p>
        <p className="mt-3 text-sm leading-6 text-[#5f594f]">{data.dataset.granularity}</p>
      </section>

      <section className="mt-7">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#777064]">
          Editorial notes
        </h3>
        <ol className="mt-3 space-y-3">
          {data.dataset.methodology_notes.map((note, index) => (
            <li key={note} className="flex gap-3 text-sm leading-6 text-[#5f594f]">
              <span className="mt-0.5 font-mono text-[10px] text-[#9a6826]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>{note}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8 border-t border-[#d9d2c5] pt-7">
        <h3 className="font-[Georgia,serif] text-2xl">Verification labels</h3>
        <div className="mt-4 space-y-3">
          {verificationEntries.map(([key, description]) => (
            <div key={key} className="rounded-xl border border-[#d9d2c5] bg-white p-4">
              <EventStatus value={key} />
              <p className="mt-2 text-sm leading-6 text-[#625b50]">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-7 border-t border-[#d9d2c5] pt-5 text-xs leading-5 text-[#777064]">
        Coverage closes at {formatCutoff(data.dataset.cutoff)}. This interface preserves the source JSON as the factual record and adds only navigation and presentation.
      </p>
    </div>
  );
}

export default function TimelineExplorer({ data }: { data: TimelinePayload }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [regionId, setRegionId] = useState('all');
  const [year, setYear] = useState('all');
  const [category, setCategory] = useState('all');
  const [verification, setVerification] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [visibleCount, setVisibleCount] = useState(36);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const years = useMemo(
    () =>
      [...new Set(data.events.map((event) => event.date_start.slice(0, 4)))].sort(
        (a, b) => Number(b) - Number(a),
      ),
    [data.events],
  );

  const regionCounts = useMemo(
    () =>
      Object.fromEntries(
        REGIONS.map((region) => [
          region.id,
          data.events.filter((event) => eventMatchesRegion(event, region)).length,
        ]),
      ),
    [data.events],
  );

  const yearCounts = useMemo(
    () =>
      Object.fromEntries(
        years.map((item) => [
          item,
          data.events.filter((event) => event.date_start.startsWith(item)).length,
        ]),
      ),
    [data.events, years],
  );

  const sourceCount = useMemo(
    () => data.events.reduce((sum, event) => sum + event.sources.length, 0),
    [data.events],
  );

  const theatreCount = useMemo(
    () => new Set(data.events.flatMap((event) => event.theatres)).size,
    [data.events],
  );

  const selectedEvent = selectedId
    ? data.events.find((event) => event.id === selectedId) ?? null
    : null;

  const filteredEvents = useMemo(() => {
    const selectedRegion = REGIONS.find((region) => region.id === regionId) ?? REGIONS[0];
    const terms = deferredQuery.split(/\s+/).filter(Boolean);
    return data.events
      .filter((event) => eventMatchesRegion(event, selectedRegion))
      .filter((event) => year === 'all' || event.date_start.startsWith(year))
      .filter((event) => category === 'all' || event.category.includes(category))
      .filter(
        (event) =>
          verification === 'all' || event.verification === verification,
      )
      .filter((event) => {
        if (terms.length === 0) return true;
        const haystack = [
          event.title,
          event.summary,
          ...event.theatres,
          ...event.actors,
          ...event.category,
          ...event.sources.map((source) => source.publisher),
        ]
          .join(' ')
          .toLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .sort((a, b) => {
        const dateComparison = a.date_start.localeCompare(b.date_start);
        if (dateComparison !== 0) {
          return sortOrder === 'newest' ? -dateComparison : dateComparison;
        }
        return a.title.localeCompare(b.title);
      });
  }, [category, data.events, deferredQuery, regionId, sortOrder, verification, year]);

  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const activeFilterCount = [
    regionId !== 'all',
    year !== 'all',
    category !== 'all',
    verification !== 'all',
    query.length > 0,
  ].filter(Boolean).length;

  useEffect(() => {
    setVisibleCount(36);
  }, [category, deferredQuery, regionId, verification, year]);

  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && data.events.some((event) => event.id === hash)) {
      setSelectedId(hash);
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [data.events]);

  function resetFilters() {
    setQuery('');
    setRegionId('all');
    setYear('all');
    setCategory('all');
    setVerification('all');
    setFiltersOpen(false);
  }

  function openEvent(event: TimelineEvent) {
    setCopied(false);
    setSelectedId(event.id);
    window.history.replaceState(null, '', `#${event.id}`);
  }

  function closeEvent() {
    setSelectedId(null);
    setCopied(false);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  async function copyEventLink() {
    if (!selectedEvent) return;
    const url = `${window.location.origin}${window.location.pathname}#${selectedEvent.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[#f7f4ed] text-[#172127]">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0d151a]/95 text-white shadow-[0_1px_0_rgba(255,255,255,.04)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1680px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex min-w-0 items-center gap-3" aria-label="The Conflict Ledger home">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-amber-300/35 bg-amber-300/10">
              <CircleDot className="size-4 text-amber-300" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight sm:text-base">
                The Conflict Ledger
              </span>
              <span className="hidden text-[9px] uppercase tracking-[0.2em] text-slate-400 sm:block">
                Middle East chronology
              </span>
            </span>
          </a>

          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-300 md:flex">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,.12)]" />
            Data through {formatDate(data.dataset.scope_end)}
          </div>

          <nav className="flex items-center gap-1" aria-label="Site navigation">
            <Button
              variant="ghost"
              className="hidden text-slate-200 hover:bg-white/10 hover:text-white sm:inline-flex"
              onClick={() => setMethodologyOpen(true)}
            >
              <BookOpen /> Methodology
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-200 hover:bg-white/10 hover:text-white sm:hidden"
              onClick={() => setMethodologyOpen(true)}
              aria-label="Open methodology"
            >
              <Menu />
            </Button>
          </nav>
        </div>
      </header>

      <section id="top" className="relative isolate overflow-hidden bg-[#132027] text-white">
        <img
          src="/atlas-map.png"
          alt="Editorial map texture with linked nodes across the Middle East"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-70"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0d151a] via-[#0d151a]/90 to-[#0d151a]/25" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0d151a]/90 via-transparent to-transparent" />
        <div className="mx-auto grid min-h-[280px] max-w-[1680px] items-end gap-8 px-5 py-8 sm:min-h-[320px] sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-10">
          <div className="max-w-4xl">
            <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300 sm:text-xs">
              <Sparkles className="size-3.5" /> Sourced chronology · Dataset v{data.dataset.version}
            </p>
            <h1 className="font-[Georgia,serif] text-[clamp(2.5rem,6vw,5.6rem)] leading-[0.94] tracking-[-0.045em] text-[#fff9ed]">
              Follow the fault lines.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
              Explore {data.events.length} documented military, diplomatic, legal and maritime events across an interconnected regional conflict.
            </p>
          </div>

          <div className="grid grid-cols-3 divide-x divide-white/15 border-y border-white/15 bg-[#0d151a]/30 py-4 text-center backdrop-blur-sm">
            <div>
              <strong className="block font-[Georgia,serif] text-2xl sm:text-3xl">{data.events.length}</strong>
              <span className="text-[9px] uppercase tracking-[0.18em] text-slate-400">Events</span>
            </div>
            <div>
              <strong className="block font-[Georgia,serif] text-2xl sm:text-3xl">{sourceCount}</strong>
              <span className="text-[9px] uppercase tracking-[0.18em] text-slate-400">Sources</span>
            </div>
            <div>
              <strong className="block font-[Georgia,serif] text-2xl sm:text-3xl">{theatreCount}</strong>
              <span className="text-[9px] uppercase tracking-[0.18em] text-slate-400">Theatres</span>
            </div>
          </div>
        </div>
      </section>

      <section className="sticky top-16 z-40 border-b border-[#d8d0c2] bg-[#f7f4ed]/95 shadow-[0_8px_22px_rgba(36,32,24,.04)] backdrop-blur-xl" aria-label="Timeline controls">
        <div className="mx-auto flex max-w-[1680px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="relative min-w-0 flex-1 lg:max-w-2xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#81796d]" />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search events, actors, theatres or sources…"
              className="h-11 rounded-full border-[#c9bfaf] bg-[#fffdf8] pl-10 pr-10 shadow-none placeholder:text-[#90887c]"
              aria-label="Search timeline events"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-[#777064] hover:bg-black/5"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            ) : (
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#d6cec1] bg-[#f4f0e8] px-1.5 py-0.5 font-mono text-[10px] text-[#827a6e]">/</kbd>
            )}
          </div>

          <NativeSelect
            value={year}
            onChange={(event) => setYear(event.target.value)}
            className="hidden sm:block [&_[data-slot=native-select]]:h-11 [&_[data-slot=native-select]]:min-w-[126px] [&_[data-slot=native-select]]:rounded-full [&_[data-slot=native-select]]:border-[#c9bfaf] [&_[data-slot=native-select]]:bg-[#fffdf8]"
            aria-label="Filter by year"
          >
            <NativeSelectOption value="all">All years</NativeSelectOption>
            {years.map((item) => (
              <NativeSelectOption key={item} value={item}>
                {item} · {yearCounts[item]}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <Button
            variant="outline"
            className="relative h-11 rounded-full border-[#c9bfaf] bg-[#fffdf8] px-3 sm:px-4"
            onClick={() => setFiltersOpen((current) => !current)}
            aria-expanded={filtersOpen}
          >
            <Filter />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 ? (
              <span className="grid size-5 place-items-center rounded-full bg-[#172127] font-mono text-[10px] text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        </div>

        {filtersOpen ? (
          <div className="border-t border-[#ddd5c8] bg-[#f1ece2]">
            <div className="mx-auto grid max-w-[1680px] gap-5 px-4 py-4 sm:px-6 lg:grid-cols-[1fr_1fr_auto] lg:px-8">
              <div>
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#776f64]">Event type</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant={category === 'all' ? 'default' : 'outline'}
                    onClick={() => setCategory('all')}
                  >
                    All types
                  </Button>
                  {FEATURED_CATEGORIES.map((item) => (
                    <Button
                      key={item}
                      size="sm"
                      variant={category === item ? 'default' : 'outline'}
                      onClick={() => setCategory(item)}
                      className={category === item ? '' : 'bg-[#fffdf8]'}
                    >
                      {CATEGORY_LABELS[item] ?? titleCase(item)}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#776f64]">Verification</p>
                <NativeSelect
                  value={verification}
                  onChange={(event) => setVerification(event.target.value)}
                  className="w-full [&_[data-slot=native-select]]:h-9 [&_[data-slot=native-select]]:bg-[#fffdf8]"
                  aria-label="Filter by verification status"
                >
                  <NativeSelectOption value="all">All verification labels</NativeSelectOption>
                  {Object.keys(data.dataset.verification_labels).map((item) => (
                    <NativeSelectOption key={item} value={item}>
                      {verificationFor(item).label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex items-end justify-end">
                <Button variant="ghost" onClick={resetFilters} disabled={activeFilterCount === 0}>
                  <RotateCcw /> Reset all
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <div className="border-b border-[#d9d2c5] bg-[#fffdf8] lg:hidden">
        <nav className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Theatre filters">
          {REGIONS.map((region) => (
            <button
              key={region.id}
              type="button"
              onClick={() => setRegionId(region.id)}
              aria-pressed={regionId === region.id}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition ${regionId === region.id ? 'border-[#172127] bg-[#172127] text-white' : 'border-[#d9d2c5] bg-[#f7f4ed] text-[#5e584f]'}`}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: region.color }} />
              {region.shortLabel}
              <span className={regionId === region.id ? 'text-slate-400' : 'text-[#8a8276]'}>{regionCounts[region.id]}</span>
            </button>
          ))}
        </nav>
      </div>

      <div id="timeline" className="mx-auto grid max-w-[1680px] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[#d9d2c5] bg-[#faf8f2] lg:block">
          <div className="sticky top-[145px] max-h-[calc(100vh-165px)] overflow-y-auto p-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9a6826]">Navigate</p>
                <h2 className="mt-1 font-[Georgia,serif] text-2xl">By theatre</h2>
              </div>
              <Ship className="size-4 text-[#8b8172]" />
            </div>

            <nav className="mt-5 space-y-1" aria-label="Theatre filters">
              {REGIONS.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => setRegionId(region.id)}
                  aria-pressed={regionId === region.id}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${regionId === region.id ? 'bg-[#172127] text-white shadow-sm' : 'text-[#4f4a43] hover:bg-[#eee9df]'}`}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: region.color }} />
                  <span className="min-w-0 flex-1 truncate">{region.label}</span>
                  <span className={`font-mono text-[10px] ${regionId === region.id ? 'text-slate-400' : 'text-[#938a7d]'}`}>{regionCounts[region.id]}</span>
                </button>
              ))}
            </nav>

            <div className="mt-8 border-t border-[#d9d2c5] pt-6">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#777064]">Coverage by year</p>
              <div className="mt-4 space-y-2.5">
                {years.map((item) => {
                  const width = Math.max(5, (yearCounts[item] / data.events.length) * 100);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setYear(year === item ? 'all' : item)}
                      className="group block w-full text-left"
                      aria-pressed={year === item}
                    >
                      <span className="flex items-center justify-between font-mono text-[10px] text-[#756e63]">
                        <span className={year === item ? 'font-bold text-[#172127]' : ''}>{item}</span>
                        <span>{yearCounts[item]}</span>
                      </span>
                      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-[#e6dfd3]">
                        <span
                          className={`block h-full rounded-full transition-all ${year === item ? 'bg-[#d98c2e]' : 'bg-[#9da19d] group-hover:bg-[#c49452]'}`}
                          style={{ width: `${width}%` }}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMethodologyOpen(true)}
              className="mt-8 w-full rounded-xl border border-[#d9d2c5] bg-[#fffdf8] p-4 text-left transition hover:border-[#b7aa97]"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-[#514b42]">
                <ShieldCheck className="size-4 text-[#9a6826]" /> Verification guide
              </span>
              <span className="mt-1.5 block text-[11px] leading-4 text-[#80786c]">See how claims, legal actions and disputed attributions are labelled.</span>
            </button>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-6 sm:px-7 sm:py-8 lg:px-10 xl:px-14">
          <div className="mx-auto max-w-[1050px]">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#d9d2c5] pb-5">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-[#9a6826]">
                  <CalendarDays className="size-3.5" /> Master timeline
                </div>
                <h2 className="mt-1.5 font-[Georgia,serif] text-3xl tracking-[-0.02em] sm:text-4xl">
                  {REGIONS.find((region) => region.id === regionId)?.label ?? 'All theatres'}
                </h2>
                <p className="mt-2 text-sm text-[#756e63]" aria-live="polite">
                  Showing {Math.min(visibleEvents.length, filteredEvents.length)} of {filteredEvents.length} matching events
                </p>
              </div>

              <div className="flex items-center gap-2">
                {activeFilterCount > 0 ? (
                  <Button variant="ghost" onClick={resetFilters} className="text-[#746d62]">
                    <X /> Clear
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="border-[#c9bfaf] bg-[#fffdf8]"
                  onClick={() => setSortOrder((current) => (current === 'newest' ? 'oldest' : 'newest'))}
                >
                  {sortOrder === 'newest' ? <ArrowDown /> : <ArrowUp />}
                  {sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
                </Button>
              </div>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="mt-7"><EmptyState reset={resetFilters} /></div>
            ) : (
              <div className="relative mt-7 before:absolute before:bottom-8 before:left-[82px] before:top-3 before:w-px before:bg-[#cfc6b7] sm:before:left-[122px]">
                {visibleEvents.map((event, index) => {
                  const previous = visibleEvents[index - 1];
                  const currentYear = event.date_start.slice(0, 4);
                  const isYearBreak = !previous || previous.date_start.slice(0, 4) !== currentYear;
                  const accent = accentForEvent(event, regionId);
                  return (
                    <Fragment key={event.id}>
                      {isYearBreak ? (
                        <div className="relative grid grid-cols-[68px_minmax(0,1fr)] gap-7 pb-4 pt-2 sm:grid-cols-[108px_minmax(0,1fr)]">
                          <div className="text-right font-[Georgia,serif] text-xl text-[#172127]">{currentYear}</div>
                          <span className="absolute left-[78px] top-4 size-2 -translate-x-1/2 rounded-full bg-[#172127] ring-4 ring-[#f7f4ed] sm:left-[118px]" />
                          <div className="flex items-center gap-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8a8276]">
                            <span className="h-px flex-1 bg-[#d9d2c5]" />
                            {yearCounts[currentYear]} event{yearCounts[currentYear] === 1 ? '' : 's'}
                          </div>
                        </div>
                      ) : null}

                      <article className="group relative grid grid-cols-[68px_minmax(0,1fr)] gap-7 pb-4 sm:grid-cols-[108px_minmax(0,1fr)]">
                        <time
                          dateTime={event.date_start}
                          className="pt-5 text-right font-mono text-[10px] uppercase leading-4 text-[#716a5f] sm:text-[11px]"
                        >
                          <span className="block sm:hidden">
                            {new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(safeDate(event.date_start))}
                          </span>
                          <span className="hidden sm:block">{formatDate(event.date_start, event.precision)}</span>
                        </time>
                        <span
                          className="absolute left-[78px] top-6 size-2.5 -translate-x-1/2 rounded-full border-2 border-[#f7f4ed] shadow-[0_0_0_1px_rgba(23,33,39,.14)] sm:left-[118px]"
                          style={{ backgroundColor: accent }}
                        />

                        <button
                          type="button"
                          onClick={() => openEvent(event)}
                          className="relative min-w-0 overflow-hidden rounded-2xl border border-[#d9d2c5] bg-[#fffdf8] p-4 text-left shadow-[0_1px_0_rgba(31,27,21,.03)] transition duration-200 hover:-translate-y-0.5 hover:border-[#b7aa97] hover:shadow-[0_12px_28px_rgba(41,36,26,.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d98c2e] focus-visible:ring-offset-2 sm:p-5"
                          aria-label={`Open event: ${event.title}`}
                        >
                          <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} />
                          <span className="mb-3 flex flex-wrap items-center gap-2 pl-1">
                            {event.theatres.slice(0, 3).map((theatre) => (
                              <Badge key={theatre} variant="secondary" className="bg-[#eee8dc] text-[#5b554b]">
                                {theatre}
                              </Badge>
                            ))}
                            {event.theatres.length > 3 ? (
                              <span className="text-[10px] text-[#8b8377]">+{event.theatres.length - 3}</span>
                            ) : null}
                            <span className="ml-auto hidden sm:inline-flex"><EventStatus value={event.verification} /></span>
                          </span>
                          <span className="block pl-1 font-[Georgia,serif] text-xl leading-snug tracking-[-0.015em] text-[#172127] sm:text-2xl">
                            {event.title}
                          </span>
                          <span className="mt-2 line-clamp-3 block pl-1 text-sm leading-6 text-[#655f55] sm:line-clamp-2">
                            {event.summary}
                          </span>
                          <span className="mt-4 flex items-center gap-2 border-t border-[#e5ded2] pl-1 pt-3 text-[10px] uppercase tracking-[0.12em] text-[#7b7469]">
                            <span>{event.sources.length} source{event.sources.length === 1 ? '' : 's'}</span>
                            <span aria-hidden="true">·</span>
                            <span>{CATEGORY_LABELS[event.category[0]] ?? titleCase(event.category[0])}</span>
                            <span className="ml-auto flex items-center gap-1 font-semibold text-[#8d5e21]">
                              Read record <ArrowUpRight className="size-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </span>
                          </span>
                        </button>
                      </article>
                    </Fragment>
                  );
                })}
              </div>
            )}

            {visibleCount < filteredEvents.length ? (
              <div className="mt-6 flex justify-center border-t border-[#d9d2c5] pt-7">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11 rounded-full border-[#c9bfaf] bg-[#fffdf8] px-6"
                  onClick={() => setVisibleCount((current) => current + 36)}
                >
                  Load 36 more <ChevronDown />
                </Button>
              </div>
            ) : null}

            <footer className="mt-12 overflow-hidden rounded-2xl bg-[#172127] text-white">
              <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="absolute inset-y-0 right-0 w-1/2 opacity-15">
                  <img src="/atlas-map.png" alt="" className="h-full w-full object-cover" />
                </div>
                <div className="relative max-w-2xl">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">About this record</p>
                  <h2 className="mt-2 font-[Georgia,serif] text-3xl">A chronology, not a causal narrative.</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{data.dataset.granularity}</p>
                </div>
                <Button
                  className="relative bg-[#f7f4ed] text-[#172127] hover:bg-white"
                  onClick={() => setMethodologyOpen(true)}
                >
                  Read methodology <ArrowUpRight />
                </Button>
              </div>
            </footer>
          </div>
        </section>
      </div>

      <Sheet
        open={Boolean(selectedEvent)}
        onOpenChange={(open) => {
          if (!open) closeEvent();
        }}
      >
        <SheetContent
          side="right"
          showCloseButton
          className="w-full gap-0 overflow-y-auto border-l-[#c9bfaf] bg-[#f7f4ed] p-0 sm:max-w-[620px]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{selectedEvent?.title ?? 'Event details'}</SheetTitle>
            <SheetDescription>Full event record, verification note, actors and sources.</SheetDescription>
          </SheetHeader>
          {selectedEvent ? (
            <EventDetail
              event={selectedEvent}
              data={data}
              copied={copied}
              onCopy={copyEventLink}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={methodologyOpen} onOpenChange={setMethodologyOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-l-[#c9bfaf] bg-[#f7f4ed] p-0 sm:max-w-[600px]"
        >
          <SheetHeader className="px-5 pb-3 pt-6 sm:px-7">
            <SheetTitle className="font-[Georgia,serif] text-3xl">Methodology & scope</SheetTitle>
            <SheetDescription>
              The labels and editorial rules carried through from the source dataset.
            </SheetDescription>
          </SheetHeader>
          <MethodologyPanel data={data} />
        </SheetContent>
      </Sheet>
    </main>
  );
}
