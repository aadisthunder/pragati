import { describe, it, expect } from 'vitest';
import { sanitizeQuestionsForStudent } from './quizRoutes.js';

describe('quizRoutes: sanitizeQuestionsForStudent', () => {
  it('should strip correct_answer and explanation while preserving prompt, options, hint, order_index', () => {
    const rawQuestions = [
      {
        id: 'q1',
        quiz_id: 'quiz1',
        prompt: 'What is 2 + 2?',
        options: [{ id: 'A', text: '4' }, { id: 'B', text: '5' }],
        correct_answer: 'A',
        explanation: 'Because 2 + 2 = 4',
        hint: 'Think of pairs',
        order_index: 0,
      },
    ];

    const sanitized = sanitizeQuestionsForStudent(rawQuestions);

    expect(sanitized[0].id).toBe('q1');
    expect(sanitized[0].prompt).toBe('What is 2 + 2?');
    expect(sanitized[0].options).toHaveLength(2);
    expect(sanitized[0].hint).toBe('Think of pairs');
    expect((sanitized[0] as any).correct_answer).toBeUndefined();
    expect((sanitized[0] as any).explanation).toBeUndefined();
  });
});
