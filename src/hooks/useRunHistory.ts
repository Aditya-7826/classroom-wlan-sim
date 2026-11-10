import { useCallback, useEffect, useRef, useState } from 'react';
import { RUNS_TABLE, supabase } from '../lib/supabase';
import type { RunSummary, TrafficLevel } from '../sim/types';

export type DbStatus = 'local' | 'checking' | 'connected';

export interface RunRecord {
  id: string;
  created_at: string;
  device_count: number;
  traffic_level: TrafficLevel;
  load_percent: number;
  hidden_node: boolean;
  hidden_count: number;
  cw_min: number;
  cw_max: number;
  max_attempts: number;
  slots_per_round: number;
  frame_slots: number;
  successes: number;
  collisions: number;
  retries: number;
  dropped: number;
  rounds: number;
  channel_utilization: number;
}

const SAVE_DEBOUNCE_MS = 1500;
/** Matches the upper bound in the database checks. */
const MAX_COUNTER = 100000;
const COLUMNS =
  'id, created_at, device_count, traffic_level, load_percent, hidden_node, hidden_count, cw_min, cw_max, ' +
  'max_attempts, slots_per_round, frame_slots, successes, collisions, retries, dropped, rounds, channel_utilization';

function counter(n: number): number {
  return Math.min(Math.max(Math.trunc(Number.isFinite(n) ? n : 0), 0), MAX_COUNTER);
}

/** Map a summary to an insert row that always satisfies the database checks. */
export function toInsertRow(summary: RunSummary) {
  return {
    device_count: summary.deviceCount,
    traffic_level: summary.traffic,
    load_percent: summary.loadPercent,
    hidden_node: summary.hiddenNode,
    hidden_count: summary.hiddenNode ? summary.hiddenCount : 0,
    cw_min: summary.cwMin,
    cw_max: summary.cwMax,
    max_attempts: summary.maxAttempts,
    slots_per_round: summary.slotsPerRound,
    frame_slots: summary.frameSlots,
    successes: counter(summary.successes),
    collisions: counter(summary.collisions),
    retries: counter(summary.retries),
    dropped: counter(summary.dropped),
    rounds: counter(summary.rounds),
    channel_utilization: Math.min(Math.max(summary.utilization, 0), 100),
  };
}

/**
 * Optional run history. With no Supabase config — or after any network
 * error — it switches to "Local only" and the simulator keeps working.
 */
export function useRunHistory() {
  const [status, setStatus] = useState<DbStatus>(supabase ? 'checking' : 'local');
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const statusRef = useRef(status);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const goLocal = useCallback((message: string) => {
    statusRef.current = 'local';
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!mountedRef.current) return;
    setStatus('local');
    setNotice(message);
  }, []);

  const loadRuns = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from(RUNS_TABLE)
        .select(COLUMNS)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      if (!mountedRef.current || statusRef.current === 'local') return;
      setRuns((data ?? []) as unknown as RunRecord[]);
      statusRef.current = 'connected';
      setStatus('connected');
    } catch {
      goLocal(
        'Could not reach the run history (or its table is missing the latest migration), so results are not being saved. The simulator still works.',
      );
    }
  }, [goLocal]);

  useEffect(() => {
    mountedRef.current = true;
    void loadRuns();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loadRuns]);

  /** Debounced: rapid clicking only produces one insert. Saves made while still connecting are kept. */
  const save = useCallback(
    (summary: RunSummary) => {
      if (!supabase || statusRef.current === 'local' || summary.rounds === 0) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      const attempt = async () => {
        timerRef.current = null;
        // Still connecting: try again shortly instead of losing the run.
        if (statusRef.current === 'checking') {
          timerRef.current = setTimeout(attempt, SAVE_DEBOUNCE_MS);
          return;
        }
        if (!supabase || statusRef.current !== 'connected') return;
        const row = toInsertRow(summary);
        const signature = JSON.stringify(row);
        if (signature === lastSavedRef.current) return;
        try {
          const { error } = await supabase.from(RUNS_TABLE).insert(row);
          if (error) throw error;
          lastSavedRef.current = signature;
          await loadRuns();
        } catch {
          goLocal('Saving the run failed, so run history is switched off for now. The simulator still works.');
        }
      };
      timerRef.current = setTimeout(attempt, SAVE_DEBOUNCE_MS);
    },
    [goLocal, loadRuns],
  );

  return { status, runs, notice, save };
}
