/**
 * CSMA/CA teaching model — pure functions, no React.
 *
 * Time is divided into slots. A data frame lasts `frameSlots` slots and is
 * followed by one ACK slot from the access point (AP). All values are
 * simplified for teaching and are NOT the real IEEE 802.11 numbers.
 */
import { createRng, normalizeSeed, type Rng } from './random';
import type {
  ModelParams,
  RoundStats,
  RunSummary,
  Settings,
  SimState,
  Slot,
  SlotKind,
  Station,
  Summary,
  Tone,
  TrafficLevel,
} from './types';

// ---------------------------------------------------------------------------
// Limits and defaults
// ---------------------------------------------------------------------------

export const MIN_DEVICES = 2;
export const MAX_DEVICES = 20;
const MAX_EVENTS = 8;

/** Contention windows are always 2^k − 1, so doubling stays on the same ladder. */
export const CW_MIN_OPTIONS: readonly number[] = [1, 3, 7, 15, 31, 63];
export const CW_MAX_OPTIONS: readonly number[] = [7, 15, 31, 63, 127, 255, 511, 1023];
export const ATTEMPTS_RANGE = { min: 1, max: 10 } as const;
export const SLOTS_RANGE = { min: 6, max: 40 } as const;
export const FRAME_RANGE = { min: 1, max: 4 } as const;
export const LOAD_RANGE = { min: 0, max: 100 } as const;

/** Simplified defaults (real Wi-Fi uses different numbers). */
export const DEFAULT_PARAMS: ModelParams = {
  cwMin: 7,
  cwMax: 63,
  maxAttempts: 4,
  slotsPerRound: 12,
  frameSlots: 2,
};
/** Kept for readability in tests and copy: the default values. */
export const CW_MIN = DEFAULT_PARAMS.cwMin;
export const CW_MAX = DEFAULT_PARAMS.cwMax;
export const MAX_ATTEMPTS = DEFAULT_PARAMS.maxAttempts;
export const SLOTS_PER_ROUND = DEFAULT_PARAMS.slotsPerRound;
export const DATA_SLOTS = DEFAULT_PARAMS.frameSlots;

export const TRAFFIC_LEVELS: readonly TrafficLevel[] = ['light', 'medium', 'heavy', 'custom'];
/** Percentage chance of a new frame per round for each preset. */
export const TRAFFIC_PERCENT: Record<Exclude<TrafficLevel, 'custom'>, number> = {
  light: 30,
  medium: 60,
  heavy: 90,
};

/** Default hidden pair. */
export const DEFAULT_HIDDEN_IDS: readonly number[] = [1, 2];

/**
 * Default seed for repeatable scenarios. With hidden-node mode on, the default
 * hidden pair (Students 1 and 2) and the default model numbers, one of the
 * pair starts sending and the other — unable to hear it — joins mid-frame, so
 * they collide at the AP in round 1 for every device count (2–20) and preset
 * load (verified in engine.test.ts).
 */
export const DEFAULT_SEED = 105;

export const DEFAULT_SETTINGS: Settings = {
  deviceCount: 6,
  traffic: 'medium',
  loadPercent: TRAFFIC_PERCENT.medium,
  hiddenNode: false,
  hiddenIds: [],
  seed: DEFAULT_SEED,
  params: DEFAULT_PARAMS,
};

// ---------------------------------------------------------------------------
// Input sanitising — the engine never trusts its caller
// ---------------------------------------------------------------------------

export type SettingsInput = Partial<Omit<Settings, 'params'>> & { params?: Partial<ModelParams> };

function toInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(Math.max(n, min), max);
}

/** Snap to the nearest allowed value (ties go to the smaller one). */
function snap(value: unknown, options: readonly number[], fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  let best = options[0];
  for (const o of options) if (Math.abs(o - value) < Math.abs(best - value)) best = o;
  return best;
}

