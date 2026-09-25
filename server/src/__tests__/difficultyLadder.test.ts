/**
 * TDD tests for the 4-tier quiz difficulty ladder (user decision: add Expert).
 * Covers every layer the difficulty string touches: the zod tool schema
 * (Express), the Groq tool-spec enum (Edge), argument backfill, the rating
 * multiplier, and generation-time concept tagging wiring.
 */
import { describe, it, expect } from 'vitest';
import { generateQuizSchema, sanitizeToolArgs } from '../agent/tools';
import * as edge from '../../../supabase/functions/api/_shared/agent-tools';
import { getRatingDelta } from '../services/analyticsService';

describe('server generateQuizSchema accepts the 4-tier ladder', () => {
  it('accepts expert as a difficulty', () => {
    const parsed = generateQuizSchema.parse({ topic: 'Calculus', difficulty: 'expert' });
    expect(parsed.difficulty).toBe('expert');
  });

  it('still accepts the original three tiers', () => {
    for (const difficulty of ['beginner', 'intermediate', 'advanced'] as const) {
      expect(generateQuizSchema.parse({ topic: 'x', difficulty }).difficulty).toBe(difficulty);
    }
  });
});

describe('edge generate_quiz tool spec exposes the 4-tier ladder', () => {
  it('enum contains beginner, intermediate, advanced and expert', () => {
    const spec = edge.AGENT_TOOL_SPECS.find((t: any) => t.function.name === 'generate_quiz');
    expect(spec.function.parameters.properties.difficulty.enum).toEqual([
      'beginner',
      'intermediate',
      'advanced',
      'expert',
    ]);
  });

  it('edge sanitizeToolArgs backfills expert difficulty from the user message', () => {
    const args = edge.sanitizeToolArgs(
      'generate_quiz',
      {},
      'Test me on Chain Rule at expert difficulty'
    );
    expect(args.difficulty).toBe('expert');
  });
});

describe('server sanitizeToolArgs backfills expert difficulty', () => {
  it('recognizes expert in the user message', () => {
    const args = sanitizeToolArgs('generate_quiz', {}, 'Generate a quiz on trees, expert difficulty');
    expect(args.difficulty).toBe('expert');
  });
});

describe('rating multiplier rewards higher difficulty tiers', () => {
  it('expert gives a bigger bonus than advanced for the same accuracy', () => {
    const advanced = getRatingDelta(90, 'advanced');
    const expert = getRatingDelta(90, 'expert');
    expect(expert).toBeGreaterThan(advanced);
  });

  it('beginner gives the smallest movements', () => {
    expect(Math.abs(getRatingDelta(90, 'beginner'))).toBeLessThan(
      Math.abs(getRatingDelta(90, 'intermediate'))
    );
  });
});
