import type { ModelParams, Station, StationState } from '../sim/types';
import { Icon, type IconName } from './Icon';

const STATE: Record<StationState, { label: string; icon: IconName; tone: string }> = {
  idle: { label: 'Idle', icon: 'idle', tone: 'muted' },
  sensing: { label: 'Sensing', icon: 'sensing', tone: 'accent' },
  backoff: { label: 'Backoff', icon: 'backoff', tone: 'warning' },
  transmitting: { label: 'Transmitting', icon: 'transmit', tone: 'accent' },
  waitingAck: { label: 'Waiting for ACK', icon: 'ack', tone: 'accent' },
  retrying: { label: 'Retrying', icon: 'backoff', tone: 'warning' },
  done: { label: 'Done', icon: 'ack', tone: 'success' },
  dropped: { label: 'Dropped', icon: 'drop', tone: 'danger' },
};

function describe(st: Station, params: ModelParams): { text: string; progress: number } {
  switch (st.state) {
    case 'sensing':
      return {
        text: st.frozen ? 'Channel busy — deferring' : `Listening… will wait ${st.backoff} slot${st.backoff === 1 ? '' : 's'}`,
        progress: 0,
      };
    case 'backoff':
    case 'retrying': {
      const start = st.backoffStart ?? 0;
      const left = st.backoff ?? 0;
      return {
        text: `${left} slot${left === 1 ? '' : 's'} left (window 0–${st.cw})${st.frozen ? ' · frozen, channel busy' : ''}`,
        progress: start === 0 ? 100 : ((start - left) / start) * 100,
      };
    }
    case 'transmitting':
      return {
        text: st.corrupted ? 'Sending — but the frame is garbled at the AP' : 'Sending its frame',
        progress: ((params.frameSlots - st.txRemaining) / params.frameSlots) * 100,
      };
    case 'waitingAck':
      return { text: 'Listening for the access point’s ACK', progress: 100 };
    case 'done':
      return { text: 'Frame delivered', progress: 100 };
    case 'dropped':
      return { text: `Gave up after ${params.maxAttempts} attempt${params.maxAttempts === 1 ? '' : 's'}`, progress: 100 };
    default:
      return { text: 'Nothing to send', progress: 0 };
  }
}

export function DeviceCard({ station, params }: { station: Station; params: ModelParams }) {
  const info = STATE[station.state];
  const { text, progress } = describe(station, params);
  const showAttempt = station.hasFrame && station.state !== 'done' && station.state !== 'dropped';

  return (
    <li className={`device device--${info.tone}`}>
      <div className="device__head">
        <h3>{station.name}</h3>
        {station.hidden && (
          <span className="badge badge--hidden">
            <Icon name="hidden" size={13} />
            Hidden
          </span>
        )}
      </div>

      <p className={`state state--${info.tone}`}>
        <Icon name={info.icon} size={15} />
        {info.label}
      </p>
      <p className="device__detail">{text}</p>

      <div className="bar" aria-hidden="true">
        <span className="bar__fill" style={{ width: `${progress}%` }} />
      </div>

      <dl className="device__stats">
        <div>
          <dt>Backoff</dt>
          <dd>{station.backoff ?? '—'}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>
            {station.totalAttempts}
            {showAttempt && <small> · try {station.attempt}/{params.maxAttempts}</small>}
          </dd>
        </div>
        <div>
          <dt>Successes</dt>
          <dd>{station.successes}</dd>
        </div>
      </dl>
    </li>
  );
}
