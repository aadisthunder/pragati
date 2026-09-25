/**
 * Pragati Adaptive Agent — pure decision core.
 *
 * This module is deliberately free of Deno APIs, network calls, and LLM calls:
 * it is a deterministic function of (learner state, concept graph, evidence).
 * Determinism is the point — the same evidence always yields the same next
 * action, which makes the adaptation testable, evaluable, and demo-safe.
 *
 * Division of labor:
 *   - This core DECIDES (which action, which concept, which difficulty, why).
 *   - The LLM only GENERATES content (lessons, quizzes, phrasing).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NextAction =
  | 'TEACH_NEW'
  | 'SOCRATIC'
  | 'MICRO_QUIZ'
  | 'RETEACH'
  | 'PREREQUISITE_REPAIR'
  | 'SPACED_REVIEW'
  | 'CHALLENGE';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

/** Difficulty expressed on a 1–5 scale for UI display. */
export type DifficultyScale = 1 | 2 | 3 | 4 | 5;

export interface ConceptNode {
  id: string;
  name: string;
  slug: string;
  /** Slugs of concepts that should be known before this one. */
  prerequisites: string[];
}

export interface ConceptGraph {
  bySlug: Record<string, ConceptNode>;
}

export interface LearnerConceptState {
  conceptSlug: string;
  mastery: number; // 0..1
  attempts: number;
  correct: number;
  incorrect: number;
  hintsUsed: number;
  /** Average seconds spent per question on this concept. */
  avgResponseTimeSec: number;
}

export interface ConceptEvidence {
  /** Question outcome on this concept during the latest assessment. */
  correct: boolean;
  skipped: boolean;
  dwellTimeSec: number;
  hintsUsed: number;
}

/** One entry of the visible agent trace. Structured events only — no CoT. */
export interface TraceEvent {
  symbol: 'ok' | 'warn' | 'action' | 'info';
  label: string;
}

export interface AdaptiveDecision {
  action: NextAction;
  conceptSlug: string | null;
  conceptName: string | null;
  /** 1–5 scale shown in the UI as "Adaptive difficulty: Level N". */
  difficulty: DifficultyScale;
  difficultyLabel: DifficultyLevel;
  /** One sentence, user-facing. No hidden reasoning. */
  rationale: string;
  expectedOutcome: string;
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
// Constants
// ---------------------------------------------------------------------------

export const MASTERY_THRESHOLDS = {
  /** Below this, the concept is considered un-learned and needs teaching. */
  WEAK: 0.4,
  /** Below this, the concept is still consolidating. */
  DEVELOPING: 0.7,
  /** At or above this, the learner is ready for a challenge. */
  STRONG: 0.8,
  /** Review interval bands (days) by mastery. */
  REVIEW_DAYS: { weak: 1, developing: 2, good: 5, strong: 10, mastered: 21 },
} as const;

export const DIFFICULTY_LEVELS: DifficultyLevel[] = ['beginner', 'intermediate', 'advanced'];

const FAST_RESPONSE_SEC = 20; // faster than this counts as "fast recall"
const SLOW_RESPONSE_SEC = 60; // slower than this counts as "effortful"

/** Human-readable trace/UI labels for each action. */
export const ACTION_LABELS: Record<NextAction, string> = {
  TEACH_NEW: 'teach new material',
  SOCRATIC: 'socratic dialogue',
  MICRO_QUIZ: 'micro quiz',
  RETEACH: 'reteach',
  PREREQUISITE_REPAIR: 'prerequisite repair',
  SPACED_REVIEW: 'spaced review',
  CHALLENGE: 'challenge',
};

// ---------------------------------------------------------------------------
// Difficulty helpers
// ---------------------------------------------------------------------------

export function difficultyToScale(label: DifficultyLevel): DifficultyScale {
  return label === 'beginner' ? 1 : label === 'intermediate' ? 3 : 5;
}

/**
 * Renders the difficulty display for the results screen (plan P0.4):
 * "Level 2 → 3" on a transition, "Level N" when steady.
 */
export function formatDifficultyTransition(
  from: DifficultyLevel,
  to: DifficultyLevel
): string {
  const fromScale = difficultyToScale(from);
  const toScale = difficultyToScale(to);
  return fromScale === toScale ? `Level ${toScale}` : `Level ${fromScale} → ${toScale}`;
}

export function scaleToLabel(scale: number): DifficultyLabel {
  if (scale <= 2) return 'beginner';
  if (scale <= 4) return 'intermediate';
  return 'advanced';
}

type DifficultyLabel = DifficultyLevel;

// ---------------------------------------------------------------------------
// Mastery update
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
      // Correct: full credit, damped by hints and by slowness.
      const hintPenalty = Math.min(0.3, 0.15 * ev.hintsUsed);
      const speedPenalty = ev.dwellTimeSec > SLOW_RESPONSE_SEC ? 0.15 : 0;
      evidenceScore += 1 - hintPenalty - speedPenalty;
    } else {
      // Incorrect: small partial credit for engagement, more if hints were low.
      evidenceScore += ev.hintsUsed === 0 ? 0.1 : 0;
    }
    if (ev.correct && !ev.skipped) correctDelta++;
    hintsDelta += ev.hintsUsed;
    dwellSum += Math.max(0, ev.dwellTimeSec);
  }

  const avgEvidence = attemptsDelta > 0 ? evidenceScore / attemptsDelta : 0.5;

  // Evidence-damped blend: more prior attempts -> the new evidence moves less.
  const priorWeight = 1 / (1 + base.attempts);
  let nextMastery = clamp01(base.mastery * (1 - priorWeight) + avgEvidence * priorWeight);

  // Uncertainty cap: a learner with zero prior history cannot demonstrate full
  // mastery from a single assessment, however clean the evidence looks.
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
// Prerequisite diagnosis
// ---------------------------------------------------------------------------

