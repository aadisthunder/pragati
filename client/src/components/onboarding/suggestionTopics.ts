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
