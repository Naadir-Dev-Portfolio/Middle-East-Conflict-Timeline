'use client';

import { RemoteImage } from '@/components/remote-image';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  BookOpenText,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ExternalLink,
  Link2,
  Maximize2,
  Minus,
  Minimize2,
  MoveHorizontal,
  Play,
  Plus,
  Rows3,
  RefreshCw,
  Search,
  ZoomIn,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import type { TimelineEvent, TimelineMediaItem, TimelinePayload } from '@/lib/timeline-types';
import {
  adjacentEventIndex, clamp, dayAtX, packCards, rulerScale, scaleForSpan, xAtDay,
  MAX_TIMELINE_SCALE, MIN_READING_SCALE, MAX_READING_SCALE, stepReadingScale,
} from '@/lib/timeline-math';
import { useTimelineCamera } from '@/lib/use-timeline-camera';
import { eventSearchText, matchesSearch, searchRelevance } from '@/lib/timeline-search';

type Region = {
  id: string;
  label: string;
  color: string;
  match: string[];
};

type ThemeLane = {
  id: string;
  label: string;
  match: string[];
};

type DragMode = 'none' | 'pan' | 'zoom';

const DAY_MS = 86_400_000;
const RULER_HEIGHT = 64;
const MAX_PIXELS_PER_DAY = MAX_TIMELINE_SCALE;

const REGIONS: Region[] = [
  { id: 'all', label: 'All', color: '#e8a951', match: [] },
  {
    id: 'iran',
    label: 'Iran',
    color: '#e8a951',
    match: ['Iran', 'Tehran', 'Kharg Island', 'Larak Island', 'Minab'],
  },
  { id: 'israel', label: 'Israel', color: '#8d83ee', match: ['Israel'] },
  {
    id: 'us',
    label: 'United States',
    color: '#6aa8d8',
    match: ['United States'],
  },
  {
    id: 'gaza',
    label: 'Gaza',
    color: '#dc746a',
    match: ['Gaza', 'Rafah', 'Palestine'],
  },
  {
    id: 'lebanon',
    label: 'Lebanon',
    color: '#59b68c',
    match: ['Lebanon', 'Beirut'],
  },
  { id: 'yemen', label: 'Yemen', color: '#caa65a', match: ['Yemen'] },
  {
    id: 'maritime',
    label: 'Energy / sea',
    color: '#4eb5c1',
    match: ['Strait of Hormuz', 'Red Sea', 'Persian Gulf'],
  },
];

const THEMES: ThemeLane[] = [
  {
    id: 'military',
    label: 'Military',
    match: [
      'military',
      'airstrike',
      'missile_attack',
      'drone_attack',
      'ground_operation',
      'leadership_targeting',
      'assassination',
    ],
  },
  {
    id: 'diplomacy',
    label: 'Diplomacy',
    match: ['diplomacy', 'ceasefire', 'mediation', 'legal', 'agreement'],
  },
  {
    id: 'energy',
    label: 'Energy / maritime',
    match: ['energy', 'maritime', 'shipping', 'oil', 'sanctions'],
  },
  {
    id: 'signals',
    label: 'Threats / signals',
    match: [
      'threat',
      'deadline',
      'political_statement',
      'extension',
      'official_claim',
    ],
  },
  { id: 'context', label: 'Context', match: [] },
];

const VERIFICATION: Record<string, { label: string; color: string }> = {
  unreviewed: { label: 'Not yet reviewed', color: '#9ba4b2' },
  confirmed: { label: 'Confirmed', color: '#65cb94' },
  legal_diplomatic: { label: 'Legal / diplomatic', color: '#6aa8d8' },
  attribution_disputed: { label: 'Attribution disputed', color: '#e9aa54' },
  official_claim: { label: 'Official claim', color: '#9d90ef' },
  unverified_contradicted: {
    label: 'Unverified / contradicted',
    color: '#df756d',
  },
};

function isoDate(value: string) {
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const british = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (british) return `${british[3]}-${british[2]}-${british[1]}`;
  return raw.slice(0, 10);
}

function dateMs(value: string) {
  if (value.includes('T')) return Date.parse(value);
  const normalized = isoDate(value);
  const time = Date.parse(`${normalized}T12:00:00Z`);
  return Number.isFinite(time) ? time : 0;
}

function formatDate(value: string, compact = false) {
  const date = new Date(dateMs(value));
  if (Number.isNaN(date.getTime())) return isoDate(value);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: compact ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatEventDate(event: TimelineEvent, compact = false) {
  if (event.date_start.includes('T')) {
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    });
    const start = `${formatDate(event.date_start, compact)}, ${time.format(new Date(event.date_start))} UTC`;
    if (!event.date_end) return start;
    return `${start} – ${formatDate(event.date_end, compact)}${event.date_end.includes('T') ? `, ${time.format(new Date(event.date_end))} UTC` : ''}`;
  }
  if (!event.date_end || isoDate(event.date_end) === isoDate(event.date_start)) return formatDate(event.date_start, compact);
  const format = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: compact ? 'short' : 'long', year: 'numeric', timeZone: 'UTC',
  });
  return format.formatRange(new Date(dateMs(event.date_start)), new Date(dateMs(event.date_end)));
}

function isoFromMs(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

function youtubeEmbedUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (!['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return null;
    const id = host === 'youtu.be'
      ? url.pathname.slice(1).split('/')[0]
      : url.searchParams.get('v') ?? url.pathname.split('/').filter(Boolean).at(-1);
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    const rawStart = url.searchParams.get('start') ?? url.searchParams.get('t') ?? '';
    const time = rawStart.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    const seconds = /^\d+$/.test(rawStart) ? Number(rawStart)
      : time ? Number(time[1] ?? 0) * 3600 + Number(time[2] ?? 0) * 60 + Number(time[3] ?? 0) : 0;
    return `https://www.youtube-nocookie.com/embed/${id}?rel=0${seconds > 0 ? `&start=${Math.floor(seconds)}` : ''}`;
  } catch {
    return null;
  }
}

function scaleToSlider(scale: number, minimum: number) {
  return (
    (Math.log(scale / minimum) /
      Math.log(MAX_PIXELS_PER_DAY / minimum)) *
    100
  );
}

function VideoPlayer({ media, className }: { media: TimelineMediaItem; className?: string }) {
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- User-supplied recordings may not have captions; render their captions_url when provided.
    <video className={className} src={media.href} poster={media.thumbnail}
      aria-label={media.alt} controls playsInline preload="metadata">
      {media.captions_url ? <track kind="captions" src={media.captions_url} label="Captions" /> : null}
    </video>
  );
}

function sliderToScale(value: number, minimum: number) {
  return (
    minimum *
    (MAX_PIXELS_PER_DAY / minimum) ** (value / 100)
  );
}

