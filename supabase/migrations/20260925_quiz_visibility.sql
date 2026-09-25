-- ============================================================================
-- Migration: Quiz privacy security hardening
-- ============================================================================
-- Quizzes are strictly PRIVATE per candidate. This migration:
--   1. Removes legacy permissive policies that let ANY authenticated user read
--      every quiz/question row (answer keys included) and insert questions
--      into other students' quizzes.
--   2. Heals installs that ran the (since-removed) public-visibility
--      experiment: drops its policies, column and index.
-- Safe to re-run. Apply in the Supabase SQL editor or via `supabase db push`.
-- ============================================================================

-- 1. Remove legacy permissive policies (they OR-ed with the owner-only ones
--    and made every quiz/question row world-readable to authenticated users).
drop policy if exists "Authenticated users can read quizzes"     on public.quizzes;
drop policy if exists "Users can insert quizzes"                 on public.quizzes;
drop policy if exists "Authenticated users can read questions"   on public.questions;
drop policy if exists "Authenticated users can insert questions" on public.questions;

-- 2. Heal the removed public-visibility experiment.
drop policy if exists "quizzes_select_public"                on public.quizzes;
drop policy if exists "quizzes_update_own"                   on public.quizzes;
drop policy if exists "questions_select_public_quiz"         on public.questions;
drop policy if exists "question_concepts_select_public_quiz" on public.question_concepts;
drop index if exists idx_quizzes_visibility;
alter table public.quizzes drop column if exists visibility;
