import { describe, expect, it } from 'vitest';
import {
  COMPARE_ROUNDS_RANGE,
  COMPARE_SEEDS_RANGE,
  buildScenarios,
  estimateSlots,
  runComparison,
  sanitizeCompareInput,
  seedList,
  type CompareInput,
} from './compare';
import { DEFAULT_PARAMS } from './engine';
import { MAX_SEED } from './random';

const base: CompareInput = {
  deviceCounts: [5, 10, 20],
  traffic: ['light', 'heavy'],
  hidden: [false, true],
  rounds: 10,
  seeds: 2,
  baseSeed: 42,
  loadPercent: 50,
  hiddenIds: [1, 2],
  params: DEFAULT_PARAMS,
};

describe('scenario comparison', () => {
  it('builds every combination once, in a stable order', () => {
    const scenarios = buildScenarios(base);
    expect(scenarios).toHaveLength(3 * 2 * 2);
    expect(scenarios[0].key).toBe('5|light|0');
    expect(scenarios.at(-1)?.key).toBe('20|heavy|1');
    expect(new Set(scenarios.map((s) => s.key)).size).toBe(scenarios.length);
  });

  it('drops invalid, duplicate and out-of-range choices', () => {
    const clean = sanitizeCompareInput({
      ...base,
      deviceCounts: [20, 1, 21, 5, 5, 7.5, Number.NaN],
      traffic: ['heavy', 'bogus' as never, 'heavy'],
      hidden: [true, true],
      rounds: 10_000,
      seeds: 0,
      baseSeed: -5,
    });
    expect(clean.deviceCounts).toEqual([5, 20]);
    expect(clean.traffic).toEqual(['heavy']);
    expect(clean.hidden).toEqual([true]);
    expect(clean.rounds).toBe(COMPARE_ROUNDS_RANGE.max);
    expect(clean.seeds).toBe(COMPARE_SEEDS_RANGE.min);
    expect(clean.baseSeed).toBe(0);
  });

  it('returns no scenarios when a dimension is empty', () => {
    expect(buildScenarios({ ...base, traffic: [] })).toHaveLength(0);
    expect(estimateSlots({ ...base, hidden: [] })).toBe(0);
  });

  it('falls back to Students 1 and 2 when the chosen hidden students do not exist', () => {
    const [scenario] = buildScenarios({ ...base, deviceCounts: [3], traffic: ['light'], hidden: [true], hiddenIds: [8, 9] });
    expect(scenario.settings.hiddenIds).toEqual([1, 2]);
    const [kept] = buildScenarios({ ...base, deviceCounts: [10], traffic: ['light'], hidden: [true], hiddenIds: [8, 9] });
    expect(kept.settings.hiddenIds).toEqual([8, 9]);
  });

  it('is repeatable and averages over the requested seeds', () => {
    const a = runComparison(base);
    const b = runComparison(base);
    expect(a).toEqual(b);
    for (const row of a) {
      expect(row.runs).toBe(2);
      expect(row.rounds).toBe(10);
      expect(row.utilization).toBeGreaterThanOrEqual(0);
      expect(row.utilization).toBeLessThanOrEqual(100);
      expect(row.deliveryRate).toBeGreaterThanOrEqual(0);
      expect(row.deliveryRate).toBeLessThanOrEqual(100);
      if (!row.hiddenNode) expect(row.hiddenCollisions).toBe(0);
    }
  });

  it('shows more collisions with more devices on heavy load', () => {
    const rows = runComparison({ ...base, deviceCounts: [2, 20], traffic: ['heavy'], hidden: [false], rounds: 50, seeds: 5 });
    expect(rows[1].collisions).toBeGreaterThan(rows[0].collisions);
  });

  it('wraps seeds at the 32-bit limit and estimates work', () => {
    expect(seedList(MAX_SEED, 3)).toEqual([MAX_SEED, 0, 1]);
    expect(estimateSlots(base)).toBe(12 * 2 * 10 * DEFAULT_PARAMS.slotsPerRound);
  });
});
