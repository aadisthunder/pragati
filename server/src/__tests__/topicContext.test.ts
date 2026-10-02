import { describe, it, expect } from 'vitest';
import {
  buildGoalMemoryBlock,
  resolveActiveGoalTitle,
  sanitizeContextNote,
  type GoalMemoryGoal,
} from '../../src/services/goalService';
import {
  buildGoalMemoryBlock as buildGoalMemoryBlockEdge,
  resolveActiveGoalTitle as resolveActiveGoalTitleEdge,
} from '../../../supabase/functions/api/_shared/goalMemory';
import {
  containsQuizSpoilers as containsQuizSpoilersEdge,
} from '../../../supabase/functions/api/_shared/agent-tools';

/**
 * Topic context files + active-topic chat memory.
 *
 * Product behavior: each learning goal carries a student-maintained context
 * note ("context file"). Selecting a topic in the chat header picker marks it
 * ACTIVE: the agent's system prompt must then name that goal, surface its
 * weakest subtopics, include the student's context notes, and treat follow-up
 * requests like "make me a test" as targeting that topic — instead of the
 * model guessing (or dumping quiz questions as plain text).
 *
 * Parity rule: the Express goalService and the Edge goalMemory mirror must
 * produce byte-identical memory blocks.
 */

const GOALS: GoalMemoryGoal[] = [
  {
    title: 'Calculus',
    masteryPct: 54,
    subtopics: [
      { name: 'Chain Rule', masteryPct: 30 },
      { name: 'Limits', masteryPct: 75 },
    ],
  },
  {
    title: 'System Design',
    masteryPct: 0,
    subtopics: [{ name: 'Caching Strategies', masteryPct: 0 }],
  },
];

describe('buildGoalMemoryBlock: active topic context', () => {
  it('marks the selected goal ACTIVE and directs test requests at it (Express)', () => {
    const block = buildGoalMemoryBlock(GOALS, 'Calculus');
    expect(block).toContain('ACTIVE TOPIC: Calculus');
    expect(block).toContain('Chain Rule (30%)');
    expect(block).toMatch(/make me a test|test me|generate a quiz/i);
    // Non-active goals stay listed as background memory.
    expect(block).toContain('System Design');
  });

  it('lists the active goal first, marked ACTIVE exactly once (Express)', () => {
    const block = buildGoalMemoryBlock(GOALS, 'System Design');
    const lines = block.split('\n');
    const activeLines = lines.filter((l) => l.startsWith('- ACTIVE: System Design'));
    expect(activeLines).toHaveLength(1);
    const activeLine = lines.findIndex((l) => l.startsWith('- ACTIVE: System Design'));
    const otherGoalLine = lines.findIndex((l) => l.startsWith('- Calculus'));
    expect(activeLine).toBeGreaterThanOrEqual(0);
    expect(otherGoalLine).toBeGreaterThan(activeLine);
  });

  it('injects the student context notes for the active goal (Express)', () => {
    const goalsWithContext = [
      {
        ...GOALS[0],
        contextNote: 'Focus on IB exam style: chain rule with trig, skip epsilon-delta proofs.',
      },
      ...GOALS.slice(1),
    ];
    const block = buildGoalMemoryBlock(goalsWithContext, 'Calculus');
    expect(block).toContain('Student context for Calculus:');
    expect(block).toContain('IB exam style');
  });

  it('Edge mirror produces the identical block (parity)', () => {
    const goalsWithContext = [
      { ...GOALS[0], contextNote: 'IB style, no proofs.' },
      ...GOALS.slice(1),
    ];
    expect(buildGoalMemoryBlockEdge(goalsWithContext as any, 'Calculus')).toBe(
      buildGoalMemoryBlock(goalsWithContext as any, 'Calculus')
    );
  });

  it('without an active goal, block matches the current behavior (no ACTIVE marker)', () => {
    const block = buildGoalMemoryBlock(GOALS);
    expect(block).not.toContain('ACTIVE');
    expect(buildGoalMemoryBlockEdge(GOALS as any, undefined)).toBe(block);
  });

  it('empty goals return empty string regardless of activeGoalId', () => {
    expect(buildGoalMemoryBlock([], 'Calculus')).toBe('');
    expect(buildGoalMemoryBlockEdge([], 'Calculus')).toBe('');
  });
});

describe('resolveActiveGoalTitle: goalId -> title for chat wiring', () => {
  const rows = [{ id: 'g1', title: 'Calculus' }, { id: 'g2', title: 'System Design' }];

  it('resolves a matching goalId to its title', () => {
    expect(resolveActiveGoalTitle(rows, 'g2')).toBe('System Design');
  });

  it('returns undefined for unknown/missing ids and empty rows', () => {
    expect(resolveActiveGoalTitle(rows, 'nope')).toBeUndefined();
    expect(resolveActiveGoalTitle(rows, undefined)).toBeUndefined();
    expect(resolveActiveGoalTitle([], 'g1')).toBeUndefined();
  });

  it('Edge mirror behaves identically', () => {
    expect(resolveActiveGoalTitleEdge(rows as any, 'g1')).toBe('Calculus');
    expect(resolveActiveGoalTitleEdge(rows as any, 'zzz')).toBeUndefined();
  });
});

describe('sanitizeContextNote: storage validation for topic context files', () => {
  it('trims and enforces the max length', () => {
    expect(sanitizeContextNote('  focus on IB style  ')).toBe('focus on IB style');
    const long = 'x'.repeat(501);
    expect(sanitizeContextNote(long)).toHaveLength(500);
  });

  it('strips control characters and normalizes newlines', () => {
    expect(sanitizeContextNote('line1\r\nline2\u0000')).toBe('line1\nline2');
  });

  it('non-strings become undefined', () => {
    expect(sanitizeContextNote(undefined)).toBeUndefined();
    expect(sanitizeContextNote(42 as any)).toBeUndefined();
  });
});

describe('containsQuizSpoilers: hardened detection', () => {
  const cases: Array<[string, boolean]> = [
    // Current formats (must keep passing)
    ['Question 1: What is 2+2?', true],
    ['### Questions', true],
    ['A) 4  B) 5', true],
    // The leak formats observed in production (must now be caught)
    ['**1.** What is the derivative of x^2?', true],
    ['1. **Which** option is correct?', true],
    ['A. 4\nB. 5\nC. 6', true],
    ['**Q1.** Differentiate f(x) = x^3', true],
    // Normal tutoring prose (must stay clean)
    ['Great question! Let us break the chain rule into steps.', false],
    ['I have generated your practice quiz on **Calculus**. Start it below!', false],
    ['Your weakest subtopic is Chain Rule (30%).', false],
  ];

  for (const [text, expected] of cases) {
    it(`detects ${expected ? 'spoiler' : 'clean'} text: ${text.slice(0, 40)}`, () => {
      expect(containsQuizSpoilersEdge(text)).toBe(expected);
    });
  }
});
