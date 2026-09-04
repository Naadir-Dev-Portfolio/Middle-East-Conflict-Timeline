# Middle East Conflict Timeline

A local research timeline. Double-click **Launch Timeline.bat**, keep its window
open, and use the app at **http://localhost:3000/**. Node.js 22.13 or newer is
required; the launcher installs the pinned dependencies on first use.

The public GitHub Pages edition is rebuilt automatically from the same source
whenever `main` is updated. Local editing remains immediate; online edits become
visible after the commit's **Deploy GitHub Pages** workflow completes.

## One file to update

**`data/timeline.json` is the only event-data file.** All summaries, detailed text,
sources, media URLs, importance settings, relationships and correction notes live
inside their respective event objects. The app does not import a frozen copy into
its code. It reads this file when opened, after saving during development, when
the app regains focus, and every 10 seconds while visible. The reload icon beside
the record count checks immediately.

This works with the double-click launcher and with `npm start` after a build.
Editing events locally does **not** require rebuilding or restarting either server.
Selections, filters, pinned connections and zoom stay in place when data refreshes.
If a save is incomplete or invalid, the open app keeps its last valid data and
shows an explanation. After fixing the file, it recovers automatically. On a
fresh launch there is no previous in-memory copy, so invalid data must be fixed.

The `data` folder contains that one file. There is no second amendments,
research, media or relationships file to keep in sync. The browser's
`/timeline.json` address is simply the local server's read-only endpoint for
`data/timeline.json`, not another source file. A production build copies that
same validated file into `dist` for static hosting; the generated copy is ignored
by Git and is never edited directly.

### File structure / schema 2.0

The file is one JSON object containing an `events` array. This is the minimal
valid structure (the event is an example, not a researched fact):

```json
{
  "schema_version": "2.0",
  "updated_at": "2026-09-03",
  "calendar_end": "2028-12-31",
  "events": [
    {
      "id": "2026-09-04-your-event-slug",
      "date_start": "2026-09-04",
      "title": "Your descriptive event title"
    }
  ]
}
```

| Top-level property | Type / rule |
| --- | --- |
| `events` | **Required:** array of event objects described below; an empty array is valid. |
| `schema_version` | Optional string; if present, must be `"2.0"`. Preserve it when updating. |
| `updated_at` | Optional valid day or timezone-qualified ISO timestamp; date of the file update. |
| `calendar_end` | Optional `YYYY-MM-DD`; extends empty calendar space, never truncates events. |
| `initial_event_id` | Optional stable event ID for the initial selection. |
| `title`, `description`, `granularity` | Optional descriptive strings for the collection. |
| `timezone` | Optional IANA timezone, such as `Europe/London`; timed events still include their own UTC offset. |
| `methodology_notes` | Optional array of non-empty strings. |
| `verification_labels` | Optional object mapping verification codes to description strings. |

Keep existing metadata. Optional properties should be **omitted**, not filled
with `null` (the exception is `date_end`, which allows `null`). The validator
checks actual calendar dates, property types, supported classifications, unique
IDs, safe web URLs and relationship targets. The format guide is here rather
than in a second JSON file. A copy-and-paste researcher prompt, including a
filled-out event template, is in [UPDATE_PROMPT.md](UPDATE_PROMPT.md).

### Adding an event

Append an object to the `events` array. Only these three properties are required:

```json
{
  "id": "2026-09-04-your-event-slug",
  "date_start": "2026-09-04",
  "title": "Your descriptive event title"
}
```

The example above is a placeholder, not an actual historical event. Commas
separate objects in the array; JSON does not allow comments or trailing commas.
Events can be inserted anywhere in the array: the timeline sorts them by date.
An omitted verification classification appears as **Not yet reviewed**.

| Optional property | What it controls |
| --- | --- |
| `date_end` | End of an event spanning more than one day; omit or use `null` for a single day. |
| `precision` | Optional text such as `day`, `time` or an explanation of uncertain timing; defaults to day/time from `date_start`. |
| `summary` | Short factual summary; attributed claims should stay attributed. |
| `intro` | Brief lead-in above the main summary. |
| `context` | Additional context in the right-hand panel. |
| `details` | An array of text paragraphs shown by **More details**; its first paragraph is also shown in the preview. |
| `sources` | An array of `{ "url": "…", "publisher": "…", "title": "…" }`; only `url` is required per source. |
| `theatres`, `actors`, `category` | Arrays of place/country names, participants and topic tags. Use existing spellings for matching filters. |
| `importance` | Integer from 1 to 5; 5 is most prominent. Omit to use the normal category-based prominence. |
| `theme` | `military`, `diplomacy`, `energy`, `signals` or `context`. |
| `verification` | `confirmed`, `legal_diplomatic`, `attribution_disputed`, `official_claim`, `unverified_contradicted` or `unreviewed`. |
| `media` | Remote images, YouTube reports, direct video URLs or document links, described below. |
| `relationships` | Optional links to other event IDs. No links are required to add an event. |
| `quote` | An exact, sourced quotation for events without an image. |
| `key_facts` | An array of `{ "label": "…", "value": "…" }` for the detailed view. |
| `claims` | An array of `{ "claim": "…", "status": "…" }` for claims that need attribution. |
| `search_aliases` | An array of alternative names or phrases that help search. |
| `reviewed_at`, `research_note` | Review date (`YYYY-MM-DD`) and any evidence limitations. |
| `editor_note` | Optional editorial note retained in the file. |
| `revisions` | Optional history of corrections: `{ "date": "YYYY-MM-DD", "reason": "…", "previous": { … }, "sources": [ … ] }`. These are notes, not another data layer; current event fields are already authoritative. |

