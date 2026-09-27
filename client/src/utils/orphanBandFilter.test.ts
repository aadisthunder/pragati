import { describe, it, expect } from 'vitest';
import { groupQuizzesByTopic, buildTopicKey, type QuizLike, type GoalLike } from './quizGrouping';

/**
 * Client-side glitch: a topic band forms from >=2 quizzes sharing a topic even
 * when NO goal matches anymore (My Topics is empty). The band header previously
 * implied topic linkage ("FROM YOUR TOPICS"). The grouping must mark such
 * groups goal-less so the page can filter them out of the topics section.
 */
const quizzes: QuizLike[] = [
  { id: 'q1', topic: 'Basic Data Structures – Beginner', difficulty: 'beginner', total_questions: 10, created_at: '2026-09-26T10:00:00Z' },
  { id: 'q2', topic: 'Basic Data Structures', difficulty: 'intermediate', total_questions: 10, created_at: '2026-09-26T09:00:00Z' },
];

describe('groupQuizzesByTopic: goal-less (orphan) groups', () => {
  it('groups orphan quizzes with goal: null (no artificial linkage)', () => {
    const { groups } = groupQuizzesByTopic(quizzes, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].goal).toBeNull();
    expect(groups[0].quizzes).toHaveLength(2);
  });

  it('attaches the matching goal when one exists', () => {
    const goals: GoalLike[] = [
      {
        goalId: 'g1',
        title: 'DSA',
        masteryPct: 0,
        subtopics: [{ id: 's1', name: 'Basic Data Structures', slug: 'basic_data_structures', masteryPct: 0, attempts: 0 }],
      },
    ];
    const { groups } = groupQuizzesByTopic(quizzes, goals);
    expect(groups[0].goal?.goalId).toBe('g1');
  });

  it('buildTopicKey treats the difficulty-suffixed and bare topics as the same band', () => {
    expect(buildTopicKey('Basic Data Structures – Beginner')).toBe(buildTopicKey('Basic Data Structures'));
  });
});
