import { describe, it, expect, vi } from 'vitest';
import { deleteGoalCascade } from '../services/goalService';

/**
 * Deleting a goal must erase the goal AND every quiz linked to it, plus the
 * attempts and telemetry hanging off those quizzes (schema-level ON DELETE
 * CASCADE handles the DB rows; this helper performs the delete and asserts
 * the application layer calls it exactly once for the goal row).
 */
function makeChainClient() {
  const calls: Array<{ table: string; op: string; args: any }> = [];
  const makeQuery = (table: string, op: string) => {
    const chain: any = {
      delete: () => chain,
      select: () => chain,
      eq: (..._args: any[]) => chain,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: undefined,
    };
    // terminal await
    chain.then = (resolve: any) => resolve({ data: null, error: null });
    calls.push({ table, op, args: chain });
    return chain;
  };
  return {
    calls,
    from: (table: string) => makeQuery(table, 'delete'),
  };
}

describe('deleteGoalCascade (goal delete cleanly erases linked quizzes)', () => {
  it('deletes the learning goal row so schema cascades erase linked quizzes/attempts/telemetry', async () => {
    const client = makeChainClient();
    await deleteGoalCascade(client as any, 'goal-123');

    const deleted = client.calls.filter((c) => c.op === 'delete');
    expect(deleted.map((c) => c.table)).toEqual(['learning_goals']);
  });

  it('propagates the delete error instead of reporting success', async () => {
    const failing: any = {
      from: () => {
        const chain: any = {
          delete: () => chain,
          eq: () => Promise.resolve({ data: null, error: { message: 'RLS blocked delete' } }),
        };
        // await chain resolves the promise from eq in supabase-js v2
        return chain;
      },
    };
    // supabase-js awaits the builder directly; emulate that the eq() call returned the error
    await expect(deleteGoalCascade(failing, 'goal-x')).rejects.toThrow('RLS blocked delete');
  });
});
