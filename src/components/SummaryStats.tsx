import { utilization } from '../sim/engine';
import type { Summary } from '../sim/types';

export function SummaryStats({ summary, hiddenNode }: { summary: Summary; hiddenNode: boolean }) {
  const items = [
    { label: 'Successful frames', value: summary.successes, tone: 'success' },
    { label: 'Collisions', value: summary.collisions, tone: 'danger' },
    ...(hiddenNode ? [{ label: 'Hidden-node collisions', value: summary.hiddenCollisions, tone: 'special' }] : []),
    { label: 'Retries', value: summary.retries, tone: 'warning' },
    { label: 'Dropped frames', value: summary.dropped, tone: 'danger' },
    { label: 'Channel utilisation', value: `${utilization(summary).toFixed(0)}%`, tone: 'accent' },
    { label: 'Rounds played', value: summary.rounds, tone: 'muted' },
  ];
  return (
    <section className="card" aria-labelledby="summary-title">
      <h2 id="summary-title">Summary</h2>
      <dl className="stats">
        {items.map((item) => (
          <div key={item.label} className={`stat stat--${item.tone}`}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">Utilisation = share of slots that carried a delivered frame or its ACK.</p>
    </section>
  );
}
