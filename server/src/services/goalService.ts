/**
 * Server-local goal service — mirrors supabase/functions/api/_shared/goalMemory.ts
 * (repo convention: shared pure logic is mirrored under server/src so the Edge
 * Function and the Express server stay behaviorally identical while imports
 * stay server-local for tsc/NodeNext).
 *
 * Both copies are covered by the shared vitest suite.
 */
import { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Limits (mirror goalMemory.ts)
// ---------------------------------------------------------------------------

export const MAX_SUBTOPICS_PER_GOAL = 6;
export const MAX_SUBTOPIC_NAME_LENGTH = 60;
export const MAX_GOAL_TITLE_LENGTH = 80;
export const MAX_CLIENT_GOALS = 8;

export interface SubtopicTag {
  name: string;
  slug: string;
}

export interface SubtopicPlan {
  topic: string;
  subtopics: SubtopicTag[];
}

export function slugifyGoalName(name: string): string {
  return (
    String(name)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'concept'
  );
}

function cleanLabel(value: unknown, maxLength: number, truncate = true): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/[\r\n\t]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!truncate && cleaned.length > maxLength) return '';
  return cleaned.slice(0, maxLength);
}

function tryParseLooseJson(raw: string): any | null {
  const text = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const startIdx = text.indexOf('{');
  if (startIdx === -1) return null;

  const slices = [text.slice(startIdx, text.lastIndexOf('}') + 1), text.slice(startIdx)];
  for (const slice of slices) {
    if (slice.length <= 1) continue;
    try {
      return JSON.parse(slice);
    } catch {
      // fall through
    }
  }

  const fullSlice = text.slice(startIdx);
  const closers: string[] = [];
  for (const ch of fullSlice) {
    if (ch === '{') closers.push('}');
    else if (ch === '[') closers.push(']');
    else if (ch === '}' && closers[closers.length - 1] === '}') closers.pop();
    else if (ch === ']' && closers[closers.length - 1] === ']') closers.pop();
  }
  try {
    return JSON.parse(fullSlice + closers.reverse().join(''));
  } catch {
    return null;
  }
}

function extractLineItems(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length >= 2 && line.length <= MAX_SUBTOPIC_NAME_LENGTH);
}

/** Robust extractor for an LLM-generated subtopic plan (see goalMemory.ts). */
export function parseSubtopicPlan(rawContent: string, requestedTopic: string): SubtopicPlan | null {
  if (!rawContent || typeof rawContent !== 'string' || !rawContent.trim()) return null;

  const raw = String(rawContent);
  const topic = cleanLabel(requestedTopic, MAX_GOAL_TITLE_LENGTH) || 'General';

  let candidateNames: string[] = [];
  const parsed = tryParseLooseJson(raw);

  if (parsed && typeof parsed === 'object') {
    const list = Array.isArray(parsed.subtopics)
      ? parsed.subtopics
      : Array.isArray(parsed.topics)
      ? parsed.topics
      : Array.isArray(parsed.items)
      ? parsed.items
      : [];
    candidateNames = list.map((item: any) =>
      typeof item === 'string' ? item : typeof item?.name === 'string' ? item.name : ''
    );
  } else {
    candidateNames = extractLineItems(raw);
  }

  const seen = new Set<string>();
  const subtopics: SubtopicTag[] = [];
  for (const name of candidateNames) {
    const label = cleanLabel(name, MAX_SUBTOPIC_NAME_LENGTH, false);
    if (label.length < 2) continue;
    const slug = slugifyGoalName(label);
    if (seen.has(slug)) continue;
    seen.add(slug);
    subtopics.push({ name: label, slug });
    if (subtopics.length >= MAX_SUBTOPICS_PER_GOAL) break;
  }

  if (subtopics.length === 0) return null;
  return { topic, subtopics };
}

// ---------------------------------------------------------------------------
// Goal mastery computation
// ---------------------------------------------------------------------------

export interface SubtopicMastery {
  id: string;
  name: string;
  slug: string;
  masteryPct: number;
  attempts: number;
}

export interface LearnerStateLite {
  conceptSlug: string;
  mastery: number;
  attempts: number;
}

export interface GoalMasteryResult {
  goalId?: string;
  title: string;
  masteryPct: number;
  subtopics: SubtopicMastery[];
}

