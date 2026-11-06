import type { RunRecord } from '../hooks/useRunHistory';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
                <th scope="col">Hidden node</th>
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
                  <td>{dateFormat.format(new Date(r.created_at))}</td>
                  <td>{r.device_count}</td>
                  <td className="capitalize">{r.traffic_level}</td>
                  <td>{r.hidden_node ? 'Yes' : 'No'}</td>
                  <td>{r.rounds}</td>
                  <td>{r.successes}</td>
                  <td>{r.collisions}</td>
                  <td>{r.retries}</td>
                  <td>{r.dropped}</td>
                  <td>{Number(r.channel_utilization).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
