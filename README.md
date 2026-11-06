# Who gets to speak? — Classroom WLAN Simulator

**An interactive browser demo that shows how Wi-Fi devices take turns on one shared channel (CSMA/CA).**

![Overview of the simulator](docs/screenshots/overview.png)

> **No database or account needed.** The simulator runs entirely in your browser. Saving run history to Supabase is an optional extra; without it the app simply shows "Local only".

## Contents

1. [Introduction](#introduction)
2. [Why we built this](#why-we-built-this)
3. [Use cases](#use-cases)
4. [See it working](#see-it-working)
5. [How CSMA/CA works here](#how-csmaca-works-here)
6. [Run it on any laptop](#run-it-on-any-laptop)
7. [Architecture](#architecture)
8. [Optional: save run history with Supabase](#optional-save-run-history-with-supabase)
9. [Deploy on Vercel](#deploy-on-vercel)
10. [Git workflow](#git-workflow)
11. [Limitations](#limitations)
12. [Author and license](#author-and-license)

---

## Introduction

All the laptops and phones in a classroom share one Wi-Fi channel. Only one of them can send to the access point at a time. If two send at once, their signals overlap and neither message gets through.

Wi-Fi handles this with **CSMA/CA** — *carrier sense multiple access with collision avoidance*. Each device listens first and, if the channel is free, waits a random number of short time slots before it sends. If no acknowledgement (ACK) comes back, it assumes a collision, waits a longer random time and tries again.

## Why we built this

On real Wi-Fi, collisions and backoff happen in microseconds, so nobody can see them. Textbooks show static diagrams that make it hard to follow *who decided what, and when*.

This simulator slows everything down to one slot at a time. You can watch every device listen, count down, send, collide and retry. A seeded random generator makes any scenario **repeatable**, so a lecturer can show exactly the same collision to every class.

## Use cases

- **Lecture demo** — step through one round on the projector and explain each slot.
- **Lab exercise** — students change devices and load, then record collisions and utilisation.
- **Self-study and revision** — replay a seed until the backoff rules make sense.
- **Explaining hidden nodes** — switch on the hidden-node toggle and see two stations that cannot hear each other collide.
- **Comparing light vs heavy load** — run the same device count on light and heavy traffic and compare the summary counters.

## See it working

| Screen | Image |
| --- | --- |
| Overview | ![Overview](docs/screenshots/overview.png) |
| A collision | ![Collision](docs/screenshots/collision.png) |
| Hidden-node problem | ![Hidden node](docs/screenshots/hidden-node.png) |
| Mobile layout | ![Mobile](docs/screenshots/mobile.png) |

### Try this

1. **See a collision.** Set **10 devices**, **Heavy** load, keep **Repeatable scenario** on with seed **5**, then press **Run one round** a few times. Watch the red *Collision* slots and the doubling wait windows (0–7 → 0–15).
2. **See the hidden-node problem.** Press **Reset**, set **6 devices**, **Medium** load, switch on **Hidden-node problem** and keep seed **60**. Press **Run one round**: Student 2 starts sending in slot 2, Student 1 (who cannot hear it) joins in slot 3, and both frames are lost.
3. **See a dropped frame.** Keep **Heavy** load, press **Run simulation** and wait until the *Dropped frames* counter goes up. Read the event log to see the fourth failed attempt.
4. **Compare loads.** Run 10 rounds on **Light**, note the utilisation, then do the same on **Heavy**.

## How CSMA/CA works here

```mermaid
flowchart TD
    A[Frame ready] --> B[Sense the channel]
    B -->|Busy| C[Defer: countdown frozen]
    C --> B
    B -->|Idle| D[Pick random wait from 0 to CW<br/>count down on idle slots only]
    D -->|Counter reaches 0| E[Transmit frame]
    E --> F{ACK from access point?}
    F -->|Yes| G[Success: reset CW to 7]
    F -->|No ACK| H{Attempt 4 of 4 used?}
    H -->|No| I[Double CW, max 63<br/>retry]
    I --> D
    H -->|Yes| J[Drop the frame]
```

Key rules in this teaching model:

- The wait (backoff) is picked from **0 to CW**. CW starts at **7** and doubles after each failure, up to **63**. These are simplified values.
- Countdowns only tick on **idle** slots. They **freeze** while someone else is sending.
- A frame lasts **2 slots** and is followed by **1 ACK slot** from the access point.
- Wi-Fi radios generally **cannot detect a collision while sending**. They only infer it because no ACK arrives.
- A frame gets **4 attempts** in total. After the fourth failure it is dropped.
- Traffic load is the chance each idle device has a new frame each round: light ≈ 30%, medium ≈ 60%, heavy ≈ 90%.
- **Hidden-node mode:** Students 1 and 2 cannot hear each other, so their countdowns do not freeze for each other. They are uploading coursework, so they always have a frame ready.
- One round is a 12-slot window. Unfinished frames carry over into the next round.

## Run it on any laptop

### Prerequisites

- **Node.js LTS** — version 22.12 or newer, or 24 (see `.nvmrc`). Node 25 is not supported by the test runner.
- **Git**

Check what you have:

```bash
node -v
git --version
```

### Windows (PowerShell)

```powershell
# 1. Install Node.js LTS and Git (skip if already installed)
winget install OpenJS.NodeJS.LTS
winget install Git.Git

# 2. Get the code (close and reopen PowerShell after installing)
git clone https://github.com/Aditya-7826/classroom-wlan-sim.git
cd classroom-wlan-sim

# 3. Install and run
npm install
npm run dev
```

### macOS

```bash
# 1. Install Node.js LTS and Git with Homebrew (skip if already installed)
brew install node@24 git

# 2. Get the code
git clone https://github.com/Aditya-7826/classroom-wlan-sim.git
cd classroom-wlan-sim

# 3. Install and run
npm install
npm run dev
```

### Linux (Debian / Ubuntu)

```bash
# 1. Install Git and Node.js LTS via nvm (skip if already installed)
sudo apt update && sudo apt install -y git curl
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24

# 2. Get the code
git clone https://github.com/Aditya-7826/classroom-wlan-sim.git
cd classroom-wlan-sim

# 3. Install and run
npm install
npm run dev
```

Then open **http://localhost:5173** in your browser.

### Other commands

```bash
npm run build     # type-check and build into dist/
npm run preview   # serve the built app locally
npm test          # run the simulation-engine tests
```

### Troubleshooting

| Problem | Fix |
| --- | --- |
| `Port 5173 is in use` | Close the other dev server, or run `npm run dev -- --port 5174` and open that port. |
| `Unsupported engine` or odd install errors | Your Node version is too old (or is v25). Install Node 24 LTS, or run `nvm use` in the project folder. |
| Blank page | Open the browser console (F12). Make sure you opened the URL that `npm run dev` printed, and run `npm install` again after pulling changes. |
| Pill says "Local only" | That is normal without Supabase. See the optional section below. |

## Architecture

```mermaid
flowchart LR
    subgraph Browser
        UI[UI components<br/>Controls, Timeline, DeviceCard, ...] --> SIM[useSimulation hook<br/>owns the one timer]
        SIM --> ENGINE[sim/engine.ts<br/>pure TypeScript]
        UI --> HIST[useRunHistory hook]
        HIST --> CLIENT[lib/supabase.ts]
    end
    CLIENT -. optional .-> DB[(Supabase Postgres<br/>simulation_runs)]
    GH[GitHub repository] --> VERCEL[Vercel build and hosting]
```

### Folder tree

```text
classroom-wlan-sim/
├── docs/screenshots/          # images used in this README
├── public/favicon.svg
├── src/
│   ├── components/            # Header, Controls, ChannelTimeline, DeviceCard,
│   │                          # SummaryStats, EventLog, LearnPanel, DbStatus, RunHistory
│   ├── hooks/
│   │   ├── useSimulation.ts   # state + the single interval timer
│   │   └── useRunHistory.ts   # optional saving / loading of run summaries
│   ├── lib/supabase.ts        # client, or null when not configured
│   ├── sim/
│   │   ├── random.ts          # seeded PRNG (mulberry32)
│   │   ├── types.ts
│   │   ├── engine.ts          # step(state) and runRound(state)
│   │   └── engine.test.ts     # Vitest tests
│   ├── styles/
│   │   ├── tokens.css         # all colours and sizes
│   │   └── app.css
│   ├── App.tsx
│   └── main.tsx
├── supabase/migrations/       # SQL for the optional run-history table
├── .env.example
└── index.html
```

### Why the engine is separate from React

The simulation lives in `src/sim/` and does not import React. `step(state)` takes a state and returns a new one, and all randomness comes from a seeded generator stored inside that state. That means:

- the rules can be **unit-tested** without a browser;
- the same seed and settings always give the **same run**;
- the UI only *displays* state, so it cannot accidentally change the rules.

## Optional: save run history with Supabase

**You can skip this section.** The app works fully without a database. If you connect one, it saves an anonymous summary each time a round finishes or you pause a simulation, and shows the last 10 runs.

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of `supabase/migrations/20261106224500_create_simulation_runs.sql`, and run it.
3. In **Project Settings → API**, copy the **Project URL** and the **publishable key**.
4. Copy the example env file and fill in both values:

   ```bash
   cp .env.example .env.local
   ```

   ```ini
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

5. Stop and restart `npm run dev`. The pill should now say **Run history: connected**.

### Why the publishable key is safe here

The publishable key is meant to be visible in the browser. It is only safe because **Row Level Security (RLS)** is turned on for the table. The policies allow anonymous users to **insert** rows that pass the range checks and to **read** rows. There are no update or delete policies, so nobody can change or remove saved runs.

Things to know:

- RLS cannot limit *how many* rows someone reads. The app asks for `order by created_at desc limit 10`. The table holds no personal data, so public reads are fine.
- Anyone with the key can insert rows, so the table could be spammed. That is acceptable for a class demo.
- **Never** put a secret or service-role key in this project or in `.env.local`.

If Supabase is unreachable, the app switches to **Local only** and keeps working.

## Deploy on Vercel

1. Push the repository to GitHub (see [Git workflow](#git-workflow)).
2. On [vercel.com](https://vercel.com), choose **Add New → Project** and import the repository.
3. Framework preset: **Vite** (detected automatically). Build command `npm run build`, output folder `dist`.
4. Optional: under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Click **Deploy**.

Vite bakes environment variables in at build time, so **redeploy after changing them**.

## Git workflow

```bash
git add .
git commit -m "Describe your change"
git push
```

Check that every commit lists only you as the author, with no extra trailers:

```bash
git log --format="%an <%ae>%n%b" | grep -iE "claude|anthropic|co-authored"
```

This should print nothing.

## Limitations

This is a **simplified teaching model**, not an IEEE 802.11-accurate simulation.

- No real timing: no SIFS, DIFS or slot durations, and no PHY or radio physics.
- No RTS/CTS, so the hidden-node problem is never solved here — on purpose.
- Contention window values (7 to 63), the 2-slot frames and the 4-attempt limit are simplified.
- Every device can always reach the access point. There is no signal strength, rate adaptation or interference from other networks.
- Rounds are fixed 12-slot windows to keep the display readable.

## Author and license

**Author:** Karthikeyan Pandita

**License:** TODO: choose a license
