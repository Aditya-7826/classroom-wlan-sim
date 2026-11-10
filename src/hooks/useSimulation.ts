import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialState, sanitizeHiddenIds, sanitizeParams, sanitizeSettings, step } from '../sim/engine';
import { freshSeed, normalizeSeed } from '../sim/random';
import type { ModelParams, SimState, Speed, TrafficLevel } from '../sim/types';

export interface ScenarioConfig {
  deviceCount: number;
  traffic: TrafficLevel;
  /** Load used when traffic is 'custom' (kept even while a preset is selected). */
  customLoad: number;
  hiddenNode: boolean;
  /** Chosen hidden students (always a valid selection of at least two). */
  hiddenIds: number[];
  repeatable: boolean;
  seed: number;
  params: ModelParams;
}

export type RunMode = 'stopped' | 'round' | 'continuous';

export const SPEED_MS: Record<Speed, number> = { slow: 900, normal: 500, fast: 200 };
/** Ticks to pause between rounds in continuous mode, so the result stays readable. */
const ROUND_GAP_TICKS = 3;

/** Bring any config back to valid values (e.g. hidden ids after the device count drops). */
export function normalizeConfig(config: ScenarioConfig): ScenarioConfig {
  const base = sanitizeSettings({
    deviceCount: config.deviceCount,
    traffic: config.traffic,
    loadPercent: config.customLoad,
    hiddenNode: config.hiddenNode,
    seed: config.seed,
    params: config.params,
  });
  return {
    deviceCount: base.deviceCount,
    traffic: base.traffic,
    customLoad: sanitizeSettings({ traffic: 'custom', loadPercent: config.customLoad }).loadPercent,
    hiddenNode: base.hiddenNode,
    hiddenIds: sanitizeHiddenIds(config.hiddenIds, base.deviceCount),
    repeatable: config.repeatable === true,
    seed: base.seed,
    params: sanitizeParams(config.params),
  };
}

function buildState(config: ScenarioConfig): SimState {
  return createInitialState({
    deviceCount: config.deviceCount,
    traffic: config.traffic,
    loadPercent: config.customLoad,
    hiddenNode: config.hiddenNode,
    hiddenIds: config.hiddenIds,
    seed: config.repeatable ? normalizeSeed(config.seed) : freshSeed(),
    params: config.params,
  });
}

/**
 * Owns the simulation state and the ONE timer that drives it. The timer is
 * cleared whenever the mode or speed changes, on pause, on reset and on unmount.
 */
export function useSimulation(config: ScenarioConfig, speed: Speed, onRunFinished: (state: SimState) => void) {
  const [state, setState] = useState<SimState>(() => buildState(config));
  const [mode, setMode] = useState<RunMode>('stopped');

  const stateRef = useRef(state);
  const modeRef = useRef<RunMode>(mode);
  const gapRef = useRef(0);
  const finishedRef = useRef(onRunFinished);
  useEffect(() => {
    finishedRef.current = onRunFinished;
  }, [onRunFinished]);

  const changeMode = useCallback((next: RunMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const commit = useCallback((next: SimState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // The single timer.
  useEffect(() => {
    if (mode === 'stopped') return undefined;
    const id = setInterval(() => {
      const prev = stateRef.current;
      if (mode === 'continuous' && !prev.roundActive && gapRef.current > 0) {
        gapRef.current -= 1;
        return;
      }
      const next = step(prev);
      commit(next);
      if (!next.roundActive) {
        if (mode === 'round') {
          changeMode('stopped');
          finishedRef.current(next);
        } else {
          gapRef.current = ROUND_GAP_TICKS;
        }
      }
    }, SPEED_MS[speed]);
    return () => clearInterval(id);
  }, [mode, speed, commit, changeMode]);

  const runOneRound = useCallback(() => {
    if (modeRef.current !== 'stopped') return; // already running: ignore double clicks
    let current = stateRef.current;
    if (!current.roundActive) {
      current = step(current); // start the round right away
      commit(current);
      if (!current.roundActive) {
        // Nobody had anything to send: the round is already over.
        finishedRef.current(current);
        return;
      }
    }
    changeMode('round');
  }, [commit, changeMode]);

  const start = useCallback(() => {
    if (modeRef.current === 'continuous') return;
    gapRef.current = 0;
    changeMode('continuous');
  }, [changeMode]);

  const pause = useCallback(() => {
    if (modeRef.current === 'stopped') return;
    changeMode('stopped');
    finishedRef.current(stateRef.current);
  }, [changeMode]);

  const reset = useCallback(
    (nextConfig: ScenarioConfig) => {
      // Stopping a continuous run by resetting still saves what it did.
      if (modeRef.current === 'continuous') finishedRef.current(stateRef.current);
      changeMode('stopped');
      gapRef.current = 0;
      commit(buildState(nextConfig));
    },
    [commit, changeMode],
  );

  // Changing the scenario starts a fresh simulation.
  const configKey = JSON.stringify(config);
  const firstKeyRef = useRef(configKey);
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });
  useEffect(() => {
    if (firstKeyRef.current === configKey) return;
    firstKeyRef.current = configKey;
    reset(configRef.current);
  }, [configKey, reset]);

  return { state, mode, runOneRound, start, pause, reset: () => reset(configRef.current) };
}
