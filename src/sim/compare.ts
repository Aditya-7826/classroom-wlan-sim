/**
 * Scenario comparison — pure functions, no React.
 *
 * Builds every combination of the ticked device counts, loads and hidden-node
 * settings, runs each one headless for the same number of rounds on the same
 * seeds, and averages the results so scenarios can be compared fairly.
 */
import {
  MAX_DEVICES,
  MIN_DEVICES,
  TRAFFIC_LEVELS,
  createInitialState,
  runRounds,
  sanitizeHiddenIds,
  sanitizeParams,
  sanitizeSettings,
  toRunSummary,
} from './engine';
import { MAX_SEED, normalizeSeed } from './random';
import type { ModelParams, RunSummary, Settings, TrafficLevel } from './types';

export const COMPARE_ROUNDS_RANGE = { min: 1, max: 200 } as const;
export const COMPARE_SEEDS_RANGE = { min: 1, max: 10 } as const;
/** Upper bound on simulated slots per comparison (≈5 µs each), so a run finishes within seconds. */
export const MAX_COMPARE_SLOTS = 1_000_000;

export interface CompareInput {
  deviceCounts: number[];
  traffic: TrafficLevel[];
  /** Which hidden-node settings to include: false = off, true = on. */
  hidden: boolean[];
  rounds: number;
  /** Number of seeds to average over: baseSeed, baseSeed + 1, … */
  seeds: number;
  baseSeed: number;
  /** Used for the 'custom' load. */
  loadPercent: number;
  /** Hidden students to use when hidden-node is on (falls back to 1 and 2 if they don't exist). */
  hiddenIds: number[];
  params: ModelParams;
}

export interface Scenario {
  key: string;
  settings: Settings;
}

export interface CompareRow {
  key: string;
  deviceCount: number;
  traffic: TrafficLevel;
  loadPercent: number;
  hiddenNode: boolean;
  hiddenIds: number[];
  /** Number of seeded runs averaged into this row. */
  runs: number;
  rounds: number;
  successes: number;
  collisions: number;
  hiddenCollisions: number;
  retries: number;
  dropped: number;
  utilization: number;
  /** Delivered frames as a share of frames that finished (delivered + dropped), 0–100. */
  deliveryRate: number;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(Math.max(n, min), max);
}

/** Validated copy of the input: unknown values removed, duplicates dropped, ranges clamped. */
export function sanitizeCompareInput(input: CompareInput): CompareInput {
  const deviceCounts = [
    ...new Set(input.deviceCounts.filter((d) => Number.isInteger(d) && d >= MIN_DEVICES && d <= MAX_DEVICES)),
  ].sort((a, b) => a - b);
  const traffic = TRAFFIC_LEVELS.filter((t) => input.traffic.includes(t));
  const hidden = [false, true].filter((h) => input.hidden.includes(h));
  return {
    deviceCounts,
    traffic,
    hidden,
    rounds: clampInt(input.rounds, COMPARE_ROUNDS_RANGE.min, COMPARE_ROUNDS_RANGE.max),
    seeds: clampInt(input.seeds, COMPARE_SEEDS_RANGE.min, COMPARE_SEEDS_RANGE.max),
    baseSeed: normalizeSeed(input.baseSeed),
    loadPercent: clampInt(input.loadPercent, 0, 100),
    hiddenIds: input.hiddenIds.filter((x) => Number.isInteger(x)),
    params: sanitizeParams(input.params),
  };
}

export function buildScenarios(raw: CompareInput): Scenario[] {
  const input = sanitizeCompareInput(raw);
  const out: Scenario[] = [];
  for (const deviceCount of input.deviceCounts) {
    for (const traffic of input.traffic) {
      for (const hiddenNode of input.hidden) {
        const settings = sanitizeSettings({
          deviceCount,
          traffic,
          loadPercent: input.loadPercent,
          hiddenNode,
          hiddenIds: hiddenNode ? sanitizeHiddenIds(input.hiddenIds, deviceCount) : [],
          seed: input.baseSeed,
          params: input.params,
        });
        out.push({ key: `${deviceCount}|${traffic}|${hiddenNode ? 1 : 0}`, settings });
      }
    }
  }
  return out;
}

/** Seeds used for a scenario: base, base + 1, … (wrapping at the 32-bit limit). */
export function seedList(baseSeed: number, count: number): number[] {
  const base = normalizeSeed(baseSeed);
  return Array.from({ length: count }, (_, i) => (base + i) % (MAX_SEED + 1));
}

/** Worst-case number of slots the comparison could simulate. */
export function estimateSlots(raw: CompareInput): number {
  const input = sanitizeCompareInput(raw);
  const scenarios = input.deviceCounts.length * input.traffic.length * input.hidden.length;
  return scenarios * input.seeds * input.rounds * input.params.slotsPerRound;
}

/** One seeded run of a scenario. */
export function runScenario(settings: Settings, seed: number, rounds: number): RunSummary {
  return toRunSummary(runRounds(createInitialState({ ...settings, seed }), rounds));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Average several seeded runs of one scenario into a table row. */
export function aggregate(scenario: Scenario, runs: RunSummary[]): CompareRow {
  const { settings } = scenario;
  const successes = runs.reduce((a, r) => a + r.successes, 0);
  const dropped = runs.reduce((a, r) => a + r.dropped, 0);
  const finished = successes + dropped;
  return {
    key: scenario.key,
    deviceCount: settings.deviceCount,
    traffic: settings.traffic,
    loadPercent: settings.loadPercent,
    hiddenNode: settings.hiddenNode,
    hiddenIds: settings.hiddenIds,
    runs: runs.length,
    rounds: runs[0]?.rounds ?? 0,
    successes: round2(mean(runs.map((r) => r.successes))),
    collisions: round2(mean(runs.map((r) => r.collisions))),
    hiddenCollisions: round2(mean(runs.map((r) => r.hiddenCollisions))),
    retries: round2(mean(runs.map((r) => r.retries))),
    dropped: round2(mean(runs.map((r) => r.dropped))),
    utilization: round2(mean(runs.map((r) => r.utilization))),
    deliveryRate: finished === 0 ? 0 : round2((successes / finished) * 100),
  };
}

/** Run the whole comparison synchronously (used by tests; the UI runs it in chunks). */
export function runComparison(raw: CompareInput): CompareRow[] {
  const input = sanitizeCompareInput(raw);
  const seeds = seedList(input.baseSeed, input.seeds);
  return buildScenarios(input).map((sc) =>
    aggregate(
      sc,
      seeds.map((seed) => runScenario(sc.settings, seed, input.rounds)),
    ),
  );
}
