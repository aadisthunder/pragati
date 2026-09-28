import { describe, it, expect } from 'vitest';
import {
  resolveGoalLinkage,
  sweepUnlinkedQuizzesForTopics,
  type GoalLinkRowLike,
} from '../services/goalService';

/**
 * SCOPE BUG (found during live certification): the original sweep erased ALL
 * unlinked quizzes matching no current goal — including the seeded judge demo
 * quiz (11111111-...) and users' genuine standalone one-offs. Deleting ONE
 * topic must erase only quizzes whose topic derives from THAT goal's title,
 * slug, or subtopics. Everything else stays.
 */

const CURRENT_GOALS: GoalLinkRowLike[] = [
  { id: 'goal-system', title: 'System Design', slug: 'system_design', subtopics: [{ name: 'Load Balancing', slug: 'load_balancing' }] },
];

function makeClient(unlinked: any[]) {
  const calls: Array<{ table: string; op: string; payload: any }> = [];
  return {
    calls,
    from: (table: string) => ({
      select: () => ({
        is: (_c: string, _v: null) => ({
          then: (res: any) => res({ data: unlinked, error: null }),
        }),
      }),
      delete: () => ({
        in: (_c: string, ids: string[]) => {
          calls.push({ table, op: 'delete-in', payload: ids });
          return Promise.resolve({ data: null, error: null });
        },
      }),
    }),
  };
}

const deletedGoal = {
  id: 'goal-deleted',
  title: 'DSA',
  slug: 'dsa',
  subtopics: [{ name: 'Basic Data Structures', slug: 'basic_data_structures' }],
};

describe('sweepUnlinkedQuizzesForTopics (scoped to the deleted goal)', () => {
  it('erases only quizzes whose topic derives from the deleted goal — seeded demo quiz and unrelated standalones SURVIVE', async () => {
    const client = makeClient([
      { id: 'q-basic', topic: 'Basic Data Structures – Beginner' }, // deleted goal subtopic -> sweep
      { id: 'q-dsa', topic: 'DSA' }, // deleted goal title -> sweep
      { id: 'q-seeded', topic: 'Calculus Diagnostic' }, // seeded judge quiz -> KEEP
      { id: 'q-standalone', topic: 'Quantum Physics one-off' }, // genuine standalone -> KEEP
      { id: 'q-current', topic: 'Load Balancing & Distribution' }, // matches a CURRENT goal -> KEEP
    ]);
    const res = await sweepUnlinkedQuizzesForTopics(client as any, deletedGoal, CURRENT_GOALS);

    const del = client.calls.find((c) => c.table === 'quizzes');
    expect(del?.payload.sort()).toEqual(['q-basic', 'q-dsa']);
    expect(res).toEqual({ deleted: 2, quizIds: ['q-basic', 'q-dsa'] });
  });

  it('never touches quizzes linked to a current goal even if their topic is similar', async () => {
    const client = makeClient([{ id: 'q-lb', topic: 'Load Balancing' }]);
    const res = await sweepUnlinkedQuizzesForTopics(client as any, deletedGoal, CURRENT_GOALS);
    expect(res.deleted).toBe(0);
    expect(client.calls).toHaveLength(0);
  });

  it('does nothing when the deleted goal had no matchable topics', async () => {
    const client = makeClient([{ id: 'q-seeded', topic: 'Calculus Diagnostic' }]);
    const res = await sweepUnlinkedQuizzesForTopics(client as any, { id: 'g', title: 'Zzz', slug: 'zzz' }, CURRENT_GOALS);
    expect(res).toEqual({ deleted: 0, quizIds: [] });
    expect(client.calls).toHaveLength(0);
  });

  it('keeps resolveGoalLinkage contract intact (subtopic-aware, still exported)', () => {
    expect(resolveGoalLinkage('Basic Data Structures – Beginner', [deletedGoal])).toEqual({ goalId: 'goal-deleted' });
    expect(resolveGoalLinkage('Calculus Diagnostic', CURRENT_GOALS)).toBeNull();
  });
});
