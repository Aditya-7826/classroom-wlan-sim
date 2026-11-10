import type { RunRecord } from '../hooks/useRunHistory';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Rows come from a public table, so never let one odd value break the page. */
function when(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateFormat.format(d);
}

function num(value: unknown, digits = 0): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

export function RunHistory({ runs }: { runs: RunRecord[] }) {
  return (
    <section className="card" aria-labelledby="history-title">
      <h2 id="history-title">Recent runs</h2>
      {runs.length === 0 ? (
        <p className="muted">No saved runs yet. Finish a round or pause a simulation to save one.</p>
      ) : (
        <div className="table-wrap" role="region" aria-labelledby="history-title" tabIndex={0}>
          <table className="table">
            <caption className="visually-hidden">Last 10 saved simulation summaries, newest first</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Devices</th>
                <th scope="col">Load</th>
                <th scope="col">Hidden</th>
                <th scope="col">Model</th>
                <th scope="col">Rounds</th>
                <th scope="col">Successes</th>
                <th scope="col">Collisions</th>
                <th scope="col">Retries</th>
                <th scope="col">Dropped</th>
                <th scope="col">Utilisation</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.created_at)}</td>
                  <td>{num(r.device_count)}</td>
                  <td>
                    <span className="capitalize">{String(r.traffic_level)}</span> ({num(r.load_percent)}%)
                  </td>
                  <td>{r.hidden_node ? `Yes (${num(r.hidden_count)})` : 'No'}</td>
                  <td>
                    CW {num(r.cw_min)}–{num(r.cw_max)}, {num(r.max_attempts)} tries, {num(r.frame_slots)}/
                    {num(r.slots_per_round)} slots
                  </td>
                  <td>{num(r.rounds)}</td>
                  <td>{num(r.successes)}</td>
                  <td>{num(r.collisions)}</td>
                  <td>{num(r.retries)}</td>
                  <td>{num(r.dropped)}</td>
                  <td>{num(r.channel_utilization)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
