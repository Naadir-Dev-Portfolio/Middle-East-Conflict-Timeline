import { useCallback, useEffect, useRef, useState } from 'react';
import { createTimelineReader } from './timeline-client';
import type { TimelinePayload } from './timeline-types';

export function useTimelineData() {
  const [data, setData] = useState<TimelinePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    const read = createTimelineReader();
    let active = true;
    let request: AbortController | null = null;
    const reload = async () => {
      if (request || !active) return;
      request = new AbortController();
      const timeout = window.setTimeout(() => request?.abort(), 10000);
      try {
        const next = await read(request.signal);
        if (active) { setData(next); setError(null); }
      } catch (failure) {
        if (active) setError(failure instanceof Error && failure.name !== 'AbortError'
          ? failure.message : 'The local server did not respond. Check the launcher window.');
      } finally {
        window.clearTimeout(timeout);
        request = null;
      }
    };
    const whenVisible = () => { if (!document.hidden) void reload(); };
    refreshRef.current = () => { void reload(); };
    void reload();
    const interval = window.setInterval(whenVisible, 10000);
    window.addEventListener('focus', whenVisible);
    window.addEventListener('online', whenVisible);
    document.addEventListener('visibilitychange', whenVisible);
    import.meta.hot?.on('timeline:data-changed', refresh);
    return () => {
      active = false;
      request?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', whenVisible);
      window.removeEventListener('online', whenVisible);
      document.removeEventListener('visibilitychange', whenVisible);
      import.meta.hot?.off('timeline:data-changed', refresh);
    };
  }, [refresh]);
  return { data, error, refresh };
}
