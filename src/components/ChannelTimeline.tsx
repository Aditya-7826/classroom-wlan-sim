import { SLOTS_PER_ROUND } from '../sim/engine';
import type { Slot, SlotKind } from '../sim/types';
import { Icon } from './Icon';

const LEGEND: { kind: SlotKind; label: string; text: string }[] = [
  { kind: 'idle', label: 'Idle', text: 'nobody sending or counting' },
  { kind: 'backoff', label: 'Backoff', text: 'students counting down' },
  { kind: 'transmit', label: 'Transmit', text: 'one student sending (S3 = Student 3)' },
  { kind: 'ack', label: 'ACK', text: 'access point confirms receipt' },
  { kind: 'collision', label: 'Collision', text: 'frames overlap, nothing gets through' },
];

export function ChannelTimeline({ slots, round }: { slots: Slot[]; round: number }) {
  const cells = Array.from({ length: SLOTS_PER_ROUND }, (_, i) => slots[i] ?? null);
  return (
    <section className="card" aria-labelledby="timeline-title">
      <div className="card__head">
        <h2 id="timeline-title">Shared channel</h2>
        <p className="muted">{round > 0 ? `Round ${round} · ${slots.length} of ${SLOTS_PER_ROUND} slots` : `${SLOTS_PER_ROUND} slots per round`}</p>
      </div>

      <ol className="timeline">
        {cells.map((slot, i) =>
          slot ? (
            <li key={i} className={`slot slot--${slot.kind}`} aria-label={`Slot ${slot.index}: ${slot.label}. ${slot.detail}`}>
              <span className="slot__num" aria-hidden="true">{slot.index}</span>
              <Icon name={slot.kind} size={18} />
              <span className="slot__label" aria-hidden="true">{slot.label}</span>
              <span className="slot__detail" aria-hidden="true">{slot.detail}</span>
            </li>
          ) : (
            <li key={i} className="slot slot--empty" aria-label={`Slot ${i + 1}: not used yet`}>
              <span className="slot__num" aria-hidden="true">{i + 1}</span>
              <span className="slot__label" aria-hidden="true">—</span>
            </li>
          ),
        )}
      </ol>

      <ul className="legend" aria-label="Legend">
        {LEGEND.map((item) => (
          <li key={item.kind} className={`legend__item legend__item--${item.kind}`}>
            <span className="legend__swatch">
              <Icon name={item.kind} size={14} />
            </span>
            <span>
              <strong>{item.label}</strong> — {item.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
