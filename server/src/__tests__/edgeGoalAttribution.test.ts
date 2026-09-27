import { describe, it, expect } from 'vitest';
import {
  findGoalSubtopicMatches,
  normalizeTopicKey,
  stripDifficultySuffixKey,
} from '../../../supabase/functions/api/_shared/goalMemory';

/**
 * Production parity test: the Edge Function's submit loop must attribute a
 * subtopic-named quiz ("Fundamental Data Structures – Beginner") to that
 * goal subtopic exactly like the Express server does. Mirrors
 * server/src/__tests__/goalQuizAttribution.test.ts.
 */
describe('edge goalMemory: quiz-topic ↔ subtopic matching', () => {
  it('normalizeTopicKey strips trailing difficulty labels', () => {
    expect(normalizeTopicKey('Fundamental Data Structures – Beginner')).toBe(
      'fundamental_data_structures'
    );
    expect(normalizeTopicKey('Graphs (Beginner)')).toBe('graphs');
  });

  it('stripDifficultySuffixKey removes a trailing difficulty segment from slugs', () => {
    expect(stripDifficultySuffixKey('fundamental_data_structures_beginner')).toBe(
      'fundamental_data_structures'
    );
    expect(stripDifficultySuffixKey('advanced_data_structures')).toBe('advanced_data_structures');
  });

  it('findGoalSubtopicMatches attributes a subtopic-named quiz topic', () => {
    const matches = findGoalSubtopicMatches(
      'Fundamental Data Structures – Beginner',
      'Which structure gives ordered element access?',
      [
        { name: 'Fundamental Data Structures', slug: 'fundamental_data_structures' },
        { name: 'Graph Algorithms', slug: 'graph_algorithms' },
      ]
    );
    expect(matches.map((m) => m.slug)).toEqual(['fundamental_data_structures']);
  });

  it('findGoalSubtopicMatches keeps working on plain question text', () => {
    const matches = findGoalSubtopicMatches('DSA Practice', 'How do graph algorithms traverse?', [
      { name: 'Graph Algorithms', slug: 'graph_algorithms' },
    ]);
    expect(matches.map((m) => m.slug)).toEqual(['graph_algorithms']);
  });

  it('findGoalSubtopicMatches returns [] on unrelated topics', () => {
    expect(
      findGoalSubtopicMatches('Roman History', 'Who was Caesar?', [
        { name: 'Fundamental Data Structures', slug: 'fundamental_data_structures' },
      ])
    ).toEqual([]);
  });
});
