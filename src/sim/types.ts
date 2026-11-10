export type TrafficLevel = 'light' | 'medium' | 'heavy' | 'custom';
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

/** The simplified protocol numbers. All of them can be changed in the UI. */
export interface ModelParams {
  /** Starting contention window: the first wait is drawn from [0, cwMin]. */
  cwMin: number;
  /** Largest contention window after doubling. */
  cwMax: number;
  /** Total attempts per frame (first try + retries) before it is dropped. */
  maxAttempts: number;
  /** Length of one round's channel window, in slots. */
  slotsPerRound: number;
  /** Length of one data frame, in slots (the ACK adds one more). */
  frameSlots: number;
}

export interface Settings {
  deviceCount: number; // MIN_DEVICES–MAX_DEVICES
  traffic: TrafficLevel;
  /** Chance (0–100) that an idle station gets a new frame each round. Fixed by the preset unless traffic is 'custom'. */
  loadPercent: number;
  hiddenNode: boolean;
  /** Stations that cannot hear one another. Empty when hiddenNode is off, otherwise at least two. */
  hiddenIds: number[];
  seed: number;
  params: ModelParams;
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
  /** Collisions caused by a station starting while one it cannot hear was already sending. */
  hiddenCollisions: number;
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

/** What gets saved to the run history and shown in comparisons. */
export interface RunSummary {
  deviceCount: number;
  traffic: TrafficLevel;
  loadPercent: number;
  hiddenNode: boolean;
  hiddenCount: number;
  cwMin: number;
  cwMax: number;
  maxAttempts: number;
  slotsPerRound: number;
  frameSlots: number;
  successes: number;
  collisions: number;
  hiddenCollisions: number;
  retries: number;
  dropped: number;
  rounds: number;
  utilization: number;
}
