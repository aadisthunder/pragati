import { describe, it, expect } from 'vitest';
import { insertQuizRow as insertQuizRowEdge } from '../../../supabase/functions/api/_shared/goalMemory';
import { insertQuizRow as insertQuizRowServer } from '../services/goalService';

const LINKAGE_ERROR = {
  message: "Could not find the 'goal_linkage' column of 'quizzes' in the schema cache",
  code: 'PGRST204',
};

function makeClient(firstInsertError: any) {
  const payloads: any[] = [];
  let call = 0;
  return {
    payloads,
    from: (table: string) => ({
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
    }),
  };
}

const ROW = {
  created_by: 'u1',
  topic: 'Calculus – Beginner',
  difficulty: 'beginner',
  total_questions: 3,
  goal_linkage: 'goal-9',
};

/**
 * Production parity: the Edge Function's quiz insert must degrade exactly like
 * the Express server's when the goal_linkage migration is not yet applied.
 */
describe('insertQuizRow parity (server ↔ Edge)', () => {
  it('both copies retry without linkage on PGRST204 and flag linkageDropped', async () => {
    const edgeClient = makeClient(LINKAGE_ERROR);
    const edge = await insertQuizRowEdge(edgeClient as any, ROW);
    expect(edge.linkageDropped).toBe(true);
    expect(edge.error).toBeNull();
    expect('goal_linkage' in edgeClient.payloads[1]).toBe(false);

    const serverClient = makeClient(LINKAGE_ERROR);
    const server = await insertQuizRowServer(serverClient as any, ROW);
    expect(server.linkageDropped).toBe(true);
    expect(server.error).toBeNull();
    expect('goal_linkage' in serverClient.payloads[1]).toBe(false);
  });

  it('both copies pass through unrelated errors without retrying', async () => {
    for (const fn of [insertQuizRowEdge, insertQuizRowServer]) {
      const client = makeClient({ message: 'RLS insert blocked', code: '42501' });
      const res = await fn(client as any, ROW);
      expect(res.linkageDropped).toBe(false);
      expect(res.error?.code).toBe('42501');
      expect(client.payloads).toHaveLength(1);
    }
  });
});
