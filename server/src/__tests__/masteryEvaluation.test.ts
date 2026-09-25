/**
 * Pragati adaptive-agent evaluation harness.
 *
 * Deterministic learner scenarios asserting what the decision core SHOULD do.
 * The measured pass rates from these scenarios are the only adaptation metrics
 * Pragati publishes — never fabricated numbers. Run via:
 *   npm --prefix server test
 * The summary logged by this suite is the source for the README's metrics table.
 */
import { describe, it, expect } from 'vitest';
import {
  chooseNextAction,
  diagnosePrerequisite,
  scheduleReview,
  updateMastery,
  type ConceptGraph,
  type LearnerConceptState,
  type AdaptiveDecision,
  type ConceptEvidence,
} from '../../../supabase/functions/api/_shared/mastery';

// ---------------------------------------------------------------------------
// Scenario fixture types
// ---------------------------------------------------------------------------

interface EvalScenario {
  id: string;
  category: string;
  /** Learner state for every known concept before the assessment. */
  learner: Record<string, LearnerConceptState>;
  /** The assessment's evidence, keyed by the concept it exercises. */
  assessed: Array<{ slug: string; name: string; evidence: ConceptEvidence[] }>;
  currentDifficulty: 'beginner' | 'intermediate' | 'advanced';
  expectedAction: string;
  /** Optional: the exact concept the action should target. */
  expectedConcept?: string;
  /** Optional: expected difficulty label after the decision. */
  expectedDifficulty?: 'beginner' | 'intermediate' | 'advanced';
}

// ---------------------------------------------------------------------------
// Shared Calculus graph
// ---------------------------------------------------------------------------

const GRAPH: ConceptGraph = {
  bySlug: {
    functions: { id: 'c1', name: 'Functions', slug: 'functions', prerequisites: [] },
    limits: { id: 'c2', name: 'Limits', slug: 'limits', prerequisites: ['functions'] },
    power_rule: { id: 'c3', name: 'Power Rule', slug: 'power_rule', prerequisites: ['functions'] },
    chain_rule: { id: 'c4', name: 'Chain Rule', slug: 'chain_rule', prerequisites: ['power_rule'] },
    derivative_application: {
      id: 'c5',
      name: 'Derivative Application',
      slug: 'derivative_application',
      prerequisites: ['power_rule', 'limits'],
    },
  },
};

function st(slug: string, mastery: number, opts: Partial<LearnerConceptState> = {}): LearnerConceptState {
  return {
    conceptSlug: slug,
    mastery,
    attempts: 4,
    correct: Math.round(mastery * 4),
    incorrect: 4 - Math.round(mastery * 4),
    hintsUsed: 0,
    avgResponseTimeSec: 30,
    ...opts,
  };
}

function ev(correct: boolean, dwell = 30, hints = 0, skipped = false): ConceptEvidence {
  return { correct, skipped, dwellTimeSec: dwell, hintsUsed: hints };
}

// ---------------------------------------------------------------------------
// The 26 deterministic evaluation scenarios
// ---------------------------------------------------------------------------

