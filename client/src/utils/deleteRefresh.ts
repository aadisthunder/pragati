/**
 * Post-goal-delete cache invalidation.
 *
 * Deleting a topic in My Topics removes it (and, via the schema's
 * ON DELETE CASCADE, every quiz linked to it) server-side — but the client
 * caches /api/quizzes and /api/goals for 2 minutes, so the Quizzes Arena kept
 * showing a band for the deleted topic. notifyGoalDeleted() drops every
 * goal-derived cache entry and fires the same 'learning_goals_updated' event
 * the Topics and Quizzes pages already listen to.
 *
 * Deduped within a short window because several callers can run after one
 * delete (confirm handler, refreshGoals, event listeners).
 */

import { invalidateCache } from '../api/client';

const DEDUPE_WINDOW_MS = 1500;
let lastDispatchAt = 0;

/**
 * Test hooks: let the Node test suite capture dispatched events and cache
 * invalidations without a DOM or the real cache module.
 */
export function setEventDispatcherForTests(dispatch: (name: string) => void): void {
  dispatchEvent = dispatch;
}

export function setCacheInvalidatorForTests(invalidate: (pattern: string) => void): void {
  invalidateCacheForTests = invalidate;
}

let dispatchEvent: (name: string) => void = (name: string) => {
  window.dispatchEvent(new Event(name));
};

let invalidateCacheForTests: (pattern: string) => void = (pattern: string) => {
  invalidateCache(pattern);
};

export function notifyGoalDeleted(): void {
  const now = Date.now();
  if (now - lastDispatchAt < DEDUPE_WINDOW_MS) return;
  lastDispatchAt = now;

  invalidateCacheForTests('/api/goals');
  invalidateCacheForTests('/api/quizzes');
  invalidateCacheForTests('/api/analytics/dashboard');
  dispatchEvent('learning_goals_updated');
}
