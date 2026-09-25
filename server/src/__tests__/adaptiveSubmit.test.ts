import { describe, it, expect, vi } from 'vitest';
import { runAdaptiveSubmitLoop, type SubmitTelemetryInput } from '../services/adaptiveSubmit';

describe('runAdaptiveSubmitLoop', () => {
  it('gracefully handles empty telemetry without querying database', async () => {
    const dummyClient = {} as any;
    await expect(runAdaptiveSubmitLoop(dummyClient, 'user-1', 'quiz-1', [], 'attempt-1')).resolves.toBeUndefined();
  });

  it('resolves concepts, auto-inserts missing concept rows, and upserts learner_concept_state', async () => {
    const insertedConcepts: any[] = [];
    const upsertedStates: any[] = [];
    const insertedEvents: any[] = [];

    const mockScopedClient = {
      from: (table: string) => {
        if (table === 'quizzes') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { topic: 'Data Structures' } }),
              }),
            }),
          };
        }
        if (table === 'question_concepts') {
          return {
            select: () => ({
              in: async () => ({ data: [] }),
            }),
          };
        }
        if (table === 'learning_goals') {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  {
                    title: 'Data Structures',
                    slug: 'data_structures',
                    goal_subtopics: [
                      { name: 'Binary Search', slug: 'binary_search' },
                      { name: 'Linked Lists', slug: 'linked_lists' },
                    ],
                  },
                ],
              }),
            }),
          };
        }
        if (table === 'concepts') {
          return {
            select: () => ({
              in: async () => ({
                // Initially neither 'data_structures' nor 'binary_search' is in concepts
                data: [],
              }),
            }),
            insert: (rows: any[]) => {
              insertedConcepts.push(...rows);
              return {
                select: async () => ({
                  data: rows.map((r, i) => ({ id: `concept-${i + 1}`, ...r })),
                }),
              };
            },
          };
        }
        if (table === 'learner_concept_state') {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({ data: [] }),
              }),
            }),
            upsert: async (record: any) => {
              upsertedStates.push(record);
              return { error: null };
            },
          };
        }
        if (table === 'learning_events') {
          return {
            insert: async (event: any) => {
              insertedEvents.push(event);
              return { error: null };
            },
          };
        }
        return {
          select: () => ({ eq: () => ({ data: [] }) }),
        };
      },
    } as any;

    const telemetry: SubmitTelemetryInput[] = [
      {
        question_id: 'q-1',
        prompt: 'How does Binary Search work in a sorted array?',
        is_correct: true,
        is_skipped: false,
        dwell_time_sec: 15,
        hints_used: 0,
      },
    ];

    await runAdaptiveSubmitLoop(mockScopedClient, 'user-123', 'quiz-456', telemetry, 'attempt-789');

    // Missing concepts (binary_search, data_structures) must be inserted so they have valid concept IDs
    expect(insertedConcepts.length).toBeGreaterThanOrEqual(1);
    const insertedSlugs = insertedConcepts.map((c) => c.slug);
    expect(insertedSlugs).toContain('binary_search');

    // Learner concept state must be upserted
    expect(upsertedStates.length).toBeGreaterThanOrEqual(1);
    expect(upsertedStates.some((s) => s.user_id === 'user-123')).toBe(true);
    expect(upsertedStates.some((s) => s.correct === 1)).toBe(true);
  });
});
