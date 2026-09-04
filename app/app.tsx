import TimelineExplorer from '@/components/timeline-explorer';
import { useTimelineData } from '@/lib/use-timeline-data';

export default function App() {
  const { data, error, refresh } = useTimelineData();
  if (!data) return <main className="data-loading" aria-live="polite">
    <h1>{error ? 'The timeline file needs attention' : 'Opening timeline'}</h1>
    <p>{error ?? 'Reading data/timeline.json…'}</p>
    {error ? <button type="button" onClick={refresh}>Try again</button> : null}
  </main>;
  return <>
    <TimelineExplorer data={data} onRefresh={refresh} />
    {error ? <output className="data-update-error">
      <span><strong>Showing the last valid timeline.</strong><span className="data-error-description">{error}</span></span>
      <button type="button" onClick={refresh}>Retry</button>
    </output> : null}
  </>;
}
