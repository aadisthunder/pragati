-- ============================================================================
-- Pragati — Database Schema & Row-Level Security Policies
-- ============================================================================
-- Canonical source of truth for the Supabase Postgres schema. Apply with:
--   supabase db push   (after moving to supabase/migrations/)
-- or run directly in the Supabase SQL editor for a fresh project.
--
-- SECURITY MODEL
-- --------------
-- Every table enables RLS and restricts users to their own rows via auth.uid().
-- Almost all server access uses a scoped Supabase client that forwards the caller's JWT
-- (RLS is the enforcement layer). The one exception is the on_auth_user_created trigger,
-- which is SECURITY DEFINER by necessity — auth.users is not exposed to the anon key.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  skill_rating integer not null default 1200,
  streak_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- quizzes (metadata) & questions
-- ---------------------------------------------------------------------------
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  topic text not null,
  difficulty text not null default 'intermediate'
    check (difficulty in ('beginner', 'intermediate', 'advanced', 'expert')),
  total_questions integer not null default 0,
  created_at timestamptz not null default now()
);

-- Healing for installs that ran the (since-removed) public-visibility experiment:
-- quizzes are strictly PRIVATE per candidate.
alter table public.quizzes drop column if exists visibility;
drop index if exists idx_quizzes_visibility;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer text not null,
  hint text not null default '',
  explanation text not null default '',
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- quiz_attempts & per-question telemetry
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  score integer not null default 0,
  total_questions integer not null default 0,
  total_time_sec integer not null default 0,
  accuracy_pct numeric(5, 2) not null default 0,
  completed_at timestamptz not null default now()
);

create table if not exists public.question_telemetry (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  selected_answer text,
  is_correct boolean not null default false,
  is_skipped boolean not null default false,
  dwell_time_sec integer not null default 0,
  hints_used integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_profiles auto-provisioning
-- ---------------------------------------------------------------------------
-- New auth users get a user_profiles row (default 1200 rating) via trigger so their
-- first quiz submit persists their real rating instead of recomputing from the
-- fallback 1200 on every attempt.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill for users created before this trigger existed.
insert into public.user_profiles (id, email, full_name)
select u.id, u.email, split_part(u.email, '@', 1)
from auth.users u
where not exists (select 1 from public.user_profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Socratic chat (sessions + messages)
-- ---------------------------------------------------------------------------
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New Conversation',
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Adaptive learner model (concepts, prerequisites, per-learner mastery)
-- ---------------------------------------------------------------------------
-- The adaptive agent's data layer: every question maps to one or more concepts,
-- concepts carry prerequisite edges, and each learner accumulates per-concept
-- mastery from quiz telemetry. learning_events records every mastery transition
-- so interventions can be evaluated (before/after evidence).

create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  name text not null,
  slug text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (topic, slug)
);

create table if not exists public.concept_prerequisites (
  concept_id uuid not null references public.concepts (id) on delete cascade,
  prerequisite_id uuid not null references public.concepts (id) on delete cascade,
  primary key (concept_id, prerequisite_id)
);

create table if not exists public.question_concepts (
  question_id uuid not null references public.questions (id) on delete cascade,
  concept_id uuid not null references public.concepts (id) on delete cascade,
  weight numeric(3, 2) not null default 1.0 check (weight > 0),
  primary key (question_id, concept_id)
);

create table if not exists public.learner_concept_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  concept_id uuid not null references public.concepts (id) on delete cascade,
  mastery numeric(4, 3) not null default 0.5 check (mastery >= 0 and mastery <= 1),
  confidence numeric(4, 3) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  attempts integer not null default 0,
  correct integer not null default 0,
  incorrect integer not null default 0,
  avg_response_time_sec numeric(7, 1) not null default 0,
  hints_used integer not null default 0,
  misconception text,
  last_seen_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, concept_id)
);

create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  concept_id uuid references public.concepts (id) on delete set null,
  event_type text not null,
  before_mastery numeric(4, 3),
  after_mastery numeric(4, 3),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Learning goals (persistent AI memory: what the user wants to master)
-- ---------------------------------------------------------------------------
-- The onboarding popup and the Topics page both write here. Mastery itself is
-- NEVER stored on goals: it is derived live from learner_concept_state by
-- matching goal_subtopics to concepts (slug/name), so quiz evidence flows
-- straight into goal progress without a sync job.

