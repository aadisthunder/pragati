import { describe, it, expect, vi } from 'vitest';
import { generateQuizSchema, getAttemptTelemetrySchema } from './tools.js';

describe('LangChain Agent Tools Schemas', () => {
  it('should validate generateQuizSchema correctly', () => {
    const valid = generateQuizSchema.safeParse({
      topic: 'Photosynthesis',
      difficulty: 'intermediate',
      num_questions: 3,
    });
    expect(valid.success).toBe(true);

    const invalid = generateQuizSchema.safeParse({
      topic: '',
    });
    expect(invalid.success).toBe(false);
  });

  it('should validate getAttemptTelemetrySchema correctly', () => {
    const valid = getAttemptTelemetrySchema.safeParse({
      attempt_id: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(valid.success).toBe(true);

    const invalid = getAttemptTelemetrySchema.safeParse({
      attempt_id: 'not-a-uuid',
    });
    expect(invalid.success).toBe(false);
  });
});
