import { describe, it, expect } from 'vitest';
import { insertQuizRow } from '../services/goalService';

/**
 * Deploy-order safety: the app may run against a database that has not yet
 * received the 20260927_quiz_goal_linkage migration. Inserting goal_linkage
 * into a table without that column fails (PostgREST PGRST204 / SQL 42703) and
 * would take down ALL quiz generation. insertQuizRow must retry once without
 * the linkage column so generation degrades gracefully instead of breaking.
 */
const LINKAGE_ERROR = {
  message: "Could not find the 'goal_linkage' column of 'quizzes' in the schema cache",
  code: 'PGRST204',
};

function makeClient(firstInsertError: any) {
  const payloads: any[] = [];
  let call = 0;
  return {
    payloads,
    from: (table: string) => {
      if (table !== 'quizzes') throw new Error(`unexpected table ${table}`);
      return {
        insert: (row: any) => {
          payloads.push(row);
          call += 1;
          return {
            select: () => ({
              single: async () => {
                if (call === 1 && firstInsertError) return { data: null, error: firstInsertError };
                return { data: { id: 'quiz-1', ...row }, error: null };
              },
            }),
          };
        },
      };
    },
  };
}

const BASE = { created_by: 'u1', topic: 'Calculus – Beginner', difficulty: 'beginner', total_questions: 3, goal_linkage: 'goal-9' };

describe('insertQuizRow (deploy-order tolerance)', () => {
  it('inserts with linkage on the happy path (single call)', async () => {
    const client = makeClient(null);
    const { data, error, linkageDropped } = await insertQuizRow(client as any, BASE);
    expect(error).toBeNull();
    expect(data?.id).toBe('quiz-1');
    expect(linkageDropped).toBe(false);
    expect(client.payloads).toHaveLength(1);
    expect(client.payloads[0].goal_linkage).toBe('goal-9');
  });

  it('retries without goal_linkage when the column is missing', async () => {
    const client = makeClient(LINKAGE_ERROR);
    const { data, error, linkageDropped } = await insertQuizRow(client as any, BASE);
    expect(error).toBeNull();
    expect(linkageDropped).toBe(true);
    expect(client.payloads).toHaveLength(2);
    expect('goal_linkage' in client.payloads[1]).toBe(false);
    expect(data?.topic).toBe(BASE.topic);
  });

  it('does not retry for unrelated insert errors', async () => {
    const client = makeClient({ message: 'duplicate key value violates unique constraint', code: '23505' });
    const { error, linkageDropped } = await insertQuizRow(client as any, BASE);
    expect(error?.message).toContain('duplicate key');
    expect(linkageDropped).toBe(false);
    expect(client.payloads).toHaveLength(1);
  });
});
