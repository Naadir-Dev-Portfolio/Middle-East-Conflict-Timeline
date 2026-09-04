'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  dayAtX, panCamera, scaleForSpan, wheelScale, zoomCamera,
  type TimelineCamera,
} from './timeline-math';

export function useTimelineCamera(initialDay: number, totalDays: number) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<TimelineCamera>({ centerDay: initialDay, scale: 6, width: 1280 });
  const cameraRef = useRef<TimelineCamera>(camera);
  const [height, setHeight] = useState(320);
  const frameRef = useRef<number | null>(null);

  const commit = useCallback((next: TimelineCamera) => {
    cameraRef.current = next;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setCamera(cameraRef.current);
    });
  }, []);

  const zoom = useCallback((scale: number, x?: number, day?: number) => {
    const current = cameraRef.current;
    const minimum = scaleForSpan(current.width, totalDays);
    commit(zoomCamera(current, Math.max(minimum, scale), x, day));
  }, [commit, totalDays]);

  const pan = useCallback((pixels: number) => {
    commit(panCamera(cameraRef.current, pixels, totalDays));
  }, [commit, totalDays]);

  const centerOn = useCallback((day: number) => {
    commit({ ...cameraRef.current, centerDay: day });
  }, [commit]);

  const rebase = useCallback((dayOffset: number) => {
    const next = { ...cameraRef.current, centerDay: cameraRef.current.centerDay + dayOffset };
    cameraRef.current = next;
    setCamera(next);
  }, []);

  const fit = useCallback((days: number | 'all', centerDay?: number) => {
    const current = cameraRef.current;
    commit({
      ...current,
      scale: scaleForSpan(current.width, days === 'all' ? totalDays : days),
      centerDay: days === 'all' ? totalDays / 2 : centerDay ?? current.centerDay,
    });
  }, [commit, totalDays]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      // Resizing changes the amount of context, not the date at the centre.
      const next = { ...cameraRef.current, width: viewport.clientWidth };
      cameraRef.current = next;
      setCamera(next);
      setHeight(viewport.clientHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      // Leave native browser magnification available via its normal shortcuts.
      // A trackpad pinch on the calendar itself is a date zoom, as is its wheel.
      event.preventDefault();
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        pan(event.deltaX || event.deltaY);
        return;
      }
      if (event.altKey && viewport.scrollHeight > viewport.clientHeight) {
        viewport.scrollTop += event.deltaY;
        return;
      }
      const x = event.clientX - viewport.getBoundingClientRect().left;
      const current = cameraRef.current;
      zoom(wheelScale(current.scale, event.deltaY, event.deltaMode), x, dayAtX(current, x));
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [pan, zoom]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  return { camera, cameraRef, viewportRef, height, zoom, pan, centerOn, fit, commit, rebase };
}
