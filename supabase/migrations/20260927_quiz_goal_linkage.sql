-- ============================================================================
-- Pragati — Quizzes ↔ Learning Goals linkage (delete-a-topic erases its quizzes)
-- ============================================================================
-- Problem: quizzes carried only free-text `topic`, so deleting a learning goal
-- (My Topics → trash) cascaded its goal_subtopics but left every quiz the user
-- generated from that topic in the database. The Quizzes Arena kept showing a
-- band for the deleted topic because ≥2 quizzes still shared its topic key.
--
-- Fix: an explicit, nullable FK from quizzes to the goal it was generated
-- from. Deleting the goal cascades to the quizzes; the quizzes' own existing
-- cascades then erase their attempts, telemetry, and question_concepts.
-- Standalone quizzes keep goal_linkage NULL.
--
-- Safe to re-run. Apply in the Supabase SQL editor or via supabase db push.

-- 1. Column + database-enforced cascade -------------------------------------
alter table public.quizzes
  add column if not exists goal_linkage uuid references public.learning_goals (id) on delete cascade;

-- 2. Backfill: link existing quizzes whose topic matches a current goal -------
-- Mirrors the app's matching (slug equality or goal-title prefix), so users
-- upgrading mid-life get the same "delete cleanly erases" behavior for the
-- quizzes they already have. Non-alphanumerics collapse to '_' first, which
-- also catches difficulty-suffixed topics ("Calculus – Beginner" →
-- calculus_beginner → prefix of/related to the calculus goal slug).
update public.quizzes q
set goal_linkage = g.id
from public.learning_goals g
where q.goal_linkage is null
  and (
    btrim(regexp_replace(lower(q.topic), '[^a-z0-9]+', '_', 'g'), '_') = g.slug
    or btrim(regexp_replace(lower(q.topic), '[^a-z0-9]+', '_', 'g'), '_') like g.slug || '\_%'
  );

-- 3. Lookup index: per-goal quiz listing and cascade deletes -----------------
create index if not exists idx_quizzes_goal_linkage on public.quizzes (goal_linkage);
