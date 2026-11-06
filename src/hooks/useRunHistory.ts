import { useCallback, useEffect, useRef, useState } from 'react';
import { RUNS_TABLE, supabase } from '../lib/supabase';
import type { RunSummary, TrafficLevel } from '../sim/types';

export type DbStatus = 'local' | 'checking' | 'connected';

export interface RunRecord {
  id: string;
  created_at: string;
  device_count: number;
  traffic_level: TrafficLevel;
  hidden_node: boolean;
  successes: number;
  collisions: number;
  retries: number;
  dropped: number;
  rounds: number;
  channel_utilization: number;
}

const SAVE_DEBOUNCE_MS = 1500;
const COLUMNS =
  'id, created_at, device_count, traffic_level, hidden_node, successes, collisions, retries, dropped, rounds, channel_utilization';

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
      if (!mountedRef.current) return;
      setRuns((data ?? []) as RunRecord[]);
      statusRef.current = 'connected';
      setStatus('connected');
    } catch {
      goLocal('Could not reach the run history, so results are not being saved. The simulator still works.');
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

  /** Debounced: rapid clicking only produces one insert. */
  const save = useCallback(
    (summary: RunSummary) => {
      if (!supabase || statusRef.current !== 'connected' || summary.rounds === 0) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        const signature = JSON.stringify(summary);
        if (signature === lastSavedRef.current || !supabase) return;
        try {
          const { error } = await supabase.from(RUNS_TABLE).insert({
            device_count: summary.deviceCount,
            traffic_level: summary.traffic,
            hidden_node: summary.hiddenNode,
            successes: summary.successes,
            collisions: summary.collisions,
            retries: summary.retries,
            dropped: summary.dropped,
            rounds: summary.rounds,
            channel_utilization: summary.utilization,
          });
          if (error) throw error;
          lastSavedRef.current = signature;
          await loadRuns();
        } catch {
          goLocal('Saving the run failed, so run history is switched off for now. The simulator still works.');
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [goLocal, loadRuns],
  );

  return { status, runs, notice, save };
}
