import { describe, it, expect } from 'vitest';
import {
  compactMissedQuestions as compactMissedQuestionsEdge,
  compactAttempts as compactAttemptsEdge,
  clampHistoryForTokenBudget as clampHistoryEdge,
  shrinkContextForTokenBudget as shrinkContextEdge,
  withGroqRetry as withGroqRetryEdge,
} from '../../../supabase/functions/api/_shared/tokenBudget';
import {
  compactMissedQuestions as compactMissedQuestionsServer,
  compactAttempts as compactAttemptsServer,
  clampHistoryForTokenBudget as clampHistoryServer,
  shrinkContextForTokenBudget as shrinkContextServer,
} from '../agent/tokenBudget';

const fatMissed = [
  {
    id: 'tel-1',
    question_id: 'q-1',
    topic: 'Calculus',
    prompt: 'x'.repeat(500),
    options: [
      { id: 'A', text: 'x'.repeat(200) },
      { id: 'B', text: 'y'.repeat(200) },
    ],
    selected_answer: 'A',
    correct_answer: 'B',
    explanation: 'z'.repeat(800),
    dwell_time_sec: 12,
    hints_used: 1,
    is_skipped: false,
  },
];

/**
 * Production parity: the Edge Function must compact payloads and clamp
 * history exactly like the Express server, so both backends stay inside
 * Groq's per-minute token budget.
 */
describe('tokenBudget parity (server ↔ Edge)', () => {
  it('compactMissedQuestions produces identical output', () => {
    expect(compactMissedQuestionsEdge(fatMissed, 5)).toEqual(compactMissedQuestionsServer(fatMissed, 5));
  });

  it('compactAttempts produces identical output', () => {
    const attempts = [{ id: 'a', quiz_id: 'q', score: 3, total_questions: 5, accuracy_pct: 60, total_time_sec: 90, completed_at: 't', quizzes: { topic: 'T', difficulty: 'beginner' } }];
    expect(compactAttemptsEdge(attempts, 5)).toEqual(compactAttemptsServer(attempts, 5));
  });

  it('clampHistoryForTokenBudget produces identical output', () => {
    const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}`.padEnd(120, 'x') }));
    expect(clampHistoryEdge(history as any, 400)).toEqual(clampHistoryServer(history as any, 400));
  });

  it('withGroqRetry retries 429 with retry-after in both copies', async () => {
    let edgeCalls = 0;
    const edge = await withGroqRetryEdge(
      async () => {
        edgeCalls += 1;
        return edgeCalls === 1
          ? new Response('{"error":{"message":"Rate limit reached"}}', { status: 429, headers: { 'retry-after': '0' } })
          : new Response('{}', { status: 200 });
      },
      { maxRetries: 2, sleep: async () => {} }
    );
    expect(edge.status).toBe(200);
    expect(edgeCalls).toBe(2);
  });

  it('shrinkContextForTokenBudget produces identical output in both copies', () => {
    const messages = [
      { role: 'system', content: 'System message' },
      { role: 'user', content: 'm1: ' + 'x'.repeat(1200) },
      { role: 'assistant', content: 'm2: ' + 'y'.repeat(1200) },
      { role: 'user', content: 'm3: ' + 'z'.repeat(400) },
    ];
    expect(shrinkContextEdge(messages, 500)).toEqual(shrinkContextServer(messages, 500));
  });
});

