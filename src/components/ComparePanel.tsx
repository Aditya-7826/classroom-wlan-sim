import { useId, useState } from 'react';
import { useComparison } from '../hooks/useComparison';
import type { ScenarioConfig } from '../hooks/useSimulation';
import {
  COMPARE_ROUNDS_RANGE,
  COMPARE_SEEDS_RANGE,
  MAX_COMPARE_SLOTS,
  estimateSlots,
  seedList,
  type CompareInput,
  type CompareRow,
} from '../sim/compare';
import { MAX_DEVICES, MIN_DEVICES, TRAFFIC_PERCENT } from '../sim/engine';
import type { TrafficLevel } from '../sim/types';

interface Props {
  config: ScenarioConfig;
  /** Seed the live simulator is using, so comparisons line up with it. */
  seedInUse: number;
}

const ALL_DEVICES = Array.from({ length: MAX_DEVICES - MIN_DEVICES + 1 }, (_, i) => i + MIN_DEVICES);
const DEVICE_PRESETS: { label: string; values: number[] }[] = [
  { label: 'Every 5', values: [5, 10, 15, 20] },
  { label: 'All', values: ALL_DEVICES },
  { label: 'None', values: [] },
];

function loadLabel(level: TrafficLevel, customLoad: number): string {
  if (level === 'custom') return `Custom (${customLoad}%)`;
  return `${level[0].toUpperCase()}${level.slice(1)} (${TRAFFIC_PERCENT[level]}%)`;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function toggle<T>(list: T[], value: T, on: boolean): T[] {
  return on ? (list.includes(value) ? list : [...list, value]) : list.filter((x) => x !== value);
}

export function ComparePanel({ config, seedInUse }: Props) {
  const id = useId();
  const cmp = useComparison();
  const [deviceCounts, setDeviceCounts] = useState<number[]>([5, 10, 15, 20]);
  const [traffic, setTraffic] = useState<TrafficLevel[]>(['light', 'medium', 'heavy']);
  const [hidden, setHidden] = useState<boolean[]>([false]);
  const [rounds, setRounds] = useState(20);
  const [seeds, setSeeds] = useState(3);

  const input: CompareInput = {
    deviceCounts,
    traffic,
    hidden,
    rounds,
    seeds,
    baseSeed: seedInUse,
    loadPercent: config.customLoad,
    hiddenIds: config.hiddenIds,
    params: config.params,
  };
  const scenarioCount = deviceCounts.length * traffic.length * hidden.length;
  const work = estimateSlots(input);
  const tooBig = work > MAX_COMPARE_SLOTS;
  const running = cmp.status === 'running';

  let problem: string | null = null;
  if (deviceCounts.length === 0) problem = 'Tick at least one device count.';
  else if (traffic.length === 0) problem = 'Tick at least one traffic load.';
  else if (hidden.length === 0) problem = 'Tick hidden-node off, on, or both.';
  else if (tooBig) problem = 'That is too much work at once — tick fewer options, or lower the rounds or seeds.';

  return (
    <section className="card compare" aria-labelledby={`${id}-title`}>
      <div className="card__head">
        <h2 id={`${id}-title`}>Compare scenarios</h2>
        <p className="muted">Run many settings on the same seeds and see them side by side</p>
      </div>

      <div className="compare__grid">
        <fieldset className="field">
          <legend>Device counts</legend>
          <div className="chips">
            {ALL_DEVICES.map((d) => (
              <label key={d} className="chip">
                <input
                  type="checkbox"
                  checked={deviceCounts.includes(d)}
                  disabled={running}
                  onChange={(e) => setDeviceCounts(toggle(deviceCounts, d, e.target.checked).sort((a, b) => a - b))}
                />
                <span>{d}</span>
              </label>
            ))}
          </div>
          <div className="chip-actions">
            {DEVICE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="btn btn--small btn--ghost"
                disabled={running}
                onClick={() => setDeviceCounts([...p.values])}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Traffic loads</legend>
          <div className="checks">
            {(['light', 'medium', 'heavy', 'custom'] as TrafficLevel[]).map((t) => (
              <label key={t} className="check">
                <input
                  type="checkbox"
                  checked={traffic.includes(t)}
                  disabled={running}
                  onChange={(e) => setTraffic(toggle(traffic, t, e.target.checked))}
                />
                <span>{loadLabel(t, config.customLoad)}</span>
              </label>
            ))}
          </div>
          <p className="field__hint">The custom % comes from the Scenario panel.</p>
        </fieldset>

        <fieldset className="field">
          <legend>Hidden-node problem</legend>
          <div className="checks">
            <label className="check">
              <input
                type="checkbox"
                checked={hidden.includes(false)}
                disabled={running}
                onChange={(e) => setHidden(toggle(hidden, false, e.target.checked))}
              />
              <span>Off</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={hidden.includes(true)}
                disabled={running}
                onChange={(e) => setHidden(toggle(hidden, true, e.target.checked))}
              />
              <span>On ({config.hiddenIds.map((x) => `S${x}`).join(', ')})</span>
            </label>
          </div>
          <p className="field__hint">If a chosen hidden student doesn’t exist at a device count, S1 and S2 are used.</p>
        </fieldset>

        <div className="field">
          <label htmlFor={`${id}-rounds`}>
            Rounds per run <output htmlFor={`${id}-rounds`}>{rounds}</output>
          </label>
          <input
            id={`${id}-rounds`}
            type="range"
            min={COMPARE_ROUNDS_RANGE.min}
            max={COMPARE_ROUNDS_RANGE.max}
            value={rounds}
            disabled={running}
            onChange={(e) => setRounds(Number(e.target.value))}
          />
          <label htmlFor={`${id}-seeds`} className="field__second">
            Seeds to average <output htmlFor={`${id}-seeds`}>{seeds}</output>
          </label>
          <input
            id={`${id}-seeds`}
            type="range"
            min={COMPARE_SEEDS_RANGE.min}
            max={COMPARE_SEEDS_RANGE.max}
            value={seeds}
            disabled={running}
            onChange={(e) => setSeeds(Number(e.target.value))}
          />
          <p className="field__hint">
            Seeds {seedList(seedInUse, seeds)[0]}
            {seeds > 1 ? `–${seedList(seedInUse, seeds).at(-1)}` : ''}, using the model settings above.
          </p>
        </div>
      </div>

      <div className="controls__actions">
        {running ? (
          <button type="button" className="btn" onClick={cmp.cancel}>
            Cancel
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => cmp.run(input)} disabled={problem !== null}>
            Run comparison
          </button>
        )}
        <p className="controls__note" aria-live="polite">
          {running
            ? `Running… ${cmp.progress.done} of ${cmp.progress.total} runs done.`
            : (problem ??
              `${scenarioCount} scenario${scenarioCount === 1 ? '' : 's'} × ${seeds} seed${seeds === 1 ? '' : 's'} × ${rounds} round${rounds === 1 ? '' : 's'}.`)}
          {cmp.status === 'cancelled' && !running ? ' Last comparison was cancelled.' : ''}
        </p>
      </div>

      {running && (
        <progress className="compare__progress" max={cmp.progress.total} value={cmp.progress.done}>
          {cmp.progress.done} of {cmp.progress.total}
        </progress>
      )}

      {cmp.status === 'done' && cmp.used && <CompareTable rows={cmp.rows} used={cmp.used} />}
    </section>
  );
}

function CompareTable({ rows, used }: { rows: CompareRow[]; used: CompareInput }) {
  const best = Math.max(...rows.map((r) => r.utilization));
  const worst = Math.max(...rows.map((r) => r.collisions));
  const seeds = seedList(used.baseSeed, used.seeds);
  const p = used.params;
  return (
    <div className="compare__results">
      <p className="muted small">
        Averages of {used.seeds} run{used.seeds === 1 ? '' : 's'} (seed{used.seeds === 1 ? '' : 's'} {seeds[0]}
        {used.seeds > 1 ? `–${seeds.at(-1)}` : ''}) × {used.rounds} round{used.rounds === 1 ? '' : 's'} each. Model: CW
        0–{p.cwMin} → 0–{p.cwMax}, {p.maxAttempts} attempts, {p.frameSlots}-slot frames, {p.slotsPerRound}-slot rounds.
      </p>
      <div className="table-wrap" role="region" aria-label="Comparison results" tabIndex={0}>
        <table className="table">
          <caption className="visually-hidden">Comparison results, one row per scenario</caption>
          <thead>
            <tr>
              <th scope="col">Devices</th>
              <th scope="col">Load</th>
              <th scope="col">Hidden</th>
              <th scope="col">Delivered</th>
              <th scope="col">Collisions</th>
              <th scope="col">Hidden-node</th>
              <th scope="col">Retries</th>
              <th scope="col">Dropped</th>
              <th scope="col">Delivery rate</th>
              <th scope="col">Utilisation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.deviceCount}</th>
                <td>{loadLabel(r.traffic, r.loadPercent)}</td>
                <td>{r.hiddenNode ? r.hiddenIds.map((x) => `S${x}`).join(', ') : 'Off'}</td>
                <td>{fmt(r.successes)}</td>
                <td>
                  {fmt(r.collisions)}
                  {r.collisions === worst && worst > 0 && rows.length > 1 && <span className="tag tag--danger">most</span>}
                </td>
                <td>{r.hiddenNode ? fmt(r.hiddenCollisions) : '—'}</td>
                <td>{fmt(r.retries)}</td>
                <td>{fmt(r.dropped)}</td>
                <td>{r.successes + r.dropped === 0 ? '—' : `${r.deliveryRate.toFixed(0)}%`}</td>
                <td>
                  <span className="meter" aria-hidden="true">
                    <span className="meter__fill" style={{ width: `${r.utilization}%` }} />
                  </span>
                  {r.utilization.toFixed(0)}%
                  {r.utilization === best && best > 0 && rows.length > 1 && <span className="tag tag--success">best</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Delivery rate = delivered ÷ (delivered + dropped). Utilisation = share of slots carrying a delivered frame or its
        ACK.
      </p>
    </div>
  );
}
