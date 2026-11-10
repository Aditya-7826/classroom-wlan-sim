import { DEFAULT_PARAMS, DEFAULT_SEED, nextCw } from '../sim/engine';
import type { ModelParams } from '../sim/types';

/** The window ladder for the current settings, e.g. "0–7 → 0–15 → 0–31 → 0–63". */
function ladder(p: ModelParams): string {
  const steps = [p.cwMin];
  while (steps.length < 12 && steps[steps.length - 1] < p.cwMax) steps.push(nextCw(steps[steps.length - 1], p.cwMax));
  return steps.map((v) => `0–${v}`).join(' → ');
}

function names(ids: number[]): string {
  const list = ids.map((x) => `Student ${x}`);
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

export function LearnPanel({ params, hiddenIds }: { params: ModelParams; hiddenIds: number[] }) {
  const pair = hiddenIds.length >= 2 ? hiddenIds : [1, 2];
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
          <li>After each failure the wait window doubles ({ladder(params)}), which makes a second clash less likely.</li>
          <li>Heavy load with many devices means more collisions, more retries and lower useful utilisation. Use <em>Compare scenarios</em> to see it across 2–20 devices at once.</li>
        </ul>
      </div>

      <div className="learn__block">
        <h3>The hidden-node problem</h3>
        <p>
          {names(pair)} sit far apart in the room. All of them can reach the access point, but they can’t hear each
          other. When one is sending, another still thinks the channel is free, so its countdown keeps going and it
          starts talking over the first frame. The access point gets garbage from both. Real Wi-Fi can use RTS/CTS
          to reduce this; this model leaves it out so the problem is easy to see.
        </p>
      </div>

      <div className="learn__block">
        <h3>Presenter notes</h3>
        <ol>
          <li>Start with 3 devices on light load and step through one round, slot by slot. Ask: “why didn’t Student 3 send yet?”</li>
          <li>Switch to 15 devices on heavy load and run the simulation. Point at the collisions counter and the doubling windows.</li>
          <li>
            Turn on <em>Hidden-node problem</em> and <em>Repeatable scenario</em> with seed {DEFAULT_SEED}. With the default
            hidden pair (Students 1 and 2) and default model settings, round 1 always shows them talking over each other.
          </li>
          <li>
            Ask students to predict what happens after {params.maxAttempts} failed attempt{params.maxAttempts === 1 ? '' : 's'},
            then find a dropped frame.
          </li>
          <li>
            Open <em>Model settings</em>: shrink the largest window to 0–{DEFAULT_PARAMS.cwMin * 2 + 1} and compare heavy load
            with 20 devices. Collisions climb because the window can’t grow far enough.
          </li>
        </ol>
      </div>
    </section>
  );
}
