/**
 * TDD tests for the mastery-graph fix:
 *
 *  D1: keyword attribution must respect quiz-topic affinity — evidence from a
 *      "Basic Data Structures" quiz may never land on "Calculus/functions"
 *      just because DS questions mention the word "function".
 *  D2 (pure part): the shared tagging helper must produce per-question concept
 *      tags (used by both backends when persisting mappings at generation time).
 *  D3: goal matching must bridge singular/plural slugs ("arrays" ↔ "array").
 */
import { describe, it, expect } from 'vitest';
import {
  matchConceptsForQuestion,
  tagQuestionsWithConcepts,
  buildConceptMappingPayload,
} from '../services/masteryCore';
import { computeGoalMastery } from '../services/goalService';
import * as edgeMatch from '../../../supabase/functions/api/_shared/agent-tools';
import * as edgeGoal from '../../../supabase/functions/api/_shared/goalMemory';

describe('D1: matchConceptsForQuestion topic affinity', () => {
  it('does NOT match Calculus keywords for a Data Structures quiz question', () => {
    // "function" appears in almost every DS question — but the quiz is about
    // data structures, so evidence must land on a data_structures concept.
    const tags = matchConceptsForQuestion(
      'Which data structure uses a hash function for O(1) lookup?',
      'Basic Data Structures'
    );
    expect(tags.map((t) => t.slug)).toContain('basic_data_structures');
    expect(tags.map((t) => t.slug)).not.toContain('functions');
  });

  it('still matches Calculus keywords for a Calculus quiz question', () => {
    const tags = matchConceptsForQuestion(
      'Differentiate x^5 using the power rule',
      'Calculus'
    );
    expect(tags.map((t) => t.slug)).toContain('power_rule');
  });
});

describe('D2: tagQuestionsWithConcepts (shared generation-time tagging)', () => {
  it('attaches normalized concept tags to every question', () => {
    const questions = [
      { prompt: 'What is the time complexity of binary search on a sorted array?', hint: '', explanation: '' },
      { prompt: 'Explain the chain rule when differentiating sin(x^2)', hint: '', explanation: '' },
    ];
    const tagged = tagQuestionsWithConcepts(questions as any, 'Calculus');
    expect(tagged.every((q: any) => Array.isArray(q.concepts) && q.concepts.length > 0)).toBe(true);
    const chainTags = tagged[1].concepts.map((c: any) => c.slug);
    expect(chainTags).toContain('chain_rule');
  });
});

describe('D1/D2 Edge mirrors stay behaviorally identical', () => {
  it('edge matchConceptsForQuestion respects topic affinity', () => {
    const tags = edgeMatch.matchConceptsForQuestion(
      'Which data structure uses a hash function for O(1) lookup?',
      'Basic Data Structures'
    );
    expect(tags.map((t: any) => t.slug)).toContain('basic_data_structures');
    expect(tags.map((t: any) => t.slug)).not.toContain('functions');
  });

  it('edge tagQuestionsWithConcepts tags every question', () => {
    const tagged = edgeMatch.tagQuestionsWithConcepts(
      [{ prompt: 'Differentiate x^5 using the power rule', hint: '', explanation: '' }],
      'Calculus'
    );
    expect(tagged[0].concepts.map((c: any) => c.slug)).toContain('power_rule');
  });

  it('edge computeGoalMastery bridges singular/plural slugs', () => {
    const result = edgeGoal.computeGoalMastery(
      'Data Structures',
      [{ id: 'st1', name: 'Arrays', slug: 'arrays' }],
      [{ conceptSlug: 'array', mastery: 0.7, attempts: 4 }] as any
    );
    expect(result.subtopics[0].masteryPct).toBe(70);
  });
});

describe('D2: buildConceptMappingPayload for attach_question_concepts rpc', () => {
  it('builds one mapping row per tagged question', () => {
    const questions = [
      { prompt: 'power rule question', concepts: [{ name: 'Power Rule', slug: 'power_rule', prerequisites: [] }] },
      { prompt: 'arrays question', concepts: [{ name: 'Arrays', slug: 'arrays', prerequisites: [] }] },
    ];
    const payload = buildConceptMappingPayload('quiz-1', questions as any);
    expect(payload.p_quiz_id).toBe('quiz-1');
    expect(payload.p_mappings).toHaveLength(2);
    expect(payload.p_mappings[0]).toEqual({
      question_id: undefined,
      concept_name: 'Power Rule',
      concept_slug: 'power_rule',
    });
  });

  it('skips questions without tags instead of throwing', () => {
    const payload = buildConceptMappingPayload('quiz-1', [{ prompt: 'no tags' }] as any);
    expect(payload.p_mappings).toHaveLength(0);
  });

  it('edge mirror produces the same payload shape', () => {
    const payload = edgeMatch.buildConceptMappingPayload('quiz-9', [
      { prompt: 'x', concepts: [{ name: 'Chain Rule', slug: 'chain_rule', prerequisites: [] }] },
    ] as any);
    expect(payload.p_quiz_id).toBe('quiz-9');
    expect(payload.p_mappings[0].concept_slug).toBe('chain_rule');
  });
});

describe('D3: computeGoalMastery singular/plural bridge', () => {
  it('matches a learned concept "array" to the goal subtopic "Arrays"', () => {
    const subtopics = [{ id: 'st1', name: 'Arrays', slug: 'arrays' }];
    const states = [{ conceptSlug: 'array', mastery: 0.7, attempts: 4 }];
    const result = computeGoalMastery('Data Structures', subtopics, states as any);
    expect(result.subtopics[0].masteryPct).toBe(70);
  });

  it('matches a learned concept "arrays" to the goal subtopic "Array"', () => {
    const subtopics = [{ id: 'st1', name: 'Array', slug: 'array' }];
    const states = [{ conceptSlug: 'arrays', mastery: 0.5, attempts: 2 }];
    const result = computeGoalMastery('Data Structures', subtopics, states as any);
    expect(result.subtopics[0].masteryPct).toBe(50);
  });
});
