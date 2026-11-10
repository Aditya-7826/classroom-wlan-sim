import { useId, useState } from 'react';
import type { RunMode, ScenarioConfig } from '../hooks/useSimulation';
import {
  ATTEMPTS_RANGE,
  CW_MAX_OPTIONS,
  CW_MIN_OPTIONS,
  DEFAULT_PARAMS,
  FRAME_RANGE,
  LOAD_RANGE,
  MAX_DEVICES,
  MIN_DEVICES,
  SLOTS_RANGE,
  TRAFFIC_PERCENT,
} from '../sim/engine';
import { MAX_SEED } from '../sim/random';
import type { ModelParams, Speed, TrafficLevel } from '../sim/types';

interface Props {
  config: ScenarioConfig;
  onConfigChange: (next: ScenarioConfig) => void;
  speed: Speed;
  onSpeedChange: (speed: Speed) => void;
  mode: RunMode;
  seedInUse: number;
  onRunRound: () => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
}

const TRAFFIC: { value: TrafficLevel; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: `≈${TRAFFIC_PERCENT.light}% ready` },
  { value: 'medium', label: 'Medium', hint: `≈${TRAFFIC_PERCENT.medium}% ready` },
  { value: 'heavy', label: 'Heavy', hint: `≈${TRAFFIC_PERCENT.heavy}% ready` },
  { value: 'custom', label: 'Custom', hint: 'set %' },
];

