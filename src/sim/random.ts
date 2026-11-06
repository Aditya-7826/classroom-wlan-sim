/**
 * Seeded pseudo-random numbers (mulberry32).
 *
 * Every random choice in the simulation goes through this file, and the
 * generator's whole state is a single 32-bit number that lives inside the
 * simulation state. Same seed + same settings => identical run.
 */

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxInclusive]. */
  int(maxInclusive: number): number;
  /** Current internal state, to be stored back into the simulation state. */
  readonly state: number;
}

/** One mulberry32 step: returns the value and the next state. */
export function mulberry32(state: number): { value: number; state: number } {
  const nextState = (state + 0x6d2b79f5) | 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: nextState };
}

/** A small mutable wrapper used while computing a single step. */
export function createRng(initialState: number): Rng {
  let state = initialState | 0;
  return {
    next() {
      const result = mulberry32(state);
      state = result.state;
      return result.value;
    },
    int(maxInclusive: number) {
      return Math.floor(this.next() * (maxInclusive + 1));
    },
    get state() {
      return state;
    },
  };
}

export const MAX_SEED = 4294967295;

/** Clamp any number to a valid unsigned 32-bit seed. */
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0;
  return Math.min(Math.max(Math.trunc(seed), 0), MAX_SEED);
}

/**
 * A fresh seed for non-repeatable runs. This only *chooses* the seed; the
 * simulation itself still draws every number from the seeded generator.
 */
export function freshSeed(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] % 100000;
}
