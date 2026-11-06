import type { ReactNode } from 'react';

export function Header({ status }: { status: ReactNode }) {
  return (
    <header className="hero">
      <div className="hero__top">
        <p className="eyebrow">Classroom WLAN · CSMA/CA</p>
        {status}
      </div>
      <h1>Who gets to speak?</h1>
      <p className="hero__lead">
        Every laptop in a classroom shares one Wi-Fi channel, and only one of them can talk to the access point at a
        time. With <strong>CSMA/CA</strong> (carrier sense multiple access with collision avoidance), each device listens
        first, waits a random number of slots, and only then sends. If two still talk over each other, no ACK comes
        back, so each waits longer and tries again.
      </p>
    </header>
  );
}
