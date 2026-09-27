import { describe, it, expect, beforeEach } from 'vitest';
import {
  setInCache,
  getFromCache,
  invalidateCache,
  fetchWithDeduplication,
} from './cache';

/**
 * Isolation contract: the in-memory API cache is module-global and survives
 * account switches in the same tab (sign-out → sign-in as a different user).
 * Any goal/quiz/analytics entry served to the previous identity would leak
 * data across accounts. clearUserCache() must wipe everything.
 */
describe('clearUserCache (cross-account cache isolation)', () => {
  beforeEach(() => {
    invalidateCache();
  });

  it('wipes every cached entry so a new identity starts cold', async () => {
    const { clearUserCache } = await import('./cache');
    setInCache('/api/goals', { goals: [{ title: 'secret-of-user-a' }] });
    setInCache('/api/quizzes', { quizzes: [{ id: 'quiz-a' }] });

    clearUserCache();

    expect(getFromCache('/api/goals')).toBeNull();
    expect(getFromCache('/api/quizzes')).toBeNull();
  });

  it('cancels in-flight deduplicated requests from the previous identity', async () => {
    const { clearUserCache } = await import('./cache');

    // Start a deduplicated fetch that hangs until released.
    let release!: (v: any) => void;
    const gate = new Promise((resolve) => (release = resolve));
    const inflight = fetchWithDeduplication('/api/quizzes', () => gate, 60_000);

    clearUserCache();

    release({ quizzes: [] });
    // The entry must not have been cached after the wipe (fresh identity refetches).
    await inflight;
    expect(getFromCache('/api/quizzes')).toBeNull();
  });
});
