import { CW_MAX, CW_MIN, DEFAULT_SEED, MAX_ATTEMPTS } from '../sim/engine';

export function LearnPanel() {
  return (
    <section className="card learn" aria-labelledby="learn-title">
      <h2 id="learn-title" className="visually-hidden">
        Learning notes
      </h2>

      <div className="learn__block">
        <h3>What to observe</h3>
        <ul>
          <li>Backoff counters only tick down on quiet slots. While someone is sending, they <strong>freeze</strong>.</li>
          <li>Two students reaching zero in the same slot collide. Neither radio notices while sending; they only know because <strong>no ACK</strong> comes back.</li>
          <li>After each failure the wait window doubles (0–{CW_MIN} → 0–15 → 0–31 → 0–{CW_MAX}), which makes a second clash less likely.</li>
          <li>Heavy load with many devices means more collisions, more retries and lower useful utilisation.</li>
        </ul>
      </div>

      <div className="learn__block">
        <h3>The hidden-node problem</h3>
        <p>
          Students 1 and 2 sit at opposite ends of the room. Both can reach the access point, but they can’t hear each
          other. When one is sending, the other still thinks the channel is free, so its countdown keeps going and it
          starts talking over the first frame. The access point gets garbage from both. Real Wi-Fi can use RTS/CTS
          to reduce this; this model leaves it out so the problem is easy to see.
        </p>
      </div>

      <div className="learn__block">
        <h3>Presenter notes</h3>
        <ol>
          <li>Start with 3 devices on light load and step through one round, slot by slot. Ask: “why didn’t Student 3 send yet?”</li>
          <li>Switch to 8 devices on heavy load and run the simulation. Point at the collisions counter and the doubling windows.</li>
          <li>Turn on <em>Hidden-node problem</em> and <em>Repeatable scenario</em> with seed {DEFAULT_SEED}. Round 1 always shows Student 1 talking over Student 2.</li>
          <li>Ask students to predict what happens after {MAX_ATTEMPTS} failed attempts, then find a dropped frame.</li>
        </ol>
      </div>
    </section>
  );
}