const SCENARIOS: EvalScenario[] = [
  // --- Hidden prerequisite (the flagship behavior) --------------------------
  {
    id: 'hidden-prereq-power-rule',
    category: 'hidden prerequisite',
    learner: {
      functions: st('functions', 0.88),
      limits: st('limits', 0.75),
      power_rule: st('power_rule', 0.32),
      derivative_application: st('derivative_application', 0.47),
    },
    assessed: [
      { slug: 'derivative_application', name: 'Derivative Application', evidence: [ev(false, 45, 1), ev(false, 60), ev(false, 50)] },
    ],
    currentDifficulty: 'intermediate',
    expectedAction: 'PREREQUISITE_REPAIR',
    expectedConcept: 'power_rule',
  },
  {
    id: 'hidden-prereq-chain-rule',
    category: 'hidden prerequisite',
    learner: {
      functions: st('functions', 0.85),
      limits: st('limits', 0.8),
      power_rule: st('power_rule', 0.35),
      chain_rule: st('chain_rule', 0.4),
    },
    assessed: [{ slug: 'chain_rule', name: 'Chain Rule', evidence: [ev(false, 55), ev(false, 60, 1)] }],
    currentDifficulty: 'intermediate',
    expectedAction: 'PREREQUISITE_REPAIR',
    expectedConcept: 'power_rule',
  },
  {
    id: 'hidden-prereq-deep-chain',
    category: 'hidden prerequisite',
    learner: {
      functions: st('functions', 0.2),
      limits: st('limits', 0.8),
      power_rule: st('power_rule', 0.3),
      derivative_application: st('derivative_application', 0.35),
    },
    assessed: [
      { slug: 'derivative_application', name: 'Derivative Application', evidence: [ev(false, 40), ev(false, 45)] },
    ],
    currentDifficulty: 'intermediate',
    expectedAction: 'PREREQUISITE_REPAIR',
    expectedConcept: 'functions',
  },
  {
    id: 'no-prereq-issue-healthy-foundation',
    category: 'hidden prerequisite',
    learner: {
      functions: st('functions', 0.9),
      limits: st('limits', 0.85),
      power_rule: st('power_rule', 0.9),
      derivative_application: st('derivative_application', 0.35),
    },
    assessed: [
      { slug: 'derivative_application', name: 'Derivative Application', evidence: [ev(false, 40), ev(false, 45)] },
    ],
    currentDifficulty: 'intermediate',
    expectedAction: 'RETEACH',
    expectedConcept: 'derivative_application',
  },

  // --- Repeated failure / repeated success ---------------------------------
  {
    id: 'repeated-failure-reteach',
    category: 'repeated failure',
    learner: {
      power_rule: st('power_rule', 0.35, { attempts: 6, correct: 2, incorrect: 4 }),
    },
    assessed: [{ slug: 'power_rule', name: 'Power Rule', evidence: [ev(false), ev(false)] }],
    currentDifficulty: 'intermediate',
    expectedAction: 'RETEACH',
    expectedConcept: 'power_rule',
  },
  {
    id: 'repeated-failure-with-hints',
    category: 'repeated failure',
    learner: {
      limits: st('limits', 0.38, { attempts: 5, correct: 2, incorrect: 3 }),
    },
    assessed: [{ slug: 'limits', name: 'Limits', evidence: [ev(false, 70, 2), ev(false, 65, 2)] }],
    currentDifficulty: 'beginner',
    expectedAction: 'RETEACH',
    expectedConcept: 'limits',
  },
  {
    id: 'repeated-success-fast-clean',
    category: 'repeated success',
    learner: {
      power_rule: st('power_rule', 0.95, { attempts: 10, correct: 10, incorrect: 0 }),
    },
    assessed: [{ slug: 'power_rule', name: 'Power Rule', evidence: [ev(true, 10), ev(true, 12), ev(true, 15)] }],
    currentDifficulty: 'beginner',
    expectedAction: 'CHALLENGE',
    expectedConcept: 'power_rule',
    expectedDifficulty: 'intermediate',
  },
  {
    id: 'repeated-success-advanced-teaches-new',
    category: 'repeated success',
    learner: {
      power_rule: st('power_rule', 0.96, { attempts: 12, correct: 12, incorrect: 0 }),
    },
    assessed: [{ slug: 'power_rule', name: 'Power Rule', evidence: [ev(true, 10), ev(true, 14)] }],
    currentDifficulty: 'advanced',
    expectedAction: 'TEACH_NEW',
    expectedConcept: 'power_rule',
  },

  // --- Fast correct / slow correct -----------------------------------------
  {
    id: 'slow-correct-not-full-mastery',
    category: 'slow correct',
    learner: {
      power_rule: st('power_rule', 0.85, { attempts: 8, correct: 8, incorrect: 0, avgResponseTimeSec: 90 }),
    },
    assessed: [{ slug: 'power_rule', name: 'Power Rule', evidence: [ev(true, 90), ev(true, 95)] }],
    currentDifficulty: 'intermediate',
    expectedAction: 'MICRO_QUIZ',
    expectedConcept: 'power_rule',
    expectedDifficulty: 'intermediate',
  },
  {
    id: 'fast-correct-mid-band-confirms',
    category: 'fast correct',
    learner: {
      power_rule: st('power_rule', 0.7, { attempts: 6, correct: 5, incorrect: 1 }),
    },
    assessed: [{ slug: 'power_rule', name: 'Power Rule', evidence: [ev(true, 15), ev(true, 18)] }],
    currentDifficulty: 'intermediate',
    expectedAction: 'MICRO_QUIZ',
    expectedConcept: 'power_rule',
    expectedDifficulty: 'intermediate',
  },
  {
    id: 'fast-correct-full-accuracy-bumps-difficulty',
    category: 'fast correct',
    learner: {
      power_rule: st('power_rule', 0.82, { attempts: 6, correct: 6, incorrect: 0 }),
    },
    assessed: [{ slug: 'power_rule', name: 'Power Rule', evidence: [ev(true, 12), ev(true, 15)] }],
    currentDifficulty: 'beginner',
    // Fully mastered (0.82 >= STRONG), 100% fast clean accuracy at beginner ->
    // the engine CHALLENGES upward to intermediate (MICRO_QUIZ would stall a
    // learner who has already demonstrated stable mastery).
    expectedAction: 'CHALLENGE',
    expectedConcept: 'power_rule',
    expectedDifficulty: 'intermediate',
  },

  // --- Hint dependency ------------------------------------------------------
  {
    id: 'hint-dependency-correct-but-reliant',
    category: 'hint dependency',
    learner: {
      limits: st('limits', 0.75, { attempts: 6, correct: 5, incorrect: 1, hintsUsed: 5 }),
    },
    assessed: [{ slug: 'limits', name: 'Limits', evidence: [ev(true, 40, 2), ev(true, 45, 2)] }],
    currentDifficulty: 'intermediate',
    expectedAction: 'MICRO_QUIZ',
    expectedConcept: 'limits',
    expectedDifficulty: 'intermediate',
  },
  {
    id: 'hint-free-mastery-challenges',
    category: 'hint dependency',
    learner: {
      limits: st('limits', 0.9, { attempts: 8, correct: 8, incorrect: 0, hintsUsed: 0 }),
    },
    assessed: [{ slug: 'limits', name: 'Limits', evidence: [ev(true, 15), ev(true, 12), ev(true, 18)] }],
    currentDifficulty: 'intermediate',
    expectedAction: 'CHALLENGE',
    expectedConcept: 'limits',
    expectedDifficulty: 'advanced',
  },

  // --- Spaced review / decay -----------------------------------------------
  {
    id: 'due-review-dominates',
    category: 'spaced review',
    learner: {
      power_rule: st('power_rule', 0.85, { attempts: 6, correct: 6, incorrect: 0 }),
      limits: st('limits', 0.35, { attempts: 5, correct: 2, incorrect: 3 }),
    },
    assessed: [{ slug: 'power_rule', name: 'Power Rule', evidence: [ev(true, 15)] }],
    currentDifficulty: 'intermediate',
    expectedAction: 'SPACED_REVIEW',
    expectedConcept: 'limits',
  },
  {
    id: 'weakest-due-concept-prioritized',
    category: 'spaced review',
    learner: {
      power_rule: st('power_rule', 0.9, { attempts: 6, correct: 6, incorrect: 0 }),
      limits: st('limits', 0.45),
      functions: st('functions', 0.3),
    },
    assessed: [{ slug: 'power_rule', name: 'Power Rule', evidence: [ev(true, 15)] }],
    currentDifficulty: 'intermediate',
    expectedAction: 'SPACED_REVIEW',
    expectedConcept: 'functions',
  },
  {
    id: 'no-review-when-all-healthy',
    category: 'spaced review',
    learner: {
      power_rule: st('power_rule', 0.85, { attempts: 6, correct: 6, incorrect: 0 }),
      limits: st('limits', 0.75),
    },
    assessed: [{ slug: 'power_rule', name: 'Power Rule', evidence: [ev(true, 15)] }],
    currentDifficulty: 'intermediate',
    // No due reviews, mastery STRONG and all evidence fast+clean -> CHALLENGE.
    expectedAction: 'CHALLENGE',
    expectedConcept: 'power_rule',
    expectedDifficulty: 'advanced',
  },

  // --- Topic switching / default behavior -----------------------------------
  {
    id: 'everything-mastered-teaches-new',
    category: 'topic switching',
    learner: {
      power_rule: st('power_rule', 0.92, { attempts: 8, correct: 8, incorrect: 0 }),
      limits: st('limits', 0.85),
    },
    assessed: [{ slug: 'power_rule', name: 'Power Rule', evidence: [ev(true, 15)] }],
    currentDifficulty: 'advanced',
    expectedAction: 'TEACH_NEW',
  },
  {
    id: 'weak-single-concept-reteach',
    category: 'obvious weakness',
    learner: {
      functions: st('functions', 0.3, { attempts: 3, correct: 1, incorrect: 2 }),
    },
    assessed: [{ slug: 'functions', name: 'Functions', evidence: [ev(false, 50)] }],
    currentDifficulty: 'beginner',
    expectedAction: 'RETEACH',
    expectedConcept: 'functions',
  },
  {
    id: 'skip-counts-against',
    category: 'obvious weakness',
    learner: {
      limits: st('limits', 0.35, { attempts: 4, correct: 1, incorrect: 3 }),
    },
    assessed: [{ slug: 'limits', name: 'Limits', evidence: [ev(false, 10, 0, true), ev(false, 40)] }],
    currentDifficulty: 'intermediate',
    expectedAction: 'RETEACH',
    expectedConcept: 'limits',
  },

  // --- Difficulty adaptation -------------------------------------------------
  {
    id: 'difficulty-never-drops-on-success',
    category: 'difficulty adaptation',
    learner: {
      power_rule: st('power_rule', 0.6, { attempts: 5, correct: 4, incorrect: 1 }),
    },
    assessed: [{ slug: 'power_rule', name: 'Power Rule', evidence: [ev(true, 12), ev(true, 10)] }],
    currentDifficulty: 'intermediate',
    expectedAction: 'MICRO_QUIZ',
    expectedConcept: 'power_rule',
    expectedDifficulty: 'intermediate',
  },
  {
    id: 'difficulty-stays-on-struggle',
    category: 'difficulty adaptation',
    learner: {
      power_rule: st('power_rule', 0.45, { attempts: 5, correct: 2, incorrect: 3 }),
    },
    assessed: [{ slug: 'power_rule', name: 'Power Rule', evidence: [ev(false, 50), ev(true, 40, 1)] }],
    currentDifficulty: 'intermediate',
    // 1 wrong of 2 with hints: mastery falls below WEAK -> a focused re-teach,
    // not more testing. Difficulty holds at intermediate.
    expectedAction: 'RETEACH',
    expectedConcept: 'power_rule',
    expectedDifficulty: 'intermediate',
  },
  {
    id: 'beginner-graduates-to-intermediate',
    category: 'difficulty adaptation',
    learner: {
      functions: st('functions', 0.95, { attempts: 8, correct: 8, incorrect: 0 }),
    },
    assessed: [{ slug: 'functions', name: 'Functions', evidence: [ev(true, 8), ev(true, 10), ev(true, 9)] }],
    currentDifficulty: 'beginner',
    expectedAction: 'CHALLENGE',
    expectedConcept: 'functions',
    expectedDifficulty: 'intermediate',
  },
  {
    id: 'intermediate-graduates-to-advanced',
    category: 'difficulty adaptation',
    learner: {
      functions: st('functions', 0.95, { attempts: 8, correct: 8, incorrect: 0 }),
    },
    assessed: [{ slug: 'functions', name: 'Functions', evidence: [ev(true, 8), ev(true, 10), ev(true, 9)] }],
    currentDifficulty: 'intermediate',
    expectedAction: 'CHALLENGE',
    expectedConcept: 'functions',
    expectedDifficulty: 'advanced',
  },
  {
    id: 'advanced-capped-no-beyond-advanced',
    category: 'difficulty adaptation',
    learner: {
      functions: st('functions', 0.98, { attempts: 10, correct: 10, incorrect: 0 }),
    },
    assessed: [{ slug: 'functions', name: 'Functions', evidence: [ev(true, 8), ev(true, 9)] }],
    currentDifficulty: 'advanced',
    expectedAction: 'TEACH_NEW',
    expectedConcept: 'functions',
  },
];

