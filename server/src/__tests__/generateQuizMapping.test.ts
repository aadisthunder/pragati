import { describe, it, expect } from 'vitest';
import { createAgentTools } from '../agent/tools.js';

/**
 * The Express agent's generate_quiz must persist question->concept mappings so
 * the adaptive submit loop attributes evidence exactly (parity with the Edge
 * Function's generate_quiz). Without mappings, subtopic quizzes only attribute
 * via fuzzy matching and the Topics mastery bars can fragment or stall.
 */

const QUIZ_JSON = {
  topic: 'Fundamental Data Structures',
  difficulty: 'beginner',
  questions: [
    {
      prompt: 'Which structure gives LIFO access?',
      options: [
        { id: 'A', text: 'Stack' },
        { id: 'B', text: 'Queue' },
        { id: 'C', text: 'Heap' },
        { id: 'D', text: 'Trie' },
      ],
      correct_answer: 'A',
      hint: 'Think about the last plate you took.',
      explanation: 'A stack is Last-In-First-Out.',
    },
  ],
};

function makeMockSupabase() {
  const inserted: Record<string, any[]> = {
    concepts: [],
    question_concepts: [],
  };

  const mockClient: any = {
    inserted,
    from(table: string) {
      if (table === 'quizzes') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: 'quiz-1', topic: QUIZ_JSON.topic, difficulty: QUIZ_JSON.difficulty, total_questions: 1 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'questions') {
        return {
          insert: (rows: any[]) => ({
            select: async () => ({
              data: rows.map((r, i) => ({ id: `q-${i + 1}`, order_index: r.order_index })),
              error: null,
            }),
          }),
        };
      }
      if (table === 'concepts') {
        return {
          select: () => ({
            in: async () => ({
              data: [{ id: 'c-existing', name: 'Fundamental Data Structures', slug: 'fundamental_data_structures' }],
            }),
          }),
          insert: (rows: any[]) => ({
            select: async () => ({
              data: rows.map((r, i) => ({ id: `c-new-${i}`, ...r })),
              error: null,
            }),
          }),
        };
      }
      if (table === 'question_concepts') {
        return {
          insert: async (rows: any[]) => {
            inserted.question_concepts.push(...rows);
            return { error: null };
          },
          upsert: async (rows: any[]) => {
            inserted.question_concepts.push(...rows);
            return { error: null };
          },
        };
      }
      return {};
    },
  };
  return mockClient;
}

describe('generate_quiz concept mapping persistence', () => {
  it('persists question_concepts rows mapping each question to its concept', async () => {
    const mockClient = makeMockSupabase();
    const mockLlm: any = {
      invoke: async () => ({ content: JSON.stringify(QUIZ_JSON) }),
    };

    const tools = createAgentTools(mockClient, 'user-1', mockLlm);
    const generateQuiz = tools.find((t) => t.name === 'generate_quiz');
    expect(generateQuiz).toBeDefined();

    const result = await generateQuiz!.invoke({
      topic: 'Fundamental Data Structures',
      difficulty: 'beginner',
      num_questions: 1,
    });

    const parsed = JSON.parse(result);
    expect(parsed.action).toBe('QUIZ_GENERATED');

    // The core regression: generated quizzes must carry concept mappings.
    expect(mockClient.inserted.question_concepts.length).toBeGreaterThanOrEqual(1);
    for (const row of mockClient.inserted.question_concepts) {
      expect(row.question_id).toBe('q-1');
      expect(typeof row.concept_id).toBe('string');
      expect(row.concept_id.length).toBeGreaterThan(0);
    }
  });
});
