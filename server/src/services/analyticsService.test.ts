import { describe, it, expect } from 'vitest';
import { calculateAttemptSummary, calculateUpdatedRating } from './analyticsService.js';

describe('analyticsService', () => {
  describe('calculateAttemptSummary', () => {
    it('should calculate accuracy, score, time, and hesitation metrics correctly', () => {
      const answers = [
        { selected_answer: 'A', is_correct: true, is_skipped: false, dwell_time_sec: 10, hints_used: 0 },
        { selected_answer: 'B', is_correct: false, is_skipped: false, dwell_time_sec: 20, hints_used: 1 },
        { selected_answer: undefined, is_correct: false, is_skipped: true, dwell_time_sec: 5, hints_used: 0 },
        { selected_answer: 'C', is_correct: true, is_skipped: false, dwell_time_sec: 15, hints_used: 2 },
      ];

      const summary = calculateAttemptSummary(answers);

      expect(summary.score).toBe(2);
      expect(summary.total_questions).toBe(4);
      expect(summary.accuracy_pct).toBe(50.0);
      expect(summary.total_time_sec).toBe(50);
      expect(summary.avg_dwell_time_sec).toBe(12.5);
      expect(summary.skipped_count).toBe(1);
      expect(summary.hints_count).toBe(3);
      expect(summary.cognitive_hesitation_score).toBeGreaterThan(0);
    });

    it('should handle empty answers list safely', () => {
      const summary = calculateAttemptSummary([]);

      expect(summary.score).toBe(0);
      expect(summary.total_questions).toBe(0);
      expect(summary.accuracy_pct).toBe(0);
      expect(summary.total_time_sec).toBe(0);
      expect(summary.avg_dwell_time_sec).toBe(0);
    });
  });

  describe('calculateUpdatedRating', () => {
    it('should increase rating on high accuracy', () => {
      const newRating = calculateUpdatedRating(1200, 100, 'intermediate');
      expect(newRating).toBeGreaterThan(1200);
    });

    it('should decrease rating on low accuracy', () => {
      const newRating = calculateUpdatedRating(1200, 20, 'intermediate');
      expect(newRating).toBeLessThan(1200);
    });
  });
});
