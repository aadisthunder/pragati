-- ============================================================================
-- Pragati — Judge Demo Seed (Adaptive Learning Agent)
-- ============================================================================
-- Creates a WRITABLE judge demo account (unlike judge.pragati@gmail.com, which
-- schema.sql hardens read-only) with a pre-seeded Calculus learner state and a
-- deterministic diagnostic quiz, so the 5-minute demo never depends on live
-- LLM output.
--
-- Apply in the Supabase SQL editor AFTER supabase/schema.sql. Safe to re-run:
-- the script resets the demo data on each run (delete + re-insert).
--
-- IMPORTANT: adjust the demo user's password (below) before applying, and
-- mirror the same email/password in the client env vars:
--   VITE_JUDGE_DEMO_EMAIL / VITE_JUDGE_DEMO_PASSWORD
-- (client/src/context/AuthContext.tsx reads VITE_DEMO_JUDGE_* by default; the
-- "Adaptive Demo" login button uses VITE_JUDGE_DEMO_*.)

-- ---------------------------------------------------------------------------
-- 1. Demo auth user (writable — intentionally does NOT match is_demo_account())
-- ---------------------------------------------------------------------------
-- Note: creating auth users requires service-admin rights. Run this script in
-- the Supabase SQL editor (which runs as postgres) rather than via the anon key.

do $$
declare
  demo_user_id uuid;
