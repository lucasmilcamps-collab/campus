-- Migration 0002: what building the backend changed (see replica/backend.md).
--
-- 1. Workout steps live in sessions.steps (jsonb). They are always read and
--    written with their session and never queried on their own; a table of
--    rows with parent ids cost a join and a tree rebuild on every read.
-- 2. Plans carry the speed model they were generated with (vma_kmh, zones),
--    so adaptation works on the plan alone.
-- 3. Activities keep a manual RPE and note (manual logs have no feedback row).
-- 4. Onboarding answers the engine needs: runs per week now. Goals keep a
--    name for races entered by hand.
-- 5. Server-only tables: a job queue with retries and a dead-letter state,
--    and fixed-window rate limits.
-- 6. New auth users get their profile, subscription and preference rows.
-- 7. Races are unique by name and date.

-- 1 -------------------------------------------------------------------------
alter table public.sessions add column steps jsonb not null default '[]';
drop table public.session_steps;

-- 2 -------------------------------------------------------------------------
alter table public.plans
  add column vma_kmh numeric(4,1) not null default 12 check (vma_kmh between 6 and 30),
  add column zones jsonb not null default '{}';

-- 3 -------------------------------------------------------------------------
alter table public.activities
  add column rpe smallint check (rpe between 1 and 5),
  add column note text check (char_length(note) <= 2000);

-- 4 -------------------------------------------------------------------------
-- (and a name for races entered by hand, which have no races row)
alter table public.goals add column name text check (char_length(name) <= 120);

alter table public.runner_profiles
  add column runs_per_week_now smallint not null default 0 check (runs_per_week_now between 0 and 14);

-- 5 -------------------------------------------------------------------------
create table private.jobs (
  id bigint generated always as identity primary key,
  kind text not null,                     -- activity.import, plan.adapt, email.trial_ending, ...
  payload jsonb not null default '{}',
  dedupe_key text,                        -- the same work enqueued twice runs once
  status text not null default 'queued' check (status in ('queued','running','done','dead')),
  attempts smallint not null default 0,
  max_attempts smallint not null default 5,
  run_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_due on private.jobs (run_at) where status = 'queued';
create unique index jobs_dedupe on private.jobs (kind, dedupe_key) where dedupe_key is not null;
create index jobs_dead on private.jobs (updated_at) where status = 'dead';

create table private.rate_limits (
  key text not null,                      -- e.g. "signin:ip:203.0.113.4", "feedback:user:<uuid>"
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
create index rate_limits_old on private.rate_limits (window_start);

-- 6 -------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.subscriptions (user_id) values (new.id) on conflict do nothing;
  insert into public.notification_prefs (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7 -------------------------------------------------------------------------
-- One row per event, so seeds and imports can upsert.
create unique index races_name_date on public.races (name, race_date);