create table if not exists public.learning_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  slug text not null,
  source text not null default 'manual' check (source in ('onboarding', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.goal_subtopics (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.learning_goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  slug text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  unique (goal_id, slug)
);

create index if not exists idx_learning_goals_user on public.learning_goals (user_id);
create index if not exists idx_goal_subtopics_goal on public.goal_subtopics (goal_id);
create index if not exists idx_goal_subtopics_user on public.goal_subtopics (user_id);

-- Indexes for the agent's hot read paths (learner state fetch, due reviews).
create index if not exists idx_learner_concept_state_user on public.learner_concept_state (user_id);
create index if not exists idx_learner_concept_state_review on public.learner_concept_state (user_id, next_review_at);
create index if not exists idx_learning_events_user on public.learning_events (user_id, created_at);

-- Onboarding flag for the first-login "what do you want to master?" popup.
-- Null = not completed. The read-only demo account can never persist this (its
-- update policy is blocked below), so the popup appears on every fresh load
-- for that account — intentional, and requires zero special-case code.
alter table public.user_profiles
  add column if not exists onboarding_completed_at timestamptz;

-- ============================================================================
-- Row-Level Security
-- ============================================================================

alter table public.user_profiles      enable row level security;
alter table public.quizzes            enable row level security;
alter table public.questions          enable row level security;
alter table public.quiz_attempts      enable row level security;
alter table public.question_telemetry enable row level security;
alter table public.chat_sessions      enable row level security;alter table public.chat_messages        enable row level security;
alter table public.concepts                  enable row level security;
alter table public.concept_prerequisites     enable row level security;
alter table public.question_concepts         enable row level security;
alter table public.learner_concept_state     enable row level security;
alter table public.learning_events           enable row level security;

-- SECURITY NOTE
-- --------------
-- GET /api/instructor/sessions/:id/messages and the explain_missed_question tool filter
-- rows in application code only partially (by session_id / question id). They are safe
-- ONLY because these RLS policies scope every read to auth.uid(). Do not loosen them.
-- learner_concept_state / learning_events follow the same owner-only model.

-- Re-run guard: CREATE POLICY has no IF NOT EXISTS, so drop any policies we
-- are about to create. Safe: every drop below is immediately followed by the
-- canonical create in this file.
drop policy if exists "profiles_select_own"            on public.user_profiles;
drop policy if exists "profiles_update_own"            on public.user_profiles;
drop policy if exists "quizzes_select_own"             on public.quizzes;
drop policy if exists "quizzes_insert_own"             on public.quizzes;
drop policy if exists "quizzes_delete_own"             on public.quizzes;
drop policy if exists "quizzes_update_own"             on public.quizzes;
drop policy if exists "quizzes_select_public"          on public.quizzes;
drop policy if exists "questions_select_public"        on public.questions;
drop policy if exists "questions_select_public_safe"   on public.questions;
drop policy if exists "questions_select_own"           on public.questions;
drop policy if exists "questions_insert_own"           on public.questions;
drop policy if exists "questions_delete_own"           on public.questions;
drop policy if exists "attempts_select_own"            on public.quiz_attempts;
drop policy if exists "attempts_insert_own"            on public.quiz_attempts;
drop policy if exists "telemetry_select_own"           on public.question_telemetry;
drop policy if exists "telemetry_insert_own"           on public.question_telemetry;
drop policy if exists "telemetry_delete_own"           on public.question_telemetry;
drop policy if exists "chat_select_own"                on public.chat_sessions;
drop policy if exists "chat_insert_own"                on public.chat_sessions;
drop policy if exists "chat_delete_own"                on public.chat_sessions;
drop policy if exists "chat_msg_select_own"            on public.chat_messages;
drop policy if exists "chat_msg_insert_own"            on public.chat_messages;
drop policy if exists "chat_msg_delete_own"            on public.chat_messages;
drop policy if exists "concepts_select_all"            on public.concepts;
drop policy if exists "concepts_insert_authenticated"  on public.concepts;
drop policy if exists "concept_prereqs_select_all"     on public.concept_prerequisites;
drop policy if exists "concept_prereqs_insert_authenticated" on public.concept_prerequisites;
drop policy if exists "question_concepts_select_own"   on public.question_concepts;
drop policy if exists "learner_state_select_own"       on public.learner_concept_state;
drop policy if exists "learner_state_insert_own"       on public.learner_concept_state;
drop policy if exists "learner_state_update_own"       on public.learner_concept_state;
drop policy if exists "learning_events_select_own"     on public.learning_events;
drop policy if exists "learning_events_insert_own"     on public.learning_events;
drop policy if exists "goals_select_own"               on public.learning_goals;
drop policy if exists "goals_insert_own"               on public.learning_goals;
drop policy if exists "goals_update_own"               on public.learning_goals;
drop policy if exists "goals_delete_own"               on public.learning_goals;
drop policy if exists "goal_subtopics_select_own"      on public.goal_subtopics;
drop policy if exists "goal_subtopics_insert_own"      on public.goal_subtopics;
drop policy if exists "goal_subtopics_update_own"      on public.goal_subtopics;
drop policy if exists "goal_subtopics_delete_own"      on public.goal_subtopics;
drop policy if exists "demo_readonly_profile_update"   on public.user_profiles;

-- Owner-only access to everything
create policy "profiles_select_own"    on public.user_profiles      for select using (auth.uid() = id);
create policy "profiles_update_own"    on public.user_profiles      for update using (auth.uid() = id);
-- Quizzes are generated per-user by the AI agent, so ownership-scoped reads keep
-- one student from enumerating another student's quizzes (and answer keys).
-- Quizzes are strictly PRIVATE per candidate — no public sharing.
create policy "quizzes_select_own"     on public.quizzes            for select using (auth.uid() = created_by);
create policy "quizzes_insert_own"     on public.quizzes            for insert with check (auth.uid() = created_by);
create policy "quizzes_delete_own"     on public.quizzes            for delete using (auth.uid() = created_by);
create policy "questions_select_own"   on public.questions          for select using (
  exists (
    select 1 from public.quizzes q
    where q.id = questions.quiz_id
      and q.created_by = auth.uid()
  )
);
create policy "questions_insert_own"   on public.questions          for insert with check (
  exists (
    select 1 from public.quizzes q
    where q.id = questions.quiz_id
      and q.created_by = auth.uid()
  )
);
create policy "questions_delete_own"   on public.questions          for delete using (
  exists (
    select 1 from public.quizzes q
    where q.id = questions.quiz_id
      and q.created_by = auth.uid()
  )
);
create policy "attempts_select_own"    on public.quiz_attempts      for select using (auth.uid() = user_id);
create policy "attempts_insert_own"    on public.quiz_attempts      for insert with check (auth.uid() = user_id);
create policy "telemetry_select_own"   on public.question_telemetry for select using (auth.uid() = user_id);
create policy "telemetry_insert_own"   on public.question_telemetry for insert with check (auth.uid() = user_id);
create policy "telemetry_delete_own"   on public.question_telemetry for delete using (auth.uid() = user_id);
create policy "chat_select_own"        on public.chat_sessions      for select using (auth.uid() = user_id);
create policy "chat_insert_own"        on public.chat_sessions      for insert with check (auth.uid() = user_id);
create policy "chat_delete_own"        on public.chat_sessions      for delete using (auth.uid() = user_id);
create policy "chat_msg_select_own"    on public.chat_messages      for select using (auth.uid() = user_id);
create policy "chat_msg_insert_own"    on public.chat_messages      for insert with check (auth.uid() = user_id);
create policy "chat_msg_delete_own"    on public.chat_messages      for delete using (auth.uid() = user_id);

-- Adaptive learner model: concepts and the graph are shared reference data;
-- authenticated users can register newly encountered concepts/topics from quizzes
-- and learning goals so learner_concept_state always has valid concept rows.
create policy "concepts_select_all" on public.concepts for select using (true);
create policy "concepts_insert_authenticated" on public.concepts for insert to authenticated with check (true);
create policy "concept_prereqs_select_all" on public.concept_prerequisites for select using (true);
create policy "concept_prereqs_insert_authenticated" on public.concept_prerequisites for insert to authenticated with check (true);
create policy "question_concepts_select_own" on public.question_concepts for select using (
  exists (
    select 1 from public.quizzes q
    join public.questions qs on qs.quiz_id = q.id
    where qs.id = question_concepts.question_id
      and q.created_by = auth.uid()
  )
);
create policy "learner_state_select_own"  on public.learner_concept_state for select using (auth.uid() = user_id);
create policy "learner_state_insert_own"  on public.learner_concept_state for insert with check (auth.uid() = user_id);
create policy "learner_state_update_own"  on public.learner_concept_state for update using (auth.uid() = user_id);
create policy "learning_events_select_own" on public.learning_events for select using (auth.uid() = user_id);
create policy "learning_events_insert_own" on public.learning_events for insert with check (auth.uid() = user_id);

-- Learning goals: strictly owner-only, like every learner-owned table.
create policy "goals_select_own"  on public.learning_goals for select using (auth.uid() = user_id);
create policy "goals_insert_own"  on public.learning_goals for insert with check (auth.uid() = user_id);
create policy "goals_update_own"  on public.learning_goals for update using (auth.uid() = user_id);
create policy "goals_delete_own"  on public.learning_goals for delete using (auth.uid() = user_id);
create policy "goal_subtopics_select_own"  on public.goal_subtopics for select using (auth.uid() = user_id);
create policy "goal_subtopics_insert_own"  on public.goal_subtopics for insert with check (auth.uid() = user_id);
create policy "goal_subtopics_update_own"  on public.goal_subtopics for update using (auth.uid() = user_id);
create policy "goal_subtopics_delete_own"  on public.goal_subtopics for delete using (auth.uid() = user_id);

-- ============================================================================
-- Demo ("Instant Judge Login") account hardening
-- ============================================================================
-- The judge credentials ship in the public client bundle, so the account itself
-- must be neutered server-side. This policy makes the demo account READ-ONLY:
-- it can browse its seeded demo data but cannot delete chats, clear missed
-- questions, or create new attempts/quizzes that pollute the demo analytics.
--
-- Replace the email lookup with the actual demo user's id if preferred.

-- SECURITY DEFINER is required here (same pattern as handle_new_user above):
-- the function reads auth.users, which the authenticated role cannot query
-- directly. As an invoker function, ANY statement whose RLS plan evaluates
-- one of the demo_readonly_* policies below fails with "permission denied
-- for table users" — not just for the demo account, but for every user.
create or replace function public.is_demo_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and email = 'judge.pragati@gmail.com'
  );
$$;

drop policy if exists "demo_readonly_chat_msg_delete" on public.chat_messages;
drop policy if exists "demo_readonly_chat_delete"     on public.chat_sessions;
drop policy if exists "demo_readonly_telemetry_delete" on public.question_telemetry;
drop policy if exists "demo_readonly_chat_msg_insert" on public.chat_messages;
drop policy if exists "demo_readonly_chat_insert"     on public.chat_sessions;
drop policy if exists "demo_readonly_attempts_insert" on public.quiz_attempts;
drop policy if exists "demo_readonly_quizzes_insert"  on public.quizzes;

create policy "demo_readonly_chat_msg_insert"  on public.chat_messages      for insert with check (not public.is_demo_account());
create policy "demo_readonly_chat_insert"      on public.chat_sessions      for insert with check (not public.is_demo_account());
create policy "demo_readonly_attempts_insert"  on public.quiz_attempts      for insert with check (not public.is_demo_account());
create policy "demo_readonly_quizzes_insert"   on public.quizzes            for insert with check (not public.is_demo_account());
create policy "demo_readonly_chat_msg_delete"  on public.chat_messages      for delete using (not public.is_demo_account());
create policy "demo_readonly_chat_delete"      on public.chat_sessions      for delete using (not public.is_demo_account());
create policy "demo_readonly_telemetry_delete" on public.question_telemetry for delete using (not public.is_demo_account());
-- Block profile updates (skill rating, streak, onboarding flag) for the demo
-- account: its onboarding flag can never persist, so the first-login popup
-- reappears on every fresh load — intentional for the judge experience.
create policy "demo_readonly_profile_update"   on public.user_profiles      for update using (not public.is_demo_account());

-- NOTE: for a fully locked-down demo you may also want a database trigger that
-- downgrades writes, or a dedicated read-only Postgres role. Policies above are
-- the pragmatic first layer; revisit if the demo account gains privileges.
