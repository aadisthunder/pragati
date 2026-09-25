-- ============================================================================
-- Migration: 4-tier quiz difficulty ladder (mastery-driven)
-- ============================================================================
-- Adds 'expert' as a 4th difficulty tier. Difficulty is chosen from live
-- mastery by the agent: beginner <50%, intermediate 50-79%, advanced 80-89%,
-- expert >=90%. Safe to re-run.
-- ============================================================================

alter table public.quizzes
  drop constraint if exists quizzes_difficulty_check;

alter table public.quizzes
  add constraint quizzes_difficulty_check
  check (difficulty in ('beginner', 'intermediate', 'advanced', 'expert'));