export function computeGoalMastery(
  title: string,
  subtopics: Array<{ id: string; name: string; slug: string }>,
  learnerStates: LearnerStateLite[]
): GoalMasteryResult {
  const stateBySlug = new Map<string, LearnerStateLite>();
  for (const s of learnerStates || []) {
    if (s && typeof s.conceptSlug === 'string') {
      stateBySlug.set(s.conceptSlug, s);
    }
  }

  const subtopicRows: SubtopicMastery[] = subtopics.map((st) => {
    const nameSlug = slugifyGoalName(st.name);
    const bySlug = stateBySlug.get(st.slug);
    const byName =
      bySlug ||
      [...stateBySlug.values()].find((s) => {
        const stateSlug = slugifyGoalName(s.conceptSlug);
        return (
          stateSlug === nameSlug ||
          (nameSlug.length >= 4 && stateSlug.startsWith(`${nameSlug}_`))
        );
      });
    const match = byName;
    const mastery = match ? Number(match.mastery) || 0 : 0;
    return {
      id: st.id,
      name: st.name,
      slug: st.slug,
      masteryPct: Math.round(Math.max(0, Math.min(1, mastery)) * 100),
      attempts: match ? Number(match.attempts) || 0 : 0,
    };
  });

  const total = subtopicRows.reduce((sum, s) => sum + s.masteryPct, 0);
  const masteryPct = subtopicRows.length > 0 ? Math.round(total / subtopicRows.length) : 0;

  return { title, masteryPct, subtopics: subtopicRows };
}

// ---------------------------------------------------------------------------
// Persistent-memory system prompt block
// ---------------------------------------------------------------------------

export interface GoalMemoryGoal {
  title: string;
  masteryPct: number;
  subtopics: Array<{ name: string; masteryPct: number }>;
}

export function buildGoalMemoryBlock(goals: GoalMemoryGoal[]): string {
  if (!goals || goals.length === 0) return '';

  const lines: string[] = [
    'PERSISTENT LEARNER MEMORY (auto-maintained; always honor this):',
    'The student is actively working toward mastery of these learning goals:',
  ];

  for (const goal of goals) {
    const subList =
      goal.subtopics && goal.subtopics.length > 0
        ? goal.subtopics.map((s) => `${s.name} (${s.masteryPct}%)`).join(', ')
        : 'subtopics not yet chosen';
    lines.push(`- ${goal.title}: ${goal.masteryPct}% mastered. Subtopics: ${subList}.`);
  }

  lines.push(
    'How to use this memory:',
    '- When the current message genuinely relates to one of these goals (same subject or concept), connect your guidance to the weakest subtopics and OFFER to generate a short test to measure mastery: say something like "Want me to give you a quick test on <subtopic>?" and wait for the student to agree. Use the get_learning_goals tool if you need current mastery numbers.',
    '- If the message is about something unrelated to these goals, answer it normally and well; do NOT force the goals or nag about tests.',
    '- Never mention this memory block itself; treat it as what you naturally know about the student.'
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Client-goal sanitization (read-only demo fallback)
// ---------------------------------------------------------------------------

export interface ClientGoalLite {
  id: string;
  title: string;
  masteryPct: number;
}

export function sanitizeClientGoals(raw: unknown): ClientGoalLite[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g): g is Record<string, unknown> => Boolean(g) && typeof g === 'object')
    .map((g) => ({
      id: cleanLabel(g.id, 64) || 'client-goal',
      title: cleanLabel(g.title, MAX_GOAL_TITLE_LENGTH),
      masteryPct: Math.round(Math.max(0, Math.min(100, Number(g.masteryPct) || 0))),
    }))
    .filter((g) => g.title.length >= 1)
    .slice(0, MAX_CLIENT_GOALS);
}

// ---------------------------------------------------------------------------
// Shared DB loader (routes + chat agent)
// ---------------------------------------------------------------------------

/**
 * Loads the user's goals with subtopics and derives mastery from
 * learner_concept_state (the single source of truth).
 */
export async function loadGoalMastery(
  scopedClient: SupabaseClient,
  userId: string
): Promise<GoalMasteryResult[]> {
  const { data: goals } = await scopedClient
    .from('learning_goals')
    .select('id, title, goal_subtopics(id, name, slug, order_index)')
    .order('created_at', { ascending: true });
  if (!goals || goals.length === 0) return [];

  const { data: states } = await scopedClient
    .from('learner_concept_state')
    .select('mastery, attempts, concepts(slug, name)')
    .eq('user_id', userId);

  const learnerStates: LearnerStateLite[] = (states || []).map((s: any) => ({
    conceptSlug: (s.concepts as any)?.slug || '',
    mastery: Number(s.mastery ?? 0),
    attempts: Number(s.attempts ?? 0),
  }));

  return goals.map((g: any) => {
    const subtopics = (g.goal_subtopics || [])
      .slice()
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((s: any) => ({ id: s.id, name: s.name, slug: s.slug }));
    return { ...computeGoalMastery(g.title, subtopics, learnerStates), goalId: g.id };
  });
}