const SPEEDS: { value: Speed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

function isValidSeedText(text: string): boolean {
  return /^\d{1,10}$/.test(text) && Number(text) <= MAX_SEED;
}

function sameParams(a: ModelParams, b: ModelParams): boolean {
  return (Object.keys(a) as (keyof ModelParams)[]).every((k) => a[k] === b[k]);
}

export function Controls(props: Props) {
  const { config, onConfigChange, speed, onSpeedChange, mode, seedInUse } = props;
  const id = useId();
  const [seedText, setSeedText] = useState(String(config.seed));
  const running = mode !== 'stopped';
  const set = (patch: Partial<ScenarioConfig>) => onConfigChange({ ...config, ...patch });
  const setParam = (patch: Partial<ModelParams>) => set({ params: { ...config.params, ...patch } });

  const seedValid = isValidSeedText(seedText);
  const p = config.params;
  const isDefaultModel = sameParams(p, DEFAULT_PARAMS);

  const toggleHidden = (studentId: number, checked: boolean) => {
    const next = checked ? [...config.hiddenIds, studentId] : config.hiddenIds.filter((x) => x !== studentId);
    if (next.length < 2) return; // the picker never allows fewer than two
    set({ hiddenIds: next.sort((a, b) => a - b) });
  };

  return (
    <section className="card controls" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Scenario</h2>

      <div className="controls__grid">
        <div className="field">
          <label htmlFor={`${id}-devices`}>
            Devices <output htmlFor={`${id}-devices`}>{config.deviceCount}</output>
          </label>
          <input
            id={`${id}-devices`}
            type="range"
            min={MIN_DEVICES}
            max={MAX_DEVICES}
            step={1}
            value={config.deviceCount}
            aria-describedby={`${id}-devices-hint`}
            onChange={(e) => set({ deviceCount: Number(e.target.value) })}
          />
          <p id={`${id}-devices-hint`} className="field__hint">
            Student 1 to Student {config.deviceCount} (up to {MAX_DEVICES})
          </p>
        </div>

        <fieldset className="field">
          <legend>Traffic load</legend>
          <div className="segmented segmented--4">
            {TRAFFIC.map((t) => (
              <label key={t.value} className="segmented__option">
                <input
                  type="radio"
                  name={`${id}-traffic`}
                  value={t.value}
                  checked={config.traffic === t.value}
                  onChange={() => set({ traffic: t.value })}
                />
                <span>
                  {t.label}
                  <small>{t.hint}</small>
                </span>
              </label>
            ))}
          </div>
          {config.traffic === 'custom' && (
            <div className="subfield">
              <label htmlFor={`${id}-load`}>
                Chance of a new frame per round <output htmlFor={`${id}-load`}>{config.customLoad}%</output>
              </label>
              <input
                id={`${id}-load`}
                type="range"
                min={LOAD_RANGE.min}
                max={LOAD_RANGE.max}
                step={5}
                value={config.customLoad}
                onChange={(e) => set({ customLoad: Number(e.target.value) })}
              />
            </div>
          )}
        </fieldset>

        <fieldset className="field">
          <legend>Speed</legend>
          <div className="segmented">
            {SPEEDS.map((s) => (
              <label key={s.value} className="segmented__option">
                <input
                  type="radio"
                  name={`${id}-speed`}
                  value={s.value}
                  checked={speed === s.value}
                  onChange={() => onSpeedChange(s.value)}
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
          <p className="field__hint">Speed can change while running.</p>
        </fieldset>

        <div className="field field--toggles">
          <label className="toggle">
            <input
              type="checkbox"
              role="switch"
              checked={config.hiddenNode}
              onChange={(e) => set({ hiddenNode: e.target.checked })}
            />
            <span className="toggle__track" aria-hidden="true" />
            <span>
              Hidden-node problem
              <small>
                {config.hiddenNode
                  ? `${config.hiddenIds.map((x) => `Student ${x}`).join(', ')} can’t hear each other`
                  : 'Pick students who can’t hear each other'}
              </small>
            </span>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              role="switch"
              checked={config.repeatable}
              onChange={(e) => set({ repeatable: e.target.checked })}
            />
            <span className="toggle__track" aria-hidden="true" />
            <span>
              Repeatable scenario
              <small>Same seed, same run every time</small>
            </span>
          </label>

          <div className="seed">
            <label htmlFor={`${id}-seed`}>Seed</label>
            <input
              id={`${id}-seed`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              value={config.repeatable ? seedText : String(seedInUse)}
              disabled={!config.repeatable}
              aria-invalid={config.repeatable && !seedValid}
              aria-describedby={`${id}-seed-hint`}
              onChange={(e) => {
                const text = e.target.value.trim();
                setSeedText(text);
                if (isValidSeedText(text)) set({ seed: Number(text) });
              }}
            />
            <p id={`${id}-seed-hint`} className="field__hint" aria-live="polite">
              {config.repeatable
                ? seedValid
                  ? 'Changing it restarts the scenario.'
                  : `Not valid — use a whole number from 0 to ${MAX_SEED}. Still using seed ${seedInUse}.`
                : 'Random seed this run (turn on Repeatable to reuse it).'}
            </p>
          </div>
        </div>
      </div>

      {config.hiddenNode && (
        <fieldset className="field picker">
          <legend>Hidden students</legend>
          <p className="field__hint" id={`${id}-hidden-hint`}>
            Ticked students can’t hear one another, though all can reach the access point. Pick at least two. They
            always have a frame ready.
          </p>
          <div className="chips" aria-describedby={`${id}-hidden-hint`}>
            {Array.from({ length: config.deviceCount }, (_, i) => i + 1).map((sid) => {
              const checked = config.hiddenIds.includes(sid);
              const locked = checked && config.hiddenIds.length <= 2;
              return (
                <label key={sid} className="chip" title={locked ? 'At least two students must stay hidden' : undefined}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={(e) => toggleHidden(sid, e.target.checked)}
                  />
                  <span>S{sid}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <details className="advanced">
        <summary>
          <span>Model settings</span>
          <span className="advanced__summary">
            CW 0–{p.cwMin} → 0–{p.cwMax} · {p.maxAttempts} attempt{p.maxAttempts === 1 ? '' : 's'} · {p.frameSlots}
            -slot frames · {p.slotsPerRound}-slot rounds{isDefaultModel ? ' (defaults)' : ''}
          </span>
        </summary>

        <div className="advanced__grid">
          <div className="field">
            <label htmlFor={`${id}-cwmin`}>Starting wait window</label>
            <select
              id={`${id}-cwmin`}
              value={p.cwMin}
              onChange={(e) => {
                const cwMin = Number(e.target.value);
                setParam({ cwMin, cwMax: Math.max(p.cwMax, CW_MAX_OPTIONS.find((o) => o >= cwMin) ?? cwMin) });
              }}
            >
              {CW_MIN_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  0–{v} slots
                </option>
              ))}
            </select>
            <p className="field__hint">First wait is drawn from this range.</p>
          </div>

          <div className="field">
            <label htmlFor={`${id}-cwmax`}>Largest wait window</label>
            <select id={`${id}-cwmax`} value={p.cwMax} onChange={(e) => setParam({ cwMax: Number(e.target.value) })}>
              {CW_MAX_OPTIONS.filter((v) => v >= p.cwMin).map((v) => (
                <option key={v} value={v}>
                  0–{v} slots
                </option>
              ))}
            </select>
            <p className="field__hint">Doubling stops here.</p>
          </div>

          <div className="field">
            <label htmlFor={`${id}-attempts`}>
              Attempts per frame <output htmlFor={`${id}-attempts`}>{p.maxAttempts}</output>
            </label>
            <input
              id={`${id}-attempts`}
              type="range"
              min={ATTEMPTS_RANGE.min}
              max={ATTEMPTS_RANGE.max}
              value={p.maxAttempts}
              onChange={(e) => setParam({ maxAttempts: Number(e.target.value) })}
            />
            <p className="field__hint">After the last failed attempt the frame is dropped.</p>
          </div>

          <div className="field">
            <label htmlFor={`${id}-frame`}>
              Frame length <output htmlFor={`${id}-frame`}>{p.frameSlots}</output>
            </label>
            <input
              id={`${id}-frame`}
              type="range"
              min={FRAME_RANGE.min}
              max={FRAME_RANGE.max}
              value={p.frameSlots}
              onChange={(e) => setParam({ frameSlots: Number(e.target.value) })}
            />
            <p className="field__hint">Data slots per frame, plus 1 ACK slot.</p>
          </div>

          <div className="field">
            <label htmlFor={`${id}-slots`}>
              Slots per round <output htmlFor={`${id}-slots`}>{p.slotsPerRound}</output>
            </label>
            <input
              id={`${id}-slots`}
              type="range"
              min={SLOTS_RANGE.min}
              max={SLOTS_RANGE.max}
              value={p.slotsPerRound}
              onChange={(e) => setParam({ slotsPerRound: Number(e.target.value) })}
            />
            <p className="field__hint">Length of the channel timeline.</p>
          </div>

          <div className="field advanced__reset">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={isDefaultModel}
              onClick={() => set({ params: { ...DEFAULT_PARAMS } })}
            >
              Restore defaults
            </button>
          </div>
        </div>
      </details>

      <div className="controls__actions">
        <button type="button" className="btn btn--primary" onClick={props.onRunRound} disabled={running}>
          Run one round
        </button>
        {mode === 'continuous' ? (
          <button type="button" className="btn" onClick={props.onPause}>
            Pause
          </button>
        ) : (
          <button type="button" className="btn" onClick={props.onStart}>
            Run simulation
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={props.onReset}>
          Reset
        </button>
        <p className="controls__note">Changing any scenario or model setting starts a fresh scenario.</p>
      </div>
    </section>
  );
}
