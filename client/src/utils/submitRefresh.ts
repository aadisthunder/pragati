/**
 * Post-submit cache invalidation.
 *
 * A quiz submit changes mastery server-side, but the client caches
 * /api/goals for 2 minutes — so the My Topics progress bar (and any
 * goal-linked UI) kept showing stale numbers. notifyGoalsChanged() drops
 * every mastery-derived cache entry and fires the same
 * 'learning_goals_updated' event the Topics page already listens to.
 *
 * Deduped within a short window because several callers run after one
 * submit (executeSubmit, refreshProfile, duplicate submits).
 */

import { invalidateCache } from '../api/client';

const DEDUPE_WINDOW_MS = 1500;
let lastDispatchAt = 0;

/**
 * Test hook: lets the Node test suite capture dispatched events without a DOM.
 */
export function setEventDispatcherForTests(dispatch: (name: string) => void): void {
  dispatchEvent = dispatch;
}

let dispatchEvent: (name: string) => void = (name: string) => {
  window.dispatchEvent(new Event(name));
};

export function notifyGoalsChanged(): void {
  const now = Date.now();
  if (now - lastDispatchAt < DEDUPE_WINDOW_MS) return;
  lastDispatchAt = now;

  invalidateCache('/api/goals');
  invalidateCache('/api/analytics/dashboard');
  invalidateCache('/api/quizzes');
  dispatchEvent('learning_goals_updated');
}