function regionMatches(event: TimelineEvent, regionId: string) {
  const region = REGIONS.find((item) => item.id === regionId);
  if (!region || region.id === 'all') return true;
  return event.theatres.some((theatre) => region.match.includes(theatre));
}

function eventColor(event: TimelineEvent) {
  return (
    REGIONS.slice(1).find((region) => regionMatches(event, region.id))?.color ??
    '#8a919d'
  );
}

function eventTheme(event: TimelineEvent) {
  return (
    THEMES.find((theme) =>
      theme.match.some((category) => event.category.includes(category)),
    )?.id ?? 'context'
  );
}

function eventImportance(event: TimelineEvent) {
  if (
    event.category.some((item) =>
      [
        'war_start',
        'assassination',
        'ceasefire',
        'nuclear',
        'leadership_targeting',
      ].includes(item),
    )
  ) {
    return 5;
  }
  if (
    event.category.some((item) =>
      ['military', 'retaliation', 'regional_escalation', 'deadline'].includes(
        item,
      ),
    )
  ) {
    return 4;
  }
  if (
    event.category.some((item) =>
      ['diplomacy', 'energy', 'maritime', 'legal'].includes(item),
    )
  ) {
    return 3;
  }
  return 2;
}

export default function TimelineExplorer({ data, onRefresh }: { data: TimelinePayload; onRefresh?: () => void }) {
  const sortedAll = useMemo(
    () =>
      [...data.events].sort(
        (a, b) => dateMs(a.date_start) - dateMs(b.date_start),
      ),
    [data.events],
  );
  const initialEvent =
    sortedAll.find(
      (event) => event.id === data.initial_event_id,
    ) ??
    sortedAll.at(-1) ??
    null;

  const scopeStart = dateMs(data.calendar.start);
  const scopeEnd = Math.max(
    dateMs(data.calendar.end),
    ...sortedAll.map((event) => dateMs(event.date_start)),
  );
  const totalDays = Math.max(1, Math.ceil((scopeEnd - scopeStart) / DAY_MS));
  const {
    camera, cameraRef, viewportRef: scrollerRef, height: viewportHeight,
    zoom: zoomAtViewportPoint, centerOn, fit: zoomToSpan, commit: commitCamera, rebase,
  } = useTimelineCamera(
    initialEvent ? (dateMs(initialEvent.date_start) - scopeStart) / DAY_MS : totalDays / 2,
    totalDays,
  );
  const pixelsPerDay = camera.scale;

  const previousScopeStart = useRef(scopeStart);
  useLayoutEffect(() => {
    if (previousScopeStart.current !== scopeStart) {
      // Adding an older event must not move the calendar date under the reader.
      const offset = (previousScopeStart.current - scopeStart) / DAY_MS;
      previousScopeStart.current = scopeStart;
      rebase(offset);
    }
  }, [rebase, scopeStart]);

  const [regionId, setRegionId] = useState('all');
  const [query, setQuery] = useState('');
  const searchQuery = query.trim().toLowerCase();
  const [themesExpanded, setThemesExpanded] = useState(false);
  const [timelineFullscreen, setTimelineFullscreen] = useState(false);
  const [cardScale, setCardScale] = useState(1);
  const [textScale, setTextScale] = useState(1);
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialEvent?.id ?? null,
  );
  const [cursorDate, setCursorDate] = useState(
    initialEvent ? isoDate(initialEvent.date_start) : data.dataset.scope_start,
  );
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [trailRelationIds, setTrailRelationIds] = useState<string[]>([]);
  const viewportCenterDate = isoFromMs(scopeStart + camera.centerDay * DAY_MS);
  const viewportRange = {
    start: isoFromMs(scopeStart + dayAtX(camera, 0) * DAY_MS),
    end: isoFromMs(scopeStart + dayAtX(camera, camera.width) * DAY_MS),
  };

  const searchRef = useRef<HTMLInputElement>(null);
  const lastHashRef = useRef<string | null>(null);
  const selectEventRef = useRef<
    ((event: TimelineEvent, reveal?: boolean, openDetails?: boolean) => void) | null
  >(null);
  const dragRef = useRef({
    active: false,
    mode: 'none' as DragMode,
    startX: 0,
    startCenterDay: 0,
    startY: 0,
    scrollTop: 0,
    moved: false,
    startPixelsPerDay: 6,
    anchorDay: 0,
    anchorViewportX: 0,
  });

  const canvasWidth = camera.width;
  const minimumScale = scaleForSpan(canvasWidth, totalDays);
  const cardHeight = timelineFullscreen ? 120 : 104;
  const rowsPerSide = timelineFullscreen ? 2 : 1;
  const rowHeight = cardHeight * cardScale + 12;
  const masterHeight = Math.max(
    viewportHeight - RULER_HEIGHT,
    rowsPerSide * 2 * rowHeight + 16,
  );
  const themeLaneHeight = Math.max(100 * cardScale + 52, (viewportHeight - RULER_HEIGHT) / THEMES.length);
  const canvasHeight = themesExpanded
    ? RULER_HEIGHT + THEMES.length * themeLaneHeight
    : RULER_HEIGHT + masterHeight;
  const masterAxisY = RULER_HEIGHT + masterHeight / 2;

  const displayTitle = useCallback(
    (event: TimelineEvent) =>
      data.research[event.id]?.display_title ?? event.title,
    [data.research],
  );

  const events = useMemo(() => {
    return sortedAll.filter((event) => {
      if (!regionMatches(event, regionId)) return false;
      return matchesSearch(eventSearchText(event, data.research[event.id]), searchQuery);
    });
  }, [data.research, searchQuery, regionId, sortedAll]);

  const searchResults = useMemo(() => {
    const relevance = (event: TimelineEvent) => searchRelevance(event, data.research[event.id], searchQuery);
    const importance = (event: TimelineEvent) => data.editorial[event.id]?.importance ?? eventImportance(event);
    return [...events].sort((a, b) => relevance(b) - relevance(a)
      || importance(b) - importance(a) || dateMs(b.date_start) - dateMs(a.date_start));
  }, [data.editorial, data.research, events, searchQuery]);

  const selected = selectedId
    ? sortedAll.find((event) => event.id === selectedId) ?? null
    : null;

  const monthMarkers = useMemo(() => {
    const markers: Array<{
      key: string;
      ms: number;
      label: string;
      year: string;
    }> = [];
    const cursor = new Date(scopeStart);
    cursor.setUTCDate(1);
    while (cursor.getTime() <= scopeEnd) {
      markers.push({
        key: cursor.toISOString().slice(0, 7),
        ms: cursor.getTime(),
        label: cursor.toLocaleDateString('en-GB', {
          month: 'short',
          timeZone: 'UTC',
        }),
        year: String(cursor.getUTCFullYear()),
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return markers;
  }, [scopeEnd, scopeStart]);

  const dayMarkers = useMemo(() => {
    if (pixelsPerDay < 5) return [];
    const markers: Array<{
      key: string;
      ms: number;
      day: number;
      weekend: boolean;
    }> = [];
    for (let dayOffset = 0; dayOffset <= totalDays; dayOffset += 1) {
      const ms = scopeStart + dayOffset * DAY_MS;
      const date = new Date(ms);
      if (pixelsPerDay < 11 && date.getUTCDay() !== 1) continue;
      markers.push({
        key: isoFromMs(ms),
        ms,
        day: date.getUTCDate(),
        weekend: date.getUTCDay() === 0 || date.getUTCDay() === 6,
      });
    }
    return markers;
  }, [pixelsPerDay, scopeStart, totalDays]);

  const eventLayout = useMemo(() => {
    const base = events.map((event, eventIndex) => {
      const x = xAtDay(camera, (dateMs(event.date_start) - scopeStart) / DAY_MS);
      const importance =
        data.editorial[event.id]?.importance ?? eventImportance(event);
      return {
        event,
        eventIndex,
        x,
        importance,
        width: (themesExpanded ? 274 : timelineFullscreen ? 330 : importance >= 5 ? 292 : 270) * cardScale,
        candidate:
          event.id === selectedId ||
          pixelsPerDay >= 12 ||
          (pixelsPerDay >= 5 && importance >= 3) ||
          (pixelsPerDay >= 1.6 && importance >= 4) ||
          importance >= 5,
      };
    });

    const candidates = base.map((item) => ({
      ...item,
      id: item.event.id,
      selected: item.event.id === selectedId,
      preferredRow: item.eventIndex % 2,
    }));
    let assignments = new Map<string, number>();
    if (themesExpanded) {
      for (const theme of THEMES) {
        const themed = candidates.filter((item) =>
          (data.editorial[item.id]?.theme ?? eventTheme(item.event)) === theme.id,
        );
        for (const [id, row] of packCards(themed, 1)) assignments.set(id, row);
      }
    } else {
      assignments = packCards(candidates, rowsPerSide * 2);
    }

    return base.map((item) => {
      const row = assignments.get(item.event.id);
      const themeId =
        data.editorial[item.event.id]?.theme ?? eventTheme(item.event);
      const themeIndex = THEMES.findIndex((theme) => theme.id === themeId);
      return {
        event: item.event,
        x: item.x,
        y: themesExpanded
          ? RULER_HEIGHT +
            (themeIndex < 0 ? THEMES.length - 1 : themeIndex) *
              themeLaneHeight +
              18
          : masterAxisY,
        importance: item.importance,
        showLabel: row !== undefined,
        side: (row ?? item.eventIndex) % 2 === 0 ? 'above' : 'below',
        labelLane: Math.floor((row ?? 0) / 2),
      };
    });
  }, [
    camera,
    cardScale,
    data.editorial,
    events,
    masterAxisY,
    pixelsPerDay,
    rowsPerSide,
    selectedId,
    scopeStart,
    themeLaneHeight,
    themesExpanded,
    timelineFullscreen,
  ]);

  const pointGroups = useMemo(() => {
    const groups: Array<{ x: number; y: number; events: TimelineEvent[] }> = [];
    const lastByY = new Map<number, typeof groups[number]>();
    for (const item of eventLayout) {
      const previous = lastByY.get(item.y);
      if (previous && item.x - previous.x < 40) {
        const count = previous.events.length;
        previous.x = (previous.x * count + item.x) / (count + 1);
        previous.events.push(item.event);
      } else {
        const group = { x: item.x, y: item.y, events: [item.event] };
        groups.push(group);
        lastByY.set(item.y, group);
      }
    }
    return groups;
  }, [eventLayout]);
  const groupedIds = new Set(pointGroups.filter((group) => group.events.length > 1)
    .flatMap((group) => group.events.map((event) => event.id)));

  const layoutById = useMemo(
    () => new Map(eventLayout.map((layout) => [layout.event.id, layout])),
    [eventLayout],
  );

  const selectedX = xAtDay(camera,
    (dateMs(selected?.date_start ?? cursorDate) - scopeStart) / DAY_MS,
  );


  const selectEvent = useCallback(
    (event: TimelineEvent, reveal = false, openDetails = timelineFullscreen) => {
      setSelectedId(event.id);
      setCursorDate(isoDate(event.date_start));
      setDetailsOpen(openDetails);
      setImageOpen(false);
      setClusterIds([]);
      setActiveMediaIndex(0);
      window.history.replaceState(null, '', `#${event.id}`);
      lastHashRef.current = event.id;
      if (reveal) {
        centerOn((dateMs(event.date_start) - scopeStart) / DAY_MS);
      }
    },
    [
      centerOn,
      timelineFullscreen,
      scopeStart,
      setCursorDate,
      setDetailsOpen,
      setActiveMediaIndex,
      setSelectedId,
      setClusterIds,
    ],
  );

  useEffect(() => {
    selectEventRef.current = selectEvent;
  }, [selectEvent]);

  useEffect(() => {
    // A different layout starts with its calendar ruler visible; date zoom is untouched.
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [themesExpanded, timelineFullscreen, scrollerRef]);

  useEffect(() => {
    const selectFromHash = () => {
      let hash: string;
      try { hash = decodeURIComponent(window.location.hash.slice(1)); }
      catch { return; }
      if (!hash || hash === lastHashRef.current) return;
      const event = sortedAll.find((item) => item.id === hash);
      if (event) selectEventRef.current?.(event, true, false);
    };
    selectFromHash();
    window.addEventListener('hashchange', selectFromHash);
    return () => window.removeEventListener('hashchange', selectFromHash);
  }, [sortedAll]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (detailsOpen || imageOpen || clusterIds.length > 0) return;
      if (event.key === 'Escape' && timelineFullscreen) {
        event.preventDefault();
        setTimelineFullscreen(false);
        return;
      }
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing || events.length === 0) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const next = adjacentEventIndex(events.map(item => dateMs(item.date_start)),
          events.findIndex(item => item.id === selectedId), dateMs(cursorDate),
          event.key === 'ArrowRight' ? 1 : -1);
        selectEvent(events[next], true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clusterIds.length, cursorDate, detailsOpen, imageOpen, events, selectEvent, selectedId, timelineFullscreen]);

  function stepEvent(direction: -1 | 1) {
    if (events.length === 0) return;
    const index = adjacentEventIndex(events.map(item => dateMs(item.date_start)),
      events.findIndex(item => item.id === selectedId), dateMs(cursorDate), direction);
    selectEvent(events[index], true);
  }

  function dateAtPointer(clientX: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return data.dataset.scope_start;
    const bounds = scroller.getBoundingClientRect();
    const day = Math.round(dayAtX(cameraRef.current, clientX - bounds.left));
    return isoFromMs(clamp(scopeStart + day * DAY_MS, scopeStart, scopeEnd));
  }

  function selectCalendarDate(clientX: number) {
    const nextDate = dateAtPointer(clientX);
    const eventOnDay = events.find(
      (item) => isoDate(item.date_start) === nextDate,
    );
    if (eventOnDay) selectEvent(eventOnDay);
    else {
      setSelectedId(null);
      setCursorDate(nextDate);
      setDetailsOpen(false);
      window.history.replaceState(null, '', window.location.pathname);
      lastHashRef.current = null;
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input')) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const bounds = scroller.getBoundingClientRect();
    const isRuler = Boolean(target.closest('[data-ruler]'));
    const anchorViewportX = event.clientX - bounds.left;
    dragRef.current = {
      active: true,
      mode: isRuler ? 'zoom' : 'pan',
      startX: event.clientX,
      startCenterDay: cameraRef.current.centerDay,
      startY: event.clientY,
      scrollTop: scroller.scrollTop,
      moved: false,
      startPixelsPerDay: cameraRef.current.scale,
      anchorDay: dayAtX(cameraRef.current, anchorViewportX),
      anchorViewportX,
    };
    setDragMode(isRuler ? 'zoom' : 'pan');
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const scroller = scrollerRef.current;
    if (!drag.active || !scroller) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 3 || Math.abs(event.clientY - drag.startY) > 3) drag.moved = true;
    if (drag.mode === 'zoom') {
      const nextScale = rulerScale(drag.startPixelsPerDay, distance);
      zoomAtViewportPoint(nextScale, drag.anchorViewportX, drag.anchorDay);
      return;
    }
    commitCamera({
      ...cameraRef.current,
      centerDay: clamp(drag.startCenterDay - distance / drag.startPixelsPerDay, 0, totalDays),
    });
    scroller.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag.active) return;
    if (!drag.moved && event.type !== 'pointercancel') selectCalendarDate(event.clientX);
    drag.active = false;
    drag.mode = 'none';
    setDragMode('none');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const verification = selected
    ? VERIFICATION[selected.verification] ?? {
        label: titleCase(selected.verification),
        color: '#8a919d',
      }
    : null;
  const selectedEditorial = selected ? data.editorial[selected.id] : null;
  const selectedResearch = selected ? data.research[selected.id] : null;
  const selectedMedia = selected ? data.media[selected.id] ?? [] : [];
  const displayMedia = selectedMedia.filter(
    (item) => item.src || item.thumbnail || item.href,
  );
  const primaryMedia =
    displayMedia[Math.min(activeMediaIndex, Math.max(0, displayMedia.length - 1))];
  const primaryMediaLink = primaryMedia?.source_url ?? primaryMedia?.href;
  const primaryYoutubeUrl =
    primaryMedia?.kind === 'youtube'
      ? youtubeEmbedUrl(primaryMedia.href ?? primaryMedia.source_url)
      : null;
  const primaryIsVideo = Boolean(primaryYoutubeUrl || primaryMedia?.kind === 'video');
  const supportingMediaLinks = selectedMedia.filter(
    (item) => item.href && (item.kind === 'youtube' || item.kind === 'video'),
  );
  const selectedRelations = selected
    ? data.relations.filter(
        (relation) =>
          relation.from === selected.id || relation.to === selected.id,
      )
    : [];
  const activeRelationIds = new Set([
    ...trailRelationIds,
    ...selectedRelations.map((relation) => relation.id),
  ]);
  const visibleRelations = data.relations.flatMap((relation) => {
    if (!activeRelationIds.has(relation.id)) return [];
    const from = layoutById.get(relation.from);
    const to = layoutById.get(relation.to);
    return from && to ? [{ relation, from, to }] : [];
  });
  const linkedEventIds = new Set(
    visibleRelations.flatMap(({ relation }) => [relation.from, relation.to]),
  );

  return (
    <main className="editor-shell" style={{ '--text-scale': textScale } as CSSProperties}>
      <ResizablePanelGroup
        orientation="vertical"
        id="conflict-workspace"
        defaultLayout={{ preview: 40, timeline: 60 }}
      >
        <ResizablePanel id="preview" defaultSize="40%" minSize={primaryIsVideo ? '45%' : '24%'}>
          <section className="event-monitor">
            <div className="monitor-toolbar">
              <div className="monitor-identity">
                <CircleDot className="size-3.5 text-[#e8a951]" />
                <span>Conflict timeline</span>
                <span className="monitor-divider" />
                <span>{data.events.length} records</span>
                {onRefresh ? <Button variant="ghost" size="icon-xs" onClick={onRefresh}
                  aria-label="Reload timeline data" title="Reload data/timeline.json · also updates automatically">
                  <RefreshCw />
                </Button> : null}
              </div>
              <div className="monitor-actions">
                <div className="reading-size-control" aria-label="Reading text size"
                  title={`Reading text: ${Math.round(textScale * 100)}% (30–180%)`}>
                  <button type="button" aria-label="Smaller reading text" disabled={textScale <= MIN_READING_SCALE}
                    onClick={() => setTextScale((value) => stepReadingScale(value, -1))}>A−</button>
                  <button type="button" aria-label="Larger reading text" disabled={textScale >= MAX_READING_SCALE}
                    onClick={() => setTextScale((value) => stepReadingScale(value, 1))}>A+</button>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => stepEvent(-1)}
                  aria-label="Previous event"
                >
                  <ChevronLeft />
                </Button>
                <span className="monitor-date">
                  {formatDate(cursorDate, true)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => stepEvent(1)}
                  aria-label="Next event"
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>

            {selected ? (
              <div className="event-preview">
                <div
                  className={`event-frame ${primaryMedia ? 'has-media' : ''} ${primaryIsVideo ? 'is-video' : ''}`}
                  style={{ '--event-color': eventColor(selected) } as CSSProperties}
                >
                  {primaryYoutubeUrl && !detailsOpen ? (
                    <iframe
                      className="event-frame-video"
                      src={primaryYoutubeUrl}
                      title={primaryMedia?.alt ?? displayTitle(selected)}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  ) : primaryMedia?.kind === 'video' && !detailsOpen ? (
                    <VideoPlayer className="event-frame-video" media={primaryMedia} />
                  ) : primaryMedia?.src || primaryMedia?.thumbnail ? (
                    <button type="button" className="event-image-open" onClick={() => setImageOpen(true)}
                      aria-label={`Enlarge image: ${primaryMedia.alt}`} title="Open full image">
                      <RemoteImage
                        className={`event-frame-image media-${primaryMedia.kind}`}
                        style={{ objectFit: 'contain', objectPosition: 'center' }}
                        src={(primaryMedia.src ?? primaryMedia.thumbnail)!}
                        alt={primaryMedia.alt}
                      />
                      <span className="image-enlarge-hint"><Maximize2 />Enlarge</span>
                    </button>
                  ) : primaryMedia?.kind === 'document' && primaryMedia.href ? (
                    <a className="event-document-link" href={primaryMedia.href} target="_blank" rel="noreferrer">
                      <BookOpenText /><span>{primaryMedia.alt}</span><span>Open document <ExternalLink /></span>
                    </a>
                  ) : (
                    <div className="event-frame-grid" />
                  )}
                  {!primaryYoutubeUrl && !primaryMedia ? (
                    <div
                      className={`event-frame-content ${selectedEditorial?.display_quote ? 'is-quote' : ''}`}
                    >
                      <p>{selected.theatres.slice(0, 3).join(' / ')}</p>
                      <h2>
                        {selectedEditorial?.display_quote
                          ? `“${selectedEditorial.display_quote}”`
                          : displayTitle(selected)}
                      </h2>
                      <span>{formatEventDate(selected)}</span>
                    </div>
                  ) : null}
                  {primaryMedia && !primaryIsVideo ? (
                    <div className="event-image-caption" title={primaryMedia.alt}>{primaryMedia.alt}</div>
                  ) : null}
                  {primaryIsVideo && primaryMedia?.href ? (
                    <a className="video-provider-link" href={primaryMedia.href} target="_blank" rel="noreferrer">
                      {primaryYoutubeUrl ? 'Open on YouTube' : 'Open original video'} <ExternalLink />
                    </a>
                  ) : null}
                  {primaryMedia && primaryMediaLink ? (
                    <a
                      className="event-media-credit"
                      href={primaryMediaLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {primaryMedia.credit ?? primaryMedia.platform ?? 'Source media'}
                      <ExternalLink />
                    </a>
                  ) : primaryMedia ? (
                    <span className="event-media-credit">
                      {primaryMedia.credit ??
                        primaryMedia.platform ??
                        'Source media'}
                    </span>
                  ) : null}
                  {selectedMedia.length > 1 ? (
                    <span className="event-media-count">
                      {selectedMedia.length} media records
                    </span>
                  ) : null}
                  {displayMedia.length > 1 ? (
                    <div className="event-media-rail" aria-label="Event media">
                      {displayMedia.map((media, index) => (
                        <button
                          type="button"
                          key={`${media.src ?? media.thumbnail}-${index}`}
                          className={index === activeMediaIndex ? 'is-active' : ''}
                          onClick={() => setActiveMediaIndex(index)}
                          aria-label={`Show ${media.kind === 'youtube' || media.kind === 'video' ? 'video' : 'image'}: ${media.alt}`}
                          aria-pressed={index === activeMediaIndex}
                          title={`${titleCase(media.kind)}: ${media.alt}`}
                        >
                          {media.src || media.thumbnail ? (
                            <RemoteImage
                              src={(media.src ?? media.thumbnail)!}
                              alt=""
                              style={{ objectFit: 'cover' }}
                            />
                          ) : (
                            <Play aria-hidden="true" />
                          )}
                          <span>{media.platform ?? media.kind}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <article className="event-inspector" key={selected.id}>
                  <div className="event-inspector-meta">
                    <span style={{ color: eventColor(selected) }}>
                      {formatEventDate(selected)}
                    </span>
                    <span className="event-meta-separator">/</span>
                    <span style={{ color: verification?.color }}>
                      {verification?.label}
                    </span>
                  </div>
                  <h1>{displayTitle(selected)}</h1>
                  <Button className="event-more-details" variant="outline" size="sm"
                    onClick={() => setDetailsOpen(true)}>
                    <BookOpenText />More details
                  </Button>
                  {selectedResearch?.deck ? (
                    <p className="event-deck">{selectedResearch.deck}</p>
                  ) : null}
                  {selectedResearch?.deck !== selected.summary ? (
                    <p className="event-summary">{selectedResearch?.longform?.[0] || selected.summary || 'No summary recorded yet.'}</p>
                  ) : null}
                  {selectedResearch?.source_digest ? (
                    <div className="event-context">
                      <p>{selectedResearch.source_digest}</p>
                    </div>
                  ) : null}

                  {selected.claims && selected.claims.length > 0 ? (
                    <div className="event-claims">
                      <span className="field-label">Claims in this record</span>
                      {selected.claims.map((claim) => (
                        <p key={`${claim.claim}-${claim.status}`}>
                          {claim.claim}
                          <small>{titleCase(claim.status)}</small>
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <div className="event-tags">
                    {selected.category.slice(0, 5).map((category) => (
                      <span key={category}>{titleCase(category)}</span>
                    ))}
                  </div>

                  <div className="event-inspector-columns">
                    <div>
                      <span className="field-label">Actors</span>
                      <p>{selected.actors.join(' · ') || 'Not specified'}</p>
                    </div>
                    <div>
                      <span className="field-label">Places</span>
                      <p>{selected.theatres.join(' · ') || 'Not specified'}</p>
                    </div>
                  </div>

                  {selectedRelations.length > 0 || trailRelationIds.length > 0 ? (
                    <div className="connection-list">
                      <div className="connection-list-heading">
                        <Link2 />
                        <span>
                          {selectedRelations.length > 0
                            ? `${selectedRelations.length} connected event${selectedRelations.length === 1 ? '' : 's'}`
                            : 'Pinned connection trail'}
                        </span>
                        {trailRelationIds.length > 0 ? (
                          <button
                            type="button"
                            className="clear-trail"
                            onClick={() => setTrailRelationIds([])}
                          >
                            Clear trail
                          </button>
                        ) : null}
                      </div>
                      {selectedRelations.map((relation) => {
                        const outward = relation.from === selected.id;
                        const otherId = outward ? relation.to : relation.from;
                        const other = sortedAll.find(
                          (event) => event.id === otherId,
                        );
                        if (!other) return null;
                        return (
                          <button
                            type="button"
                            key={relation.id}
                            className={
                              trailRelationIds.includes(relation.id)
                                ? 'is-in-trail'
                                : ''
                            }
                            onClick={() => {
                              setTrailRelationIds((current) =>
                                current.includes(relation.id)
                                  ? current
                                  : [...current, relation.id],
                              );
                              selectEvent(other, true);
                            }}
                          >
                            <span className="connection-direction">
                              {isoDate(other.date_start) === isoDate(selected.date_start) ? 'Same-day connection'
                                : dateMs(other.date_start) > dateMs(selected.date_start) ? 'Later connection' : 'Earlier connection'}
                            </span>
                            <strong>{relation.label}</strong>
                            <p>{relation.summary}</p>
                            <small>
                              {formatDate(other.date_start, true)} ·{' '}
                              {displayTitle(other)}
                            </small>
                            <em>{titleCase(relation.confidence)}</em>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="source-strip">
                    <div className="source-strip-heading">
                      <span>
                        Sources and supporting media
                      </span>
                      <small>
                        {selected.sources.length + supportingMediaLinks.length}
                      </small>
                    </div>
                    {selected.sources.map((source, index) => (
                      <a
                        key={`${source.url}-${index}`}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>{source.title ?? source.publisher}<small>{source.title ? source.publisher : hostFromUrl(source.url)}</small></span>
                        <ExternalLink />
                      </a>
                    ))}
                    {supportingMediaLinks.map((media, index) => (
                      <button
                        type="button"
                        key={`${media.href}-${index}`}
                        className="supporting-media-link"
                        onClick={() => setActiveMediaIndex(displayMedia.indexOf(media))}
                        aria-label={`Play video: ${media.alt}`}
                      >
                        <span>
                          <Play />
                          {media.alt}
                        </span>
                        <small>{media.credit ?? media.platform ?? 'Video report'} · Play in preview</small>
                      </button>
                    ))}
                  </div>
                </article>
              </div>
            ) : (
              <div className="empty-day-preview">
                <CalendarDays />
                <p>{formatDate(cursorDate)}</p>
                <h2>No event recorded on this day</h2>
                <span>
                  This is a real calendar position, not a collapsed gap. It can
                  be filled by adding a new event record later.
                </span>
              </div>
            )}
          </section>
        </ResizablePanel>

        <ResizableHandle className="editor-divider" />

        <ResizablePanel id="timeline" defaultSize="60%" minSize="30%">
          <section
            className={`timeline-workspace ${timelineFullscreen ? 'is-fullscreen' : ''}`}
            style={{ '--card-scale': cardScale, '--card-height': `${cardHeight}px` } as CSSProperties}
          >
            <div className="timeline-toolbar">
              <div className="country-filters hide-scrollbar">
                {REGIONS.map((region) => (
                  <button
                    type="button"
                    key={region.id}
                    className={region.id === regionId ? 'is-active' : ''}
                    onClick={() => setRegionId(region.id)}
                  >
                    <span style={{ backgroundColor: region.color }} />
                    {region.label}
                  </button>
                ))}
              </div>

              <div className="timeline-tools">
                <button
                  type="button"
                  className={`theme-toggle ${themesExpanded ? 'is-active' : ''}`}
                  onClick={() => setThemesExpanded((current) => !current)}
                  title="Group the master calendar by theme"
                >
                  <Rows3 />
                  {themesExpanded ? 'One timeline' : 'Group themes'}
                </button>
                <label className="timeline-search">
                  <Search />
                  <Input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setQuery('');
                      if (event.key === 'Enter' && searchResults[0]) {
                        selectEvent(searchResults[0], true);
                        setQuery('');
                      }
                    }}
                    placeholder="Find in timeline"
                    aria-label="Find in timeline"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                    >
                      <X />
                    </button>
                  ) : null}
                </label>
                <div className="zoom-presets" aria-label="Timeline zoom presets">
                  <button type="button" onClick={() => zoomToSpan('all')}>All</button>
                  <button type="button" onClick={() => zoomToSpan(365)}>1y</button>
                  <button type="button" onClick={() => zoomToSpan(31)}>1m</button>
                  <button type="button" onClick={() => zoomToSpan(7)}>1w</button>
                  <button type="button" onClick={() => zoomToSpan(1)}>1d</button>
                </div>
                <label className="date-jump" title="Jump to a calendar date">
                  <CalendarDays />
                  <input type="date" aria-label="Jump to date"
                    value={viewportCenterDate}
                    min={isoDate(data.dataset.scope_start)} max={isoFromMs(scopeEnd)}
                    onInput={(event) => {
                      const value = event.currentTarget.value;
                      if (value >= isoDate(data.dataset.scope_start) && value <= isoFromMs(scopeEnd)) {
                        centerOn((dateMs(value) - scopeStart) / DAY_MS);
                      }
                    }}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value >= isoDate(data.dataset.scope_start) && value <= isoFromMs(scopeEnd)) {
                        centerOn((dateMs(value) - scopeStart) / DAY_MS);
                      }
                    }} />
                </label>
                <label className="timeline-zoom-slider">
                  <ZoomIn />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.5"
                    value={scaleToSlider(pixelsPerDay, minimumScale)}
                    onChange={(event) =>
                      zoomAtViewportPoint(sliderToScale(Number(event.target.value), minimumScale))
                    }
                    onKeyDown={(event) => {
                      if (event.ctrlKey || event.metaKey || event.altKey) return;
                      const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1,
                        PageDown: -10, PageUp: 10 }[event.key];
                      if (event.key !== 'Home' && event.key !== 'End' && step === undefined) return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (event.key === 'Home') zoomAtViewportPoint(minimumScale);
                      else if (event.key === 'End') zoomAtViewportPoint(MAX_PIXELS_PER_DAY);
                      else zoomAtViewportPoint(sliderToScale(clamp(
                        scaleToSlider(cameraRef.current.scale, minimumScale) + (step ?? 0), 0, 100,
                      ), minimumScale));
                    }}
                    aria-label="Timeline zoom level"
                  />
                </label>
                <div className="zoom-control">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => zoomAtViewportPoint(pixelsPerDay / 1.25)}
                    disabled={pixelsPerDay <= minimumScale}
                    aria-label="Zoom out"
                  >
                    <Minus />
                  </Button>
                  <span>
                    {Math.max(1, Math.round(canvasWidth / pixelsPerDay))} day{Math.round(canvasWidth / pixelsPerDay) > 1 ? 's' : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => zoomAtViewportPoint(pixelsPerDay * 1.25)}
                    disabled={pixelsPerDay >= MAX_PIXELS_PER_DAY}
                    aria-label="Zoom in"
                  >
                    <Plus />
                  </Button>
                </div>
                <div className="card-scale-control" aria-label="Event card size">
                  <button
                    type="button"
                    onClick={() => setCardScale((value) => clamp(Math.round((value - 0.1) * 10) / 10, 0.3, 1.6))}
                    disabled={cardScale <= 0.3}
                    aria-label="Make event cards smaller"
                  >
                    A−
                  </button>
                  <span>{Math.round(cardScale * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => setCardScale((value) => clamp(Math.round((value + 0.1) * 10) / 10, 0.3, 1.6))}
                    disabled={cardScale >= 1.6}
                    aria-label="Make event cards larger"
                  >
                    A+
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="timeline-fullscreen-toggle"
                  onClick={() => setTimelineFullscreen((value) => !value)}
                  aria-label={
                    timelineFullscreen
                      ? 'Exit full-screen timeline'
                      : 'Open full-screen timeline'
                  }
                  title={
                    timelineFullscreen
                      ? 'Exit full-screen timeline (Esc)'
                      : 'Open full-screen timeline'
                  }
                >
                  {timelineFullscreen ? <Minimize2 /> : <Maximize2 />}
                </Button>
              </div>
            </div>

            {query.trim() ? (
              <section className="timeline-search-results" aria-label="Search results">
                <p>{events.length} matching event{events.length === 1 ? '' : 's'}</p>
                {searchResults.map((event) => (
                  <button type="button" key={event.id} onClick={() => {
                    selectEvent(event, true);
                    setQuery('');
                  }}>
                    <time>{formatDate(event.date_start, true)}</time>
                    <strong>{displayTitle(event)}</strong>
                  </button>
                ))}
                {events.length === 0 ? <small>Try another name, place or phrase, or change the country filter.</small> : null}
              </section>
            ) : null}

            <div className="timeline-stage">
              <div className="timeline-date-hud" aria-live="polite">
                <strong>{formatDate(viewportCenterDate, true)}</strong>
                <span>
                  {formatDate(viewportRange.start, true)} —{' '}
                  {formatDate(viewportRange.end, true)}
                </span>
              </div>
              <div className="timeline-center-guide" aria-hidden="true" />
              <div
                ref={scrollerRef}
                className={`timeline-scroller drag-${dragMode} ${themesExpanded ? 'has-theme-lanes' : 'is-master'}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onDoubleClick={(event) => {
                  if ((event.target as HTMLElement).closest('button, input, a')) return;
                  const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
                  zoomAtViewportPoint(cameraRef.current.scale * 1.5, x);
                }}
                data-center-day={camera.centerDay}
                data-scale={pixelsPerDay}
                data-viewport-width={camera.width}
                aria-label="Interactive calendar timeline"
              >
                <div
                  className="timeline-canvas"
                  style={
                    {
                      width: canvasWidth,
                      height: canvasHeight,
                      '--day-width': `${pixelsPerDay}px`,
                      '--master-axis-y': `${masterAxisY}px`,
                    } as CSSProperties
                  }
                >
                  {themesExpanded ? (
                    <div className="theme-labels" style={{ paddingTop: RULER_HEIGHT }}>
                      {THEMES.map((theme) => (
                        <div key={theme.id} style={{ height: themeLaneHeight }}>{theme.label}</div>
                      ))}
                    </div>
                  ) : null}

                  {themesExpanded ? (
                    THEMES.map((theme, index) => (
                      <div
                        key={theme.id}
                        className="timeline-theme-lane"
                        style={{
                          top: RULER_HEIGHT + index * themeLaneHeight,
                          height: themeLaneHeight,
                        }}
                      />
                    ))
                  ) : (
                    <div className="master-axis" />
                  )}

                  {monthMarkers.map((marker) => {
                    const x = xAtDay(camera, (marker.ms - scopeStart) / DAY_MS);
                    if (x < -90 || x > canvasWidth + 90) return null;
                    const showYear = marker.key.endsWith('-01');
                    const showMonth = pixelsPerDay > 2 || (pixelsPerDay >= 0.55 && Number(marker.key.slice(5)) % 3 === 1);
                    return (
                      <div
                        key={marker.key}
                        className="month-marker"
                        style={{ left: x }}
                      >
                        {showYear || showMonth ? (
                          <span className={showYear || pixelsPerDay >= 18 ? 'is-year' : 'is-month'}>
                            {showYear ? marker.year : pixelsPerDay >= 18 ? `${marker.label} ${marker.year}` : marker.label}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}

                  {dayMarkers.map((marker) => {
                    const x = xAtDay(camera, (marker.ms - scopeStart) / DAY_MS);
                    if (x < -pixelsPerDay || x > canvasWidth + pixelsPerDay) return null;
                    return (
                      <div
                        key={marker.key}
                        className={`day-marker ${marker.weekend ? 'is-weekend' : ''}`}
                        data-date={marker.key}
                        style={{ left: x, width: pixelsPerDay }}
                      >
                        {pixelsPerDay >= 18 ? <span>{marker.day}</span> : null}
                      </div>
                    );
                  })}

                  <div
                    className="calendar-ruler-hit"
                    data-ruler
                    title="Drag horizontally to zoom around this date"
                  >
                    <MoveHorizontal />
                    <span>drag ruler to zoom</span>
                  </div>

                  {visibleRelations.length > 0 ? (
                    <svg
                      className="relation-overlay"
                      width={canvasWidth}
                      height={canvasHeight}
                      aria-hidden="true"
                    >
                      {visibleRelations.map(({ relation, from, to }, index) => {
                        const middle = (from.x + to.x) / 2;
                        const isTrail = trailRelationIds.includes(relation.id);
                        const path = themesExpanded
                          ? `M ${from.x} ${from.y} C ${middle} ${from.y}, ${middle} ${to.y}, ${to.x} ${to.y}`
                          : `M ${from.x} ${from.y} C ${middle} ${from.y + (index % 2 === 0 ? -62 : 62)}, ${middle} ${to.y + (index % 2 === 0 ? -62 : 62)}, ${to.x} ${to.y}`;
                        return (
                          <path
                            key={relation.id}
                            className={isTrail ? 'is-trail' : ''}
                            d={path}
                          />
                        );
                      })}
                    </svg>
                  ) : null}

                  <div className="timeline-playhead" style={{ left: selectedX }}>
                    <span />
                  </div>

                  {eventLayout.map(
                    ({ event, x, y, importance, showLabel, side, labelLane }) => {
                      if (x < -600 || x > canvasWidth + 600) return null;
                      const grouped = groupedIds.has(event.id);
                      if (grouped && !showLabel) return null;
                      const active = selectedId === event.id;
                      const linked = linkedEventIds.has(event.id);
                      return (
                        <button
                          type="button"
                          key={event.id}
                          data-event-id={event.id}
                          aria-pressed={active}
                          aria-label={`${formatEventDate(event)} — ${displayTitle(event)}`}
                          className={`timeline-event importance-${importance} ${themesExpanded ? 'is-theme-lane' : `is-master is-${side}`} ${active ? 'is-selected' : ''} ${linked ? 'is-linked' : ''} ${grouped ? 'is-grouped' : ''}`}
                          style={
                            {
                              left: x,
                              top: y,
                              '--event-color': eventColor(event),
                              '--label-lane': labelLane,
                              '--label-offset': `${34 + labelLane * rowHeight}px`,
                            } as CSSProperties
                          }
                          onClick={(eventClick) => {
                            eventClick.stopPropagation();
                            selectEvent(event);
                          }}
                          title={`${formatEventDate(event)} — ${displayTitle(event)}`}
                        >
                          <span className="event-point" />
                          {showLabel ? (
                            <>
                              {!themesExpanded ? <span className="event-stem" aria-hidden="true" /> : null}
                              <span className="event-clip">
                                <small>{formatEventDate(event, true)}</small>
                                <strong>{displayTitle(event)}</strong>
                              </span>
                            </>
                          ) : null}
                        </button>
                      );
                    },
                  )}
                  {pointGroups.filter((group) => group.events.length > 1 && group.x > -30 && group.x < canvasWidth + 30)
                    .map((group) => (
                      <button type="button" key={group.events[0].id}
                        className={`timeline-cluster ${group.events.some((event) => event.id === selectedId) ? 'is-selected' : ''}`}
                        style={{ left: group.x, top: group.y }}
                        aria-label={`Explore ${group.events.length} events near ${formatDate(group.events[0].date_start)}`}
                        title={`${group.events.length} nearby events — click to explore or zoom in`}
                        onClick={() => setClusterIds(group.events.map((event) => event.id))}>
                        {group.events.length}
                      </button>
                    ))}
                </div>
              </div>
            </div>

            <div className="timeline-statusbar">
              <span className="timeline-hint">
                {cardScale > 1.1
                  ? 'Wheel: zoom · Drag: pan · Alt + wheel: scroll tall cards · Click a group to explore'
                  : 'Wheel: zoom · Drag: pan · Drag dates: zoom · Click a group to explore'}
              </span>
              <span className="relation-preview">
                <Link2 />{' '}
                {trailRelationIds.length > 0
                  ? `${trailRelationIds.length} link${trailRelationIds.length === 1 ? '' : 's'} pinned`
                  : 'select a connection to pin its trail'}
              </span>
            </div>
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog open={clusterIds.length > 0} onOpenChange={(open) => { if (!open) setClusterIds([]); }}>
        <DialogContent className="event-cluster-dialog">
          <DialogHeader>
            <DialogTitle>{clusterIds.length} events in this part of the calendar</DialogTitle>
            <DialogDescription>Choose an event, or zoom in to separate these dates on the timeline.</DialogDescription>
          </DialogHeader>
          <Button variant="outline" className="cluster-zoom-button" onClick={() => {
            const days = sortedAll.filter((event) => clusterIds.includes(event.id))
              .map((event) => (dateMs(event.date_start) - scopeStart) / DAY_MS);
            zoomToSpan(Math.max(1, (Math.max(...days) - Math.min(...days)) * 1.3 + 2),
              (Math.max(...days) + Math.min(...days)) / 2);
            setClusterIds([]);
          }}><ZoomIn />Zoom into these events</Button>
          <div className="cluster-event-list">
            {sortedAll.filter((event) => clusterIds.includes(event.id)).map((event) => (
              <button type="button" key={event.id} onClick={() => selectEvent(event)}>
                <time>{formatDate(event.date_start, true)}</time>
                <strong>{displayTitle(event)}</strong>
                <ChevronRight />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {selected ? (
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="event-dossier-dialog" style={{ '--text-scale': textScale } as CSSProperties}>
            <DialogHeader className="event-dossier-header">
              <div className="event-dossier-kicker">
                <span style={{ color: eventColor(selected) }}>
                  {formatEventDate(selected)}
                </span>
                <span>{verification?.label}</span>
                <span>Research dossier</span>
                <div className="reading-size-control" aria-label="Dossier text size"
                  title={`Reading text: ${Math.round(textScale * 100)}% (30–180%)`}>
                  <button type="button" aria-label="Smaller reading text in details" disabled={textScale <= MIN_READING_SCALE}
                    onClick={() => setTextScale((value) => stepReadingScale(value, -1))}>A−</button>
                  <button type="button" aria-label="Larger reading text in details" disabled={textScale >= MAX_READING_SCALE}
                    onClick={() => setTextScale((value) => stepReadingScale(value, 1))}>A+</button>
                </div>
              </div>
              <DialogTitle>{displayTitle(selected)}</DialogTitle>
              <DialogDescription>
                {selectedResearch?.deck ?? selected.summary}
              </DialogDescription>
            </DialogHeader>

            {primaryYoutubeUrl ? (
              <div className="event-dossier-video">
                <iframe src={primaryYoutubeUrl} title={primaryMedia?.alt ?? displayTitle(selected)}
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
              </div>
            ) : primaryMedia?.kind === 'video' ? (
              <div className="event-dossier-video"><VideoPlayer media={primaryMedia} /></div>
            ) : primaryMedia?.src || primaryMedia?.thumbnail ? (
              <button type="button" className="event-dossier-media" onClick={() => setImageOpen(true)}
                aria-label={`Enlarge image from details: ${primaryMedia.alt}`}>
                <RemoteImage
                  src={(primaryMedia.src ?? primaryMedia.thumbnail)!}
                  style={{ objectFit: 'contain', objectPosition: 'center' }}
                  alt={primaryMedia.alt}
                />
                <span>{primaryMedia.credit ?? primaryMedia.platform}</span>
              </button>
            ) : null}

            <div className="event-dossier-grid">
              <article className="event-dossier-copy">
                {(selectedResearch?.longform?.length
                  ? selectedResearch.longform
                  : [selected.summary || 'No additional detail recorded yet.']
                ).map((paragraph, index) => (
                  <p key={`${selected.id}-paragraph-${index}`}>{paragraph}</p>
                ))}
                {selectedResearch?.research_note ? (
                  <aside>
                    <strong>Research note</strong>
                    <p>{selectedResearch.research_note}</p>
                  </aside>
                ) : null}
              </article>

              <aside className="event-dossier-facts">
                {selectedResearch?.key_facts?.length ? (
                  <div className="dossier-fact-list">
                    <span className="field-label">Key facts</span>
                    {selectedResearch.key_facts.map((fact) => (
                      <div key={`${fact.label}-${fact.value}`}>
                        <small>{fact.label}</small>
                        <strong>{fact.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="dossier-source-list">
                  <span className="field-label">Source record</span>
                  {selected.sources.map((source, index) => (
                    <a
                      key={`${source.url}-dossier-${index}`}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>{source.title ?? source.publisher}</span>
                      <small>{source.title ? `${source.publisher} · ` : ''}{hostFromUrl(source.url)}</small>
                      <ExternalLink />
                    </a>
                  ))}
                  {supportingMediaLinks.map((media) => (
                    <button type="button" key={media.href} onClick={() => setActiveMediaIndex(displayMedia.indexOf(media))}>
                      <Play />{media.credit ?? 'Video report'}<span>Play video</span>
                    </button>
                  ))}
                </div>
                <p className="dossier-reviewed">
                  Reviewed {selectedResearch?.reviewed_at ?? 'not yet'}
                </p>
              </aside>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {primaryMedia && (primaryMedia.src || primaryMedia.thumbnail) ? (
        <Dialog open={imageOpen} onOpenChange={setImageOpen}>
          <DialogContent className="image-viewer-dialog">
            <DialogHeader className="image-viewer-header">
              <DialogTitle>Full image</DialogTitle>
              <DialogDescription>{primaryMedia.alt}</DialogDescription>
            </DialogHeader>
            <div className="image-viewer-stage">
              <RemoteImage src={(primaryMedia.src ?? primaryMedia.thumbnail)!} alt={primaryMedia.alt}
                style={{ objectFit: 'contain', objectPosition: 'center' }}
                className="image-viewer-image" />
            </div>
            <div className="image-viewer-footer">
              <span>{primaryMedia.credit ?? 'Source image'}</span>
              <a href={primaryMedia.src ?? primaryMedia.thumbnail} target="_blank" rel="noreferrer">
                Open original image <ExternalLink />
              </a>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </main>
  );
}
