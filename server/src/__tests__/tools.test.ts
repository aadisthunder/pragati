import { describe, it, expect, vi } from 'vitest';
import {
  extractQuizJson,
  sanitizeToolArgs,
  createAgentTools,
} from '../agent/tools.js';

describe('Agent Tools & Sanitization', () => {
  describe('extractQuizJson', () => {
    it('extracts valid JSON from markdown code fences', () => {
      const input = '```json\n{"topic": "Physics", "questions": [{"prompt": "What is force?"}]}\n```';
      const parsed = extractQuizJson(input);
      expect(parsed).toEqual({
        topic: 'Physics',
        questions: [{ prompt: 'What is force?' }],
      });
    });

    it('repairs unclosed JSON braces from streaming responses', () => {
      const input = '{"topic": "Math", "questions": [{"prompt": "2+2?"}';
      const parsed = extractQuizJson(input);
      expect(parsed).not.toBeNull();
      expect(parsed?.topic).toBe('Math');
    });

    it('returns null for empty or invalid strings', () => {
      expect(extractQuizJson('')).toBeNull();
      expect(extractQuizJson('No json here')).toBeNull();
    });
  });

  describe('sanitizeToolArgs', () => {
    it('backfills topic and num_questions for generate_quiz from user message', () => {
      const userMsg = 'Generate a quiz to test my understanding on topic : inflation 2026 10 questions';
      const args = sanitizeToolArgs('generate_quiz', {}, userMsg);
      expect(args.topic).toContain('inflation 2026');
      expect(args.num_questions).toBe(10);
      expect(args.difficulty).toBe('intermediate');
    });

    it('handles get_student_performance limit argument', () => {
      const args = sanitizeToolArgs('get_student_performance', {});
      expect(args.limit).toBe(5);
    });

    it('handles get_questions_to_review limit argument', () => {
      const args = sanitizeToolArgs('get_questions_to_review', {});
      expect(args.limit).toBe(10);
    });
  });

  describe('createAgentTools tool registry', () => {
    it('registers generate_quiz, get_student_performance, and get_questions_to_review', () => {
      const dummyClient = {} as any;
      const dummyLlm = {} as any;
      const tools = createAgentTools(dummyClient, 'user-123', dummyLlm);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('generate_quiz');
      expect(toolNames).toContain('get_student_performance');
      expect(toolNames).toContain('get_questions_to_review');
    });
  });
});
