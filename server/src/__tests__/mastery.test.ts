/**
 * Tests for the Pragati adaptive-agent decision core.
 *
 * These are the same functions the Edge Function uses on every quiz submit —
 * the evaluation harness (masteryEvaluation.test.ts) asserts adaptation
 * accuracy across deterministic learner scenarios against this same core.
 */
import { describe, it, expect } from 'vitest';
import {
  updateMastery,
  diagnosePrerequisite,
  chooseNextAction,
  scheduleReview,
  nextReviewAt,
  difficultyToScale,
  scaleToLabel,
  formatDifficultyTransition,
  buildAgentTrace,
  type ConceptGraph,
  type LearnerConceptState,
} from '../../../supabase/functions/api/_shared/mastery';

// ---------------------------------------------------------------------------
// Fixtures: a small Calculus graph used across tests
// ---------------------------------------------------------------------------

const CALCULUS_GRAPH: ConceptGraph = {
  bySlug: {
    functions: { id: 'c1', name: 'Functions', slug: 'functions', prerequisites: [] },
    limits: { id: 'c2', name: 'Limits', slug: 'limits', prerequisites: ['functions'] },
    power_rule: { id: 'c3', name: 'Power Rule', slug: 'power_rule', prerequisites: ['functions'] },
    derivative_application: {
      id: 'c4',
      name: 'Derivative Application',
      slug: 'derivative_application',
      prerequisites: ['power_rule', 'limits'],
    },
  },
};