// ---------------------------------------------------------------------------
// Extra deterministic checks: mastery update + review scheduling
// ---------------------------------------------------------------------------

interface MasteryScenario {
  id: string;
  category: string;
  prevMastery: number | null;
  prevAttempts: number;
  evidence: ConceptEvidence[];
  /** Expected mastery direction after the update. */
  expectDirection: 'up' | 'down' | 'flat';
  /** Expected review days band for the post-update mastery. */
  expectReviewBand?: number[];
}

const MASTERY_SCENARIOS: MasteryScenario[] = [
  { id: 'cold-start-correct', category: 'mastery update', prevMastery: null, prevAttempts: 0, evidence: [ev(true, 15), ev(true, 18)], expectDirection: 'up', expectReviewBand: [5, 10] },
  { id: 'cold-start-wrong', category: 'mastery update', prevMastery: null, prevAttempts: 0, evidence: [ev(false, 50), ev(false, 60)], expectDirection: 'down', expectReviewBand: [1] },
  { id: 'strong-learner-single-miss', category: 'mastery update', prevMastery: 0.9, prevAttempts: 20, evidence: [ev(false, 40)], expectDirection: 'down', expectReviewBand: [5, 10] },
  { id: 'stable-no-thrash', category: 'mastery update', prevMastery: 0.9, prevAttempts: 20, evidence: [ev(false, 30), ev(false, 30)], expectDirection: 'down', expectReviewBand: [5, 10] },
  { id: 'hint-correct-moves-less', category: 'mastery update', prevMastery: null, prevAttempts: 0, evidence: [ev(true, 20, 2)], expectDirection: 'up', expectReviewBand: [2, 5] },
  { id: 'skip-is-negative', category: 'mastery update', prevMastery: null, prevAttempts: 0, evidence: [ev(false, 5, 0, true)], expectDirection: 'down', expectReviewBand: [1] },
];

