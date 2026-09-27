import { describe, it, expect } from 'vitest';
import {
  findGoalSubtopicMatches,
  normalizeTopicKey,
  stripDifficultySuffixKey,
} from '../services/goalService';

describe('normalizeTopicKey', () => {
  it('slugifies, lowercases, and trims separators', () => {
    expect(normalizeTopicKey('Fundamental Data Structures')).toBe('fundamental_data_structures');
    expect(normalizeTopicKey('  Arrays  ')).toBe('arrays');
  });

  it('strips a trailing difficulty label the agent appends to quiz topics', () => {
    expect(normalizeTopicKey('Fundamental Data Structures – Beginner')).toBe(
      'fundamental_data_structures'
    );
    expect(normalizeTopicKey('Sorting and Searching Algorithms - Advanced')).toBe(
      'sorting_and_searching_algorithms'
    );
    expect(normalizeTopicKey('Graphs (Beginner)')).toBe('graphs');
  });

  it('keeps difficulty words that are part of the title itself', () => {
    expect(normalizeTopicKey('Advanced Data Structures')).toBe('advanced_data_structures');
  });
});

describe('stripDifficultySuffixKey', () => {
  it('removes a trailing difficulty segment from a slugified key', () => {
    expect(stripDifficultySuffixKey('fundamental_data_structures_beginner')).toBe(
      'fundamental_data_structures'
    );
    expect(stripDifficultySuffixKey('graphs_expert')).toBe('graphs');
  });

  it('leaves keys without a difficulty suffix untouched', () => {
    expect(stripDifficultySuffixKey('advanced_data_structures')).toBe('advanced_data_structures');
  });
});

describe('findGoalSubtopicMatches', () => {
  const subtopics = [
    { name: 'Fundamental Data Structures', slug: 'fundamental_data_structures' },
    { name: 'Graph Algorithms and Traversals', slug: 'graph_algorithms_and_traversals' },
  ];

  it('matches a quiz topic that names the subtopic, ignoring the difficulty suffix', () => {
    const matches = findGoalSubtopicMatches(
      'Fundamental Data Structures – Beginner',
      'What is a stack?',
      subtopics
    );
    expect(matches.map((m) => m.slug)).toEqual(['fundamental_data_structures']);
  });

  it('matches when the question text mentions the subtopic', () => {
    const matches = findGoalSubtopicMatches(
      'DSA Practice Quiz',
      'Explain how graph algorithms and traversals such as BFS work.',
      subtopics
    );
    expect(matches.map((m) => m.slug)).toEqual(['graph_algorithms_and_traversals']);
  });

  it('matches singular/plural drift between quiz topic and subtopic name', () => {
    const matches = findGoalSubtopicMatches('Array and String Basics', '', [
      { name: 'Arrays', slug: 'arrays' },
    ]);
    expect(matches.map((m) => m.slug)).toEqual(['arrays']);
  });

  it('returns no duplicates when both topic and text match the same subtopic', () => {
    const matches = findGoalSubtopicMatches(
      'Fundamental Data Structures – Beginner',
      'Fundamental data structures store organized data.',
      subtopics
    );
    expect(matches.map((m) => m.slug)).toEqual(['fundamental_data_structures']);
  });

  it('returns [] when nothing matches', () => {
    expect(
      findGoalSubtopicMatches('Roman History', 'Who was Julius Caesar?', subtopics)
    ).toEqual([]);
  });

  it('ignores ultra-short keys (<4 chars) to avoid over-broad containment', () => {
    const matches = findGoalSubtopicMatches('The Big Bang Theory Quiz', 'Physics of explosions', [
      { name: 'Big', slug: 'big' },
    ]);
    expect(matches).toEqual([]);
  });

  it('handles empty topic and text without throwing', () => {
    expect(findGoalSubtopicMatches('', '', subtopics)).toEqual([]);
  });
});
