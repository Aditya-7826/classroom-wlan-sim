import { useCallback, useState } from 'react';
import { ChannelTimeline } from './components/ChannelTimeline';
import { ComparePanel } from './components/ComparePanel';
import { Controls } from './components/Controls';
import { DbStatus } from './components/DbStatus';
import { DeviceCard } from './components/DeviceCard';
import { EventLog } from './components/EventLog';
import { Header } from './components/Header';
import { LearnPanel } from './components/LearnPanel';
import { RunHistory } from './components/RunHistory';
import { SummaryStats } from './components/SummaryStats';
import { useRunHistory } from './hooks/useRunHistory';
import { normalizeConfig, useSimulation, type ScenarioConfig } from './hooks/useSimulation';
import { DEFAULT_HIDDEN_IDS, DEFAULT_SETTINGS, toRunSummary } from './sim/engine';
import type { SimState, Speed } from './sim/types';

const INITIAL_CONFIG: ScenarioConfig = {
  deviceCount: DEFAULT_SETTINGS.deviceCount,
  traffic: DEFAULT_SETTINGS.traffic,
  customLoad: 50,
  hiddenNode: DEFAULT_SETTINGS.hiddenNode,
  hiddenIds: [...DEFAULT_HIDDEN_IDS],
  repeatable: true,
  seed: DEFAULT_SETTINGS.seed,
  params: { ...DEFAULT_SETTINGS.params },
};

export default function App() {
  const [config, setConfig] = useState<ScenarioConfig>(INITIAL_CONFIG);
  const [speed, setSpeed] = useState<Speed>('normal');
  const history = useRunHistory();

  const { save } = history;
  const handleFinished = useCallback((s: SimState) => save(toRunSummary(s)), [save]);
  const sim = useSimulation(config, speed, handleFinished);
  const { state } = sim;
  // Every change goes through normalizeConfig, so the UI can never hold an invalid scenario.
  const changeConfig = useCallback((next: ScenarioConfig) => setConfig(normalizeConfig(next)), []);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to the simulator
      </a>
      <div className="page">
        <Header status={<DbStatus status={history.status} />} />
        {history.notice && (
          <p className="notice" role="status">
            {history.notice}
          </p>
        )}

        <main id="main" className="layout">
          <Controls
            config={config}
            onConfigChange={changeConfig}
            speed={speed}
            onSpeedChange={setSpeed}
            mode={sim.mode}
            seedInUse={state.settings.seed}
            onRunRound={sim.runOneRound}
            onStart={sim.start}
            onPause={sim.pause}
            onReset={sim.reset}
          />

          <p className={`outcome outcome--${state.outcomeTone}`} aria-live="polite">
            {state.outcome}
          </p>

          <ChannelTimeline slots={state.slots} round={state.round} slotsPerRound={state.settings.params.slotsPerRound} />

          <section className="card" aria-labelledby="devices-title">
            <div className="card__head">
              <h2 id="devices-title">Devices</h2>
              <p className="muted">One access point, {state.stations.length} students</p>
            </div>
            <ul className="devices">
              {state.stations.map((st) => (
                <DeviceCard key={st.id} station={st} params={state.settings.params} />
              ))}
            </ul>
          </section>

          <div className="columns">
            <div className="stack">
              <SummaryStats summary={state.summary} hiddenNode={state.settings.hiddenNode} />
              <EventLog events={state.events} />
            </div>
            <LearnPanel params={state.settings.params} hiddenIds={state.settings.hiddenIds} />
          </div>

          <ComparePanel config={config} seedInUse={state.settings.seed} />

          {history.status === 'connected' && <RunHistory runs={history.runs} />}
        </main>

        <footer className="footer">
          <p>
            <strong>Teaching model only.</strong> Simplified CSMA/CA with made-up slot counts and window sizes. It is
            not an IEEE 802.11-accurate simulation (no SIFS/DIFS timing, no RTS/CTS, no real radio physics).
          </p>
        </footer>
      </div>
    </>
  );
}