// ---------------------------------------------------------------------------
// Runner: measures adaptation accuracy across all scenarios
// ---------------------------------------------------------------------------

function runScenarios() {
  const results: Array<{ id: string; category: string; pass: boolean; detail: string }> = [];

  for (const s of SCENARIOS) {
    const decision: AdaptiveDecision = chooseNextAction({
      assessed: s.assessed.map((a) => ({
        slug: a.slug,
        name: a.name,
        state: s.learner[a.slug],
        evidence: a.evidence,
      })),
      graph: GRAPH,
      learner: s.learner,
      currentDifficulty: s.currentDifficulty,
    });

    const actionOk = decision.action === s.expectedAction;
    const conceptOk = !s.expectedConcept || decision.conceptSlug === s.expectedConcept;
    const diffOk = !s.expectedDifficulty || decision.difficultyLabel === s.expectedDifficulty;
    const pass = actionOk && conceptOk && diffOk;

    results.push({
      id: s.id,
      category: s.category,
      pass,
      detail: `expected ${s.expectedAction}${s.expectedConcept ? `/${s.expectedConcept}` : ''}${s.expectedDifficulty ? `/${s.expectedDifficulty}` : ''}, got ${decision.action}/${decision.conceptSlug ?? '-'}/${decision.difficultyLabel}`,
    });
  }

  for (const m of MASTERY_SCENARIOS) {
    const prev = m.prevMastery === null ? null : st('x', m.prevMastery, { attempts: m.prevAttempts });
    const next = updateMastery(prev, m.evidence);
    const before = prev ? prev.mastery : 0.5;
    const dirOk =
      m.expectDirection === 'up' ? next.mastery > before : m.expectDirection === 'down' ? next.mastery < before : next.mastery === before;
    const bandOk = !m.expectReviewBand || m.expectReviewBand.includes(scheduleReview(next.mastery));
    results.push({
      id: m.id,
      category: m.category,
      pass: dirOk && bandOk,
      detail: `mastery ${before} -> ${next.mastery} (expected ${m.expectDirection}${m.expectReviewBand ? `, review in ${m.expectReviewBand.join('/')}` : ''} days; scheduled ${scheduleReview(next.mastery)})`,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// The suite: every scenario is a test, plus the summary metrics
// ---------------------------------------------------------------------------

const RESULTS = runScenarios();
const PASSED = RESULTS.filter((r) => r.pass);
const ACCURACY = Math.round((PASSED.length / RESULTS.length) * 100);

const BY_CATEGORY: Record<string, { total: number; passed: number }> = {};
for (const r of RESULTS) {
  BY_CATEGORY[r.category] ??= { total: 0, passed: 0 };
  BY_CATEGORY[r.category].total++;
  if (r.pass) BY_CATEGORY[r.category].passed++;
}

describe('Pragati adaptive-agent evaluation harness', () => {
  it('diagnoses prerequisite failures with root-cause accuracy', () => {
    const cat = RESULTS.filter((r) => r.category === 'hidden prerequisite');
    expect(cat.every((r) => r.pass)).toBe(true);
  });

  it('selects the correct next action in every deterministic scenario', () => {
    const failures = RESULTS.filter((r) => !r.pass);
    expect(failures).toEqual([]);
  });

  it('reports adaptation accuracy of at least 90%', () => {
    expect(ACCURACY).toBeGreaterThanOrEqual(90);
  });

  it('logs the measured metrics (source for README)', () => {
    const categoryLines = Object.entries(BY_CATEGORY)
      .map(([cat, s]) => `        ${cat}: ${s.passed}/${s.total} (${Math.round((s.passed / s.total) * 100)}%)`)
      .join('\n');
    console.info(
      [
        '',
        '  ┌─────────────────────────────────────────────────────────┐',
        '  │       Pragati Adaptive Engine — Evaluation Results      │',
        '  └─────────────────────────────────────────────────────────┘',
        `        Scenarios: ${RESULTS.length}`,
        `        Passed: ${PASSED.length}`,
        `        Adaptation accuracy: ${ACCURACY}%`,
        categoryLines,
      ].join('\n')
    );
    expect(PASSED.length).toBe(RESULTS.length);
  });
});

// Prerequisite diagnosis is also part of the harness.
describe('evaluation: prerequisite diagnosis accuracy', () => {
  it('finds the true root cause in a deep dependency chain', () => {
    const learner = {
      functions: st('functions', 0.2),
      limits: st('limits', 0.8),
      power_rule: st('power_rule', 0.3),
      chain_rule: st('chain_rule', 0.35),
      derivative_application: st('derivative_application', 0.4),
    };
    const d = diagnosePrerequisite('derivative_application', GRAPH, learner);
    expect(d.path).toEqual(['power_rule', 'functions']);
    expect(d.blockingSlug).toBe('functions');
  });

  it('stops at the failing concept when prerequisites are healthy', () => {
    const learner = {
      functions: st('functions', 0.9),
      limits: st('limits', 0.85),
      power_rule: st('power_rule', 0.88),
      derivative_application: st('derivative_application', 0.3),
    };
    const d = diagnosePrerequisite('derivative_application', GRAPH, learner);
    expect(d.blockingSlug).toBeNull();
  });
});
