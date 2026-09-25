/**
 * Server-local mastery core — mirrors supabase/functions/api/_shared/mastery.ts
 * (the updateMastery / review-scheduling / concept-attribution subset the
 * Express submit route needs). Repo convention: shared pure logic is mirrored
 * under server/src so the Edge Function and Express stay behaviorally
 * identical while imports stay server-local for tsc/NodeNext. Both copies are
 * covered by the shared vitest suite.
 */

const SLOW_RESPONSE_SEC = 60; // slower than this counts as "effortful"
export const MASTERY_THRESHOLDS = {
  DEVELOPING: 0.7,
  REVIEW_DAYS: { weak: 1, developing: 2, good: 5, strong: 10, mastered: 21 },
} as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// Types (subset of mastery.ts)
// ---------------------------------------------------------------------------

export interface LearnerConceptState {
  conceptSlug: string;
  mastery: number;
  attempts: number;
  correct: number;
  incorrect: number;
  hintsUsed: number;
  avgResponseTimeSec: number;
}

export interface ConceptEvidence {
  correct: boolean;
  skipped: boolean;
  dwellTimeSec: number;
  hintsUsed: number;
}

export interface MasteryStateUpdate {
  mastery: number;
  attempts: number;
  correct: number;
  incorrect: number;
  hintsUsed: number;
  avgResponseTimeSec: number;
}

// ---------------------------------------------------------------------------
// Concept attribution (keyword fallback when no explicit mappings exist)
// ---------------------------------------------------------------------------

/** Seed taxonomy mirrors agent-tools.ts KNOWN_CONCEPTS. */
const KNOWN_CONCEPTS: Array<{
  name: string;
  slug: string;
  topic: string;
  keywords: string[];
}> = [
  { name: 'Functions', slug: 'functions', topic: 'Calculus', keywords: ['function', 'domain', 'range'] },
  { name: 'Limits', slug: 'limits', topic: 'Calculus', keywords: ['limit', 'continuity', 'approaches'] },
  { name: 'Power Rule', slug: 'power_rule', topic: 'Calculus', keywords: ['power rule', 'exponent'] },
  { name: 'Chain Rule', slug: 'chain_rule', topic: 'Calculus', keywords: ['chain rule', 'composite'] },
  {
    name: 'Derivative Application',
    slug: 'derivative_application',
    topic: 'Calculus',
    keywords: ['derivative', 'slope', 'tangent', 'rate of change'],
  },
];

/** Converts a concept name to the canonical slug form used across the schema. */
export function slugifyConceptName(name: string): string {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'concept'
  );
}

export interface ConceptTag {
  name: string;
  slug: string;
  prerequisites: string[];
}

/**
 * Keyword-matches question text against the seed taxonomy. Falls back to the
 * quiz topic as a single concept so mastery updates always have a target.
 */
export function matchConceptsForQuestion(text: string, fallbackTopic: string): ConceptTag[] {
  const lower = String(text).toLowerCase();
  const matched = KNOWN_CONCEPTS.filter((c) => c.keywords.some((k) => lower.includes(k)));
  if (matched.length > 0) {
    return matched.map((c) => ({ name: c.name, slug: c.slug, prerequisites: [] }));
  }
  const safeTopic = String(fallbackTopic || 'General').trim().slice(0, 60) || 'General';
  return [{ name: safeTopic, slug: slugifyConceptName(safeTopic), prerequisites: [] }];
}

// ---------------------------------------------------------------------------
// Mastery update (mirror of mastery.ts updateMastery)
// ---------------------------------------------------------------------------

/**
 * Blends new quiz evidence into the learner's running state for one concept.
 * Evidence weighting: correctness dominates; slow-but-correct and hint-reliant
 * answers move mastery less; skips count as incorrect evidence.
 */
export function updateMastery(
  prev: LearnerConceptState | null,
  evidence: ConceptEvidence[]
): MasteryStateUpdate {
  const base = prev ?? {
    conceptSlug: '',
    mastery: 0.5,
    attempts: 0,
    correct: 0,
    incorrect: 0,
    hintsUsed: 0,
    avgResponseTimeSec: 0,
  };

  const attemptsDelta = evidence.length;
  let correctDelta = 0;
  let hintsDelta = 0;
  let dwellSum = 0;
  let evidenceScore = 0;

  for (const ev of evidence) {
    if (ev.skipped) {
      evidenceScore += 0.0;
    } else if (ev.correct) {
      const hintPenalty = Math.min(0.3, 0.15 * ev.hintsUsed);
      const speedPenalty = ev.dwellTimeSec > SLOW_RESPONSE_SEC ? 0.15 : 0;
      evidenceScore += 1 - hintPenalty - speedPenalty;
    } else {
      evidenceScore += ev.hintsUsed === 0 ? 0.1 : 0;
    }
    if (ev.correct && !ev.skipped) correctDelta++;
    hintsDelta += ev.hintsUsed;
    dwellSum += Math.max(0, ev.dwellTimeSec);
  }

  const avgEvidence = attemptsDelta > 0 ? evidenceScore / attemptsDelta : 0.5;

  const priorWeight = 1 / (1 + base.attempts);
  let nextMastery = clamp01(base.mastery * (1 - priorWeight) + avgEvidence * priorWeight);

  // Uncertainty cap for first-assessment learners.
  if (base.attempts === 0) {
    nextMastery = Math.min(nextMastery, 0.85);
  }

  const totalAttempts = base.attempts + attemptsDelta;
  const totalDwell = base.avgResponseTimeSec * base.attempts + dwellSum;
  const nextAvgDwell = totalAttempts > 0 ? totalDwell / totalAttempts : 0;

  return {
    mastery: round3(nextMastery),
    attempts: totalAttempts,
    correct: base.correct + correctDelta,
    incorrect: base.incorrect + (attemptsDelta - correctDelta),
    hintsUsed: base.hintsUsed + hintsDelta,
    avgResponseTimeSec: round1(nextAvgDwell),
  };
}

// ---------------------------------------------------------------------------
// Review scheduling
// ---------------------------------------------------------------------------

export function scheduleReview(mastery: number): number {
  if (mastery < 0.4) return MASTERY_THRESHOLDS.REVIEW_DAYS.weak;
  if (mastery < 0.6) return MASTERY_THRESHOLDS.REVIEW_DAYS.developing;
  if (mastery < 0.8) return MASTERY_THRESHOLDS.REVIEW_DAYS.good;
  if (mastery < 0.9) return MASTERY_THRESHOLDS.REVIEW_DAYS.strong;
  return MASTERY_THRESHOLDS.REVIEW_DAYS.mastered;
}

export function nextReviewAt(mastery: number, from: Date = new Date()): Date {
  const days = scheduleReview(mastery);
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}