export function sanitizeParams(input: Partial<ModelParams> = {}): ModelParams {
  const cwMin = snap(input.cwMin, CW_MIN_OPTIONS, DEFAULT_PARAMS.cwMin);
  let cwMax = snap(input.cwMax, CW_MAX_OPTIONS, DEFAULT_PARAMS.cwMax);
  if (cwMax < cwMin) cwMax = CW_MAX_OPTIONS.find((o) => o >= cwMin) ?? cwMin;
  return {
    cwMin,
    cwMax,
    maxAttempts: toInt(input.maxAttempts, DEFAULT_PARAMS.maxAttempts, ATTEMPTS_RANGE.min, ATTEMPTS_RANGE.max),
    slotsPerRound: toInt(input.slotsPerRound, DEFAULT_PARAMS.slotsPerRound, SLOTS_RANGE.min, SLOTS_RANGE.max),
    frameSlots: toInt(input.frameSlots, DEFAULT_PARAMS.frameSlots, FRAME_RANGE.min, FRAME_RANGE.max),
  };
}

/** Valid, unique, sorted hidden ids — or the default pair if fewer than two remain. */
export function sanitizeHiddenIds(ids: unknown, deviceCount: number): number[] {
  const list = Array.isArray(ids) ? ids : [];
  const valid = [
    ...new Set(list.filter((x): x is number => Number.isInteger(x) && x >= 1 && x <= deviceCount)),
  ].sort((a, b) => a - b);
  return valid.length >= 2 ? valid : [...DEFAULT_HIDDEN_IDS];
}

