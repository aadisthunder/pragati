import { describe, it, expect } from 'vitest';
import { buildTopicKey, groupQuizzesByTopic } from './quizGrouping';
import type { QuizLike } from './quizGrouping';

const quiz = (id: string, topic: string, created_at = '2026-09-20T10:00:00Z'): QuizLike => ({
  id,
  topic,
  difficulty: 'beginner',
  total_questions: 5,
  created_at,
});

describe('buildTopicKey', () => {
  it('normalizes quiz topics into a canonical key, stripping difficulty labels', () => {
    expect(buildTopicKey('Fundamental Data Structures – Beginner')).toBe(
      'fundamental_data_structures'
    );
    expect(buildTopicKey('DSA')).toBe('dsa');
  });

  it('returns null for blank topics', () => {
    expect(buildTopicKey('   ')).toBeNull();
  });
});

describe('groupQuizzesByTopic', () => {
  it('groups quizzes that share a normalized topic and links them to a goal by key', () => {
    const goals = [{ goalId: 'g1', title: 'DSA', masteryPct: 20, subtopics: [] }];
    const quizzes = [
      quiz('q1', 'Fundamental Data Structures – Beginner'),
      quiz('q2', 'Fundamental Data Structures – Intermediate', '2026-09-21T10:00:00Z'),
      quiz('q3', 'Roman History'),
    ];

    const { groups, independents } = groupQuizzesByTopic(quizzes, goals);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('fundamental_data_structures');
    // Newest first inside the group (q2 created later than q1).
    expect(groups[0].quizzes.map((q) => q.id)).toEqual(['q2', 'q1']);
    // No link: goal "DSA" has no subtopic named like the quiz topic.
    expect(groups[0].goal).toBeNull();
    expect(independents.map((q) => q.id)).toEqual(['q3']);
  });

  it('links a subtopic quiz to its goal band, headed by the goal title like My Topics', () => {
    const goals = [
      {
        goalId: 'g1',
        title: 'DSA',
        masteryPct: 35,
        subtopics: [
          { id: 's1', name: 'Fundamental Data Structures', slug: 'fundamental_data_structures', masteryPct: 40, attempts: 2 },
        ],
      },
    ];
    const quizzes = [quiz('q1', 'Fundamental Data Structures – Beginner')];

    const { groups, independents } = groupQuizzesByTopic(quizzes, goals);
    expect(independents).toHaveLength(0);
    expect(groups[0].goal?.goalId).toBe('g1');
    expect(groups[0].label).toBe('DSA');
  });

  it('sorts quizzes inside a group newest-first', () => {
    const quizzes = [
      quiz('old', 'Graphs', '2026-09-01T10:00:00Z'),
      quiz('new', 'Graphs – Advanced', '2026-09-22T10:00:00Z'),
    ];
    const { groups } = groupQuizzesByTopic(quizzes, []);
    expect(groups[0].quizzes.map((q) => q.id)).toEqual(['new', 'old']);
  });

  it('puts a lone quiz with a unique topic in independents (no artificial groups)', () => {
    const quizzes = [quiz('q1', 'Roman History')];
    const { groups, independents } = groupQuizzesByTopic(quizzes, []);
    expect(groups).toHaveLength(0);
    expect(independents.map((q) => q.id)).toEqual(['q1']);
  });

  it('merges every subtopic quiz of one goal into a single band headed by the topic name', () => {
    // My Topics shows one card per goal titled e.g. "System Design"; the
    // Quizzes page must show exactly one band per goal with that same
    // heading, no matter which subtopic each quiz was generated from.
    const goals = [
      {
        goalId: 'g1',
        title: 'System Design',
        masteryPct: 0,
        subtopics: [
          { id: 's1', name: 'Scalability Fundamentals', slug: 'scalability_fundamentals', masteryPct: 0, attempts: 0 },
          { id: 's2', name: 'Caching Strategies', slug: 'caching_strategies', masteryPct: 0, attempts: 0 },
          { id: 's3', name: 'Load Balancing & Distribution', slug: 'load_balancing_distribution', masteryPct: 0, attempts: 0 },
        ],
      },
    ];
    const quizzes = [
      quiz('q1', 'Load Balancing & Distribution – Beginner'),
      quiz('q2', 'Caching Strategies – Intermediate', '2026-09-21T10:00:00Z'),
      quiz('q3', 'Scalability Fundamentals – Beginner', '2026-09-22T10:00:00Z'),
    ];

    const { groups, independents } = groupQuizzesByTopic(quizzes, goals);

    expect(independents).toHaveLength(0);
    expect(groups).toHaveLength(1);
    expect(groups[0].goal?.goalId).toBe('g1');
    expect(groups[0].label).toBe('System Design');
    expect(groups[0].quizzes.map((q) => q.id)).toEqual(['q3', 'q2', 'q1']);
  });

  it('tolerates missing fields and empty inputs', () => {
    const { groups, independents } = groupQuizzesByTopic([], []);
    expect(groups).toEqual([]);
    expect(independents).toEqual([]);
  });
});
