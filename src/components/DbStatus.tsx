import type { DbStatus as Status } from '../hooks/useRunHistory';

const TEXT: Record<Status, string> = {
  connected: 'Run history: connected',
  checking: 'Run history: connecting…',
  local: 'Local only',
};

export function DbStatus({ status }: { status: Status }) {
  return (
    <p className={`pill pill--${status}`} role="status">
      <span className="pill__dot" aria-hidden="true" />
      {TEXT[status]}
    </p>
  );
}
