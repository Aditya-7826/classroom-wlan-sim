import { useId, useState } from 'react';
import type { RunMode, ScenarioConfig } from '../hooks/useSimulation';
import { MAX_DEVICES, MIN_DEVICES } from '../sim/engine';
import { MAX_SEED } from '../sim/random';
import type { Speed, TrafficLevel } from '../sim/types';

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
  { value: 'light', label: 'Light', hint: '≈30% ready' },
  { value: 'medium', label: 'Medium', hint: '≈60% ready' },
  { value: 'heavy', label: 'Heavy', hint: '≈90% ready' },
];

const SPEEDS: { value: Speed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

export function Controls(props: Props) {
  const { config, onConfigChange, speed, onSpeedChange, mode, seedInUse } = props;
  const id = useId();
  const [seedText, setSeedText] = useState(String(config.seed));
  const running = mode !== 'stopped';
  const set = (patch: Partial<ScenarioConfig>) => onConfigChange({ ...config, ...patch });

  const seedValid = /^\d+$/.test(seedText) && Number(seedText) <= MAX_SEED;

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
            value={config.deviceCount}
            onChange={(e) => set({ deviceCount: Number(e.target.value) })}
          />
          <p className="field__hint">Student 1 to Student {config.deviceCount}</p>
        </div>

        <fieldset className="field">
          <legend>Traffic load</legend>
          <div className="segmented">
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
              <small>Students 1 and 2 can’t hear each other</small>
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
              value={config.repeatable ? seedText : String(seedInUse)}
              disabled={!config.repeatable}
              aria-invalid={config.repeatable && !seedValid}
              aria-describedby={`${id}-seed-hint`}
              onChange={(e) => {
                const text = e.target.value.trim();
                setSeedText(text);
                if (/^\d+$/.test(text) && Number(text) <= MAX_SEED) set({ seed: Number(text) });
              }}
            />
            <p id={`${id}-seed-hint`} className="field__hint">
              {config.repeatable
                ? seedValid
                  ? 'Changing it restarts the scenario.'
                  : `Use a whole number from 0 to ${MAX_SEED}.`
                : 'Random seed this run (turn on Repeatable to reuse it).'}
            </p>
          </div>
        </div>
      </div>

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
        <p className="controls__note">Changing devices, load, hidden node or seed starts a fresh scenario.</p>
      </div>
    </section>
  );
}
