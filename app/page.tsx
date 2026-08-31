import timeline from '../iran_conflict_timeline_2020_2026.json';
import TimelineExplorer, {
  type TimelinePayload,
} from '@/components/timeline-explorer';

export default function Home() {
  return <TimelineExplorer data={timeline as TimelinePayload} />;
}
