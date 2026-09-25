import { describe, it, expect } from 'vitest';
import {
  calculateTargetDifficulty,
  buildTestMePrompt,
  QUIZ_DIFFICULTIES,
  type QuizDifficulty,
} from './quizDifficulty';

describe('calculateTargetDifficulty (4-tier mastery ladder)', () => {
  it('assigns beginner for mastery below 50%', () => {
    expect(calculateTargetDifficulty(0)).toBe('beginner');
    expect(calculateTargetDifficulty(30)).toBe('beginner');
    expect(calculateTargetDifficulty(49)).toBe('beginner');
  });

  it('assigns intermediate for mastery 50-79%', () => {
    expect(calculateTargetDifficulty(50)).toBe('intermediate');
    expect(calculateTargetDifficulty(65)).toBe('intermediate');
    expect(calculateTargetDifficulty(79)).toBe('intermediate');
  });

  it('assigns advanced for mastery 80-89%', () => {
    expect(calculateTargetDifficulty(80)).toBe('advanced');
    expect(calculateTargetDifficulty(85)).toBe('advanced');
    expect(calculateTargetDifficulty(89)).toBe('advanced');
  });

  it('assigns expert for mastery at or above 90%', () => {
    expect(calculateTargetDifficulty(90)).toBe('expert');
    expect(calculateTargetDifficulty(95)).toBe('expert');
    expect(calculateTargetDifficulty(100)).toBe('expert');
  });

  it('handles negative or out-of-range numbers safely', () => {
    expect(calculateTargetDifficulty(-10)).toBe('beginner');
    expect(calculateTargetDifficulty(150)).toBe('expert');
  });

  it('exposes the 4-tier ladder in order', () => {
    expect(QUIZ_DIFFICULTIES).toEqual(['beginner', 'intermediate', 'advanced', 'expert']);
    const ladder: QuizDifficulty[] = QUIZ_DIFFICULTIES;
    expect(ladder.length).toBe(4);
  });
});

describe('buildTestMePrompt — sends clean topic name prompt so agent tool checks live mastery', () => {
  const goal = {
    goalId: 'g1',
    title: 'Data Structures and Algorithms',
    masteryPct: 25,
    subtopics: [
      { id: 's1', name: 'Arrays', slug: 'arrays', masteryPct: 30, attempts: 1 },
      { id: 's2', name: 'Linked Lists', slug: 'linked_lists', masteryPct: 20, attempts: 1 },
    ],
  };

  it('constructs a clean concise prompt passing the learning goal title', () => {
    const prompt = buildTestMePrompt(goal);
    expect(prompt).toBe('Test me on my learning goal "Data Structures and Algorithms".');
  });

  it('works for any topic title without leaking large manual data or subtopic dumps', () => {
    const dsaPrompt = buildTestMePrompt({ title: 'DSA', masteryPct: 0 });
    expect(dsaPrompt).toBe('Test me on my learning goal "DSA".');
    expect(dsaPrompt.length).toBeLessThan(60);
  });
});
