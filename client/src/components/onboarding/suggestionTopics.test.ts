import { describe, it, expect } from 'vitest';
import { SUGGESTION_TOPICS } from './suggestionTopics';

describe('SUGGESTION_TOPICS', () => {
  it('offers a small, non-empty set of starter topics', () => {
    expect(SUGGESTION_TOPICS.length).toBeGreaterThanOrEqual(4);
    expect(SUGGESTION_TOPICS.length).toBeLessThanOrEqual(6);
  });

  it('has well-formed, unique topic labels', () => {
    const lowered = SUGGESTION_TOPICS.map((t) => t.toLowerCase());
    expect(new Set(lowered).size).toBe(SUGGESTION_TOPICS.length);
    for (const topic of SUGGESTION_TOPICS) {
      expect(topic.trim()).toBe(topic);
      expect(topic.length).toBeGreaterThanOrEqual(2);
      expect(topic.length).toBeLessThanOrEqual(60);
    }
  });

  it('never suggests a topic the judge demo already has seeded (server 409s duplicates)', () => {
    // The judge demo account ships with a "Calculus" goal; clicking a chip that
    // collides would surface a live "You already have a goal" error to judges.
    expect(SUGGESTION_TOPICS.map((t) => t.toLowerCase())).not.toContain('calculus');
  });
});