Omit properties you do not have. Empty arrays are fine. Dates use `YYYY-MM-DD`.
For a known time, use an ISO timestamp with `Z` or a UTC offset, for example
`2026-09-04T14:30:00Z` or `2026-09-04T15:30:00+01:00`. Both represent the same
instant; the calendar places timestamps chronologically and displays their time
in UTC. Do not use ambiguous local timestamps without an offset.

The calendar includes empty days through **31 December 2028** and automatically
extends farther when an event or its end date lies beyond that. The optional
top-level `calendar_end` can extend empty space farther; no code change is needed.
The optional `initial_event_id` only controls the initial selection without a URL
hash. The other top-level metadata describes the collection; its `updated_at`
date is informational, not a requirement for detecting changed events.

### Images and video

Each media item needs only `url`. Use a **direct image address**, not the article
page address. YouTube URLs are recognized automatically, including watch, short,
live and embed links; thumbnails and the player are generated from the URL.
Direct `.mp4`, `.webm` and `.ogv` URLs use the video player. PDF URLs become document
links. Use `type` explicitly when the URL has no recognizable extension.

```json
"media": [
  {
    "type": "image",
    "url": "https://publisher.example/photo.jpg",
    "caption": "What this photograph actually shows, including its date if different",
    "credit": "Photographer / publisher",
    "source_url": "https://publisher.example/article"
  },
  {
    "type": "youtube",
    "url": "https://www.youtube.com/watch?v=7kp5Rfh9E2M",
    "caption": "Reuters report on the two-week ceasefire, 7 April 2026",
    "credit": "Reuters"
  }
]
```

The image addresses above are placeholders; the YouTube example is an existing
report, not footage to attach indiscriminately to other events. Optional
`thumbnail_url` supplies a custom poster; `captions_url` can provide WebVTT captions
for a direct video. A screenshot of a social post uses
`type: "social"`, the screenshot's image URL in `url`, and the original post or
source article in `source_url`. `platform` can name the service. A post's ordinary
web-page URL is not an image; this app does not execute arbitrary embed HTML.

Images and videos load directly from their providers; **no downloaded event
pictures are required by the app**. An internet connection is needed for them,
and providers can remove content or block hotlinking. An unavailable image shows
a fallback while the event and its source links remain usable. Preserve credits;
a remote URL is not permission to republish an image.

### Optional connections

Put a connection inside either event's `relationships` array and point `to` at
the other event's stable `id`. The app discovers both ends and draws the link;
do **not** duplicate the connection on both records. An event ID is not a sequence
number, and must not change when records are inserted or an event date is corrected.

```json
"relationships": [
  {
    "to": "2026-04-07-us-iran-two-week-ceasefire",
    "type": "negotiation",
    "label": "Connection label",
    "summary": "Explain what the evidence actually connects.",
    "confidence": "interpretive"
  }
]
```

Available types: `retaliation`, `precursor`, `escalation`, `deadline_response`,
`negotiation`, `implementation`, `breakdown`, `contextual_thread`. Confidence can
be `documented`, `strong_inference` or `interpretive`; omitting it defaults to
`interpretive`. Only `to` is required. An optional stable connection `id` is
generated from its endpoints/type when omitted. Existing links remain intact
when unrelated events are added. If a connection is uncertain, leave it out.

### Instructions for a future researcher or scheduled agent

1. Read **only `data/timeline.json`** for the current data and examples of the format.
2. Check for existing coverage before adding an event. Keep every existing ID and
   all unrelated records. In an append-only job, report corrections needed to
   an existing record instead of rewriting it or creating a duplicate.
3. Research meaningful developments, use credible sources and distinguish claims
   from independently established facts. Include direct source URLs and enough
   context to understand the event. Do not invent missing media or connections.
4. Append new records inside the existing `events` array. Change existing
   records only when separately authorised; correction notes can then be kept
   in that record's `revisions`. No app files need editing.
5. Parse and validate the result before replacing the live file. Prefer an atomic
   save (write a temporary candidate, validate it, then replace `data/timeline.json`)
   and re-read the latest file before saving to avoid overwriting someone else's edits.
6. If the project tools are available, run `npm run validate:data`. You can also
   validate a temporary candidate with `npm run validate:data -- path/to/candidate.json`.

The app is read-only: it displays research, but does not perform research, schedule
an agent, download event images or write to the data file.

For an append-only weekly research job, copy [UPDATE_PROMPT.md](UPDATE_PROMPT.md).
It contains the data contract and research rules; the agent does not need the
website's source code. Scheduling that job is separate from this app.

## Reading and navigation

The reading-size **A− / A+** controls cover **30–180%**, in ten-percentage-point
steps, in both the right-hand panel and **More details**. They share the same
setting. Hover over either control group to see the current percentage. Timeline
card sizing and calendar zoom are separate controls; reducing reading text does
not move the calendar.

## Development and checks

```text
npm ci
npm run dev
npm run validate:data
npm test
npm run lint
npm run build
npm start
```

Use either the development server or the built preview on port 3000, not both
simultaneously. `npm start` serves the built UI plus the **current
`data/timeline.json`**, not a stale build-time copy. The GitHub Pages workflow
validates and packages the file on each push to `main`; changing the online site
therefore requires committing `data/timeline.json`.

The repository now contains the React/Vite app, the four UI primitives it uses,
the JSON loader/validator and timeline helpers, focused tests, this guide, the
researcher prompt and the Windows launcher. Package/TypeScript/lint JSON files are build configuration,
**not additional event-data files**. `node_modules` is installed tooling and
`dist` is generated output; both are ignored by Git. No OpenAI hosting config,
Cloudflare account, API key or online service account is required.