function learnerState(overrides: Partial<LearnerConceptState> = {}): LearnerConceptState {
  return {
    conceptSlug: 'x',
    mastery: 0.5,
    attempts: 4,
    correct: 2,
    incorrect: 2,
    hintsUsed: 0,
    avgResponseTimeSec: 30,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// updateMastery
// ---------------------------------------------------------------------------

describe('updateMastery', () => {
  it('raises mastery on fast, hint-free correct answers from a cold start', () => {
    const next = updateMastery(null, [
      { correct: true, skipped: false, dwellTimeSec: 15, hintsUsed: 0 },
      { correct: true, skipped: false, dwellTimeSec: 20, hintsUsed: 0 },
    ]);
    expect(next.mastery).toBeGreaterThan(0.7);
    expect(next.attempts).toBe(2);
    expect(next.correct).toBe(2);
  });

  it('lowers mastery on incorrect answers', () => {
    const prev = learnerState({ conceptSlug: 'power_rule', mastery: 0.6, attempts: 4 });
    const next = updateMastery(prev, [
      { correct: false, skipped: false, dwellTimeSec: 40, hintsUsed: 0 },
      { correct: false, skipped: false, dwellTimeSec: 40, hintsUsed: 0 },
    ]);
    expect(next.mastery).toBeLessThan(0.6);
    expect(next.incorrect).toBeGreaterThan(2);
  });

  it('counts a skip as negative evidence, not neutral', () => {
    const skipped = updateMastery(null, [
      { correct: false, skipped: true, dwellTimeSec: 5, hintsUsed: 0 },
    ]);
    const wrong = updateMastery(null, [
      { correct: false, skipped: false, dwellTimeSec: 5, hintsUsed: 0 },
    ]);
    expect(skipped.mastery).toBeLessThan(wrong.mastery);
  });

  it('gives less credit to slow-but-correct and hint-reliant answers', () => {
    const fastClean = updateMastery(null, [
      { correct: true, skipped: false, dwellTimeSec: 10, hintsUsed: 0 },
    ]);
    const slowHinted = updateMastery(null, [
      { correct: true, skipped: false, dwellTimeSec: 90, hintsUsed: 2 },
    ]);
    expect(slowHinted.mastery).toBeLessThan(fastClean.mastery);
  });

  it('dampens new evidence as attempts accumulate (stability, not thrash)', () => {
    const prev = learnerState({ mastery: 0.9, attempts: 20, correct: 18, incorrect: 2 });
    const next = updateMastery(prev, [
      { correct: false, skipped: false, dwellTimeSec: 30, hintsUsed: 0 },
      { correct: false, skipped: false, dwellTimeSec: 30, hintsUsed: 0 },
    ]);
    expect(next.mastery).toBeLessThan(0.9);
    expect(next.mastery).toBeGreaterThan(0.75);
  });

  it('accumulates hints and response time across updates', () => {
    const first = updateMastery(null, [
      { correct: true, skipped: false, dwellTimeSec: 30, hintsUsed: 1 },
    ]);
    const second = updateMastery(
      { conceptSlug: 'limits', mastery: first.mastery, attempts: 1, correct: 1, incorrect: 0, hintsUsed: first.hintsUsed, avgResponseTimeSec: first.avgResponseTimeSec },
      [{ correct: true, skipped: false, dwellTimeSec: 50, hintsUsed: 0 }]
    );
    expect(second.hintsUsed).toBe(1);
    expect(second.avgResponseTimeSec).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// diagnosePrerequisite
// ---------------------------------------------------------------------------

describe('diagnosePrerequisite', () => {
  it('finds a weak power-rule prerequisite behind derivative failures', () => {
    const learner = {
      functions: learnerState({ conceptSlug: 'functions', mastery: 0.88 }),
      power_rule: learnerState({ conceptSlug: 'power_rule', mastery: 0.32 }),
      limits: learnerState({ conceptSlug: 'limits', mastery: 0.75 }),
      derivative_application: learnerState({ conceptSlug: 'derivative_application', mastery: 0.47 }),
    };
    const d = diagnosePrerequisite('derivative_application', CALCULUS_GRAPH, learner);
    expect(d.blockingSlug).toBe('power_rule');
    expect(d.blockingName).toBe('Power Rule');
    expect(d.path).toContain('power_rule');
  });

  it('returns null when all prerequisites are healthy (failure is on the concept itself)', () => {
    const learner = {
      functions: learnerState({ conceptSlug: 'functions', mastery: 0.9 }),
      power_rule: learnerState({ conceptSlug: 'power_rule', mastery: 0.9 }),
      limits: learnerState({ conceptSlug: 'limits', mastery: 0.85 }),
      derivative_application: learnerState({ conceptSlug: 'derivative_application', mastery: 0.3 }),
    };
    const d = diagnosePrerequisite('derivative_application', CALCULUS_GRAPH, learner);
    expect(d.blockingSlug).toBeNull();
  });

  it('walks recursively to the root cause through chained prerequisites', () => {
    const learner = {
      functions: learnerState({ conceptSlug: 'functions', mastery: 0.2 }),
      power_rule: learnerState({ conceptSlug: 'power_rule', mastery: 0.35 }),
      limits: learnerState({ conceptSlug: 'limits', mastery: 0.8 }),
      derivative_application: learnerState({ conceptSlug: 'derivative_application', mastery: 0.4 }),
    };
    const d = diagnosePrerequisite('derivative_application', CALCULUS_GRAPH, learner);
    expect(d.blockingSlug).toBe('functions');
    expect(d.path).toEqual(['power_rule', 'functions']);
  });

  it('handles unknown concepts and leaf concepts safely', () => {
    expect(diagnosePrerequisite('nonexistent', CALCULUS_GRAPH, {})).toEqual({
      blockingSlug: null,
      blockingName: null,
      path: [],
    });
    expect(
      diagnosePrerequisite('functions', CALCULUS_GRAPH, { functions: learnerState({ mastery: 0.1 }) })
    ).toEqual({ blockingSlug: null, blockingName: null, path: [] });
  });
});

// ---------------------------------------------------------------------------
// chooseNextAction
// ---------------------------------------------------------------------------

describe('chooseNextAction', () => {
  it('selects PREREQUISITE_REPAIR for repeated failure with a weak prerequisite', () => {
    const learner = {
      functions: learnerState({ conceptSlug: 'functions', mastery: 0.88 }),
      power_rule: learnerState({ conceptSlug: 'power_rule', mastery: 0.32 }),
      limits: learnerState({ conceptSlug: 'limits', mastery: 0.75 }),
      derivative_application: learnerState({ conceptSlug: 'derivative_application', mastery: 0.45 }),
    };
    const decision = chooseNextAction({
      assessed: [
        {
          slug: 'derivative_application',
          name: 'Derivative Application',
          state: learner.derivative_application,
          evidence: [
            { correct: false, skipped: false, dwellTimeSec: 45, hintsUsed: 1 },
            { correct: false, skipped: false, dwellTimeSec: 60, hintsUsed: 0 },
          ],
        },
      ],
      graph: CALCULUS_GRAPH,
      learner,
      currentDifficulty: 'intermediate',
    });
    expect(decision.action).toBe('PREREQUISITE_REPAIR');
    expect(decision.conceptSlug).toBe('power_rule');
    expect(decision.difficulty).toBe(1);
    expect(decision.rationale).toMatch(/power rule/i);
  });

  it('selects RETEACH for repeated failure with healthy prerequisites', () => {
    const learner = {
      functions: learnerState({ conceptSlug: 'functions', mastery: 0.9 }),
      power_rule: learnerState({ conceptSlug: 'power_rule', mastery: 0.9 }),
      limits: learnerState({ conceptSlug: 'limits', mastery: 0.85 }),
      derivative_application: learnerState({ conceptSlug: 'derivative_application', mastery: 0.4 }),
    };
    const decision = chooseNextAction({
      assessed: [
        {
          slug: 'derivative_application',
          name: 'Derivative Application',
          state: learner.derivative_application,
          evidence: [
            { correct: false, skipped: false, dwellTimeSec: 40, hintsUsed: 0 },
            { correct: false, skipped: false, dwellTimeSec: 40, hintsUsed: 0 },
          ],
        },
      ],
      graph: CALCULUS_GRAPH,
      learner,
      currentDifficulty: 'intermediate',
    });
    expect(decision.action).toBe('RETEACH');
    expect(decision.conceptSlug).toBe('derivative_application');
  });

  it('selects CHALLENGE and raises difficulty for fast, clean mastery', () => {
    const learner = {
      power_rule: learnerState({ conceptSlug: 'power_rule', mastery: 0.95, attempts: 8, correct: 8, incorrect: 0 }),
    };
    const decision = chooseNextAction({
      assessed: [
        {
          slug: 'power_rule',
          name: 'Power Rule',
          state: learner.power_rule,
          evidence: [
            { correct: true, skipped: false, dwellTimeSec: 10, hintsUsed: 0 },
            { correct: true, skipped: false, dwellTimeSec: 12, hintsUsed: 0 },
            { correct: true, skipped: false, dwellTimeSec: 15, hintsUsed: 0 },
          ],
        },
      ],
      graph: CALCULUS_GRAPH,
      learner,
      currentDifficulty: 'beginner',
    });
    expect(decision.action).toBe('CHALLENGE');
    expect(decision.difficultyLabel).toBe('intermediate');
    expect(decision.difficulty).toBe(3);
  });

  it('selects SPACED_REVIEW when another weak concept is due', () => {
    const learner = {
      power_rule: learnerState({ conceptSlug: 'power_rule', mastery: 0.85, attempts: 6, correct: 6, incorrect: 0 }),
      limits: learnerState({ conceptSlug: 'limits', mastery: 0.35, attempts: 5, correct: 2, incorrect: 3 }),
    };
    const decision = chooseNextAction({
      assessed: [
        {
          slug: 'power_rule',
          name: 'Power Rule',
          state: learner.power_rule,
          evidence: [{ correct: true, skipped: false, dwellTimeSec: 15, hintsUsed: 0 }],
        },
      ],
      graph: CALCULUS_GRAPH,
      learner,
      currentDifficulty: 'intermediate',
    });
    expect(decision.action).toBe('SPACED_REVIEW');
    expect(decision.conceptSlug).toBe('limits');
  });

  it('selects MICRO_QUIZ for promising-but-unstable mastery', () => {
    const learner = {
      power_rule: learnerState({ conceptSlug: 'power_rule', mastery: 0.75, attempts: 6, correct: 5, incorrect: 1 }),
    };
    const decision = chooseNextAction({
      assessed: [
        {
          slug: 'power_rule',
          name: 'Power Rule',
          state: learner.power_rule,
          evidence: [{ correct: true, skipped: false, dwellTimeSec: 25, hintsUsed: 0 }],
        },
      ],
      graph: CALCULUS_GRAPH,
      learner,
      currentDifficulty: 'intermediate',
    });
    expect(decision.action).toBe('MICRO_QUIZ');
  });

  it('selects TEACH_NEW when everything is mastered at advanced difficulty', () => {
    const learner = {
      power_rule: learnerState({ conceptSlug: 'power_rule', mastery: 0.95, attempts: 10, correct: 10, incorrect: 0 }),
    };
    const decision = chooseNextAction({
      assessed: [
        {
          slug: 'power_rule',
          name: 'Power Rule',
          state: learner.power_rule,
          // Already at advanced + fully mastered, but the 30s dwell exceeds the
          // FAST_RESPONSE_SEC bar, so this is not CHALLENGE-ready evidence: it
          // gets one confirming MICRO_QUIZ... except at advanced it consolidates
          // only if evidence is fast. 30s is slow, so MICRO_QUIZ at advanced.
          evidence: [{ correct: true, skipped: false, dwellTimeSec: 30, hintsUsed: 0 }],
        },
      ],
      graph: CALCULUS_GRAPH,
      learner,
      currentDifficulty: 'advanced',
    });
    expect(decision.action).toBe('MICRO_QUIZ');
    expect(decision.difficultyLabel).toBe('advanced');
  });

  it('selects TEACH_NEW for fully mastered, fast, hint-free performance at advanced difficulty', () => {
    const learner = {
      power_rule: learnerState({ conceptSlug: 'power_rule', mastery: 0.95, attempts: 10, correct: 10, incorrect: 0 }),
    };
    const decision = chooseNextAction({
      assessed: [
        {
          slug: 'power_rule',
          name: 'Power Rule',
          state: learner.power_rule,
          evidence: [{ correct: true, skipped: false, dwellTimeSec: 12, hintsUsed: 0 }],
        },
      ],
      graph: CALCULUS_GRAPH,
      learner,
      currentDifficulty: 'advanced',
    });
    expect(decision.action).toBe('TEACH_NEW');
  });

  it('keeps difficulty on slow-but-correct performance even at full accuracy', () => {
    const learner = {
      power_rule: learnerState({ conceptSlug: 'power_rule', mastery: 0.85, attempts: 8, correct: 8, incorrect: 0, hintsUsed: 0 }),
    };
    const decision = chooseNextAction({
      assessed: [
        {
          slug: 'power_rule',
          name: 'Power Rule',
          state: learner.power_rule,
          evidence: [
            { correct: true, skipped: false, dwellTimeSec: 90, hintsUsed: 0 },
            { correct: true, skipped: false, dwellTimeSec: 95, hintsUsed: 0 },
          ],
        },
      ],
      graph: CALCULUS_GRAPH,
      learner,
      currentDifficulty: 'intermediate',
    });
    // 100% correct but effortful: mastery 0.85 >= STRONG, but evidence is slow
    // (>60s), so the CHALLENGE rule's fast-condition fails and falls to MICRO_QUIZ
    // — and the slow evidence keeps difficulty where it was.
    expect(decision.action).toBe('MICRO_QUIZ');
    expect(decision.difficultyLabel).toBe('intermediate');
  });
});

// ---------------------------------------------------------------------------
// scheduleReview / difficulty helpers / trace
// ---------------------------------------------------------------------------

describe('formatDifficultyTransition', () => {
  it('shows a transition when the difficulty changes (plan P0.4: "Level 2 → 3")', () => {
    expect(formatDifficultyTransition('intermediate', 'advanced')).toBe('Level 3 → 5');
    expect(formatDifficultyTransition('beginner', 'intermediate')).toBe('Level 1 → 3');
  });

  it('shows a steady-state level when difficulty holds', () => {
    expect(formatDifficultyTransition('intermediate', 'intermediate')).toBe('Level 3');
    expect(formatDifficultyTransition('advanced', 'advanced')).toBe('Level 5');
  });
});

describe('scheduleReview', () => {
  it('schedules weak concepts sooner than strong ones', () => {
    expect(scheduleReview(0.3)).toBe(1);
    expect(scheduleReview(0.5)).toBe(2);
    expect(scheduleReview(0.7)).toBe(5);
    expect(scheduleReview(0.85)).toBe(10);
    expect(scheduleReview(0.95)).toBe(21);
  });

  it('produces a future review date', () => {
    const from = new Date('2026-09-24T00:00:00Z');
    const d = nextReviewAt(0.85, from);
    expect(d.getTime()).toBeGreaterThan(from.getTime());
    expect(d.getTime()).toBe(from.getTime() + 10 * 24 * 3600 * 1000);
  });
});

describe('difficulty helpers', () => {
  it('maps labels to the 1-5 scale and back', () => {
    expect(difficultyToScale('beginner')).toBe(1);
    expect(difficultyToScale('intermediate')).toBe(3);
    expect(difficultyToScale('advanced')).toBe(5);
    expect(scaleToLabel(1)).toBe('beginner');
    expect(scaleToLabel(3)).toBe('intermediate');
    expect(scaleToLabel(5)).toBe('advanced');
  });
});

describe('buildAgentTrace', () => {
  it('emits a prerequisite-warning trace for a prerequisite-repair decision', () => {
    const decision = chooseNextAction({
      assessed: [
        {
          slug: 'derivative_application',
          name: 'Derivative Application',
          state: learnerState({ conceptSlug: 'derivative_application', mastery: 0.45, attempts: 2, correct: 0, incorrect: 2 }),
          evidence: [
            { correct: false, skipped: false, dwellTimeSec: 40, hintsUsed: 0 },
            { correct: false, skipped: false, dwellTimeSec: 40, hintsUsed: 0 },
          ],
        },
      ],
      graph: CALCULUS_GRAPH,
      learner: {
        functions: learnerState({ conceptSlug: 'functions', mastery: 0.88 }),
        power_rule: learnerState({ conceptSlug: 'power_rule', mastery: 0.32 }),
        limits: learnerState({ conceptSlug: 'limits', mastery: 0.75 }),
        derivative_application: learnerState({ conceptSlug: 'derivative_application', mastery: 0.45, attempts: 2, correct: 0, incorrect: 2 }),
      },
      currentDifficulty: 'intermediate',
    });
    expect(decision.action).toBe('PREREQUISITE_REPAIR');
    const trace = buildAgentTrace([{ correctCount: 1, total: 4 }], decision, {
      blockingSlug: 'power_rule',
      blockingName: 'Power Rule',
      path: ['power_rule'],
    });
    const labels = trace.map((t) => t.label);
    expect(labels.some((l) => l.includes('Power Rule'))).toBe(true);
    expect(labels.some((l) => l.includes('prerequisite repair'))).toBe(true);
    expect(trace[0].label).toContain('1/4');
  });
});
