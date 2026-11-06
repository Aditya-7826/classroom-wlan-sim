import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialState, step } from '../sim/engine';
import { freshSeed, normalizeSeed } from '../sim/random';
import type { SimState, Speed, TrafficLevel } from '../sim/types';

export interface ScenarioConfig {
  deviceCount: number;
  traffic: TrafficLevel;
  hiddenNode: boolean;
  repeatable: boolean;
  seed: number;
}

export type RunMode = 'stopped' | 'round' | 'continuous';

export const SPEED_MS: Record<Speed, number> = { slow: 900, normal: 500, fast: 200 };
/** Ticks to pause between rounds in continuous mode, so the result stays readable. */
const ROUND_GAP_TICKS = 3;

function buildState(config: ScenarioConfig): SimState {
  return createInitialState({
    deviceCount: config.deviceCount,
    traffic: config.traffic,
    hiddenNode: config.hiddenNode,
    seed: config.repeatable ? normalizeSeed(config.seed) : freshSeed(),
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
  const gapRef = useRef(0);
  const finishedRef = useRef(onRunFinished);
  useEffect(() => {
    finishedRef.current = onRunFinished;
  }, [onRunFinished]);

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
          setMode('stopped');
          finishedRef.current(next);
        } else {
          gapRef.current = ROUND_GAP_TICKS;
        }
      }
    }, SPEED_MS[speed]);
    return () => clearInterval(id);
  }, [mode, speed, commit]);

  const runOneRound = useCallback(() => {
    let current = stateRef.current;
    if (!current.roundActive) {
      current = step(current); // start the round right away
      commit(current);
      if (!current.roundActive) {
        // Nobody had anything to send: the round is already over.
        setMode('stopped');
        finishedRef.current(current);
        return;
      }
    }
    setMode('round');
  }, [commit]);

  const start = useCallback(() => {
    gapRef.current = 0;
    setMode('continuous');
  }, []);

  const pause = useCallback(() => {
    setMode('stopped');
    finishedRef.current(stateRef.current);
  }, []);

  const reset = useCallback(
    (nextConfig: ScenarioConfig) => {
      setMode('stopped');
      gapRef.current = 0;
      commit(buildState(nextConfig));
    },
    [commit],
  );

  // Changing the scenario starts a fresh simulation.
  const configKey = `${config.deviceCount}|${config.traffic}|${config.hiddenNode}|${config.repeatable}|${config.seed}`;
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
