export type QuizDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

/** The 4-tier difficulty ladder, in ascending order. */
export const QUIZ_DIFFICULTIES: QuizDifficulty[] = ['beginner', 'intermediate', 'advanced', 'expert'];

/**
 * Calculates adaptive quiz difficulty based on the current mastery percentage:
 * - < 50%: beginner (foundational reinforcement)
 * - 50% - 79%: intermediate (application & core understanding)
 * - 80% - 89%: advanced (deep mastery, edge cases, higher cognitive rigor)
 * - >= 90%: expert (synthesis, transfer problems, near-exam rigor)
 */
export function calculateTargetDifficulty(masteryPct: number): QuizDifficulty {
  const clamped = Math.max(0, Math.min(100, Number(masteryPct) || 0));
  if (clamped < 50) return 'beginner';
  if (clamped < 80) return 'intermediate';
  if (clamped < 90) return 'advanced';
  return 'expert';
}

export interface GoalForPrompt {
  title: string;
  masteryPct: number;
  subtopics?: Array<{ name: string; masteryPct?: number }>;
}

/**
 * Builds the prompt sent to the AI Instructor when a student clicks "Test Me".
 * Passes the learning goal / topic name cleanly so the agent's check_topic_mastery
 * tool can inspect live mastery and present adapted subtopics dynamically.
 */
export function buildTestMePrompt(goal: GoalForPrompt): string {
  const title = (goal.title || '').trim();
  return `Test me on my learning goal "${title}".`;
}
