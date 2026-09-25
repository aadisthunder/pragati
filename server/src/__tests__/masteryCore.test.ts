/**
 * Tests for the server-local mastery core mirror (masteryCore.ts).
 * Mirrors the contract of supabase/functions/api/_shared/mastery.ts so the
 * Express submit route updates learner_concept_state identically to the Edge
 * Function. Written test-first (TDD).
 */
import { describe, it, expect } from 'vitest';
import {
  updateMastery,
  nextReviewAt,
  matchConceptsForQuestion,
  slugifyConceptName,
} from '../services/masteryCore';

describe('updateMastery (Express mirror matches Edge behavior)', () => {
  it('blends evidence into a fresh state with the uncertainty cap', () => {
    const result = updateMastery(null, [
      { correct: true, skipped: false, dwellTimeSec: 10, hintsUsed: 0 },
      { correct: true, skipped: false, dwellTimeSec: 12, hintsUsed: 0 },
    ]);
    // Two clean correct answers on a fresh learner: capped below 1.0
    expect(result.mastery).toBeGreaterThan(0.8);
    expect(result.mastery).toBeLessThanOrEqual(0.85);
    expect(result.attempts).toBe(2);
    expect(result.correct).toBe(2);
    expect(result.incorrect).toBe(0);
  });

  it('damps mastery growth for hint-reliant correct answers', () => {
    const clean = updateMastery(null, [
      { correct: true, skipped: false, dwellTimeSec: 10, hintsUsed: 0 },
    ]);
    const hinted = updateMastery(null, [
      { correct: true, skipped: false, dwellTimeSec: 10, hintsUsed: 2 },
    ]);
    expect(hinted.mastery).toBeLessThan(clean.mastery);
  });

  it('counts skips as incorrect evidence', () => {
    const result = updateMastery(null, [
      { correct: false, skipped: true, dwellTimeSec: 0, hintsUsed: 0 },
    ]);
    expect(result.mastery).toBeLessThan(0.5);
    expect(result.correct).toBe(0);
    expect(result.incorrect).toBe(1);
  });

  it('preserves running averages from prior state', () => {
    const prev = {
      conceptSlug: 'power_rule',
      mastery: 0.8,
      attempts: 4,
      correct: 3,
      incorrect: 1,
      hintsUsed: 1,
      avgResponseTimeSec: 20,
    };
    const result = updateMastery(prev, [
      { correct: false, skipped: false, dwellTimeSec: 40, hintsUsed: 0 },
    ]);
    expect(result.attempts).toBe(5);
    expect(result.correct).toBe(3);
    expect(result.incorrect).toBe(2);
    // Avg dwell blends 20*4 and 40 -> 24
    expect(result.avgResponseTimeSec).toBe(24);
    // One failure against a strong history should pull mastery down modestly
    expect(result.mastery).toBeLessThan(0.8);
    expect(result.mastery).toBeGreaterThan(0.6);
  });
});

describe('nextReviewAt', () => {
  it('schedules later reviews for stronger mastery', () => {
    const now = new Date('2026-09-25T12:00:00Z');
    const weak = nextReviewAt(0.2, now);
    const strong = nextReviewAt(0.95, now);
    expect(strong.getTime()).toBeGreaterThan(weak.getTime());
    expect(weak.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('matchConceptsForQuestion (keyword attribution fallback)', () => {
  it('matches known concept keywords', () => {
    const tags = matchConceptsForQuestion('Differentiate x^5 using the power rule', 'Calculus');
    expect(tags.some((t) => t.slug === 'power_rule')).toBe(true);
  });

  it('falls back to the quiz topic as a single concept', () => {
    const tags = matchConceptsForQuestion('Completely unrelated text about photosynthesis', 'Quantum Physics');
    expect(tags).toHaveLength(1);
    expect(tags[0].slug).toBe('quantum_physics');
  });
});

describe('slugifyConceptName', () => {
  it('produces canonical slugs', () => {
    expect(slugifyConceptName('Power Rule')).toBe('power_rule');
    expect(slugifyConceptName('  Chain  Rule! ')).toBe('chain_rule');
  });
});
