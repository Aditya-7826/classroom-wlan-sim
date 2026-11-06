import { describe, expect, it } from 'vitest';
import {
  CW_MAX,
  CW_MIN,
  DATA_SLOTS,
  DEFAULT_SEED,
  MAX_ATTEMPTS,
  SLOTS_PER_ROUND,
  createInitialState,
  nextCw,
  runRound,
  step,
} from './engine';
import { mulberry32 } from './random';
import type { SimState, Station, TrafficLevel } from './types';

/** A state mid-round with no random arrivals, so tests control every station. */
function manualState(deviceCount: number, hiddenNode = false): SimState {
  const s = createInitialState({ deviceCount, traffic: 'light', hiddenNode, seed: 1 });
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

    // Through the engine: a collision on attempt 3 moves the window 31 → 63.
    const s = manualState(2);
    giveFrame(s.stations[0], 0, 3, 31);
    giveFrame(s.stations[1], 0, 3, 31);
    const after = stepN(s, DATA_SLOTS + 1);
    expect(after.stations[0].cw).toBe(CW_MAX);
    expect(after.stations[0].backoff).toBeLessThanOrEqual(CW_MAX);
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
    const settings = { deviceCount: 7, traffic: 'heavy' as const, hiddenNode: true, seed: 1234 };
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

  it('never runs a round past the 12-slot window', () => {
    let s = createInitialState({ deviceCount: 10, traffic: 'heavy', hiddenNode: false, seed: 5 });
    for (let i = 0; i < 20; i += 1) {
      s = runRound(s);
      expect(s.slots.length).toBeLessThanOrEqual(SLOTS_PER_ROUND);
    }
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
  });

  it('makes the default seed produce a hidden-node collision in round 1', () => {
    const levels: TrafficLevel[] = ['light', 'medium', 'heavy'];
    for (let deviceCount = 2; deviceCount <= 10; deviceCount += 1) {
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
