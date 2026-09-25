-- Migration: Allow authenticated users to insert newly created concepts and prerequisites
-- Enables adaptive learner model to register and track custom learning goals (e.g. DSA, System Design)

drop policy if exists "concepts_insert_authenticated" on public.concepts;
create policy "concepts_insert_authenticated" on public.concepts
  for insert to authenticated with check (true);

drop policy if exists "concept_prereqs_insert_authenticated" on public.concept_prerequisites;
create policy "concept_prereqs_insert_authenticated" on public.concept_prerequisites
  for insert to authenticated with check (true);
