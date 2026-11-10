-- Classroom WLAN simulator: support up to 20 devices and record the model settings.
--
-- Run this AFTER 20261106224500_create_simulation_runs.sql. It is safe to run on
-- a table that already holds rows: existing rows get the values the simulator
-- used when they were saved (CW 7–63, 4 attempts, 12-slot rounds, 2-slot frames,
-- presets of 30/60/90 % load, and Students 1 and 2 as the hidden pair).
--
-- Still no personal data: every column is an anonymous setting or counter.
-- RLS notes from the first migration still apply (reads cannot be row-capped,
-- so the app always asks for `order by created_at desc limit 10`; anonymous
-- inserts can be spammed, which is accepted for a class demo).

begin;

-- 1. Up to 20 devices, and a 'custom' traffic level.
alter table public.simulation_runs drop constraint if exists simulation_runs_device_count_check;
alter table public.simulation_runs
  add constraint simulation_runs_device_count_check check (device_count between 2 and 20);

alter table public.simulation_runs drop constraint if exists simulation_runs_traffic_level_check;
alter table public.simulation_runs
  add constraint simulation_runs_traffic_level_check
  check (traffic_level in ('light', 'medium', 'heavy', 'custom'));

-- 2. New columns: added nullable, back-filled, then made required.
alter table public.simulation_runs
  add column if not exists load_percent    int,
  add column if not exists hidden_count    int,
  add column if not exists cw_min          int,
  add column if not exists cw_max          int,
  add column if not exists max_attempts    int,
  add column if not exists slots_per_round int,
  add column if not exists frame_slots     int;

update public.simulation_runs
set
  load_percent    = coalesce(load_percent, case traffic_level
                      when 'light' then 30 when 'medium' then 60 when 'heavy' then 90 else 60 end),
  hidden_count    = coalesce(hidden_count, case when hidden_node then 2 else 0 end),
  cw_min          = coalesce(cw_min, 7),
  cw_max          = coalesce(cw_max, 63),
  max_attempts    = coalesce(max_attempts, 4),
  slots_per_round = coalesce(slots_per_round, 12),
  frame_slots     = coalesce(frame_slots, 2);

alter table public.simulation_runs
  alter column load_percent    set not null,
  alter column hidden_count    set not null,
  alter column cw_min          set not null,
  alter column cw_max          set not null,
  alter column max_attempts    set not null,
  alter column slots_per_round set not null,
  alter column frame_slots     set not null;

-- 3. Range and consistency checks (the same rules the app enforces).
alter table public.simulation_runs
  add constraint simulation_runs_load_percent_check
    check (load_percent between 0 and 100),
  add constraint simulation_runs_load_matches_level_check
    check (
      (traffic_level = 'light'  and load_percent = 30) or
      (traffic_level = 'medium' and load_percent = 60) or
      (traffic_level = 'heavy'  and load_percent = 90) or
      traffic_level = 'custom'
    ),
  add constraint simulation_runs_hidden_count_check
    check (
      (hidden_node and hidden_count between 2 and device_count) or
      (not hidden_node and hidden_count = 0)
    ),
  add constraint simulation_runs_cw_min_check
    check (cw_min in (1, 3, 7, 15, 31, 63)),
  add constraint simulation_runs_cw_max_check
    check (cw_max in (7, 15, 31, 63, 127, 255, 511, 1023) and cw_max >= cw_min),
  add constraint simulation_runs_max_attempts_check
    check (max_attempts between 1 and 10),
  add constraint simulation_runs_slots_per_round_check
    check (slots_per_round between 6 and 40),
  add constraint simulation_runs_frame_slots_check
    check (frame_slots between 1 and 4);

-- 4. Let anonymous users insert the new columns too (id / created_at stay default-only).
grant insert (
  load_percent, hidden_count, cw_min, cw_max, max_attempts, slots_per_round, frame_slots
) on table public.simulation_runs to anon;

-- 5. Replace the insert policy so it mirrors the new limits.
drop policy if exists "Anyone can insert a valid run summary" on public.simulation_runs;

create policy "Anyone can insert a valid run summary"
  on public.simulation_runs
  for insert
  to anon
  with check (
    device_count between 2 and 20
    and traffic_level in ('light', 'medium', 'heavy', 'custom')
    and load_percent between 0 and 100
    and hidden_node is not null
    and hidden_count between 0 and device_count
    and cw_min in (1, 3, 7, 15, 31, 63)
    and cw_max in (7, 15, 31, 63, 127, 255, 511, 1023)
    and cw_max >= cw_min
    and max_attempts between 1 and 10
    and slots_per_round between 6 and 40
    and frame_slots between 1 and 4
    and successes  between 0 and 100000
    and collisions between 0 and 100000
    and retries    between 0 and 100000
    and dropped    between 0 and 100000
    and rounds     between 0 and 100000
    and channel_utilization between 0 and 100
  );

-- Still no update or delete policies on purpose.

commit;
