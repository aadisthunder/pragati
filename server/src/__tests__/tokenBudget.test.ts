import { describe, it, expect } from 'vitest';
import {
  compactMissedQuestions,
  compactAttempts,
  estimateTokens,
  clampHistoryForTokenBudget,
} from '../agent/tokenBudget';

const fatMissed = Array.from({ length: 10 }, (_, i) => ({
  id: `tel-${i}`,
  question_id: `q-${i}`,
  topic: 'Basic Data Structures',
  prompt: `Question number ${i} asks a fairly long conceptual thing about arrays and loops with LaTeX $x^2$ included.`,
  options: [
    { id: 'A', text: 'A very long option text that goes on and on with filler words to pad the payload size' },
    { id: 'B', text: 'Another long option with more filler to make the JSON payload genuinely large' },
    { id: 'C', text: 'Third option with yet more filler text padding the token count upward' },
    { id: 'D', text: 'Fourth option, still padded, because real options tend to be verbose' },
  ],
  selected_answer: 'A',
  correct_answer: 'B',
  explanation: 'A long step-by-step explanation that repeats the full reasoning chain and adds several sentences of padding to the tool result.',
  dwell_time_sec: 30 + i,
  hints_used: i,
  is_skipped: false,
}));

describe('tokenBudget: compact tool payloads (Groq 8K TPM)', () => {
  it('caps the number of missed questions at 5', () => {
    const compact = compactMissedQuestions(fatMissed, 5);
    expect(compact).toHaveLength(5);
  });

  it('truncates prompts, options, and explanations per item', () => {
    const compact = compactMissedQuestions(fatMissed, 5);
    for (const q of compact) {
      expect(q.prompt.length).toBeLessThanOrEqual(200 + 3); // ellipsis
      expect(q.explanation.length).toBeLessThanOrEqual(240 + 3);
      for (const o of q.options) {
        expect(o.text.length).toBeLessThanOrEqual(80 + 3);
      }
    }
  });

  it('drops fields the Socratic reply does not need (telemetry noise)', () => {
    const compact = compactMissedQuestions(fatMissed, 5);
    for (const q of compact) {
      expect(q).not.toHaveProperty('dwell_time_sec');
      expect(q).not.toHaveProperty('hints_used');
      expect(q).not.toHaveProperty('attempt_id');
    }
  });

  it('produces a payload far smaller than the raw one', () => {
    const raw = JSON.stringify({
      action: 'QUESTIONS_TO_REVIEW_RETRIEVED',
      total_missed: fatMissed.length,
      questions: fatMissed,
    });
    const compactJson = JSON.stringify({
      action: 'QUESTIONS_TO_REVIEW_RETRIEVED',
      total_missed: fatMissed.length,
      questions: compactMissedQuestions(fatMissed, 5),
    });
    expect(estimateTokens(compactJson)).toBeLessThan(estimateTokens(raw) * 0.5);
  });

  it('keeps the correct answer and skip flag (needed for tutoring)', () => {
    const compact = compactMissedQuestions(fatMissed, 3);
    expect(compact[0].correct_answer).toBe('B');
    expect(compact[0]).toHaveProperty('is_skipped');
  });

  it('tolerates null/undefined entries', () => {
    expect(compactMissedQuestions([null, undefined, fatMissed[0]] as any, 5)).toHaveLength(1);
    expect(compactMissedQuestions(null as any, 5)).toEqual([]);
  });
});

describe('tokenBudget: compactAttempts', () => {
  it('keeps only score/accuracy fields and caps the list', () => {
    const attempts = Array.from({ length: 10 }, (_, i) => ({
      id: `a-${i}`,
      quiz_id: `qz-${i}`,
      score: i,
      total_questions: 10,
      accuracy_pct: i * 10,
      total_time_sec: 600,
      completed_at: '2026-09-27T00:00:00Z',
      quizzes: { topic: `Topic ${i}`, difficulty: 'beginner' },
    }));
    const compact = compactAttempts(attempts, 5);
    expect(compact).toHaveLength(5);
    expect(compact[0]).toMatchObject({ topic: 'Topic 0', score: 0, accuracy_pct: 0 });
    expect(compact[0]).not.toHaveProperty('total_time_sec');
    expect(compact[0]).not.toHaveProperty('quiz_id');
  });
});

describe('tokenBudget: estimateTokens', () => {
  it('estimates ~chars/4 and never returns 0 for non-empty strings', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});

describe('tokenBudget: clampHistoryForTokenBudget', () => {
  it('keeps the most recent turns within a character budget', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i} `.padEnd(300, 'x'),
    }));
    const clamped = clampHistoryForTokenBudget(history as any, 4000);
    expect(clamped.length).toBeLessThan(20);
    expect(clamped[clamped.length - 1].content).toContain('message 19');
    // Total chars within budget + small slack for the boundary turn
    const totalChars = clamped.reduce((s, m) => s + m.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(4000 + 300);
  });

  it('returns history unchanged when already small', () => {
    const history = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    expect(clampHistoryForTokenBudget(history as any, 4000)).toHaveLength(2);
  });

  it('never returns empty when history is non-empty (always keeps the latest turn)', () => {
    const history = [{ role: 'user', content: 'x'.repeat(9000) }];
    expect(clampHistoryForTokenBudget(history as any, 4000)).toHaveLength(1);
  });
});
