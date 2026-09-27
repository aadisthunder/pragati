import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Scalability contract: every quizzes query is RLS-filtered on created_by
 * (owner-only policies), and the list endpoint sorts by created_at — yet the
 * schema had no index on quizzes.created_by, forcing per-user scans over the
 * whole table as it grows. The canonical schema must carry
 * idx_quizzes_created_by (created_by, created_at DESC).
 */
const SCHEMA_PATH = join(__dirname, '..', '..', '..', 'supabase', 'schema.sql');
const sql = readFileSync(SCHEMA_PATH, 'utf8');

describe('quizzes.created_by index contract (scalability)', () => {
  it('schema indexes quizzes by owner with recency-friendly ordering', () => {
    expect(sql).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+idx_quizzes_created_by\s+on\s+public\.quizzes\s*\(created_by,\s*created_at\s+desc\)/i
    );
  });
});
