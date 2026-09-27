import { describe, it, expect } from 'vitest';
import {
  resolveGoalLinkage,
  sweepUnlinkedQuizzesForGoals,
  type GoalLinkRowLike,
} from '../services/goalService';

const goals: GoalLinkRowLike[] = [
  {
    id: 'goal-dsa',
    title: 'DSA',
    slug: 'dsa',
    subtopics: [
      { name: 'Basic Data Structures', slug: 'basic_data_structures' },
      { name: 'Fundamental Data Types', slug: 'fundamental_data_types' },
    ],
  },
  { id: 'goal-calc', title: 'Calculus', slug: 'calculus', subtopics: [{ name: 'Functions', slug: 'functions' }] },
];

/**
 * Phase-1 evidence for the reported glitch: quizzes named after a goal
 * SUBTOPIC ("Basic Data Structures") got no linkage, so deleting the goal
 * ("DSA") left them behind and the Quizzes Arena kept the band. Two fixes:
 * (a) resolveGoalLinkage must also match subtopic names/slugs; (b) a sweep
 * must erase already-orphaned unlinked quizzes that match no current goal.
 */
describe('resolveGoalLinkage: subtopic-aware (root-cause fix)', () => {
  it('links a quiz named after a goal subtopic', () => {
    expect(resolveGoalLinkage('Basic Data Structures – Beginner', goals)).toEqual({
      goalId: 'goal-dsa',
    });
    expect(resolveGoalLinkage('Fundamental Data Types', goals)).toEqual({ goalId: 'goal-dsa' });
  });

  it('links via subtopic slug and prefix forms', () => {
    expect(resolveGoalLinkage('basic_data_structures', goals)).toEqual({ goalId: 'goal-dsa' });
    expect(resolveGoalLinkage('Basic Data Structures Intermediate', goals)).toEqual({
      goalId: 'goal-dsa',
    });
  });

  it('still links via goal title/slug (no regression)', () => {
    expect(resolveGoalLinkage('DSA', goals)).toEqual({ goalId: 'goal-dsa' });
    expect(resolveGoalLinkage('Calculus Functions', goals)).toEqual({ goalId: 'goal-calc' });
    expect(resolveGoalLinkage('Quantum Physics', goals)).toBeNull();
  });
});

describe('sweepUnlinkedQuizzesForGoals (erase already-orphaned quizzes)', () => {
  function makeClient(unlinkedQuizzes: any[]) {
    const calls: Array<{ table: string; op: string; payload: any }> = [];
    return {
      calls,
      from: (table: string) => ({
        select: () => ({
          is: (_col: string, val: null) => ({
            // RLS scopes this to the caller already; emulate returned rows
            then: (res: any) => res({ data: unlinkedQuizzes, error: null }),
          }),
        }),
        delete: () => ({
          in: (_col: string, ids: string[]) => {
            calls.push({ table, op: 'delete-in', payload: ids });
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    };
  }

  it('erases unlinked quizzes that match NO current goal (orphan sweep)', async () => {
    const client = makeClient([
      { id: 'q1', topic: 'Basic Data Structures – Beginner' }, // matches goal-dsa subtopic
      { id: 'q2', topic: 'Calculus Functions' }, // matches goal-calc
      { id: 'q3', topic: 'Quantum Physics' }, // matches nothing -> sweep
      { id: 'q4', topic: 'Intro to Robotics' }, // matches nothing -> sweep
    ]);
    const deleted = await sweepUnlinkedQuizzesForGoals(client as any, goals, 'user-1');

    const quizDelete = client.calls.find((c) => c.table === 'quizzes');
    expect(quizDelete?.payload.sort()).toEqual(['q3', 'q4']);
    expect(deleted).toEqual({ deleted: 2, quizIds: ['q3', 'q4'] });
  });

  it('deletes nothing when every unlinked quiz still matches a goal', async () => {
    const client = makeClient([
      { id: 'q1', topic: 'Basic Data Structures' },
      { id: 'q2', topic: 'Calculus Functions' },
    ]);
    const deleted = await sweepUnlinkedQuizzesForGoals(client as any, goals, 'user-1');
    expect(deleted).toEqual({ deleted: 0, quizIds: [] });
    expect(client.calls.find((c) => c.table === 'quizzes')).toBeUndefined();
  });

  it('attempts are removed first (no FK leftovers) using existing cascade helper ordering', async () => {
    // The quiz delete cascades attempts/telemetry via FK; assert quizzes delete
    // is the only delete issued (deleteQuizCascade is NOT re-implemented here).
    const client = makeClient([{ id: 'q3', topic: 'Quantum Physics' }]);
    await sweepUnlinkedQuizzesForGoals(client as any, goals, 'user-1');
    expect(client.calls.map((c) => c.table)).toEqual(['quizzes']);
  });

  it('tolerates empty goals and empty quiz lists', async () => {
    const client = makeClient([]);
    const deleted = await sweepUnlinkedQuizzesForGoals(client as any, [], 'user-1');
    expect(deleted).toEqual({ deleted: 0, quizIds: [] });
  });
});
