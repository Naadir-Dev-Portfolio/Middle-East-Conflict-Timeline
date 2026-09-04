import { loadTimelineData } from './timeline-data.ts';
import type { TimelinePayload } from './timeline-types.ts';

/** Accept a replacement only after parsing and validation have both succeeded. */
export function createTimelineReader(fetchFile: typeof fetch = fetch) {
  let etag: string | null = null;
  let previousText = '';
  let previousData: TimelinePayload | null = null;
  return async (signal?: AbortSignal) => {
    const base = import.meta.env?.BASE_URL ?? '/';
    const endpoint = `${base.endsWith('/') ? base : `${base}/`}timeline.json`;
    const response = await fetchFile(endpoint, {
      signal, cache: 'no-store', headers: etag ? { 'If-None-Match': etag } : {},
    });
    if (response.status === 304 && previousData) return previousData;
    if (!response.ok) throw new Error(`Cannot read data/timeline.json (HTTP ${response.status}). Check that the local server is running and the file exists.`);
    const text = (await response.text()).replace(/^\uFEFF/, '');
    if (text !== previousText || !previousData) {
      let json: unknown;
      try { json = JSON.parse(text); }
      catch { throw new Error('data/timeline.json is not valid JSON. Check for a missing comma, quotation mark or closing bracket.'); }
      const next = loadTimelineData(json);
      previousData = next;
      previousText = text;
    }
    // Never cache the ETag of a malformed/partially written file.
    etag = response.headers.get('etag');
    return previousData;
  };
}
