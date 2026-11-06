/**
 * CSMA/CA teaching model — pure functions, no React.
 *
 * Time is divided into slots. A data frame lasts DATA_SLOTS slots and is
 * followed by one ACK slot from the access point (AP). All values are
 * simplified for teaching and are NOT the real IEEE 802.11 numbers.
 */
import { createRng, normalizeSeed, type Rng } from './random';
import type {
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

/** Simplified contention window values (real Wi-Fi uses different numbers). */
export const CW_MIN = 7;
export const CW_MAX = 63;
/** Total attempts per frame (first try + retries) before it is dropped. */
export const MAX_ATTEMPTS = 4;
export const SLOTS_PER_ROUND = 12;
export const DATA_SLOTS = 2;
export const MIN_DEVICES = 2;
export const MAX_DEVICES = 10;
const MAX_EVENTS = 8;

export const TRAFFIC_PROBABILITY: Record<TrafficLevel, number> = {
  light: 0.3,
  medium: 0.6,
  heavy: 0.9,
};

/** In hidden-node mode these two stations cannot hear each other. */
export const HIDDEN_STATION_IDS: readonly number[] = [1, 2];

/**
 * Default seed for repeatable scenarios. Chosen so that, with hidden-node
 * mode on, Student 2 starts first and Student 1 — unable to hear it — joins
 * mid-frame, so they collide at the AP in round 1 for every device count and
 * traffic level (verified in engine.test.ts).
 */
export const DEFAULT_SEED = 60;

export const DEFAULT_SETTINGS: Settings = {
  deviceCount: 6,
  traffic: 'medium',
  hiddenNode: false,
  seed: DEFAULT_SEED,
};

/** Double the window (0–7 → 0–15 → 0–31 → 0–63), capped at CW_MAX. */
export function nextCw(cw: number): number {
  return Math.min((cw + 1) * 2 - 1, CW_MAX);
}

export function stationName(id: number): string {
  return `Student ${id}`;
}

export function createStation(id: number, hidden = false): Station {
  return {
    id,
    name: stationName(id),
    hidden,
    hasFrame: false,
    state: 'idle',
    backoff: null,
    backoffStart: null,
    cw: CW_MIN,
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
  return { successes: 0, collisions: 0, retries: 0, dropped: 0, rounds: 0, totalSlots: 0, usefulSlots: 0 };
}

function emptyRoundStats(): RoundStats {
  return { hadFrames: false, delivered: [], dropped: [], collisions: 0, hiddenCollisions: 0, retries: 0 };
}

export function createInitialState(input: Settings): SimState {
  const deviceCount = Math.min(Math.max(Math.round(input.deviceCount), MIN_DEVICES), MAX_DEVICES);
  const settings: Settings = { ...input, deviceCount, seed: normalizeSeed(input.seed) };
  const stations = Array.from({ length: deviceCount }, (_, i) =>
    createStation(i + 1, settings.hiddenNode && HIDDEN_STATION_IDS.includes(i + 1)),
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

/** Can station `a` hear station `b`? Only the hidden pair cannot hear each other. */
export function canHear(a: Station, b: Station): boolean {
  return a.id === b.id || !(a.hidden && b.hidden);
}

export function utilization(summary: Summary): number {
  if (summary.totalSlots === 0) return 0;
  return Math.round((summary.usefulSlots / summary.totalSlots) * 10000) / 100;
}

export function toRunSummary(state: SimState): RunSummary {
  const { summary, settings } = state;
  return {
    deviceCount: settings.deviceCount,
    traffic: settings.traffic,
    hiddenNode: settings.hiddenNode,
    successes: summary.successes,
    collisions: summary.collisions,
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
  const probability = TRAFFIC_PROBABILITY[s.settings.traffic];

  // Stations are processed in id order, so in hidden-node mode Students 1 and 2
  // (always ready: they are uploading coursework) draw their waits first.
  for (const st of s.stations) {
    if (st.hasFrame) {
      carried.push(st.id);
      continue;
    }
    const ready = st.hidden ? true : rng.next() < probability;
    if (!ready) continue;
    st.hasFrame = true;
    st.attempt = 1;
    st.cw = CW_MIN;
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
      `${listNames(fresh)} ${fresh.length === 1 ? 'has' : 'have'} a new frame. ` +
        `${fresh.length === 1 ? 'It listens' : 'Each listens'} to the channel and picks a random wait from ${windowText(CW_MIN)} slots.`,
    );
  }
  if (carried.length > 0) {
    parts.push(`${listNames(carried)} still ${carried.length === 1 ? 'has' : 'have'} an unfinished frame from last round.`);
  }
  pushEvent(s, 'info', `Round ${s.round} begins. ${parts.join(' ')}`, null);
  s.outcome = `Round ${s.round} in progress…`;
  s.outcomeTone = 'info';
}

// ---------------------------------------------------------------------------
// One slot
// ---------------------------------------------------------------------------

function succeed(s: SimState, st: Station, slotNo: number): void {
  st.hasFrame = false;
  st.state = 'done';
  st.successes += 1;
  st.cw = CW_MIN;
  st.attempt = 1;
  st.backoff = null;
  st.backoffStart = null;
  s.summary.successes += 1;
  s.summary.usefulSlots += DATA_SLOTS + 1;
  s.roundStats.delivered.push(st.id);
  pushEvent(
    s,
    'success',
    `${st.name}'s frame arrived — the access point sent an ACK. ${st.name} resets its wait window to ${windowText(CW_MIN)}.`,
    slotNo,
  );
}

function fail(s: SimState, st: Station, rng: Rng, slotNo: number): void {
  if (st.attempt >= MAX_ATTEMPTS) {
    pushEvent(
      s,
      'danger',
      `${st.name} heard no ACK on attempt ${st.attempt} of ${MAX_ATTEMPTS} — it gives up and the frame is dropped.`,
      slotNo,
    );
    st.hasFrame = false;
    st.state = 'dropped';
    st.drops += 1;
    st.cw = CW_MIN;
    st.attempt = 1;
    st.backoff = null;
    st.backoffStart = null;
    s.summary.dropped += 1;
    s.roundStats.dropped.push(st.id);
    return;
  }
  st.attempt += 1;
  st.cw = nextCw(st.cw);
  drawBackoff(st, rng);
  st.state = 'retrying';
  s.summary.retries += 1;
  s.roundStats.retries += 1;
  pushEvent(
    s,
    'warning',
    `${st.name} heard no ACK — doubling its wait window to ${windowText(st.cw)} and retrying (attempt ${st.attempt} of ${MAX_ATTEMPTS}).`,
    slotNo,
  );
}

function simulateSlot(s: SimState, rng: Rng): void {
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
  for (const st of starters) {
    const hiddenFrom = ongoing.filter((o) => !canHear(st, o));
    st.state = 'transmitting';
    st.txRemaining = DATA_SLOTS;
    st.corrupted = false;
    st.totalAttempts += 1;
    st.backoff = null;
    st.backoffStart = null;
    st.frozen = false;
    const why =
      hiddenFrom.length > 0
        ? `${st.name} can't hear ${listNames(hiddenFrom.map((o) => o.id))}, thinks the channel is free and starts sending`
        : `${st.name} counted down to 0 and starts sending`;
    pushEvent(s, 'info', `${why} (attempt ${st.attempt} of ${MAX_ATTEMPTS}).`, slotNo);
  }

  // 2. Two or more frames on the air at once => collision at the AP.
  const transmitters = s.stations.filter((st) => st.state === 'transmitting');
  if (transmitters.length >= 2) {
    if (transmitters.some((t) => !t.corrupted)) {
      const ids = transmitters.map((t) => t.id);
      const hiddenPair = transmitters.filter((t) => t.hidden);
      s.summary.collisions += 1;
      s.roundStats.collisions += 1;
      if (hiddenPair.length >= 2) {
        s.roundStats.hiddenCollisions += 1;
        pushEvent(
          s,
          'special',
          `Hidden-node collision at the access point! ${listNames(hiddenPair.map((t) => t.id))} can't hear each other, so both thought the channel was free. ` +
            `Their radios can't notice the clash while sending — they'll only find out when no ACK arrives.`,
          slotNo,
        );
      } else {
        pushEvent(
          s,
          'danger',
          `Collision at the access point: ${listNames(ids)} are sending at the same time. ` +
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
    detail = `${counting} ${counting === 1 ? 'student is' : 'students are'} counting down`;
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
  if (s.slots.length >= SLOTS_PER_ROUND || !pending) endRound(s);
}

// ---------------------------------------------------------------------------
// Round end
// ---------------------------------------------------------------------------

function endRound(s: SimState): void {
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
      ? `${listNames(r.delivered)} delivered ${r.delivered.length === 1 ? 'a frame' : 'frames'} (ACK received).`
      : 'No frames were delivered.',
  );
  if (r.collisions > 0) {
    const hidden = r.hiddenCollisions > 0 ? `, ${r.hiddenCollisions} caused by hidden nodes` : '';
    parts.push(`${r.collisions} collision${r.collisions === 1 ? '' : 's'}${hidden} — no ACK, so the senders had to retry.`);
  }
  if (r.retries > 0) parts.push(`${r.retries} retr${r.retries === 1 ? 'y' : 'ies'} with a doubled wait window.`);
  if (r.dropped.length > 0) parts.push(`${listNames(r.dropped)} gave up after ${MAX_ATTEMPTS} attempts (frame dropped).`);
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
