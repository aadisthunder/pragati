import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * After a quiz submit, mastery data changes server-side; every cached view of
 * it (My Topics, Quizzes Arena, Analytics) must refresh. This pins the
 * post-submit cache invalidation contract. Runs in the repo's Node test
 * environment: the event dispatch is injected, no DOM globals required.
 */
describe('post-submit cache invalidation', () => {
  let events: string[];

  const fakeDispatch = (name: string) => {
    events.push(name);
  };

  beforeEach(async () => {
    vi.resetModules();
    events = [];
    // Fresh module state per test (the dedupe window is module-level).
    await import('./submitRefresh');
  });

  async function loadFresh() {
    vi.resetModules();
    const mod = await import('./submitRefresh');
    return mod;
  }

  it('notifyGoalsChanged dispatches exactly one learning_goals_updated event', async () => {
    const { setEventDispatcherForTests } = await loadFresh();
    setEventDispatcherForTests(fakeDispatch);

    const { notifyGoalsChanged } = await import('./submitRefresh');
    notifyGoalsChanged();

    expect(events).toEqual(['learning_goals_updated']);
  });

  it('collapses rapid repeat calls into a single dispatch within the dedupe window', async () => {
    const { setEventDispatcherForTests } = await loadFresh();
    setEventDispatcherForTests(fakeDispatch);

    const { notifyGoalsChanged } = await import('./submitRefresh');
    notifyGoalsChanged();
    notifyGoalsChanged();
    notifyGoalsChanged();

    expect(events).toEqual(['learning_goals_updated']);
  });

  it('dispatches again after the dedupe window elapses', async () => {
    vi.useFakeTimers();
    try {
      const { setEventDispatcherForTests } = await loadFresh();
      setEventDispatcherForTests(fakeDispatch);

      const { notifyGoalsChanged } = await import('./submitRefresh');
      notifyGoalsChanged();
      vi.advanceTimersByTime(2000);
      notifyGoalsChanged();

      expect(events).toEqual(['learning_goals_updated', 'learning_goals_updated']);
    } finally {
      vi.useRealTimers();
    }
  });
});