begin
  -- Create or fetch the demo user.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'judge.demo@pragati.app',
    crypt('PragatiJudgeDemo2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Judge Demo"}'::jsonb,
    now(), now(), '', '', '', ''
  )
  on conflict (email) do nothing
  returning id into demo_user_id;

  if demo_user_id is null then
    select id into demo_user_id from auth.users where email = 'judge.demo@pragati.app';
  end if;

  -- Identity row (Supabase GoTrue convention for password identities).
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(),
    demo_user_id,
    'email',
    'email',
    jsonb_build_object('sub', demo_user_id::text, 'email', 'judge.demo@pragati.app', 'email_verified', true),
    now(), now(), now()
  )
  on conflict do nothing;

  -- ---------------------------------------------------------------------------
  -- 2. Reset any previous demo data for this user.
  -- ---------------------------------------------------------------------------
  delete from public.learner_concept_state where user_id = demo_user_id;
  delete from public.learning_events      where user_id = demo_user_id;
  delete from public.question_telemetry   where user_id = demo_user_id;
  delete from public.quiz_attempts        where user_id = demo_user_id;
  delete from public.quizzes              where created_by = demo_user_id;

  -- ---------------------------------------------------------------------------
  -- 3. Calculus concept taxonomy + prerequisite graph.
  -- ---------------------------------------------------------------------------
  insert into public.concepts (topic, name, slug, description) values
    ('Calculus', 'Functions',              'functions',              'Mappings between sets; notation, domain and range.'),
    ('Calculus', 'Limits',                 'limits',                 'Behavior of functions as inputs approach a value.'),
    ('Calculus', 'Power Rule',             'power_rule',             'd/dx x^n = n x^(n-1); the core differentiation procedure.'),
    ('Calculus', 'Chain Rule',             'chain_rule',             'Differentiating composite functions.'),
    ('Calculus', 'Derivative Application', 'derivative_application', 'Tangents, rates of change, optimization.')
  on conflict (topic, slug) do nothing;

  insert into public.concept_prerequisites (concept_id, prerequisite_id)
  select c.id, p.id
  from (values
    ('limits',                 'functions'),
    ('power_rule',             'functions'),
    ('chain_rule',             'power_rule'),
    ('derivative_application', 'power_rule'),
    ('derivative_application', 'limits')
  ) as edges(concept_slug, prereq_slug)
  join public.concepts c on c.slug = edges.concept_slug  and c.topic = 'Calculus'
  join public.concepts p on p.slug = edges.prereq_slug and p.topic = 'Calculus'
  on conflict do nothing;

  -- ---------------------------------------------------------------------------
  -- 4. Seeded learner state — the demo's "before" picture:
  --       Functions 88% · Limits 75% · Power Rule 32% · Derivatives 47%
  --    (Power Rule deliberately below the 40% repair threshold.)
  -- ---------------------------------------------------------------------------
  insert into public.learner_concept_state
    (user_id, concept_id, mastery, confidence, attempts, correct, incorrect, avg_response_time_sec, hints_used, last_seen_at, next_review_at)
  select
    demo_user_id, c.id, v.mastery, v.mastery, v.attempts, v.correct, v.incorrect, v.avg_sec, v.hints, now() - interval '2 days', now() + (v.review_days || ' days')::interval
  from (values
    ('functions',              0.88, 8, 7, 1, 25.0, 1, 10),
    ('limits',                 0.75, 6, 4, 2, 40.0, 2, 5),
    ('power_rule',             0.32, 5, 1, 4, 55.0, 4, 1),
    ('chain_rule',             0.30, 3, 1, 2, 60.0, 2, 1),
    ('derivative_application', 0.47, 6, 2, 4, 52.0, 3, 2)
  ) as v(slug, mastery, attempts, correct, incorrect, avg_sec, hints, review_days)
  join public.concepts c on c.slug = v.slug and c.topic = 'Calculus';

  insert into public.learning_events (user_id, concept_id, event_type, before_mastery, after_mastery, metadata)
  select demo_user_id, c.id, 'seeded_baseline', null, v.mastery, '{"source":"judge-seed"}'::jsonb
  from (values
    ('functions', 0.88), ('limits', 0.75), ('power_rule', 0.32), ('chain_rule', 0.30), ('derivative_application', 0.47)
  ) as v(slug, mastery)
  join public.concepts c on c.slug = v.slug and c.topic = 'Calculus';

  -- ---------------------------------------------------------------------------
  -- 5. Deterministic diagnostic quiz (5 questions, pre-mapped to concepts).
  -- ---------------------------------------------------------------------------
  insert into public.quizzes (id, created_by, topic, difficulty, total_questions)
  values ('11111111-1111-1111-1111-111111111111', demo_user_id, 'Calculus', 'intermediate', 5)
  on conflict (id) do nothing;

  insert into public.questions (id, quiz_id, prompt, options, correct_answer, hint, explanation, order_index) values
    ('11111111-1111-1111-1111-111111111101',
     '11111111-1111-1111-1111-111111111111',
     'If $f(x) = x^2 + 3x$, what is $f(4)$?',
     '[{"id":"A","text":"28"},{"id":"B","text":"24"},{"id":"C","text":"19"},{"id":"D","text":"16"}]'::jsonb,
     'A',
     'Substitute the value into the function definition, then evaluate each term.',
     '$f(4) = 4^2 + 3(4) = 16 + 12 = 28$. This tests function evaluation: apply the rule to the input.',
     0),
    ('11111111-1111-1111-1111-111111111102',
     '11111111-1111-1111-1111-111111111111',
     'What is $\\lim_{x \\to 2} (3x + 1)$?',
     '[{"id":"A","text":"5"},{"id":"B","text":"6"},{"id":"C","text":"7"},{"id":"D","text":"The limit does not exist"}]'::jsonb,
     'C',
     'Polynomials are continuous everywhere — direct substitution works.',
     'Since $3x+1$ is continuous, the limit is $3(2)+1 = 7$. Continuity makes limits trivial.',
     1),
    ('11111111-1111-1111-1111-111111111103',
     '11111111-1111-1111-1111-111111111111',
     'Differentiate: $f(x) = x^5$',
     '[{"id":"A","text":"$5x^4$"},{"id":"B","text":"$x^4$"},{"id":"C","text":"$5x^5$"},{"id":"D","text":"$4x^5$"}]'::jsonb,
     'A',
     'Apply d/dx x^n = n x^(n-1): multiply by the exponent, then reduce the exponent by one.',
     'The power rule gives d/dx x^5 = 5x^(5-1) = 5x^4.',
     2),
    ('11111111-1111-1111-1111-111111111104',
     '11111111-1111-1111-1111-111111111111',
     'Differentiate: $f(x) = 3x^4 - 2x^2 + 7$',
     '[{"id":"A","text":"$12x^3 - 4x$"},{"id":"B","text":"$12x^3 - 4x + 7$"},{"id":"C","text":"$3x^3 - 2x$"},{"id":"D","text":"$12x^3 - 2x$"}]'::jsonb,
     'A',
     'Differentiate term by term with the power rule. What happens to the constant 7?',
     'Term by term: d/dx 3x^4 = 12x^3, d/dx (-2x^2) = -4x, d/dx 7 = 0. So f''(x) = 12x^3 - 4x. The constant vanishes — a classic power-rule slip.',
     3),
    ('11111111-1111-1111-1111-111111111105',
     '11111111-1111-1111-1111-111111111111',
     'A ball''s position is $s(t) = t^3$ meters. What is its velocity at $t = 2$s?',
     '[{"id":"A","text":"$6$ m/s"},{"id":"B","text":"$8$ m/s"},{"id":"C","text":"$12$ m/s"},{"id":"D","text":"$3$ m/s"}]'::jsonb,
     'C',
     'Velocity is the derivative of position. Differentiate $t^3$ first, then substitute $t = 2$.',
     's''(t) = 3t^2 (power rule), so s''(2) = 3(4) = 12 m/s. Applications reduce to the differentiation procedure.',
     4)
  on conflict (id) do nothing;

  -- Map questions to concepts (explicit pre-mapping: no live LLM tagging needed).
  insert into public.question_concepts (question_id, concept_id, weight)
  select q.id, c.id, 1.0
  from (values
    ('11111111-1111-1111-1111-111111111101', 'functions'),
    ('11111111-1111-1111-1111-111111111102', 'limits'),
    ('11111111-1111-1111-1111-111111111103', 'power_rule'),
    ('11111111-1111-1111-1111-111111111104', 'power_rule'),
    ('11111111-1111-1111-1111-111111111105', 'derivative_application'),
    ('11111111-1111-1111-1111-111111111105', 'power_rule')
  ) as qm(question_id, concept_slug)
  join public.questions qs on qs.id = qm.question_id
  join public.concepts  c  on c.slug = qm.concept_slug and c.topic = 'Calculus'
  on conflict do nothing;

  -- ---------------------------------------------------------------------------
  -- 6. Ensure user_profiles row exists (normally via the signup trigger).
  -- ---------------------------------------------------------------------------
  insert into public.user_profiles (id, email, full_name)
  values (demo_user_id, 'judge.demo@pragati.app', 'Judge Demo')
  on conflict (id) do nothing;
end $$;
