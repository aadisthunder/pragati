/**
 * Starter topics offered as one-click chips in the "What do you want to
 * master?" popup. Pure data (unit-tested) so the modal stays presentational.
 * Must NOT contain topics the judge demo account already has seeded
 * (duplicate goals are rejected with 409 by POST /api/goals).
 *
 * Deliberately spans six distinct domains — sciences, math, programming,
 * humanities, language, and AI — to signal that Pragati is a complete
 * learning agent for ANY subject, not a single-domain quiz tool.
 */
export const SUGGESTION_TOPICS: string[] = [
  'Organic Chemistry',
  'Linear Algebra',
  'Python Programming',
  'World History',
  'Conversational Spanish',
  'Neural Networks',
];

/**
 * One-click chips rendered between the goal input and the "Create my learning
 * plan" CTA. Tapping a chip fills the input verbatim so users (and judges) can
 * start from a real example instead of a blank field.
 */
export const SUGGESTION_CHIPS: string[] = SUGGESTION_TOPICS;

/** Chip styling: neutral pill when idle, dark filled when selected. */
export function getGoalSuggestionChipClass(isActive: boolean): string {
  return isActive
    ? 'inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-900 bg-slate-900 text-white shadow-xs transition-all cursor-pointer active:scale-[0.97] shrink-0'
    : 'inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400 hover:bg-white hover:text-slate-900 shadow-xs transition-all cursor-pointer active:scale-[0.97] shrink-0';
}