export interface PrerequisiteDiagnosis {
  /** Weakest prerequisite on the path, or null if none are weak. */
  blockingSlug: string | null;
  blockingName: string | null;
  path: string[];
}

/**
 * Finds the weakest prerequisite on the dependency path to a failing concept.
 * BFS upward through prerequisite edges, always descending toward the weakest
 * mastered ancestor so the recommendation is the true root cause, not just the
 * nearest neighbor.
 */
export function diagnosePrerequisite(
  failedSlug: string,
  graph: ConceptGraph,
  learner: Record<string, LearnerConceptState>
): PrerequisiteDiagnosis {
  const start = graph.bySlug[failedSlug];
  if (!start || start.prerequisites.length === 0) {
    return { blockingSlug: null, blockingName: null, path: [] };
  }

  const path: string[] = [];
  let current = start;
  let blocking: ConceptNode | null = null;

  const seen = new Set<string>();
  for (;;) {
    const candidates = current.prerequisites
      .map((slug) => graph.bySlug[slug])
      .filter((n): n is ConceptNode => Boolean(n) && !seen.has(n.slug));
    if (candidates.length === 0) break;

    // Prefer the weakest prerequisite; ties break toward the earlier one.
    candidates.sort(
      (a, b) => (learner[a.slug]?.mastery ?? 0.5) - (learner[b.slug]?.mastery ?? 0.5)
    );
    const weakest = candidates[0];
    const weakestMastery = learner[weakest.slug]?.mastery ?? 0.5;

    if (weakestMastery >= MASTERY_THRESHOLDS.DEVELOPING) {
      // Prerequisites are healthy — the failure is on the concept itself.
      break;
    }

    // A prerequisite with no assessment evidence cannot be diagnosed as weak —
    // defaulting unknown concepts to "weak" would fabricate root causes.
    const st = learner[weakest.slug];
    const hasEvidence = Boolean(st && st.attempts > 0);
    if (!hasEvidence || (st as LearnerConceptState).mastery >= MASTERY_THRESHOLDS.DEVELOPING) {
      break;
    }

    seen.add(weakest.slug);
    path.push(weakest.slug);
    blocking = weakest;
    current = weakest;
  }

  return {
    blockingSlug: blocking?.slug ?? null,
    blockingName: blocking?.name ?? null,
    path,
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

// ---------------------------------------------------------------------------
// Next-action decision
// ---------------------------------------------------------------------------

export interface DecisionInput {
  /** Concepts exercised by the assessment just completed. */
  assessed: Array<{
    slug: string;
    name: string;
    /** Post-update learner state for this concept. */
    state: LearnerConceptState;
    /** Evidence from the assessment (per question mapped to this concept). */
    evidence: ConceptEvidence[];
  }>;
  graph: ConceptGraph;
  /** Full learner state (slug -> state), including previously known concepts. */
  learner: Record<string, LearnerConceptState>;
  /** Current quiz difficulty label, for adaptive difficulty transitions. */
  currentDifficulty: DifficultyLevel;
}

/**
 * Deterministic next-action rules, evaluated in priority order:
 *   1. Repeated failure (>=2 wrong) on a concept with a weak prerequisite
 *      -> PREREQUISITE_REPAIR on the root cause.
 *   2. Repeated failure without a prerequisite cause -> RETEACH.
 *   3. Concept below weak threshold but some evidence of learning -> RETEACH.
 *   4. Due-for-review weak concepts exist -> SPACED_REVIEW.
 *   5. Strong mastery, fast, hint-free -> CHALLENGE.
 *   6. Solid mid-band performance -> MICRO_QUIZ to confirm.
 *   7. Default -> TEACH_NEW.
 */
export function chooseNextAction(input: DecisionInput): AdaptiveDecision {
  const { assessed, graph, learner, currentDifficulty } = input;

  // Pick the concept with the most negative evidence as the focus.
  const focus =
    assessed.length > 0
      ? assessed.reduce((worst, a) => {
          const scoreOf = (x: typeof a) => {
            const s = x.state;
            const acc = s.attempts > 0 ? s.correct / s.attempts : 0;
            return acc - (s.hintsUsed > 0 ? 0.1 : 0);
          };
          return scoreOf(a) < scoreOf(worst) ? a : worst;
        })
      : null;

  const focusAcc = focus && focus.state.attempts > 0 ? focus.state.correct / focus.state.attempts : 1;

  // Rule 1 — repeated failure with a prerequisite cause.
  if (focus && focusAcc <= 0.5 && focus.state.attempts >= 2) {
    const diagnosis = diagnosePrerequisite(focus.slug, graph, learner);
    if (diagnosis.blockingSlug) {
      const blockingState = learner[diagnosis.blockingSlug];
      return {
        action: 'PREREQUISITE_REPAIR',
        conceptSlug: diagnosis.blockingSlug,
        conceptName: diagnosis.blockingName,
        difficulty: 1,
        difficultyLabel: 'beginner',
        rationale: `You missed ${focus.state.incorrect} ${focus.slug} questions and its prerequisite "${diagnosis.blockingName}" sits at ${pct(blockingState?.mastery ?? 0.5)}. Pragati is repairing that prerequisite before retesting.`,
        expectedOutcome: `Restore ${diagnosis.blockingName} above ${pct(MASTERY_THRESHOLDS.DEVELOPING)}, then retest ${focus.name}.`,
      };
    }

    // Rule 2 — repeated failure, prerequisites healthy: re-teach directly.
    return {
      action: 'RETEACH',
      conceptSlug: focus.slug,
      conceptName: focus.name,
      difficulty: difficultyToScale(currentDifficulty),
      difficultyLabel: currentDifficulty,
      rationale: `You missed ${focus.state.incorrect} of ${focus.state.attempts} ${focus.name} questions with healthy prerequisites, so the concept itself needs re-teaching.`,
      expectedOutcome: `A focused re-teach of ${focus.name}, then a micro-check.`,
    };
  }

  // Rule 3 — single-concept evidence below weak threshold.
  if (focus && focus.state.mastery < MASTERY_THRESHOLDS.WEAK) {
    return {
      action: 'RETEACH',
      conceptSlug: focus.slug,
      conceptName: focus.name,
      difficulty: difficultyToScale(currentDifficulty),
      difficultyLabel: currentDifficulty,
      rationale: `${focus.name} mastery is ${pct(focus.state.mastery)} — below the learning threshold — so Pragati re-teaches it before more testing.`,
      expectedOutcome: `Lift ${focus.name} above ${pct(MASTERY_THRESHOLDS.WEAK)} with a targeted lesson.`,
    };
  }

  // Rule 4 — due reviews dominate once the fresh assessment is handled.
  const dueReview = Object.entries(learner)
    .filter(([slug]) => !assessed.some((a) => a.slug === slug))
    .map(([slug, s]) => ({ slug, s }))
    .filter(({ s }) => s.mastery < MASTERY_THRESHOLDS.DEVELOPING && s.attempts > 0)
    .sort((a, b) => a.s.mastery - b.s.mastery)[0];
  if (dueReview) {
    return {
      action: 'SPACED_REVIEW',
      conceptSlug: dueReview.slug,
      conceptName: graph.bySlug[dueReview.slug]?.name ?? dueReview.slug,
      difficulty: difficultyToScale(currentDifficulty),
      difficultyLabel: currentDifficulty,
      rationale: `${graph.bySlug[dueReview.slug]?.name ?? dueReview.slug} has decayed to ${pct(dueReview.s.mastery)} and is due for review — recall practice now prevents re-learning later.`,
      expectedOutcome: `Quick recall checks on ${graph.bySlug[dueReview.slug]?.name ?? dueReview.slug} to stabilize retention.`,
    };
  }

  // Rule 5 — strong, fast, hint-free evidence -> raise the challenge.
  const challengeReady =
    !!focus &&
    focusAcc === 1 &&
    focus.state.mastery >= MASTERY_THRESHOLDS.STRONG &&
    focus.evidence.length > 0 &&
    focus.evidence.every(
      (ev) => ev.correct && ev.hintsUsed === 0 && ev.dwellTimeSec <= FAST_RESPONSE_SEC
    );
  if (focus && challengeReady && currentDifficulty !== 'advanced') {
    const nextLabel: DifficultyLevel =
      currentDifficulty === 'beginner' ? 'intermediate' : 'advanced';
    return {
      action: 'CHALLENGE',
      conceptSlug: focus.slug,
      conceptName: focus.name,
      difficulty: difficultyToScale(nextLabel),
      difficultyLabel: nextLabel,
      rationale: `You answered every ${focus.name} question correctly, quickly, and without hints, so Pragati raises the difficulty.`,
      expectedOutcome: `Harder ${nextLabel} problems to stretch ${focus.name} mastery.`,
    };
  }

  // Rule 6 — anything not yet challenge-ready gets consolidated with a micro
  // quiz first (including slow-but-perfect performance: speed is part of
  // demonstrated mastery). Only a challenge-ready learner already at advanced
  // difficulty skips past this to TEACH_NEW.
  if (focus && !(challengeReady && currentDifficulty === 'advanced')) {
    // Difficulty rises only on fast, hint-free, fully-correct evidence.
    // Slow-but-correct performance keeps the current difficulty (accuracy is
    // proven, fluency is not) — do not treat a high score as full mastery.
    const evidenceCleanAndFast =
      focus.evidence.length > 0 &&
      focus.evidence.every(
        (ev) => ev.correct && ev.hintsUsed === 0 && ev.dwellTimeSec <= FAST_RESPONSE_SEC
      );
    const nextLabel: DifficultyLevel =
      focusAcc === 1 && evidenceCleanAndFast && currentDifficulty !== 'advanced'
        ? currentDifficulty === 'beginner'
          ? 'intermediate'
          : 'advanced'
        : currentDifficulty;
    return {
      action: 'MICRO_QUIZ',
      conceptSlug: focus.slug,
      conceptName: focus.name,
      difficulty: difficultyToScale(nextLabel),
      difficultyLabel: nextLabel,
      rationale: `${focus.name} mastery is ${pct(focus.state.mastery)} — promising but not yet proven stable, so Pragati confirms it with a short micro-quiz.`,
      expectedOutcome: `Consolidate ${focus.name} to above ${pct(MASTERY_THRESHOLDS.STRONG)}.`,
    };
  }

  // Rule 7 — default: teach something new.
  return {
    action: 'TEACH_NEW',
    conceptSlug: focus?.slug ?? null,
    conceptName: focus?.name ?? null,
    difficulty: difficultyToScale(currentDifficulty),
    difficultyLabel: currentDifficulty,
    rationale: 'You have demonstrated solid mastery here, so Pragati is ready to move you forward to new material.',
    expectedOutcome: 'Introduce the next concept that builds on what you just mastered.',
  };
}

// ---------------------------------------------------------------------------
// Agent trace builder
// ---------------------------------------------------------------------------

/**
 * Builds the visible agent trace from a decision. Structured events only:
 * no hidden chain-of-thought, no model internals — just what happened and why,
 * in ordered, human-readable steps.
 */
export function buildAgentTrace(
  events: Array<{ correctCount: number; total: number }>,
  decision: AdaptiveDecision,
  diagnosis?: PrerequisiteDiagnosis
): TraceEvent[] {
  const trace: TraceEvent[] = [];
  const total = events.reduce((acc, e) => acc + e.total, 0);
  const correct = events.reduce((acc, e) => acc + e.correctCount, 0);

  trace.push({ symbol: 'ok', label: `Observation recorded (${correct}/${total} correct)` });
  trace.push({ symbol: 'ok', label: 'Concept mastery updated from quiz evidence' });

  const failed = total - correct;
  if (failed > 0) {
    if (diagnosis?.blockingSlug) {
      trace.push({
        symbol: 'warn',
        label: `Prerequisite weakness detected: ${diagnosis.blockingName}`,
      });
    } else {
      trace.push({ symbol: 'warn', label: 'Knowledge gap detected' });
    }
  }

  trace.push({ symbol: 'action', label: `Selected ${ACTION_LABELS[decision.action]}` });
  trace.push({ symbol: 'info', label: `Next: ${decision.expectedOutcome}` });
  return trace;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
