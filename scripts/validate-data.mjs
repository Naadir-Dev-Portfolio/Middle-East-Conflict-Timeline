import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateTimeline } from '../lib/timeline-validation.mjs';

const path = process.argv[2] ?? fileURLToPath(new URL('../data/timeline.json', import.meta.url));
try {
  const file = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  const result = validateTimeline(file);
  if (result.errors.length) {
    console.error(`Timeline validation failed with ${result.errors.length} error(s):`);
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else {
    const c = result.counts;
    console.log(`Timeline valid: ${c.events} events, ${c.dossiers} detailed entries, ${c.media} media URLs, ${c.relations} connections.`);
    console.log('One data file: data/timeline.json. Optional fields, dates, IDs, sources and links checked.');
  }
  for (const warning of result.warnings) console.warn(`  Warning: ${warning}`);
} catch (error) {
  console.error(`Could not read the timeline JSON: ${error.message}`);
  process.exitCode = 1;
}
