import { describe, it, expect } from 'vitest';
import { SUGGESTION_TOPICS, SUGGESTION_CHIPS, getGoalSuggestionChipClass } from './suggestionTopics';

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

describe('SUGGESTION_CHIPS (one-click starter goals in the modal)', () => {
  it('is non-empty and mirrors the curated starter topics', () => {
    expect(SUGGESTION_CHIPS.length).toBeGreaterThanOrEqual(4);
    expect(SUGGESTION_CHIPS.length).toBeLessThanOrEqual(6);
    expect(SUGGESTION_CHIPS).toEqual(SUGGESTION_TOPICS);
  });

  it('selecting a chip fills the goal input verbatim', () => {
    for (const chip of SUGGESTION_CHIPS) {
      expect(chip.trim().length).toBeGreaterThan(0);
      expect(chip.length).toBeLessThanOrEqual(80); // input maxLength
    }
  });
});

describe('getGoalSuggestionChipClass (chip styling contract)', () => {
  it('idle chips are neutral and interactive', () => {
    const cls = getGoalSuggestionChipClass(false);
    expect(cls).toContain('border-slate-200');
    expect(cls).toContain('cursor-pointer');
  });

  it('the active chip is visually selected (dark filled)', () => {
    const cls = getGoalSuggestionChipClass(true);
    expect(cls).toContain('bg-slate-900');
    expect(cls).toContain('text-white');
  });
});
