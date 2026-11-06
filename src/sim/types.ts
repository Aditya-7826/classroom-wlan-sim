export type TrafficLevel = 'light' | 'medium' | 'heavy';
export type Speed = 'slow' | 'normal' | 'fast';

export type StationState =
  | 'idle' // nothing to send
  | 'sensing' // has a frame, listening before counting down
  | 'backoff' // counting down a random wait (first attempt)
  | 'transmitting'
  | 'waitingAck'
  | 'retrying' // counting down again after a missing ACK
  | 'done' // delivered a frame this round
  | 'dropped'; // gave up on a frame this round

export type SlotKind = 'idle' | 'backoff' | 'transmit' | 'ack' | 'collision';

export type Tone = 'info' | 'success' | 'warning' | 'danger' | 'special';

export interface Settings {
  deviceCount: number; // 2–10
  traffic: TrafficLevel;
  hiddenNode: boolean;
  seed: number;
}

export interface Station {
  id: number; // 1-based
  name: string;
  hidden: boolean;
  hasFrame: boolean;
  state: StationState;
  /** Slots left to wait, or null when not counting down. */
  backoff: number | null;
  /** The value drawn for the current countdown (for the progress bar). */
  backoffStart: number | null;
  /** Upper end of the current contention window: wait is drawn from [0, cw]. */
  cw: number;
  /** Attempt number for the current frame (1-based). */
  attempt: number;
  /** Data slots left in the current transmission. */
  txRemaining: number;
  /** True once the current frame has overlapped another at the AP. */
  corrupted: boolean;
  /** True when the countdown paused this slot because the channel sounded busy. */
  frozen: boolean;
  totalAttempts: number;
  successes: number;
  drops: number;
}

export interface Slot {
  index: number; // 1-based within the round
  kind: SlotKind;
  stationIds: number[];
  label: string;
  detail: string;
}

export interface SimEvent {
  id: number;
  round: number;
  slot: number | null;
  tone: Tone;
  text: string;
}

export interface Summary {
  successes: number;
  collisions: number;
  retries: number;
  dropped: number;
  rounds: number;
  totalSlots: number;
  /** Slots that carried a frame that was delivered, plus its ACK. */
  usefulSlots: number;
}

export interface RoundStats {
  hadFrames: boolean;
  delivered: number[];
  dropped: number[];
  collisions: number;
  hiddenCollisions: number;
  retries: number;
}

export interface SimState {
  settings: Settings;
  rng: number;
  round: number;
  roundActive: boolean;
  slots: Slot[];
  stations: Station[];
  /** Station the AP will ACK in the next slot. */
  ackFor: number | null;
  /** Stations whose corrupted frame just ended; they hear silence next slot. */
  awaitingAck: number[];
  events: SimEvent[];
  nextEventId: number;
  summary: Summary;
  roundStats: RoundStats;
  outcome: string;
  outcomeTone: Tone;
}

/** What gets saved to the run history. */
export interface RunSummary {
  deviceCount: number;
  traffic: TrafficLevel;
  hiddenNode: boolean;
  successes: number;
  collisions: number;
  retries: number;
  dropped: number;
  rounds: number;
  utilization: number;
}
