/**
 * Adaptive submit loop for the Express server — the I/O mirror of the Edge
 * Function's runAdaptiveLoop (supabase/functions/api/index.ts), using the
 * pure masteryCore mirror.
 *
 * Quiz evidence -> per-concept mastery -> learner_concept_state upsert ->
 * learning_events. Goal mastery bars derive from learner_concept_state, so
 * this is what makes the My Topics bars move in local development.
 * NEVER throws into the submit path: callers wrap it in try/catch.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import {
  updateMastery,
  nextReviewAt,
  matchConceptsForQuestion,
  slugifyConceptName,
  type ConceptEvidence,
  type LearnerConceptState,
} from './masteryCore.js';

/** Subset of an evaluated telemetry row the loop needs. */
export interface SubmitTelemetryInput {
  question_id: string;
  prompt?: string;
  is_correct: boolean;
  is_skipped: boolean;
  dwell_time_sec: number;
  hints_used: number;
}

/**
 * Runs the adaptive loop for a completed attempt. Mirrors the Edge Function's
 * precedence: explicit DB mappings (question_concepts) > learning goal subtopics >
 * keyword matching > quiz-topic fallback.
 */
export async function runAdaptiveSubmitLoop(
  scopedClient: SupabaseClient,
  userId: string,
  quizId: string,
  telemetry: SubmitTelemetryInput[],
  attemptId: string
): Promise<void> {
  if (!telemetry || telemetry.length === 0) return;

  // 1. Quiz topic
  const { data: quizRow } = await scopedClient
    .from('quizzes')
    .select('topic')
    .eq('id', quizId)
    .maybeSingle();
  const topic = quizRow?.topic || 'General';

  // 2. Explicit question->concept mappings (seeded/generated quizzes)
  const questionIds = telemetry.map((t) => t.question_id);
  const { data: mappings } = await scopedClient
    .from('question_concepts')
    .select('question_id, concepts(slug)')
    .in('question_id', questionIds);

  const questionToSlugs = new Map<string, string[]>();
  for (const m of mappings || []) {
    const slug = (m as any).concepts?.slug;
    if (!slug) continue;
    const list = questionToSlugs.get((m as any).question_id) || [];
    list.push(slug);
    questionToSlugs.set((m as any).question_id, list);
  }

  // 3. Fallback attribution for unmapped questions: check user goal subtopics first
  let goalSubtopics: Array<{ name: string; slug: string }> = [];
  try {
    const { data: userGoals } = await scopedClient
      .from('learning_goals')
      .select('title, slug, goal_subtopics(name, slug)')
      .eq('user_id', userId);
    for (const g of userGoals || []) {
      for (const st of (g as any).goal_subtopics || []) {
        if (st && st.name && st.slug) {
          goalSubtopics.push({ name: st.name, slug: st.slug });
        }
      }
    }
  } catch {
    // Non-fatal
  }

  for (const t of telemetry) {
    if (questionToSlugs.has(t.question_id)) continue;
    const promptLower = String(t.prompt || '').toLowerCase();
    const matchedFromGoals = goalSubtopics.filter(
      (st) =>
        promptLower.includes(st.name.toLowerCase()) ||
        promptLower.includes(st.slug.replace(/_/g, ' '))
    );
    if (matchedFromGoals.length > 0) {
      questionToSlugs.set(t.question_id, matchedFromGoals.map((s) => s.slug));
    } else {
      questionToSlugs.set(
        t.question_id,
        matchConceptsForQuestion(t.prompt || '', topic).map((c) => c.slug)
      );
    }
  }

  const topicSlug = slugifyConceptName(topic);
  const touchedSlugs = Array.from(
    new Set([...Array.from(questionToSlugs.values()).flat(), topicSlug].filter(Boolean))
  );
  if (touchedSlugs.length === 0) return;

  // 4. Resolve concept ids (auto-register missing concepts so custom topics track mastery)
  const { data: conceptRows } = await scopedClient
    .from('concepts')
    .select('id, name, slug')
    .in('slug', touchedSlugs);
  const slugToId = new Map<string, string>();
  for (const row of conceptRows || []) slugToId.set(row.slug, row.id);

  const missingSlugs = touchedSlugs.filter((s) => !slugToId.has(s));
  if (missingSlugs.length > 0) {
    const toInsert = missingSlugs.map((s) => {
      const formattedName = s
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
      return {
        topic: topic || 'General',
        name: formattedName,
        slug: s,
        description: `Concept for ${topic || 'General'}`,
      };
    });
    try {
      const { data: createdConcepts } = await scopedClient
        .from('concepts')
        .insert(toInsert)
        .select('id, name, slug');
      for (const c of createdConcepts || []) {
        slugToId.set(c.slug, c.id);
      }
    } catch {
      // Non-fatal fallback
    }
  }

  // 5. Load existing learner state
  const { data: existingStates } = await scopedClient
    .from('learner_concept_state')
    .select('*')
    .eq('user_id', userId)
    .in('concept_id', Array.from(slugToId.values()));
  const stateBySlug = new Map<string, any>();
  for (const s of existingStates || []) {
    const slug = Array.from(slugToId.entries()).find(([, id]) => id === s.concept_id)?.[0];
    if (slug) stateBySlug.set(slug, s);
  }

  // 6. Group evidence per concept, update, persist
  const evidenceBySlug: Record<string, ConceptEvidence[]> = {};
  for (const t of telemetry) {
    const itemEvidence: ConceptEvidence = {
      correct: Boolean(t.is_correct),
      skipped: Boolean(t.is_skipped),
      dwellTimeSec: Number(t.dwell_time_sec) || 0,
      hintsUsed: Number(t.hints_used) || 0,
    };
    for (const slug of questionToSlugs.get(t.question_id) || []) {
      (evidenceBySlug[slug] ??= []).push(itemEvidence);
    }
    if (topicSlug) {
      (evidenceBySlug[topicSlug] ??= []).push(itemEvidence);
    }
  }

  const now = new Date();
  for (const slug of touchedSlugs) {
    const conceptId = slugToId.get(slug);
    const evidence = evidenceBySlug[slug] || [];
    if (!conceptId || evidence.length === 0) continue;

    const prevRow = stateBySlug.get(slug);
    const prevState: LearnerConceptState | null = prevRow
      ? {
          conceptSlug: slug,
          mastery: Number(prevRow.mastery ?? 0.5),
          attempts: Number(prevRow.attempts ?? 0),
          correct: Number(prevRow.correct ?? 0),
          incorrect: Number(prevRow.incorrect ?? 0),
          hintsUsed: Number(prevRow.hints_used ?? 0),
          avgResponseTimeSec: Number(prevRow.avg_response_time_sec ?? 0),
        }
      : null;

    const updated = updateMastery(prevState, evidence);
    const beforeMastery = prevState ? prevState.mastery : 0.5;
    const reviewAt = nextReviewAt(updated.mastery, now);

    const { error: upsertError } = await scopedClient.from('learner_concept_state').upsert(
      {
        user_id: userId,
        concept_id: conceptId,
        mastery: updated.mastery,
        confidence: Math.max(0, 1 - Math.min(1, updated.hintsUsed / Math.max(1, updated.attempts * 2))),
        attempts: updated.attempts,
        correct: updated.correct,
        incorrect: updated.incorrect,
        avg_response_time_sec: updated.avgResponseTimeSec,
        hints_used: updated.hintsUsed,
        last_seen_at: now.toISOString(),
        next_review_at: reviewAt.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id,concept_id' }
    );
    if (upsertError) {
      console.error(`learner_concept_state upsert failed for ${slug}:`, upsertError.message);
      continue;
    }

    await scopedClient.from('learning_events').insert({
      user_id: userId,
      concept_id: conceptId,
      event_type: 'quiz_evidence',
      before_mastery: beforeMastery,
      after_mastery: updated.mastery,
      metadata: {
        attempt_id: attemptId,
        question_count: evidence.length,
        hints_used: updated.hintsUsed,
        source: 'express-submit',
      },
    });
  }
}
