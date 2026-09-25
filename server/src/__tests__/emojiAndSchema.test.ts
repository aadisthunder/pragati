/**
 * Tests for emoji stripping in AI replies and the Groq-proof tool schema.
 *
 * Background: Groq validates tool-call arguments against the JSON schema
 * BEFORE our code runs. Any hard bound in the schema (e.g. num_questions
 * maximum: 10) turns a model that wants 14 questions into a hard API error
 * (tool_use_failed) that leaks raw JSON to the chat. Bounds must therefore
 * live ONLY in sanitizeToolArgs, which clamps after extraction.
 */
import { describe, it, expect } from 'vitest';
import {
  stripEmojis,
  AGENT_TOOL_SPECS,
  sanitizeToolArgs,
  extractGroqErrorMessage,
} from '../../../supabase/functions/api/_shared/agent-tools';

describe('stripEmojis', () => {
  it('removes emojis from the end of a sentence', () => {
    expect(stripEmojis('Great question! 🙂')).toBe('Great question!');
  });

  it('removes emojis in the middle and collapses leftover spaces', () => {
    expect(stripEmojis('Let us dive 👍 into this')).toBe('Let us dive into this');
  });

  it('removes multi-codepoint emoji (ZWJ sequences, flags, skin tones)', () => {
    expect(stripEmojis('Family 👨‍👩‍👧‍👦 time 🇮🇳 done 👍🏽')).toBe('Family time done');
  });

  it('keeps regular punctuation, math and letters untouched', () => {
    const text = 'So, x = 2 (not 3) — right? Yes: $E=mc^2$.';
    expect(stripEmojis(text)).toBe(text);
  });

  it('returns non-string input unchanged', () => {
    expect(stripEmojis(null as any)).toBeNull();
    expect(stripEmojis(undefined as any)).toBeUndefined();
  });
});

describe('AGENT_TOOL_SPECS are Groq-proof', () => {
  it('generate_quiz num_questions has no maximum for Groq to reject', () => {
    const spec = AGENT_TOOL_SPECS.find((t: any) => t.function.name === 'generate_quiz');
    const numSpec = spec.function.parameters.properties.num_questions;
    expect(numSpec.maximum).toBeUndefined();
    expect(numSpec.minimum).toBeUndefined();
  });

  it('limit parameters carry no hard minimum/maximum either', () => {
    for (const name of ['get_student_attempts', 'get_student_performance', 'get_questions_to_review']) {
      const spec = AGENT_TOOL_SPECS.find((t: any) => t.function.name === name);
      const limitSpec = spec.function.parameters.properties.limit;
      expect(limitSpec?.maximum).toBeUndefined();
      expect(limitSpec?.minimum).toBeUndefined();
    }
  });
});

describe('sanitizeToolArgs clamps out-of-range values locally', () => {
  it('clamps num_questions above 10 down to 10 (the 14-questions bug)', () => {
    const args = sanitizeToolArgs('generate_quiz', { topic: 'backend', num_questions: 14 }, 'make me 14 questions');
    expect(args.num_questions).toBe(10);
  });

  it('clamps num_questions below 1 up to 1', () => {
    const args = sanitizeToolArgs('generate_quiz', { topic: 'backend', num_questions: 0 }, 'quiz');
    expect(args.num_questions).toBe(1);
  });

  it('clamps limit values into the 1-20 range', () => {
    expect(sanitizeToolArgs('get_student_attempts', { limit: 99 }, 'x').limit).toBe(20);
    expect(sanitizeToolArgs('get_student_attempts', { limit: -3 }, 'x').limit).toBe(1);
  });
});

describe('extractGroqErrorMessage', () => {
  it('produces a friendly message from a tool_use_failed error', () => {
    const raw = JSON.stringify({
      error: {
        message: 'Tool call validation failed: parameters for tool generate_quiz did not match schema: errors /num_questions: maximum got: 14, want 10',
        type: 'invalid_request_error',
        code: 'tool_use_failed',
        failed_generation: '{"name": "generate_quiz", "arguments": {"difficulty": "beginner", "num_questions": 14, "topic": "backend development"}}',
      },
    });
    const msg = extractGroqErrorMessage(raw);
    expect(msg).toContain("couldn't complete that request");
    expect(msg).not.toContain('backend development');
    expect(msg).not.toContain('tool_use_failed');
  });

  it('falls back to a generic friendly line when the payload is not JSON', () => {
    expect(extractGroqErrorMessage('gateway timeout')).toContain("couldn't complete that request");
  });
});
