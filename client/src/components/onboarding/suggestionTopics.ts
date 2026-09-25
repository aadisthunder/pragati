/**
 * Starter topics offered as one-click chips in the "What do you want to
 * master?" popup. Pure data (unit-tested) so the modal stays presentational.
 * Must NOT contain topics the judge demo account already has seeded
 * (duplicate goals are rejected with 409 by POST /api/goals).
 */
export const SUGGESTION_TOPICS: string[] = [
  'Organic Chemistry',
  'World History',
  'Linear Algebra',
  'Microeconomics',
  'Spanish Vocabulary',
  'Neural Networks',
];
