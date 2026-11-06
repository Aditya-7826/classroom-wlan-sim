-- Classroom WLAN simulator: anonymous run summaries.
--
-- The table stores only aggregate counters from a simulation run. It holds no
-- personal data (no names, emails, IP addresses or user ids).
--
-- Notes on Row Level Security (RLS):
--   * RLS cannot limit HOW MANY rows a select returns. The app always queries
--     `order by created_at desc limit 10`. Because the data is anonymous and
--     non-personal, public reads are acceptable for this demo.
--   * Anonymous inserts can be spammed by anyone who has the publishable key.
--     That is an accepted limitation for a class demo. The checks below keep
--     every row within sane bounds.
--   * There are no update or delete policies, so anonymous users cannot change
--     or remove saved rows.

create table if not exists public.simulation_runs (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  device_count        int     not null check (device_count between 2 and 10),
  traffic_level       text    not null check (traffic_level in ('light', 'medium', 'heavy')),
  hidden_node         boolean not null,
  successes           int     not null check (successes  between 0 and 100000),
  collisions          int     not null check (collisions between 0 and 100000),
  retries             int     not null check (retries    between 0 and 100000),
  dropped             int     not null check (dropped    between 0 and 100000),
  rounds              int     not null check (rounds     between 0 and 100000),
  channel_utilization numeric(5,2) not null check (channel_utilization between 0 and 100)
);

create index if not exists simulation_runs_created_at_idx
  on public.simulation_runs (created_at desc);

alter table public.simulation_runs enable row level security;

-- Table privileges: anon may read, and may insert only the counter columns
-- (id and created_at always come from the defaults).
revoke all on table public.simulation_runs from anon, authenticated;
grant select on table public.simulation_runs to anon;
grant insert (
  device_count, traffic_level, hidden_node,
  successes, collisions, retries, dropped, rounds, channel_utilization
) on table public.simulation_runs to anon;

create policy "Anyone can read run summaries"
  on public.simulation_runs
  for select
  to anon
  using (true);

create policy "Anyone can insert a valid run summary"
  on public.simulation_runs
  for insert
  to anon
  with check (
    device_count between 2 and 10
    and traffic_level in ('light', 'medium', 'heavy')
    and hidden_node is not null
    and successes  between 0 and 100000
    and collisions between 0 and 100000
    and retries    between 0 and 100000
    and dropped    between 0 and 100000
    and rounds     between 0 and 100000
    and channel_utilization between 0 and 100
  );

-- No update or delete policies on purpose.
