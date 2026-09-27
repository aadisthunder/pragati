import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Deleting a topic in My Topics must be visible everywhere immediately: the
 * goals cache, the Quizzes Arena list, and Analytics all view goal-derived
 * data. This pins the post-delete invalidation contract (the reported glitch:
 * deleted topics kept appearing in the Quizzes section from cache).
 */
describe('post-delete cache invalidation', () => {
  let events: string[];
  const fakeDispatch = (name: string) => {
    events.push(name);
  };

  async function loadFresh() {
    vi.resetModules();
    return import('./deleteRefresh');
  }

  beforeEach(() => {
    events = [];
  });

  it('notifyGoalDeleted invalidates goals, quizzes, and analytics caches and dispatches the event', async () => {
    const { setEventDispatcherForTests } = await loadFresh();
    setEventDispatcherForTests(fakeDispatch);

    const invalidated: string[] = [];
    const { setCacheInvalidatorForTests } = await import('./deleteRefresh');
    setCacheInvalidatorForTests((pattern: string) => invalidated.push(pattern));

    const { notifyGoalDeleted } = await import('./deleteRefresh');
    notifyGoalDeleted();

    expect(events).toEqual(['learning_goals_updated']);
    expect(invalidated).toContain('/api/goals');
    expect(invalidated).toContain('/api/quizzes');
    expect(invalidated).toContain('/api/analytics/dashboard');
  });

  it('collapses rapid repeat calls into a single dispatch within the dedupe window', async () => {
    const mod = await loadFresh();
    mod.setEventDispatcherForTests(fakeDispatch);
    const invalidated: string[] = [];
    mod.setCacheInvalidatorForTests((pattern: string) => invalidated.push(pattern));

    mod.notifyGoalDeleted();
    mod.notifyGoalDeleted();
    mod.notifyGoalDeleted();

    expect(events).toEqual(['learning_goals_updated']);
    expect(invalidated.filter((p) => p === '/api/quizzes').length).toBe(1);
  });
});
