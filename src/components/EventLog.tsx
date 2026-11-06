import type { SimEvent } from '../sim/types';

export function EventLog({ events }: { events: SimEvent[] }) {
  return (
    <section className="card" aria-labelledby="log-title">
      <h2 id="log-title">What just happened</h2>
      {events.length === 0 ? (
        <p className="muted" aria-live="polite">
          Events will appear here, newest first.
        </p>
      ) : (
        <ol className="log" aria-live="polite" aria-relevant="additions">
          {events.map((e) => (
            <li key={e.id} className={`log__item log__item--${e.tone}`}>
              <span className="log__when">
                R{e.round}
                {e.slot !== null ? ` · slot ${e.slot}` : ''}
              </span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