export function sanitizeSettings(input: SettingsInput = {}): Settings {
  const deviceCount = toInt(input.deviceCount, DEFAULT_SETTINGS.deviceCount, MIN_DEVICES, MAX_DEVICES);
  const traffic: TrafficLevel = TRAFFIC_LEVELS.includes(input.traffic as TrafficLevel)
    ? (input.traffic as TrafficLevel)
    : DEFAULT_SETTINGS.traffic;
  const loadPercent =
    traffic === 'custom'
      ? toInt(input.loadPercent, DEFAULT_SETTINGS.loadPercent, LOAD_RANGE.min, LOAD_RANGE.max)
      : TRAFFIC_PERCENT[traffic];
  const hiddenNode = input.hiddenNode === true;
  return {
    deviceCount,
    traffic,
    loadPercent,
    hiddenNode,
    hiddenIds: hiddenNode ? sanitizeHiddenIds(input.hiddenIds, deviceCount) : [],
    seed: normalizeSeed(typeof input.seed === 'number' ? input.seed : DEFAULT_SEED),
    params: sanitizeParams(input.params),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Double the window (e.g. 0–7 → 0–15 → 0–31 → 0–63), capped at cwMax. */
export function nextCw(cw: number, cwMax: number = CW_MAX): number {
  return Math.min((cw + 1) * 2 - 1, cwMax);
}

export function stationName(id: number): string {
  return `Student ${id}`;
}

export function createStation(id: number, hidden = false, cwMin = CW_MIN): Station {
  return {
    id,
    name: stationName(id),
    hidden,
    hasFrame: false,
    state: 'idle',
    backoff: null,
    backoffStart: null,
    cw: cwMin,
    attempt: 1,
    txRemaining: 0,
    corrupted: false,
    frozen: false,
    totalAttempts: 0,
    successes: 0,
    drops: 0,
  };
}

function emptySummary(): Summary {
  return {
    successes: 0,
    collisions: 0,
    hiddenCollisions: 0,
    retries: 0,
    dropped: 0,
    rounds: 0,
    totalSlots: 0,
    usefulSlots: 0,
  };
}

function emptyRoundStats(): RoundStats {
  return { hadFrames: false, delivered: [], dropped: [], collisions: 0, hiddenCollisions: 0, retries: 0 };
}

export function createInitialState(input: SettingsInput): SimState {
  const settings = sanitizeSettings(input);
  const stations = Array.from({ length: settings.deviceCount }, (_, i) =>
    createStation(i + 1, settings.hiddenIds.includes(i + 1), settings.params.cwMin),
  );
  return {
    settings,
    rng: settings.seed | 0,
    round: 0,
    roundActive: false,
    slots: [],
    stations,
    ackFor: null,
    awaitingAck: [],
    events: [],
    nextEventId: 1,
    summary: emptySummary(),
    roundStats: emptyRoundStats(),
    outcome: 'Press “Run one round” to see who gets to speak first.',
    outcomeTone: 'info',
  };
}

/** Can station `a` hear station `b`? Hidden stations cannot hear one another. */
export function canHear(a: Station, b: Station): boolean {
  return a.id === b.id || !(a.hidden && b.hidden);
}

/** Share of slots (0–100, two decimals) that carried a delivered frame or its ACK. */
export function utilization(summary: Summary): number {
  if (summary.totalSlots <= 0) return 0;
  const pct = Math.round((summary.usefulSlots / summary.totalSlots) * 10000) / 100;
  return Math.min(Math.max(pct, 0), 100);
}

export function toRunSummary(state: SimState): RunSummary {
  const { summary, settings } = state;
  return {
    deviceCount: settings.deviceCount,
    traffic: settings.traffic,
    loadPercent: settings.loadPercent,
    hiddenNode: settings.hiddenNode,
    hiddenCount: settings.hiddenIds.length,
    cwMin: settings.params.cwMin,
    cwMax: settings.params.cwMax,
    maxAttempts: settings.params.maxAttempts,
    slotsPerRound: settings.params.slotsPerRound,
    frameSlots: settings.params.frameSlots,
    successes: summary.successes,
    collisions: summary.collisions,
    hiddenCollisions: summary.hiddenCollisions,
    retries: summary.retries,
    dropped: summary.dropped,
    rounds: summary.rounds,
    utilization: utilization(summary),
  };
}

export function listNames(ids: number[]): string {
  const names = ids.map(stationName);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function windowText(cw: number): string {
  return `0–${cw}`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function pushEvent(s: SimState, tone: Tone, text: string, slot: number | null): void {
  s.events = [{ id: s.nextEventId, round: s.round, slot, tone, text }, ...s.events].slice(0, MAX_EVENTS);
  s.nextEventId += 1;
}

function drawBackoff(st: Station, rng: Rng): void {
  st.backoff = rng.int(st.cw);
  st.backoffStart = st.backoff;
  st.frozen = false;
}

function byId(s: SimState, id: number): Station {
  const st = s.stations.find((x) => x.id === id);
  if (!st) throw new Error(`Unknown station ${id}`);
  return st;
}

function isContending(st: Station): boolean {
  return (st.state === 'sensing' || st.state === 'backoff' || st.state === 'retrying') && st.backoff !== null;
}

// ---------------------------------------------------------------------------
// Round start
// ---------------------------------------------------------------------------

function startRound(s: SimState, rng: Rng): void {
  const { cwMin } = s.settings.params;
  s.round += 1;
  s.summary.rounds += 1;
  s.roundActive = true;
  s.slots = [];
  s.roundStats = emptyRoundStats();

  for (const st of s.stations) {
    if (!st.hasFrame) {
      st.state = 'idle';
      st.backoff = null;
      st.backoffStart = null;
      st.frozen = false;
    }
  }

  const fresh: number[] = [];
  const carried: number[] = [];
  const probability = s.settings.loadPercent / 100;

  // Stations are processed in id order. Hidden stations are always ready
  // (they are uploading coursework), so they never consume a readiness draw.
  for (const st of s.stations) {
    if (st.hasFrame) {
      carried.push(st.id);
      continue;
    }
    const ready = st.hidden ? true : rng.next() < probability;
    if (!ready) continue;
    st.hasFrame = true;
    st.attempt = 1;
    st.cw = cwMin;
    drawBackoff(st, rng);
    st.state = 'sensing';
    fresh.push(st.id);
  }

  s.roundStats.hadFrames = fresh.length + carried.length > 0;

  if (!s.roundStats.hadFrames) {
    pushEvent(s, 'info', `Round ${s.round}: nobody has a frame to send.`, null);
    endRound(s);
    return;
  }

  const parts: string[] = [];
  if (fresh.length > 0) {
    parts.push(
      `${listNames(fresh)} ${plural(fresh.length, 'has', 'have')} a new frame. ` +
        `${plural(fresh.length, 'It listens', 'Each listens')} to the channel and picks a random wait from ${windowText(cwMin)} slots.`,
    );
  }
  if (carried.length > 0) {
    parts.push(`${listNames(carried)} still ${plural(carried.length, 'has', 'have')} an unfinished frame from last round.`);
  }
  pushEvent(s, 'info', `Round ${s.round} begins. ${parts.join(' ')}`, null);
  s.outcome = `Round ${s.round} in progress…`;
  s.outcomeTone = 'info';
}

// ---------------------------------------------------------------------------
// One slot
// ---------------------------------------------------------------------------

function succeed(s: SimState, st: Station, slotNo: number): void {
  const { cwMin, frameSlots } = s.settings.params;
  st.hasFrame = false;
  st.state = 'done';
  st.successes += 1;
  st.cw = cwMin;
  st.attempt = 1;
  st.backoff = null;
  st.backoffStart = null;
  s.summary.successes += 1;
  s.summary.usefulSlots += frameSlots + 1;
  s.roundStats.delivered.push(st.id);
  pushEvent(
    s,
    'success',
    `${st.name}'s frame arrived — the access point sent an ACK. ${st.name} resets its wait window to ${windowText(cwMin)}.`,
    slotNo,
  );
}

function fail(s: SimState, st: Station, rng: Rng, slotNo: number): void {
  const { cwMin, cwMax, maxAttempts } = s.settings.params;
  if (st.attempt >= maxAttempts) {
    pushEvent(
      s,
      'danger',
      `${st.name} heard no ACK on attempt ${st.attempt} of ${maxAttempts} — it gives up and the frame is dropped.`,
      slotNo,
    );
    st.hasFrame = false;
    st.state = 'dropped';
    st.drops += 1;
    st.cw = cwMin;
    st.attempt = 1;
    st.backoff = null;
    st.backoffStart = null;
    s.summary.dropped += 1;
    s.roundStats.dropped.push(st.id);
    return;
  }
  const before = st.cw;
  st.attempt += 1;
  st.cw = nextCw(st.cw, cwMax);
  drawBackoff(st, rng);
  st.state = 'retrying';
  s.summary.retries += 1;
  s.roundStats.retries += 1;
  const windowNote =
    st.cw > before
      ? `doubling its wait window to ${windowText(st.cw)}`
      : `keeping its wait window at the maximum ${windowText(st.cw)}`;
  pushEvent(
    s,
    'warning',
    `${st.name} heard no ACK — ${windowNote} and retrying (attempt ${st.attempt} of ${maxAttempts}).`,
    slotNo,
  );
}

function simulateSlot(s: SimState, rng: Rng): void {
  const { frameSlots, maxAttempts, slotsPerRound } = s.settings.params;
  const slotNo = s.slots.length + 1;
  const ackTarget = s.ackFor;
  const timeouts = s.awaitingAck;
  s.ackFor = null;
  s.awaitingAck = [];

  const ongoing = s.stations.filter((st) => st.state === 'transmitting');
  const contenders = s.stations.filter(isContending);

  // 1. Stations whose countdown reached 0 start sending — unless they can hear
  //    the channel is busy. The AP's ACK goes out first after a short gap, so
  //    everyone hears it and waits.
  const starters = contenders.filter(
    (st) => st.backoff === 0 && ackTarget === null && !ongoing.some((o) => canHear(st, o)),
  );
  /** Starters that began while a station they cannot hear was already on the air. */
  const blind: { id: number; unheard: number[] }[] = [];
  for (const st of starters) {
    const unheard = ongoing.filter((o) => !canHear(st, o)).map((o) => o.id);
    if (unheard.length > 0) blind.push({ id: st.id, unheard });
    st.state = 'transmitting';
    st.txRemaining = frameSlots;
    st.corrupted = false;
    st.totalAttempts += 1;
    st.backoff = null;
    st.backoffStart = null;
    st.frozen = false;
    const why =
      unheard.length > 0
        ? `${st.name} can't hear ${listNames(unheard)}, thinks the channel is free and starts sending`
        : `${st.name} counted down to 0 and starts sending`;
    pushEvent(s, 'info', `${why} (attempt ${st.attempt} of ${maxAttempts}).`, slotNo);
  }

  // 2. Two or more frames on the air at once => collision at the AP.
  const transmitters = s.stations.filter((st) => st.state === 'transmitting');
  if (transmitters.length >= 2) {
    if (transmitters.some((t) => !t.corrupted)) {
      const ids = transmitters.map((t) => t.id);
      s.summary.collisions += 1;
      s.roundStats.collisions += 1;
      if (blind.length > 0) {
        // Only a real hidden-node case: someone started over a sender it could not hear.
        s.summary.hiddenCollisions += 1;
        s.roundStats.hiddenCollisions += 1;
        const who = blind.map((b) => `${stationName(b.id)} couldn't hear ${listNames(b.unheard)}`).join('; ');
        pushEvent(
          s,
          'special',
          `Hidden-node collision at the access point! ${who}, so it thought the channel was free. ` +
            `Radios can't notice the clash while sending — they'll only find out when no ACK arrives.`,
          slotNo,
        );
      } else {
        pushEvent(
          s,
          'danger',
          `Collision at the access point: ${listNames(ids)} started sending in the same slot. ` +
            `Wi-Fi radios can't detect this while sending — they'll only find out when no ACK arrives.`,
          slotNo,
        );
      }
    }
    for (const t of transmitters) t.corrupted = true;
  }

  // 3. Everyone else counts down only if the slot sounds idle to them.
  let counting = 0;
  for (const st of contenders) {
    if (starters.includes(st)) continue;
    const busy = ackTarget !== null || transmitters.some((t) => canHear(st, t));
    if (busy) {
      st.frozen = true;
      continue;
    }
    st.frozen = false;
    if (st.state === 'sensing') st.state = 'backoff';
    if (st.backoff !== null && st.backoff > 0) {
      st.backoff -= 1;
      counting += 1;
    }
  }

  // 4. Describe the slot (before transmissions advance).
  let kind: SlotKind;
  let label: string;
  let detail: string;
  let stationIds: number[];
  if (ackTarget !== null) {
    kind = 'ack';
    stationIds = [ackTarget];
    label = 'ACK';
    detail = `Access point confirms ${stationName(ackTarget)}'s frame`;
  } else if (transmitters.length >= 2 || transmitters.some((t) => t.corrupted)) {
    kind = 'collision';
    stationIds = transmitters.map((t) => t.id);
    label = 'Collision';
    detail =
      transmitters.length >= 2
        ? `${listNames(stationIds)} overlap at the access point`
        : `Rest of ${stationName(stationIds[0])}'s frame — already garbled`;
  } else if (transmitters.length === 1) {
    kind = 'transmit';
    stationIds = [transmitters[0].id];
    label = `S${transmitters[0].id}`;
    detail = `${transmitters[0].name} is sending`;
  } else if (counting > 0) {
    kind = 'backoff';
    stationIds = [];
    label = 'Backoff';
    detail = `${counting} ${plural(counting, 'student is', 'students are')} counting down`;
  } else {
    kind = 'idle';
    stationIds = [];
    label = timeouts.length > 0 ? 'No ACK' : 'Idle';
    detail = timeouts.length > 0 ? `Silence — no ACK for ${listNames(timeouts)}` : 'Nobody is sending';
  }

  // 5. ACK received, or ACK missing.
  if (ackTarget !== null) succeed(s, byId(s, ackTarget), slotNo);
  for (const id of timeouts) fail(s, byId(s, id), rng, slotNo);

  // 6. Advance transmissions; a finished frame waits for its ACK next slot.
  for (const t of transmitters) {
    t.txRemaining -= 1;
    if (t.txRemaining === 0) {
      t.state = 'waitingAck';
      if (t.corrupted) s.awaitingAck.push(t.id);
      else s.ackFor = t.id;
    }
  }

  const slot: Slot = { index: slotNo, kind, stationIds, label, detail };
  s.slots = [...s.slots, slot];
  s.summary.totalSlots += 1;

  const pending = s.stations.some((st) => st.hasFrame);
  if (s.slots.length >= slotsPerRound || !pending) endRound(s);
}

// ---------------------------------------------------------------------------
// Round end
// ---------------------------------------------------------------------------

function endRound(s: SimState): void {
  const { maxAttempts } = s.settings.params;
  s.roundActive = false;
  const r = s.roundStats;
  if (!r.hadFrames) {
    s.outcome = `Round ${s.round}: nobody had a frame to send, so the channel stayed quiet.`;
    s.outcomeTone = 'info';
    return;
  }

  const parts: string[] = [];
  parts.push(
    r.delivered.length > 0
      ? `${listNames(r.delivered)} delivered ${plural(r.delivered.length, 'a frame', 'frames')} (ACK received).`
      : 'No frames were delivered.',
  );
  if (r.collisions > 0) {
    const hidden = r.hiddenCollisions > 0 ? `, ${r.hiddenCollisions} caused by hidden nodes` : '';
    parts.push(`${r.collisions} collision${plural(r.collisions, '', 's')}${hidden} — no ACK, so the senders had to retry.`);
  }
  if (r.retries > 0) parts.push(`${r.retries} retr${plural(r.retries, 'y', 'ies')} with a larger or maxed-out wait window.`);
  if (r.dropped.length > 0) {
    parts.push(
      `${listNames(r.dropped)} gave up after ${maxAttempts} attempt${plural(maxAttempts, '', 's')} (frame dropped).`,
    );
  }
  const waiting = s.stations.filter((st) => st.hasFrame).map((st) => st.id);
  if (waiting.length > 0) parts.push(`${listNames(waiting)} still waiting — carried into the next round.`);

  s.outcome = `Round ${s.round} (${s.slots.length} slots): ${parts.join(' ')}`;
  s.outcomeTone =
    r.hiddenCollisions > 0 ? 'special' : r.dropped.length > 0 || r.collisions > 0 ? 'danger' : 'success';
  pushEvent(s, s.outcomeTone, `Round ${s.round} finished.`, null);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Advance the simulation by one step: start a round, or play one slot. */
export function step(state: SimState): SimState {
  const s = structuredClone(state);
  const rng = createRng(s.rng);
  if (s.roundActive) simulateSlot(s, rng);
  else startRound(s, rng);
  s.rng = rng.state;
  return s;
}

/** Finish the current round (or play a whole new one). */
export function runRound(state: SimState): SimState {
  let s = state.roundActive ? state : step(state);
  while (s.roundActive) s = step(s);
  return s;
}

/**
 * Finish the current round (if any) and then play `count` more whole rounds,
 * copying the state only once. Gives exactly the same result as calling
 * runRound repeatedly — used for fast batch comparisons.
 */
export function runRounds(state: SimState, count: number): SimState {
  const s = structuredClone(state);
  const rng = createRng(s.rng);
  while (s.roundActive) simulateSlot(s, rng);
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  for (let i = 0; i < n; i += 1) {
    startRound(s, rng);
    while (s.roundActive) simulateSlot(s, rng);
  }
  s.rng = rng.state;
  return s;
}
