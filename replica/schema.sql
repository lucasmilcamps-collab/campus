-- Schema for the running-coach clone (rebuild of Campus Coach's core features).
-- Target: Postgres 15+ on Supabase. Auth users live in auth.users (Supabase Auth).
-- Access rules: Postgres row level security on every table in `public`.
-- Secrets (provider tokens) and webhook bookkeeping live in the `private` schema,
-- which is not exposed through the Supabase API; only server code (service role) touches it.
--
-- Conventions: uuid ids, timestamptz in UTC, check constraints for status fields,
-- an index on every foreign key and every filter/sort column, money as integer cents.
-- Calendar days that belong to the runner (session dates, race dates) are `date`,
-- interpreted in profiles.timezone, never timestamptz.

create extension if not exists pgcrypto;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- users and runner profile  (S01 S02 S04 S24 S26)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  birth_year int check (birth_year between 1900 and 2100),
  sex text check (sex in ('female','male','other','undisclosed')),
  locale text not null default 'fr' check (locale in ('fr','en','nl')),
  timezone text not null default 'Europe/Paris',
  units text not null default 'metric' check (units in ('metric','imperial')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.runner_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  experience text not null check (experience in ('none','under_1y','1_3y','over_3y')),
  weekly_volume_km numeric(5,1) not null default 0 check (weekly_volume_km >= 0),
  sessions_per_week smallint not null default 3 check (sessions_per_week between 3 and 5),
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  nutrition_enabled boolean not null default false,
  -- current speed-endurance model; recomputed by the plan engine
  vma_kmh numeric(4,1) check (vma_kmh between 6 and 30),
  endurance_index numeric(4,3),                 -- slope of the speed/duration curve
  pace_zones jsonb not null default '{}',       -- {"ef":{"min":360,"max":400},"threshold":{...}} s/km
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- History of what the level estimate was based on (F01, F09).
create table public.reference_times (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('estimate','test_1500','race','strava')),
  distance_m int not null check (distance_m > 0),
  duration_s int not null check (duration_s > 0),
  measured_on date not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.reference_times (user_id, measured_on desc);
create unique index reference_times_one_current on public.reference_times (user_id) where is_current;

-- ---------------------------------------------------------------------------
-- races and goals  (S05 S19 S20)
-- ---------------------------------------------------------------------------

create table public.races (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  race_date date not null,
  city text,
  country char(2) not null default 'FR',
  lat numeric(8,5),
  lng numeric(8,5),
  distance_m int not null check (distance_m > 0),
  elevation_gain_m int not null default 0 check (elevation_gain_m >= 0),
  discipline text not null check (discipline in ('road','trail')),
  website_url text,
  -- user-submitted races are private to their author until reviewed
  submitted_by uuid references public.profiles(id) on delete set null,
  status text not null default 'published' check (status in ('published','pending','rejected')),
  search tsvector generated always as (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(city,''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.races (race_date);
create index on public.races (country, race_date);
create index on public.races (discipline, distance_m);
create index on public.races using gin (search);
create index on public.races (submitted_by);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('race','speed','start_running','injury_return','evaluation')),
  race_id uuid references public.races(id) on delete set null,
  distance_m int check (distance_m > 0),
  elevation_gain_m int not null default 0,
  surface text not null default 'road' check (surface in ('road','trail')),
  goal_date date,
  target_time_s int check (target_time_s > 0),
  is_primary boolean not null default true,
  status text not null default 'active' check (status in ('active','done','abandoned')),
  result_time_s int check (result_time_s > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint race_goal_has_date check (kind <> 'race' or goal_date is not null)
);
create index on public.goals (user_id, status);
create index on public.goals (race_id);
-- one active primary goal per runner; secondary races sit alongside it
create unique index goals_one_active_primary on public.goals (user_id) where is_primary and status = 'active';

-- ---------------------------------------------------------------------------
-- plans, weeks, sessions, steps  (S06 S08 S09 S10 S16)
-- ---------------------------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  tier text not null check (tier in ('free','training')),
  start_date date not null,
  end_date date not null,
  sessions_per_week smallint not null check (sessions_per_week between 3 and 5),
  engine_version text not null,            -- which plan-engine release generated it
  revision int not null default 1,         -- bumps on every adaptation
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_dates check (end_date > start_date)
);
create index on public.plans (goal_id);
create unique index plans_one_active on public.plans (user_id) where status = 'active';

-- secondary races attached to a plan (F02)
create table public.plan_secondary_goals (
  plan_id uuid not null references public.plans(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  primary key (plan_id, goal_id)
);
create index on public.plan_secondary_goals (goal_id);

create table public.plan_weeks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  week_index smallint not null check (week_index >= 0),
  starts_on date not null,
  phase text not null check (phase in ('base','build','specific','taper','recovery','race')),
  target_volume_km numeric(5,1) not null check (target_volume_km >= 0),
  unique (plan_id, week_index)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  week_id uuid not null references public.plan_weeks(id) on delete cascade,
  scheduled_on date not null,
  original_on date not null,               -- before any move (F06)
  type text not null check (type in ('easy','long','vma','threshold','race_pace','hills','trail','strength','test','race','rest')),
  title text not null,
  purpose text,                            -- our own coaching copy, keyed by type
  surface text not null default 'road' check (surface in ('road','trail')),
  est_duration_s int not null default 0 check (est_duration_s >= 0),
  est_distance_m int not null default 0 check (est_distance_m >= 0),
  est_elevation_m int not null default 0,
  nutrition_note text,
  status text not null default 'planned' check (status in ('planned','done','missed','skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sessions (user_id, scheduled_on);
create index on public.sessions (plan_id, scheduled_on);
create index on public.sessions (week_id);
create index on public.sessions (user_id, status);

create table public.session_steps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  parent_id uuid references public.session_steps(id) on delete cascade,  -- children of a repeat block
  position smallint not null,
  kind text not null check (kind in ('warmup','work','recovery','cooldown','repeat')),
  repeat_count smallint check (repeat_count between 2 and 50),
  duration_s int check (duration_s > 0),
  distance_m int check (distance_m > 0),
  pace_zone text check (pace_zone in ('ef','marathon','half','10k','threshold','s60','vma','walk')),
  target_pace_s_per_km int check (target_pace_s_per_km between 120 and 1200),
  note text,
  constraint repeat_shape check ((kind = 'repeat') = (repeat_count is not null)),
  constraint step_has_length check (kind = 'repeat' or duration_s is not null or distance_m is not null)
);
create index on public.session_steps (session_id, position);
create index on public.session_steps (parent_id);

-- ---------------------------------------------------------------------------
-- activities and feedback  (S12 S13 S14 S15 S17)
-- ---------------------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  source text not null check (source in ('tracker','garmin','coros','suunto','strava','apple','manual')),
  external_id text,                        -- provider's activity id; null for tracker/manual
  sport text not null default 'run' check (sport in ('run','trail','walk','bike','swim','strength','other')),
  started_at timestamptz not null,
  timezone text not null,                  -- where it was run, for display
  duration_s int not null check (duration_s > 0),
  distance_m int not null default 0 check (distance_m >= 0),
  elevation_gain_m int not null default 0,
  avg_hr smallint check (avg_hr between 30 and 250),
  polyline text,
  laps jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.activities (user_id, started_at desc);
create index on public.activities (session_id);
-- the same provider activity imported twice (webhook retry, Strava + Garmin both on) is one row
create unique index activities_provider_unique on public.activities (user_id, source, external_id) where external_id is not null;
-- at most one activity counts for a planned session
create unique index activities_one_per_session on public.activities (session_id) where session_id is not null;

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete cascade,
  rpe smallint not null check (rpe between 1 and 5),   -- 5 = "extrême"
  pain boolean not null default false,
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_target check (session_id is not null or activity_id is not null)
);
create index on public.feedback (user_id, created_at desc);
create unique index feedback_one_per_session on public.feedback (session_id) where session_id is not null;
create index on public.feedback (activity_id);

-- Every adaptation, with a human-readable diff. Fixes the "unclear what changed" complaint (F05).
create table public.plan_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  from_revision int not null,
  to_revision int not null,
  reason text not null check (reason in ('feedback','missed_sessions','new_reference','settings_change','goal_change','move')),
  trigger_feedback_id uuid references public.feedback(id) on delete set null,
  pace_change_pct numeric(4,2),
  summary text not null,                   -- shown in the banner on S08
  diff jsonb not null default '{}',
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint revision_moves_forward check (to_revision > from_revision)
);
create index on public.plan_adjustments (plan_id, created_at desc);
create index on public.plan_adjustments (user_id, seen_at);
create index on public.plan_adjustments (trigger_feedback_id);
create unique index plan_adjustments_revision on public.plan_adjustments (plan_id, to_revision);

-- ---------------------------------------------------------------------------
-- integrations  (S11 S25)
-- ---------------------------------------------------------------------------

-- Public, token-free view of a connection, readable by the owner.
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('strava','garmin','coros','suunto','apple_health')),
  external_user_id text not null,
  status text not null default 'active' check (status in ('active','revoked','error')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  -- one provider account can only be linked to one of our users (FAQ: shared accounts break sync)
  unique (provider, external_user_id)
);

-- Tokens: server only. Encrypt at rest with Supabase Vault or app-level AES-GCM.
create table private.connection_tokens (
  connection_id uuid primary key references public.connections(id) on delete cascade,
  access_token_enc bytea not null,
  refresh_token_enc bytea,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.watch_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  provider text not null check (provider in ('garmin','coros','suunto','apple')),
  tolerance_s_per_km smallint not null default 15 check (tolerance_s_per_km between 0 and 60),
  target_on date not null,
  plan_revision int not null,              -- re-export needed when the plan changed since
  external_workout_id text,
  status text not null default 'pending' check (status in ('pending','sent','failed','stale')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.watch_exports (session_id);
create index on public.watch_exports (user_id, status);

-- ---------------------------------------------------------------------------
-- billing  (S07)
-- ---------------------------------------------------------------------------

-- Mirror of RevenueCat's entitlement state. Written only by the webhook handler.
create table public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free','training')),
  period text check (period in ('month','year')),
  store text check (store in ('app_store','play_store','stripe')),
  status text not null default 'none' check (status in ('none','trial','active','grace','cancelled','expired')),
  price_cents int check (price_cents >= 0),
  currency char(3),
  trial_used boolean not null default false,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  rc_app_user_id text unique,
  updated_at timestamptz not null default now()
);
create index on public.subscriptions (status, current_period_ends_at);

create table private.webhook_events (
  provider text not null,                  -- revenuecat, stripe, strava, garmin, ...
  event_id text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload jsonb not null,
  primary key (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- notifications  (S27)
-- ---------------------------------------------------------------------------

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_token text not null unique,
  platform text not null check (platform in ('ios','android')),
  created_at timestamptz not null default now()
);
create index on public.push_tokens (user_id);

create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  session_reminder boolean not null default true,
  reminder_local_time time not null default '07:30',
  plan_updates boolean not null default true,
  marketing_email boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- content and community (could-haves, milestone 4)  (S21 S22 S23)
-- ---------------------------------------------------------------------------

create table public.learn_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  locale text not null default 'fr',
  title text not null,
  body_md text not null,
  session_type text,
  requires_tier text not null default 'free' check (requires_tier in ('free','training')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.learn_articles (session_type, locale);

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 60),
  city text,
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.crews (owner_id);

create table public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index on public.crew_members (user_id);

create table public.crew_events (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  race_id uuid references public.races(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.crew_events (crew_id, starts_at);
create index on public.crew_events (race_id);
create index on public.crew_events (created_by);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid references public.crews(id) on delete cascade,  -- null = global challenge
  title text not null,
  metric text not null check (metric in ('distance_m','duration_s','elevation_m')),
  target bigint not null check (target > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint challenge_window check (ends_at > starts_at)
);
create index on public.challenges (crew_id, ends_at);

create table public.challenge_entries (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  progress bigint not null default 0,
  completed_at timestamptz,
  primary key (challenge_id, user_id)
);
create index on public.challenge_entries (user_id);

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

create table public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
create index on public.user_badges (badge_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['profiles','runner_profiles','races','goals','plans','sessions','activities',
                           'feedback','connections','watch_exports','subscriptions','notification_prefs',
                           'learn_articles','crews']
  loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- row level security
-- Rule of thumb: the client reads its own rows and writes only the fields a user
-- may change by hand. Plan generation, adaptation, imports and billing run in
-- server code with the service role, which bypasses RLS.
-- ---------------------------------------------------------------------------

create or replace function public.is_crew_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crew_members where crew_id = c and user_id = auth.uid())
$$;

alter table public.profiles            enable row level security;
alter table public.runner_profiles     enable row level security;
alter table public.reference_times     enable row level security;
alter table public.races               enable row level security;
alter table public.goals               enable row level security;
alter table public.plans               enable row level security;
alter table public.plan_secondary_goals enable row level security;
alter table public.plan_weeks          enable row level security;
alter table public.sessions            enable row level security;
alter table public.session_steps       enable row level security;
alter table public.activities          enable row level security;
alter table public.feedback            enable row level security;
alter table public.plan_adjustments    enable row level security;
alter table public.connections         enable row level security;
alter table public.watch_exports       enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.push_tokens         enable row level security;
alter table public.notification_prefs  enable row level security;
alter table public.learn_articles      enable row level security;
alter table public.crews               enable row level security;
alter table public.crew_members        enable row level security;
alter table public.crew_events         enable row level security;
alter table public.challenges          enable row level security;
alter table public.challenge_entries   enable row level security;
alter table public.badges              enable row level security;
alter table public.user_badges         enable row level security;

-- own row, read + update
create policy own_read   on public.profiles for select using (id = auth.uid());
create policy own_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy own_read   on public.runner_profiles for select using (user_id = auth.uid());
-- settings the user edits by hand (sessions/week, difficulty, nutrition); paces are server-written
create policy own_update on public.runner_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- read-only to the client: written by the engine
create policy own_read on public.reference_times  for select using (user_id = auth.uid());
create policy own_read on public.goals            for select using (user_id = auth.uid());
create policy own_read on public.plans            for select using (user_id = auth.uid());
create policy own_read on public.plan_secondary_goals for select
  using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()));
create policy own_read on public.plan_weeks for select
  using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()));
create policy own_read on public.sessions         for select using (user_id = auth.uid());
create policy own_read on public.session_steps for select
  using (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy own_read on public.plan_adjustments for select using (user_id = auth.uid());
create policy own_seen on public.plan_adjustments for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_read on public.connections      for select using (user_id = auth.uid());
create policy own_read on public.watch_exports    for select using (user_id = auth.uid());
create policy own_read on public.subscriptions    for select using (user_id = auth.uid());

-- activities: read own; manual entries may be inserted/deleted by the user
create policy own_read   on public.activities for select using (user_id = auth.uid());
create policy own_manual_insert on public.activities for insert
  with check (user_id = auth.uid() and source = 'manual');
create policy own_manual_delete on public.activities for delete
  using (user_id = auth.uid() and source = 'manual');

-- feedback: full CRUD on own rows (adaptation runs server-side on insert via a route)
create policy own_all on public.feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_all on public.push_tokens        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.notification_prefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- races: published races are public; pending ones only to their author
create policy public_read on public.races for select
  using (status = 'published' or submitted_by = auth.uid());
create policy submit on public.races for insert
  with check (submitted_by = auth.uid() and status = 'pending');

-- learn: anyone signed in reads published articles; the API strips locked bodies for free users
create policy published_read on public.learn_articles for select using (published_at is not null and published_at <= now());

-- community
create policy member_read on public.crews for select using (public.is_crew_member(id) or owner_id = auth.uid());
create policy owner_insert on public.crews for insert with check (owner_id = auth.uid());
create policy owner_update on public.crews for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy member_read on public.crew_members for select using (public.is_crew_member(crew_id));
create policy self_leave on public.crew_members for delete using (user_id = auth.uid());
create policy member_read on public.crew_events for select using (public.is_crew_member(crew_id));
create policy member_insert on public.crew_events for insert
  with check (public.is_crew_member(crew_id) and created_by = auth.uid());
create policy visible_read on public.challenges for select using (crew_id is null or public.is_crew_member(crew_id));
create policy visible_read on public.challenge_entries for select
  using (user_id = auth.uid() or exists (select 1 from public.challenges c where c.id = challenge_id and (c.crew_id is null or public.is_crew_member(c.crew_id))));
create policy public_read on public.badges for select using (true);
create policy own_read on public.user_badges for select using (user_id = auth.uid());
-- joining a crew goes through POST /api/crews/join (validates the invite code), not a client insert.

-- column-level guard: the client may only change these runner_profiles columns
revoke update on public.runner_profiles from authenticated;
grant update (sessions_per_week, difficulty, nutrition_enabled) on public.runner_profiles to authenticated;
revoke update on public.plan_adjustments from authenticated;
grant update (seen_at) on public.plan_adjustments to authenticated;
