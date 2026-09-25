/**
 * Pure data-plumbing for the adaptive loop: question→concept attribution,
 * learner-state merging, and learning-event construction.
 *
 * Pure TypeScript only (no Deno APIs, no network), so it is unit-tested under
 * vitest in the server suite — the same pattern as mastery.ts. The I/O shell
 * in supabase/functions/api/index.ts does only DB reads/writes and calls into
 * these builders; every decision-relevant computation lives here.
 */
import {
  matchConceptsForQuestion,
  type ConceptTag,
} from './agent-tools.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One telemetry row the submit handler evaluated (subset the loop needs). */
export interface QuestionTelemetryInput {
  question_id: string;
  prompt?: string;
  /** Embedded concept tags carried on generated quizzes (pre-DB-mapping). */
  concepts?: ConceptTag[];
  attempt_id?: string;
}

export interface MappingRow {
  question_id: string;
  concepts: { slug: string } | null;
}

export interface DbLearnerStateRow {
  concept_id: string;
  mastery: number | string | null;
  attempts: number | null;
  correct: number | null;
  incorrect: number | null;
  hints_used: number | null;
  avg_response_time_sec: number | string | null;
}

// ---------------------------------------------------------------------------
// Question → concept attribution
// ---------------------------------------------------------------------------

/**
 * Builds the question_id → concept-slug map with a clear precedence:
 *   1. explicit DB mappings (question_concepts, seeded/generated)
 *   2. embedded tags from quiz generation (normalized at generation time)
 *   3. keyword matching against the seed taxonomy
 *   4. the quiz topic as a single concept
 */
export function buildQuestionToSlugs(
  mappings: MappingRow[] | null,
  telemetry: QuestionTelemetryInput[],
  topic: string
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const m of mappings || []) {
    const slug = m.concepts?.slug;
    if (!slug) continue;
    const list = map.get(m.question_id) || [];
    list.push(slug);
    map.set(m.question_id, list);
  }

  for (const t of telemetry) {
    if (map.has(t.question_id)) continue;
    const embedded = Array.isArray(t.concepts) ? t.concepts : [];
    if (embedded.length > 0) {
      map.set(
        t.question_id,
        embedded.map((c) => c.slug)
      );
    } else {
      map.set(
        t.question_id,
        matchConceptsForQuestion(t.prompt || '', topic).map((c) => c.slug)
      );
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Learner state merging
// ---------------------------------------------------------------------------

/** Derives ConceptEvidence-shaped rows for one concept from telemetry. */
export function evidenceFor(
  slug: string,
  questionToSlugs: Map<string, string[]>,
  telemetry: QuestionTelemetryInput[]
): ConceptEvidenceInput[] {
  const evidence: ConceptEvidenceInput[] = [];
  for (const t of telemetry) {
    const slugs = questionToSlugs.get(t.question_id) || [];
    if (!slugs.includes(slug)) continue;
    evidence.push({
      correct: Boolean(t.is_correct),
      skipped: Boolean(t.is_skipped),
      dwellTimeSec: Number(t.dwell_time_sec) || 0,
      hintsUsed: Number(t.hints_used) || 0,
    });
  }
  return evidence;
}

export interface ConceptEvidenceInput {
  correct: boolean;
  skipped: boolean;
  dwellTimeSec: number;
  hintsUsed: number;
}

/**
 * Merges the updated stats (from updateMastery) over the previously persisted
 * learner state. Single source of truth: the running averages and counters
 * come from the MasteryStateUpdate — they are never recomputed from the raw
 * evidence, so the decision core sees exactly what was persisted.
 */
export function mergeLearnerStates(
  persisted: Record<string, LearnerConceptStateLike>,
  updates: Array<{ slug: string; updated: MasteryUpdateLike }>,
  _evidenceBySlug: Array<{ slug: string; evidence: ConceptEvidenceInput[] }> = []
): Record<string, LearnerConceptStateLike> {
  const merged: Record<string, LearnerConceptStateLike> = {};

  // Untouched concepts pass through unchanged.
  for (const [slug, state] of Object.entries(persisted)) {
    if (!updates.some((u) => u.slug === slug)) {
      merged[slug] = state;
    }
  }

  // Touched concepts take the authoritative updateMastery output.
  for (const u of updates) {
    merged[u.slug] = {
      conceptSlug: u.slug,
      mastery: u.updated.mastery,
      attempts: u.updated.attempts,
      correct: u.updated.correct,
      incorrect: u.updated.incorrect,
      hintsUsed: u.updated.hintsUsed,
      avgResponseTimeSec: u.updated.avgResponseTimeSec,
    };
  }

  return merged;
}

// Structural types so this module does not need to import mastery.ts types
// (avoids a circular dependency risk if mastery ever imports from here).
export interface LearnerConceptStateLike {
  conceptSlug: string;
  mastery: number;
  attempts: number;
  correct: number;
  incorrect: number;
  hintsUsed: number;
  avgResponseTimeSec: number;
}

export interface MasteryUpdateLike {
  mastery: number;
  attempts: number;
  correct: number;
  incorrect: number;
  hintsUsed: number;
  avgResponseTimeSec: number;
}

// ---------------------------------------------------------------------------
// Learning events
// ---------------------------------------------------------------------------

export interface LearningEventInput {
  userId: string;
  conceptId: string;
  attemptId: string | null;
  eventType: string;
  beforeMastery: number;
  afterMastery: number;
  questionCount: number;
  hintsUsed: number;
}

/**
 * Builds the learning_events insert row. The attempt_id is threaded explicitly
 * by the caller (from the created attempt row) so it is never silently null.
 */
export function buildLearningEventRow(input: LearningEventInput): {
  user_id: string;
  concept_id: string;
  event_type: string;
  before_mastery: number;
  after_mastery: number;
  metadata: Record<string, unknown>;
} {
  return {
    user_id: input.userId,
    concept_id: input.conceptId,
    event_type: input.eventType,
    before_mastery: input.beforeMastery,
    after_mastery: input.afterMastery,
    metadata: {
      attempt_id: input.attemptId,
      questions: input.questionCount,
      hints: input.hintsUsed,
    },
  };
}

// ---------------------------------------------------------------------------
// Assessed inputs for the decision core
// ---------------------------------------------------------------------------

export interface AssessedInput {
  slug: string;
  name: string;
  state: LearnerConceptStateLike;
  evidence: ConceptEvidenceInput[];
}

/**
 * Derives the chooseNextAction inputs from the mastery deltas, merged learner
 * states, and the per-concept evidence map — one computation, reused.
 */
export function buildAssessedInputs(
  deltas: Array<{ conceptSlug: string; conceptName: string; after: number }>,
  merged: Record<string, LearnerConceptStateLike>,
  evidenceBySlug: Record<string, ConceptEvidenceInput[]>
): AssessedInput[] {
  return deltas.map((d) => ({
    slug: d.conceptSlug,
    name: d.conceptName,
    state: merged[d.conceptSlug],
    evidence: evidenceBySlug[d.conceptSlug] || [],
  }));
}
