import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Schema contract: the quizzes ↔ learning_goals link must be enforced by the
 * DATABASE (ON DELETE CASCADE), not by application sweeps. This keeps the
 * "delete a topic cleanly erases its quizzes" guarantee true even if rows are
 * deleted via SQL, another client, or a future code path that forgets the
 * sweep. The migration file is the unit under test here.
 */
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
const EXPECTED_FILE = '20260927_quiz_goal_linkage.sql';

describe('quizzes.goal_linkage schema contract', () => {
  const path = join(MIGRATIONS_DIR, EXPECTED_FILE);

  it('migration file exists', () => {
    expect(existsSync(path)).toBe(true);
  });

  const sql = existsSync(path) ? readFileSync(path, 'utf8') : '';

  it('adds a nullable goal_linkage column on quizzes referencing learning_goals', () => {
    expect(sql).toMatch(/alter\s+table\s+public\.quizzes/i);
    expect(sql).toMatch(/add\s+column\s+if\s+not\s+exists\s+goal_linkage/i);
    expect(sql).toMatch(/references\s+public\.learning_goals\s*\(id\)/i);
  });

  it('cascade is database-enforced: deleting a goal erases its quizzes', () => {
    expect(sql).toMatch(/on\s+delete\s+cascade/i);
  });

  it('quizzes remain nullable (standalone quizzes stay legal)', () => {
    expect(sql).not.toMatch(/goal_linkage\s+uuid\s+not\s+null/i);
  });

  it('indexes goal_linkage for per-goal quiz lookups', () => {
    expect(sql).toMatch(/create\s+index\s+if\s+not\s+exists\s+idx_quizzes_goal_linkage/i);
  });

  it('backfills linkage for existing topic-matched quizzes (self-heal on upgrade)', () => {
    expect(sql).toMatch(/update\s+public\.quizzes/i);
    expect(sql).toMatch(/from\s+public\.learning_goals/i);
  });
});
