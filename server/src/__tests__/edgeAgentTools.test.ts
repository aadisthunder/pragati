/**
 * Tests for the shared agent-tool helpers used by the Supabase Edge Function.
 *
 * These are pure functions (no Deno-specific APIs) so they can run under vitest
 * in the server suite, keeping the Edge Function's tool-calling logic covered
 * by the same CI tests as the Express server.
 */
import { describe, it, expect } from 'vitest';
import {
  AGENT_TOOL_SPECS,
  extractToolCallsFromGroq,
  sanitizeToolArgs,
  extractQuizJson,
  stripAnswerKeyForClient,
  buildQuizGenerationPrompt,
  containsQuizSpoilers,
  buildQuizReadyFallback,
} from '../../../supabase/functions/api/_shared/agent-tools';

describe('AGENT_TOOL_SPECS', () => {
  it('defines all six tools with groq-compatible schemas', () => {
    const names = AGENT_TOOL_SPECS.map((t: any) => t.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'generate_quiz',
        'get_student_attempts',
        'get_attempt_telemetry',
        'explain_missed_question',
        'get_student_performance',
        'get_questions_to_review',
      ])
    );
    for (const spec of AGENT_TOOL_SPECS) {
      expect(spec.type).toBe('function');
      expect(typeof spec.function.description).toBe('string');
      expect(spec.function.description.length).toBeGreaterThan(10);
      expect(spec.function.parameters).toBeTypeOf('object');
    }
  });

  it('constrains generate_quiz difficulty and question count', () => {
    const spec = AGENT_TOOL_SPECS.find((t: any) => t.function.name === 'generate_quiz');
    expect(spec.function.parameters.properties.difficulty.enum).toEqual(['beginner', 'intermediate', 'advanced']);
    expect(spec.function.parameters.properties.num_questions.minimum).toBe(1);
    expect(spec.function.parameters.properties.num_questions.maximum).toBe(10);
  });
});

describe('extractToolCallsFromGroq', () => {
  it('extracts tool calls from a groq response message', () => {
    const message = {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'generate_quiz', arguments: '{"topic":"photosynthesis"}' },
        },
      ],
    };
    const calls = extractToolCallsFromGroq(message);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ id: 'call_1', name: 'generate_quiz', args: { topic: 'photosynthesis' } });
  });

  it('parses malformed JSON arguments into an empty object instead of throwing', () => {
    const message = {
      tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'generate_quiz', arguments: '{bad json' } }],
    };
    const calls = extractToolCallsFromGroq(message);
    expect(calls[0].args).toEqual({});
  });

  it('returns empty array when no tool calls present', () => {
    expect(extractToolCallsFromGroq({ role: 'assistant', content: 'Hello!' })).toEqual([]);
    expect(extractToolCallsFromGroq(null)).toEqual([]);
  });
});

describe('sanitizeToolArgs', () => {
  it('backfills topic and question count from the user message', () => {
    const args = sanitizeToolArgs('generate_quiz', {}, 'Generate a quiz to test my understanding on topic : backend 5 questions');
    expect(args.topic).toBe('backend');
    expect(args.num_questions).toBe(5);
    expect(args.difficulty).toBe('intermediate');
  });

  it('clamps num_questions to the 1-10 range', () => {
    const args = sanitizeToolArgs('generate_quiz', { topic: 'sql', num_questions: 25 }, 'quiz on sql');
    expect(args.num_questions).toBeLessThanOrEqual(10);
    expect(args.num_questions).toBeGreaterThanOrEqual(1);
  });

  it('truncates overly long topics to 120 chars', () => {
    const args = sanitizeToolArgs('generate_quiz', { topic: 'x'.repeat(500) }, 'quiz');
    expect(args.topic.length).toBeLessThanOrEqual(120);
  });

  it('defaults limits for list tools', () => {
    expect(sanitizeToolArgs('get_student_attempts', {}, 'history').limit).toBe(5);
    expect(sanitizeToolArgs('get_questions_to_review', {}, 'review').limit).toBe(10);
  });
});

describe('extractQuizJson', () => {
  it('parses a clean quiz JSON payload', () => {
    const payload = {
      topic: 'backend',
      difficulty: 'intermediate',
      questions: [
        {
          prompt: 'What is a queue?',
          options: [
            { id: 'A', text: 'FIFO' },
            { id: 'B', text: 'LIFO' },
          ],
          correct_answer: 'A',
          hint: 'Think ordering',
          explanation: 'Queues are first-in-first-out.',
        },
      ],
    };
    expect(extractQuizJson(JSON.stringify(payload))).toEqual(payload);
  });

  it('repairs markdown fences around the JSON', () => {
    const raw = '```json\n{"topic":"t","questions":[{"prompt":"p","options":[{"id":"A","text":"a"},{"id":"B","text":"b"}],"correct_answer":"A","hint":"h","explanation":"e"}]}\n```';
    const parsed = extractQuizJson(raw);
    expect(parsed?.topic).toBe('t');
    expect(parsed?.questions).toHaveLength(1);
  });

  it('repairs truncated JSON missing closing braces', () => {
    const raw =
      '{"topic":"t","questions":[{"prompt":"p","options":[{"id":"A","text":"a"},{"id":"B","text":"b"}],"correct_answer":"A","hint":"h","explanation":"e"';
    const parsed = extractQuizJson(raw);
    expect(parsed?.questions).toHaveLength(1);
  });

  it('returns null for garbage input', () => {
    expect(extractQuizJson('no json here at all')).toBeNull();
    expect(extractQuizJson('')).toBeNull();
  });
});

describe('stripAnswerKeyForClient', () => {
  it('removes correct_answer and explanation from every question', () => {
    const quiz = {
      topic: 't',
      difficulty: 'intermediate',
      questions: [
        {
          prompt: 'p',
          options: [{ id: 'A', text: 'a' }],
          correct_answer: 'A',
          hint: 'h',
          explanation: 'secret',
        },
      ],
    };
    const safe = stripAnswerKeyForClient(quiz);
    expect(safe.questions[0]).not.toHaveProperty('correct_answer');
    expect(safe.questions[0]).not.toHaveProperty('explanation');
    expect(safe.questions[0].prompt).toBe('p');
    expect(safe.questions[0].hint).toBe('h');
  });
});

describe('buildQuizGenerationPrompt', () => {
  it('embeds topic, difficulty and count with the strict JSON contract', () => {
    const prompt = buildQuizGenerationPrompt({ topic: 'photosynthesis', difficulty: 'beginner', num_questions: 3 });
    expect(prompt).toContain('photosynthesis');
    expect(prompt).toContain('beginner');
    expect(prompt).toContain('exactly 3 questions');
    expect(prompt).toContain('"correct_answer"');
    expect(prompt).not.toContain('```');
  });
});

describe('containsQuizSpoilers', () => {
  it('detects numbered question dumps and option lists', () => {
    expect(containsQuizSpoilers('Question 1 - Architecture: What is X?')).toBe(true);
    expect(containsQuizSpoilers('### Questions')).toBe(true);
    expect(containsQuizSpoilers('A) first option')).toBe(true);
    expect(containsQuizSpoilers('I generated your quiz. Start it below!')).toBe(false);
  });
});

describe('buildQuizReadyFallback', () => {
  it('produces a friendly no-spoiler reply naming the topic', () => {
    const msg = buildQuizReadyFallback('backend');
    expect(msg).toContain('backend');
    expect(msg).toContain('card');
    expect(containsQuizSpoilers(msg)).toBe(false);
  });
});
