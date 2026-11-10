import { describe, expect, it } from 'vitest';
import {
  CW_MAX,
  CW_MIN,
  DATA_SLOTS,
  DEFAULT_SEED,
  MAX_ATTEMPTS,
  MAX_DEVICES,
  MIN_DEVICES,
  SLOTS_PER_ROUND,
  createInitialState,
  nextCw,
  runRound,
  runRounds,
  sanitizeSettings,
  step,
  utilization,
  type SettingsInput,
} from './engine';
import { createRng, mulberry32 } from './random';
import type { ModelParams, SimState, Station, TrafficLevel } from './types';

/** A state mid-round with no random arrivals, so tests control every station. */
function manualState(deviceCount: number, hiddenNode = false, params: Partial<ModelParams> = {}, hiddenIds?: number[]): SimState {
  const s = createInitialState({ deviceCount, traffic: 'light', hiddenNode, hiddenIds, seed: 1, params });
  s.round = 1;
  s.roundActive = true;
  return s;
}

function giveFrame(st: Station, backoff: number, attempt = 1, cw = CW_MIN): void {
  st.hasFrame = true;
  st.state = attempt > 1 ? 'retrying' : 'backoff';
  st.backoff = backoff;
  st.backoffStart = backoff;
  st.attempt = attempt;
  st.cw = cw;
}

function stepN(s: SimState, n: number): SimState {
  let out = s;
  for (let i = 0; i < n; i += 1) out = step(out);
  return out;
}

