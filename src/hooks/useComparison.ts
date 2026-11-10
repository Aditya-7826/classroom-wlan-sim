import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_COMPARE_SLOTS,
  aggregate,
  buildScenarios,
  estimateSlots,
  runScenario,
  sanitizeCompareInput,
  seedList,
  type CompareInput,
  type CompareRow,
} from '../sim/compare';
import type { RunSummary } from '../sim/types';

export type CompareStatus = 'idle' | 'running' | 'done' | 'cancelled';

/** Time budget per chunk, so the page keeps responding while a comparison runs. */
const CHUNK_MS = 30;

/**
 * Runs a comparison in small chunks on the main thread. Only one chunk timer
 * exists at a time; it is cleared on cancel, on a new run and on unmount.
 */
export function useComparison() {
  const [status, setStatus] = useState<CompareStatus>('idle');
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [used, setUsed] = useState<CompareInput | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const run = useCallback(
    (raw: CompareInput) => {
      clearTimer();
      const input = sanitizeCompareInput(raw);
      if (estimateSlots(input) > MAX_COMPARE_SLOTS) return;
      const scenarios = buildScenarios(input);
      const seeds = seedList(input.baseSeed, input.seeds);
      const total = scenarios.length * seeds.length;
      if (total === 0) return;

      const results: RunSummary[][] = scenarios.map(() => []);
      let next = 0;
      setUsed(input);
      setRows([]);
      setProgress({ done: 0, total });
      setStatus('running');

      const tick = () => {
        const started = performance.now();
        while (next < total && performance.now() - started < CHUNK_MS) {
          const sc = Math.floor(next / seeds.length);
          results[sc].push(runScenario(scenarios[sc].settings, seeds[next % seeds.length], input.rounds));
          next += 1;
        }
        setProgress({ done: next, total });
        if (next < total) {
          timerRef.current = setTimeout(tick, 0);
          return;
        }
        timerRef.current = null;
        setRows(scenarios.map((sc, i) => aggregate(sc, results[i])));
        setStatus('done');
      };
      timerRef.current = setTimeout(tick, 0);
    },
    [clearTimer],
  );

  const cancel = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimer();
    setStatus('cancelled');
  }, [clearTimer]);

  return { status, rows, used, progress, run, cancel };
}
