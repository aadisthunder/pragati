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
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  total_questions integer not null default 0,
  created_at timestamptz not null default now()
);

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

-- ============================================================================
-- Row-Level Security
-- ============================================================================

alter table public.user_profiles      enable row level security;
alter table public.quizzes            enable row level security;
alter table public.questions          enable row level security;
alter table public.quiz_attempts      enable row level security;
alter table public.question_telemetry enable row level security;
alter table public.chat_sessions      enable row level security;
alter table public.chat_messages      enable row level security;

-- SECURITY NOTE
-- --------------
-- GET /api/instructor/sessions/:id/messages and the explain_missed_question tool filter
-- rows in application code only partially (by session_id / question id). They are safe
-- ONLY because these RLS policies scope every read to auth.uid(). Do not loosen them.

-- Owner-only access to everything
create policy "profiles_select_own"    on public.user_profiles      for select using (auth.uid() = id);
create policy "profiles_update_own"    on public.user_profiles      for update using (auth.uid() = id);
-- Quizzes are generated per-user by the AI agent, so ownership-scoped reads keep
-- one student from enumerating another student's quizzes (and answer keys).
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

-- ============================================================================
-- Demo ("Instant Judge Login") account hardening
-- ============================================================================
-- The judge credentials ship in the public client bundle, so the account itself
-- must be neutered server-side. This policy makes the demo account READ-ONLY:
-- it can browse its seeded demo data but cannot delete chats, clear missed
-- questions, or create new attempts/quizzes that pollute the demo analytics.
--
-- Replace the email lookup with the actual demo user's id if preferred.

create or replace function public.is_demo_account()
returns boolean
language sql
stable
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

-- NOTE: for a fully locked-down demo you may also want a database trigger that
-- downgrades writes, or a dedicated read-only Postgres role. Policies above are
-- the pragmatic first layer; revisit if the demo account gains privileges.