describe('seeded random numbers', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    expect(a).toEqual(b);
    expect(a.value).toBeGreaterThanOrEqual(0);
    expect(a.value).toBeLessThan(1);
  });

  it('keeps int() inside [0, max]', () => {
    const rng = createRng(42);
    for (let i = 0; i < 5000; i += 1) {
      const v = rng.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('CSMA/CA engine', () => {
  it('freezes backoff while the channel is busy', () => {
    const s = manualState(3);
    // Student 1 is already mid-transmission; Student 2 is counting down.
    Object.assign(s.stations[0], { hasFrame: true, state: 'transmitting', txRemaining: 2 });
    giveFrame(s.stations[1], 3);

    const next = step(s);
    expect(next.stations[1].backoff).toBe(3);
    expect(next.stations[1].frozen).toBe(true);
    expect(next.slots[0].kind).toBe('transmit');

    // Once the frame and its ACK are over, the countdown resumes.
    const later = stepN(next, 3); // data slot 2, ACK slot, first idle slot
    expect(later.slots.map((x) => x.kind)).toEqual(['transmit', 'transmit', 'ack', 'backoff']);
    expect(later.stations[1].backoff).toBe(2);
  });

  it('gives a sole sender an ACK and resets its window', () => {
    const s = manualState(2);
    giveFrame(s.stations[0], 0, 2, 15);

    const done = stepN(s, DATA_SLOTS + 1);
    expect(done.slots.map((x) => x.kind)).toEqual(['transmit', 'transmit', 'ack']);
    expect(done.stations[0].state).toBe('done');
    expect(done.stations[0].successes).toBe(1);
    expect(done.stations[0].cw).toBe(CW_MIN);
    expect(done.summary.successes).toBe(1);
    expect(done.summary.collisions).toBe(0);
    expect(done.roundActive).toBe(false); // nothing left to send ends the round
  });

  it('makes simultaneous senders collide, with no ACK', () => {
    const s = manualState(3);
    giveFrame(s.stations[0], 0);
    giveFrame(s.stations[1], 0);

    const afterData = stepN(s, DATA_SLOTS);
    expect(afterData.slots.map((x) => x.kind)).toEqual(['collision', 'collision']);
    expect(afterData.summary.collisions).toBe(1);
    expect(afterData.ackFor).toBeNull();

    const afterSilence = step(afterData);
    expect(afterSilence.slots[2].kind).not.toBe('ack');
    for (const st of afterSilence.stations.slice(0, 2)) {
      expect(st.state).toBe('retrying');
      expect(st.attempt).toBe(2);
      expect(st.cw).toBe(15);
    }
    expect(afterSilence.summary.retries).toBe(2);
    expect(afterSilence.summary.successes).toBe(0);
  });

  it('doubles the contention window on each failure and caps it', () => {
    expect(nextCw(7)).toBe(15);
    expect(nextCw(15)).toBe(31);
    expect(nextCw(31)).toBe(63);
    expect(nextCw(CW_MAX)).toBe(CW_MAX);
    expect(nextCw(15, 15)).toBe(15);

    // Through the engine: a collision on attempt 3 moves the window 31 → 63.
    const s = manualState(2);
    giveFrame(s.stations[0], 0, 3, 31);
    giveFrame(s.stations[1], 0, 3, 31);
    const after = stepN(s, DATA_SLOTS + 1);
    expect(after.stations[0].cw).toBe(CW_MAX);
    expect(after.stations[0].backoff).toBeLessThanOrEqual(CW_MAX);
  });

  it('says the window stays at the maximum instead of "doubling" once capped', () => {
    const s = manualState(2, false, { maxAttempts: 6 });
    giveFrame(s.stations[0], 0, 4, CW_MAX);
    giveFrame(s.stations[1], 0, 4, CW_MAX);
    const after = stepN(s, DATA_SLOTS + 1);
    expect(after.stations[0].cw).toBe(CW_MAX);
    const texts = after.events.map((e) => e.text).join('\n');
    expect(texts).toContain(`keeping its wait window at the maximum 0–${CW_MAX}`);
    expect(texts).not.toContain(`doubling its wait window to 0–${CW_MAX}`);
  });

  it('drops the frame after the retry limit', () => {
    const s = manualState(2);
    giveFrame(s.stations[0], 0, MAX_ATTEMPTS, CW_MAX);
    giveFrame(s.stations[1], 0, MAX_ATTEMPTS, CW_MAX);

    const after = stepN(s, DATA_SLOTS + 1);
    for (const st of after.stations) {
      expect(st.state).toBe('dropped');
      expect(st.hasFrame).toBe(false);
      expect(st.drops).toBe(1);
      expect(st.cw).toBe(CW_MIN);
    }
    expect(after.summary.dropped).toBe(2);
  });

  it('gives identical results for the same seed and settings', () => {
    const settings: SettingsInput = { deviceCount: 17, traffic: 'heavy', hiddenNode: true, hiddenIds: [3, 9, 14], seed: 1234 };
    let a = createInitialState(settings);
    let b = createInitialState(settings);
    for (let i = 0; i < 5; i += 1) {
      a = runRound(a);
      b = runRound(b);
    }
    expect(a).toEqual(b);

    const other = runRound(createInitialState({ ...settings, seed: 999 }));
    expect(other.slots).not.toEqual(runRound(createInitialState(settings)).slots);
  });

  it('runRounds gives exactly the same result as repeated runRound', () => {
    const start = createInitialState({ deviceCount: 20, traffic: 'heavy', hiddenNode: true, seed: 77, params: { frameSlots: 3 } });
    let slow = start;
    for (let i = 0; i < 12; i += 1) slow = runRound(slow);
    expect(runRounds(start, 12)).toEqual(slow);

    // Also when starting mid-round.
    const mid = stepN(start, 4);
    let slowMid = runRound(mid);
    for (let i = 0; i < 3; i += 1) slowMid = runRound(slowMid);
    expect(runRounds(mid, 3)).toEqual(slowMid);
  });

  it('never runs a round past its slot window', () => {
    for (const slotsPerRound of [6, 12, 40]) {
      let s = createInitialState({ deviceCount: MAX_DEVICES, traffic: 'heavy', seed: 5, params: { slotsPerRound } });
      for (let i = 0; i < 20; i += 1) {
        s = runRound(s);
        expect(s.slots.length).toBeLessThanOrEqual(slotsPerRound);
      }
    }
    expect(SLOTS_PER_ROUND).toBe(12);
  });

  it('lets hidden stations overlap because they cannot hear each other', () => {
    const s = manualState(3, true);
    // Student 1 is sending; hidden Student 2 is at 0 and does not hear it.
    Object.assign(s.stations[0], { hasFrame: true, state: 'transmitting', txRemaining: 1 });
    giveFrame(s.stations[1], 0);
    // Student 3 can hear Student 1, so it waits.
    giveFrame(s.stations[2], 0);

    const next = step(s);
    expect(next.stations[1].state).toBe('transmitting');
    expect(next.stations[2].state).toBe('backoff');
    expect(next.slots[0].kind).toBe('collision');
    expect(next.roundStats.hiddenCollisions).toBe(1);
    expect(next.summary.hiddenCollisions).toBe(1);
  });

  it('does not blame hidden nodes when two hidden stations simply start in the same slot', () => {
    const s = manualState(3, true);
    giveFrame(s.stations[0], 0);
    giveFrame(s.stations[1], 0);
    const next = step(s);
    expect(next.summary.collisions).toBe(1);
    expect(next.summary.hiddenCollisions).toBe(0);
    expect(next.events[0].tone).toBe('danger');
  });

  it('supports more than two hidden students', () => {
    const s = manualState(5, true, {}, [2, 3, 5]);
    expect(s.stations.filter((x) => x.hidden).map((x) => x.id)).toEqual([2, 3, 5]);
    Object.assign(s.stations[1], { hasFrame: true, state: 'transmitting', txRemaining: 2 });
    giveFrame(s.stations[2], 0); // hidden, cannot hear Student 2 → joins
    giveFrame(s.stations[3], 0); // not hidden, hears Student 2 → waits
    const next = step(s);
    expect(next.stations[2].state).toBe('transmitting');
    expect(next.stations[3].state).toBe('backoff');
    expect(next.summary.hiddenCollisions).toBe(1);
  });

  it('makes the default seed produce a hidden-node collision in round 1 for 2–20 devices', () => {
    const levels: TrafficLevel[] = ['light', 'medium', 'heavy'];
    for (let deviceCount = MIN_DEVICES; deviceCount <= MAX_DEVICES; deviceCount += 1) {
      for (const traffic of levels) {
        const round1 = runRound(createInitialState({ deviceCount, traffic, hiddenNode: true, seed: DEFAULT_SEED }));
        expect(round1.round).toBe(1);
        expect(round1.roundStats.hiddenCollisions, `${deviceCount} devices, ${traffic}`).toBeGreaterThanOrEqual(1);
        const collision = round1.slots.find((x) => x.kind === 'collision');
        expect(collision?.stationIds).toEqual(expect.arrayContaining([1, 2]));
      }
    }
  });
});

describe('custom model parameters', () => {
  it('uses the chosen frame length', () => {
    const s = manualState(2, false, { frameSlots: 3 });
    giveFrame(s.stations[0], 0);
    const done = stepN(s, 4);
    expect(done.slots.map((x) => x.kind)).toEqual(['transmit', 'transmit', 'transmit', 'ack']);
    expect(done.summary.usefulSlots).toBe(4);
  });

  it('drops on the first failure when only one attempt is allowed', () => {
    const s = manualState(2, false, { maxAttempts: 1 });
    giveFrame(s.stations[0], 0);
    giveFrame(s.stations[1], 0);
    const after = stepN(s, DATA_SLOTS + 1);
    expect(after.summary.dropped).toBe(2);
    expect(after.summary.retries).toBe(0);
  });

  it('starts and caps the window at the chosen values', () => {
    const s = manualState(2, false, { cwMin: 3, cwMax: 15 });
    expect(s.stations[0].cw).toBe(3);
    giveFrame(s.stations[0], 0, 2, 15);
    giveFrame(s.stations[1], 0, 2, 15);
    const after = stepN(s, DATA_SLOTS + 1);
    expect(after.stations[0].cw).toBe(15);
    expect(after.stations[0].backoff).toBeLessThanOrEqual(15);
  });

  it('respects a custom load of 0% and 100%', () => {
    const none = runRound(createInitialState({ deviceCount: 20, traffic: 'custom', loadPercent: 0, seed: 3 }));
    expect(none.roundStats.hadFrames).toBe(false);
    expect(none.summary.totalSlots).toBe(0);

    const all = step(createInitialState({ deviceCount: 20, traffic: 'custom', loadPercent: 100, seed: 3 }));
    expect(all.stations.every((x) => x.hasFrame)).toBe(true);
  });
});

describe('input sanitising', () => {
  it('clamps and snaps every setting to a valid value', () => {
    const s = sanitizeSettings({
      deviceCount: 99,
      traffic: 'bogus' as TrafficLevel,
      loadPercent: 250,
      hiddenNode: true,
      hiddenIds: [0, 2, 2, 50, 1.5, -3],
      seed: -10,
      params: { cwMin: 8, cwMax: 2, maxAttempts: 0, slotsPerRound: 1000, frameSlots: Number.NaN },
    });
    expect(s.deviceCount).toBe(MAX_DEVICES);
    expect(s.traffic).toBe('medium');
    expect(s.loadPercent).toBe(60); // preset value, not the bogus 250
    expect(s.hiddenIds).toEqual([1, 2]); // only one valid id left, so the default pair
    expect(s.seed).toBe(0);
    expect(s.params).toEqual({ cwMin: 7, cwMax: 7, maxAttempts: 1, slotsPerRound: 40, frameSlots: 2 });
  });

  it('keeps valid hidden ids and ignores them when hidden-node is off', () => {
    expect(sanitizeSettings({ deviceCount: 10, hiddenNode: true, hiddenIds: [9, 4, 4, 12] }).hiddenIds).toEqual([4, 9]);
    expect(sanitizeSettings({ deviceCount: 10, hiddenNode: false, hiddenIds: [4, 9] }).hiddenIds).toEqual([]);
    expect(sanitizeSettings({ deviceCount: 1 }).deviceCount).toBe(MIN_DEVICES);
    expect(sanitizeSettings({ deviceCount: Number.POSITIVE_INFINITY }).deviceCount).toBe(6);
  });

  it('forces the preset load and clamps a custom one', () => {
    expect(sanitizeSettings({ traffic: 'heavy', loadPercent: 5 }).loadPercent).toBe(90);
    expect(sanitizeSettings({ traffic: 'custom', loadPercent: 42.6 }).loadPercent).toBe(43);
    expect(sanitizeSettings({ traffic: 'custom', loadPercent: -1 }).loadPercent).toBe(0);
  });

  it('never reports utilisation outside 0–100', () => {
    const base = { successes: 0, collisions: 0, hiddenCollisions: 0, retries: 0, dropped: 0, rounds: 1 };
    expect(utilization({ ...base, totalSlots: 0, usefulSlots: 0 })).toBe(0);
    expect(utilization({ ...base, totalSlots: 3, usefulSlots: 9 })).toBe(100);
  });
});

describe('invariants hold for random settings', () => {
  it('keeps every counter consistent across 300 random scenarios', () => {
    // Collect violations instead of calling expect() per value (much faster).
    const problems: string[] = [];
    const check = (ok: boolean, what: string, label: string) => {
      if (!ok && problems.length < 20) problems.push(`${what} :: ${label}`);
    };
    const rng = createRng(2026);
    const levels: TrafficLevel[] = ['light', 'medium', 'heavy', 'custom'];
    const cwMins = [1, 3, 7, 15, 31, 63];
    const cwMaxes = [7, 15, 31, 63, 127, 255, 511, 1023];
    for (let n = 0; n < 300; n += 1) {
      const deviceCount = MIN_DEVICES + rng.int(MAX_DEVICES - MIN_DEVICES);
      const input: SettingsInput = {
        deviceCount,
        traffic: levels[rng.int(3)],
        loadPercent: rng.int(100),
        hiddenNode: rng.next() < 0.5,
        hiddenIds: Array.from({ length: 2 + rng.int(deviceCount - 2) }, () => 1 + rng.int(deviceCount - 1)),
        seed: rng.int(1_000_000),
        params: {
          cwMin: cwMins[rng.int(5)],
          cwMax: cwMaxes[rng.int(7)],
          maxAttempts: 1 + rng.int(9),
          slotsPerRound: 6 + rng.int(34),
          frameSlots: 1 + rng.int(3),
        },
      };
      let s = createInitialState(input);
      const p = s.settings.params;
      const label = JSON.stringify(input);
      for (let r = 0; r < 8; r += 1) {
        // Walk slot by slot so mid-round states are checked too.
        do {
          s = step(s);
          check(s.slots.length <= p.slotsPerRound, 'round too long', label);
          for (const st of s.stations) {
            check(st.cw >= p.cwMin && st.cw <= p.cwMax, `cw ${st.cw} out of range`, label);
            check(st.attempt >= 1 && st.attempt <= p.maxAttempts, `attempt ${st.attempt} out of range`, label);
            if (st.backoff !== null) check(st.backoff >= 0 && st.backoff <= st.cw, `backoff ${st.backoff} > cw`, label);
            if (st.state === 'transmitting') {
              check(st.txRemaining >= 1 && st.txRemaining <= p.frameSlots, 'bad txRemaining', label);
            }
            check(st.hidden === s.settings.hiddenIds.includes(st.id), 'hidden flag mismatch', label);
          }
          // At most one ACK pending, and never for a garbled frame.
          if (s.ackFor !== null) {
            const target = s.stations.find((x) => x.id === s.ackFor);
            check(target?.corrupted === false, 'ACK for a garbled frame', label);
            check(!s.awaitingAck.includes(s.ackFor), 'ACK and timeout for the same frame', label);
          }
        } while (s.roundActive);

        const sum = s.summary;
        check(sum.hiddenCollisions <= sum.collisions, 'hidden > collisions', label);
        check(sum.usefulSlots <= sum.totalSlots, 'useful > total slots', label);
        check(sum.usefulSlots === sum.successes * (p.frameSlots + 1), 'useful slots mismatch', label);
        check(s.stations.reduce((a, st) => a + st.successes, 0) === sum.successes, 'successes mismatch', label);
        check(s.stations.reduce((a, st) => a + st.drops, 0) === sum.dropped, 'drops mismatch', label);
        // Every attempt ends in success, a drop, a retry, or is still in flight.
        const attempts = s.stations.reduce((a, st) => a + st.totalAttempts, 0);
        const inFlight = s.stations.filter((st) => st.state === 'transmitting' || st.state === 'waitingAck').length;
        check(attempts === sum.successes + sum.dropped + sum.retries + inFlight, 'attempt accounting broken', label);
        const u = utilization(sum);
        check(u >= 0 && u <= 100, `utilisation ${u}`, label);
      }
    }
    expect(problems).toEqual([]);
  }, 60_000);
});
