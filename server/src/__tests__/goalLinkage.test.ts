import { describe, it, expect } from 'vitest';
import {
  resolveGoalLinkage,
  buildQuizInsertRow,
  normalizeTopicKey,
  type GoalLinkRowLike,
} from '../../../supabase/functions/api/_shared/goalMemory';
import {
  resolveGoalLinkage as resolveGoalLinkageServer,
  buildQuizInsertRow as buildQuizInsertRowServer,
  normalizeTopicKey as normalizeTopicKeyServer,
  type GoalLinkRowLike as GoalLinkRowLikeServer,
} from '../services/goalService';

const links: GoalLinkRowLike[] = [
  { id: 'goal-1', title: 'Data Structures', slug: 'data_structures' },
  { id: 'goal-2', title: 'Calculus', slug: 'calculus' },
];

const linkRowsServer = links as GoalLinkRowLikeServer[];

describe('goal-linkage resolution (delete-a-topic erases its quizzes)', () => {
  it('matches a quiz topic equal to a goal title', () => {
    expect(resolveGoalLinkage('Data Structures', links)).toEqual({ goalId: 'goal-1' });
    expect(resolveGoalLinkageServer('Data Structures', linkRowsServer)).toEqual({ goalId: 'goal-1' });
  });

  it('matches a quiz topic equal to a goal slug', () => {
    expect(resolveGoalLinkage('data_structures', links)).toEqual({ goalId: 'goal-1' });
  });

  it('strips difficulty labels before matching ("Fundamental Data Structures – Beginner" form)', () => {
    expect(resolveGoalLinkage('Data Structures – Beginner', links)).toEqual({ goalId: 'goal-1' });
    expect(resolveGoalLinkage('Data Structures (Beginner)', links)).toEqual({ goalId: 'goal-1' });
    expect(resolveGoalLinkageServer('Data Structures – Intermediate', linkRowsServer)).toEqual({
      goalId: 'goal-1',
    });
  });

  it('links subdomain topics via goal-title prefix ("Calculus Functions" → "Calculus") so a deleted goal takes them along', () => {
    expect(resolveGoalLinkage('Calculus Functions', links)).toEqual({ goalId: 'goal-2' });
    expect(resolveGoalLinkageServer('Calculus Functions', linkRowsServer)).toEqual({ goalId: 'goal-2' });
  });

  it('returns null when no goal matches (standalone quiz)', () => {
    expect(resolveGoalLinkage('Quantum Physics', links)).toBeNull();
    expect(resolveGoalLinkageServer('Quantum Physics', linkRowsServer)).toBeNull();
  });

  it('tolerates empty or garbage input without throwing', () => {
    expect(resolveGoalLinkage('', links)).toBeNull();
    expect(resolveGoalLinkage('Basic Data Structures', [])).toBeNull();
  });

  it('builds the quiz insert row with goal_linkage resolved (thin wiring for both backends)', () => {
    const base = { created_by: 'u1', topic: 'Data Structures – Beginner', difficulty: 'beginner', total_questions: 5 };
    expect(buildQuizInsertRow(base, links)).toEqual({ ...base, goal_linkage: 'goal-1' });
    expect(buildQuizInsertRow({ ...base, topic: 'Quantum Physics' }, links)).toEqual({
      ...base,
      topic: 'Quantum Physics',
      goal_linkage: null,
    });
    expect(buildQuizInsertRowServer(base, linkRowsServer)).toEqual({ ...base, goal_linkage: 'goal-1' });
  });

  it('both copies (server + Edge) normalize identically for key titles', () => {
    const samples = ['Data Structures', 'DSA', 'Calculus Functions', 'Linear Algebra'];
    for (const s of samples) {
      expect(normalizeTopicKey(s)).toBe(normalizeTopicKeyServer(s));
    }
  });
});
