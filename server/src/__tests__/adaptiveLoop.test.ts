/**
 * Tests for the pure data-plumbing of the adaptive loop (supabase/functions/
 * api/_shared/adaptiveLoop.ts): question→concept attribution, learner-state
 * merging, and learning-event construction.
 *
 * The I/O shell that calls these (supabase/functions/api/index.ts) only does
 * DB reads/writes; every decision-relevant computation lives here so it can be
 * unit-tested under vitest — same rationale as mastery.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  buildQuestionToSlugs,
  mergeLearnerStates,
  buildLearningEventRow,
  buildAssessedInputs,
  type QuestionTelemetryInput,
} from '../../../supabase/functions/api/_shared/adaptiveLoop';
import type { LearnerConceptState, MasteryStateUpdate } from '../../../supabase/functions/api/_shared/mastery';

// ---------------------------------------------------------------------------
// buildQuestionToSlugs
// ---------------------------------------------------------------------------

describe('buildQuestionToSlugs', () => {
  const telemetry: QuestionTelemetryInput[] = [
    { question_id: 'q1', prompt: 'Differentiate x^5 using the power rule', concepts: [{ name: 'Power Rule', slug: 'power_rule', prerequisites: [] }] },
    { question_id: 'q2', prompt: 'What is a limit?', concepts: [] },
  ];

  it('prefers explicit DB mappings over embedded tags', () => {
    const mappings = [
      { question_id: 'q1', concepts: { slug: 'derivative_application' } },
    ];
    const map = buildQuestionToSlugs(mappings, telemetry, 'Calculus');
    expect(map.get('q1')).toEqual(['derivative_application']);
  });

  it('falls back to embedded concept tags when no DB mapping exists', () => {
    const map = buildQuestionToSlugs([], telemetry, 'Calculus');
    expect(map.get('q1')).toEqual(['power_rule']);
  });

  it('falls back to keyword matching, then the topic, when nothing else is available', () => {
    const plainTelemetry: QuestionTelemetryInput[] = [
      { question_id: 'q2', prompt: 'What is a limit?', concepts: [] },
      { question_id: 'q3', prompt: 'Completely unrelated text about cooking pasta', concepts: [] },
    ];
    const map = buildQuestionToSlugs([], plainTelemetry, 'Calculus');
    // q2 keyword-matches "limit" → the limits concept.
    expect(map.get('q2')).toEqual(['limits']);
    // q3 matches nothing → falls back to the topic-level concept.
    expect(map.get('q3')).toEqual(['calculus']);
  });

  it('handles empty inputs without throwing', () => {
    expect(buildQuestionToSlugs([], [], 'Calculus').size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mergeLearnerStates
// ---------------------------------------------------------------------------

describe('mergeLearnerStates', () => {
  const DB_STATE: LearnerConceptState = {
    conceptSlug: 'power_rule',
    mastery: 0.6,
    attempts: 10,
    correct: 6,
    incorrect: 4,
    hintsUsed: 3,
    avgResponseTimeSec: 45,
  };

  it('stores the persisted running average, not this attempt\'s average (bug fix)', () => {
    // updateMastery computed the new running average and stored it in the
    // MasteryStateUpdate; the merge must keep exactly that value. The old code
    // overwrote it with the current attempt's per-question mean.
    const updated: MasteryStateUpdate = {
      mastery: 0.62,
      attempts: 12,
      correct: 7,
      incorrect: 5,
      hintsUsed: 4,
      avgResponseTimeSec: 43.2, // running average from updateMastery
    };
    const merged = mergeLearnerStates(
      { power_rule: DB_STATE },
      [{ slug: 'power_rule', updated }],
      [{ slug: 'power_rule', evidence: [{ correct: true, skipped: false, dwellTimeSec: 12, hintsUsed: 0 }, { correct: true, skipped: false, dwellTimeSec: 18, hintsUsed: 0 }] }]
    );
    expect(merged.power_rule.avgResponseTimeSec).toBe(43.2);
  });

  it('adds this attempt\'s evidence to the persisted counters', () => {
    const updated: MasteryStateUpdate = {
      mastery: 0.62,
      attempts: 12,
      correct: 7,
      incorrect: 5,
      hintsUsed: 4,
      avgResponseTimeSec: 43.2,
    };
    const merged = mergeLearnerStates(
      { power_rule: DB_STATE },
      [{ slug: 'power_rule', updated }],
      [{ slug: 'power_rule', evidence: [{ correct: true, skipped: false, dwellTimeSec: 12, hintsUsed: 1 }, { correct: false, skipped: false, dwellTimeSec: 30, hintsUsed: 0 }] }]
    );
    expect(merged.power_rule.attempts).toBe(12);
    expect(merged.power_rule.correct).toBe(7);
    expect(merged.power_rule.incorrect).toBe(5);
    expect(merged.power_rule.hintsUsed).toBe(4);
  });

  it('includes untouched concepts unchanged', () => {
    const untouched: LearnerConceptState = { ...DB_STATE, conceptSlug: 'limits', mastery: 0.35 };
    const updated: MasteryStateUpdate = {
      mastery: 0.62, attempts: 12, correct: 7, incorrect: 5, hintsUsed: 4, avgResponseTimeSec: 43.2,
    };
    const merged = mergeLearnerStates(
      { power_rule: DB_STATE, limits: untouched },
      [{ slug: 'power_rule', updated }],
      [{ slug: 'power_rule', evidence: [{ correct: true, skipped: false, dwellTimeSec: 12, hintsUsed: 0 }] }]
    );
    expect(merged.limits).toEqual(untouched);
  });
});

// ---------------------------------------------------------------------------
// buildLearningEventRow
// ---------------------------------------------------------------------------

describe('buildLearningEventRow', () => {
  it('records the attempt_id in metadata (bug fix — was always null)', () => {
    const row = buildLearningEventRow({
      userId: 'user-1',
      conceptId: 'concept-1',
      attemptId: 'attempt-abc',
      eventType: 'quiz_evidence',
      beforeMastery: 0.5,
      afterMastery: 0.62,
      questionCount: 2,
      hintsUsed: 1,
    });
    expect(row.metadata.attempt_id).toBe('attempt-abc');
    expect(row.before_mastery).toBe(0.5);
    expect(row.after_mastery).toBe(0.62);
  });

  it(' tolerates a missing attempt_id', () => {
    const row = buildLearningEventRow({
      userId: 'user-1',
      conceptId: 'concept-1',
      attemptId: null,
      eventType: 'quiz_evidence',
      beforeMastery: 0.5,
      afterMastery: 0.6,
      questionCount: 1,
      hintsUsed: 0,
    });
    expect(row.metadata.attempt_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildAssessedInputs
// ---------------------------------------------------------------------------

describe('buildAssessedInputs', () => {
  it('derives assessed inputs once from the mastery deltas and evidence map', () => {
    const merged: Record<string, LearnerConceptState> = {
      power_rule: {
        conceptSlug: 'power_rule', mastery: 0.62, attempts: 12, correct: 7, incorrect: 5, hintsUsed: 4, avgResponseTimeSec: 43.2,
      },
    };
    const inputs = buildAssessedInputs(
      [{ conceptSlug: 'power_rule', conceptName: 'Power Rule', after: 0.62 }],
      merged,
      { power_rule: [{ correct: true, skipped: false, dwellTimeSec: 12, hintsUsed: 0 }] }
    );
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toEqual({
      slug: 'power_rule',
      name: 'Power Rule',
      state: merged.power_rule,
      evidence: [{ correct: true, skipped: false, dwellTimeSec: 12, hintsUsed: 0 }],
    });
  });
});
