export type IconName = 'idle' | 'backoff' | 'transmit' | 'ack' | 'collision' | 'hidden' | 'sensing' | 'drop';

const PATHS: Record<IconName, string> = {
  idle: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10',
  backoff: 'M7 4h10M7 20h10M8 4c0 4 8 4 8 8s-8 4-8 8M16 4c0 4-8 4-8 8s8 4 8 8',
  transmit: 'M12 19V6M6.5 11.5L12 6l5.5 5.5',
  ack: 'M5 12.5l4.5 4.5L19 7.5',
  collision: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  hidden: 'M3 3l18 18M10.6 6.2A9.6 9.6 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.6 3.1M6.4 7.5A16 16 0 0 0 3 12s4 6 9 6a8.7 8.7 0 0 0 4-1',
  sensing: 'M4 12h2l2-5 3 10 3-8 2 3h4',
  drop: 'M12 4v9M12 17.5v.5',
};

/** Decorative icon; always paired with visible text, so hidden from screen readers. */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
