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

  /** Trims singular/plural drift so "arrays" ↔ "array" match. */
  const singularize = (slug: string) => slug.replace(/_?s$/, '');

  const subtopicRows: SubtopicMastery[] = subtopics.map((st) => {
    const nameSlug = slugifyGoalName(st.name);
    const singularSlug = singularize(st.slug);
    const singularNameSlug = singularize(nameSlug);
    const bySlug = stateBySlug.get(st.slug);
    const byName =
      bySlug ||
      [...stateBySlug.values()].find((s) => {
        const stateSlug = slugifyGoalName(s.conceptSlug);
        const stateSingular = singularize(stateSlug);
        return (
          stateSlug === nameSlug ||
          stateSingular === singularSlug ||
          stateSingular === singularNameSlug ||
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

  const goalTitleSlug = slugifyGoalName(title);
  const topicState =
    stateBySlug.get(goalTitleSlug) ||
    [...stateBySlug.values()].find((s) => {
      const stateSlug = slugifyGoalName(s.conceptSlug);
      return (
        stateSlug === goalTitleSlug ||
        (goalTitleSlug.length >= 3 && stateSlug.startsWith(`${goalTitleSlug}_`)) ||
        (stateSlug.length >= 3 && goalTitleSlug.startsWith(`${stateSlug}_`))
      );
    });
  const topicMasteryPct = topicState ? Math.round(Math.max(0, Math.min(1, Number(topicState.mastery) || 0)) * 100) : 0;

  const total = subtopicRows.reduce((sum, s) => sum + s.masteryPct, 0);
  const subtopicsAssessed = subtopicRows.some((s) => s.attempts > 0 || s.masteryPct > 0);

  let masteryPct = 0;
  if (subtopicsAssessed && subtopicRows.length > 0) {
    masteryPct = Math.round(total / subtopicRows.length);
  } else if (topicMasteryPct > 0) {
    masteryPct = topicMasteryPct;
  } else if (subtopicRows.length > 0) {
    masteryPct = Math.round(total / subtopicRows.length);
  }

  return { title, masteryPct, subtopics: subtopicRows };
}

// ---------------------------------------------------------------------------
// Persistent-memory system prompt block
// ---------------------------------------------------------------------------

export interface GoalMemoryGoal {
  title: string;
  masteryPct: number;
  subtopics: Array<{ name: string; masteryPct: number }>;
  /** Student-maintained context file for this topic (chat picker "context note"). */
  contextNote?: string;
}

/**
 * Builds the PERSISTENT LEARNER MEMORY system-prompt block.
 *
 * `activeGoalTitle` marks the topic selected in the chat header picker: the
 * block then names it ACTIVE first, surfaces its weakest subtopics, and
 * includes the student's context notes so requests like "make me a test"
 * default to that topic instead of the model guessing.
 */
export function buildGoalMemoryBlock(goals: GoalMemoryGoal[], activeGoalTitle?: string): string {
  if (!goals || goals.length === 0) return '';

  const lines: string[] = [
    'PERSISTENT LEARNER MEMORY (auto-maintained; always honor this):',
    'The student is actively working toward mastery of these learning goals:',
  ];

  const ordered = [...goals].sort((a, b) => {
    if (activeGoalTitle) {
      if (a.title === activeGoalTitle) return -1;
      if (b.title === activeGoalTitle) return 1;
    }
    return 0;
  });

  for (const goal of ordered) {
    const isActive = Boolean(activeGoalTitle) && goal.title === activeGoalTitle;
    const subList =
      goal.subtopics && goal.subtopics.length > 0
        ? goal.subtopics.map((s) => `${s.name} (${s.masteryPct}%)`).join(', ')
        : 'subtopics not yet chosen';
    lines.push(`- ${isActive ? 'ACTIVE: ' : ''}${goal.title}: ${goal.masteryPct}% mastered. Subtopics: ${subList}.`);
    if (isActive && goal.contextNote && goal.contextNote.trim()) {
      lines.push(`  Student context for ${goal.title}: ${goal.contextNote.trim()}`);
    }
  }

  const active = activeGoalTitle ? goals.find((g) => g.title === activeGoalTitle) : undefined;
  if (active) {
    lines.push(
      `ACTIVE TOPIC: ${active.title}. The student selected this topic in the chat header, so the current conversation is about it.`,
      '- Requests like "test me", "make me a test", or "generate a quiz" with no explicit topic refer to the ACTIVE TOPIC: call check_topic_mastery for it and negotiate the subtopic Socratically (lead with its weakest subtopic).',
      '- Explanations, examples, and difficulty should assume this topic unless the student clearly switches subjects.'
    );
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
// Active-topic chat context (header picker plumbing)
// ---------------------------------------------------------------------------

/** Minimal goal-row shape needed to resolve the picker selection to a title. */
export interface GoalIdTitleRow {
  id: string;
  title: string;
}

/**
 * Resolves the chat header picker's activeGoalId to the goal's title for the
 * system-prompt block. Unknown/missing ids yield undefined (no active topic).
 */
export function resolveActiveGoalTitle(
  goalRows: GoalIdTitleRow[],
  activeGoalId?: string
): string | undefined {
  if (!activeGoalId || !goalRows || goalRows.length === 0) return undefined;
  return goalRows.find((g) => g && g.id === activeGoalId)?.title;
}

/** Hard cap for student context files (kept small: it enters every prompt). */
export const CONTEXT_NOTE_MAX_LENGTH = 500;

/**
 * Validates a student context note before storage: strings only, control
 * characters stripped, CRLF normalized, trimmed, length-capped. Anything else
 * becomes undefined ("no context file").
 */
export function sanitizeContextNote(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const cleaned = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, CONTEXT_NOTE_MAX_LENGTH);
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

/**
 * Subtopic slug keys that carry a trailing difficulty tier the quiz agent
 * appends to topics ("Fundamental Data Structures – Beginner" →
 * "fundamental_data_structures_beginner"). Stripped during matching so a
 * beginner quiz on a subtopic attributes to that subtopic's single concept
 * instead of fragmenting mastery across per-difficulty concepts.
 */
const DIFFICULTY_TIERS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;

/**
 * Normalizes a topic/title for matching: slugified, with any trailing
 * "– <difficulty>" label removed first so it never pollutes the key.
 * A difficulty word is only a suffix label when it follows a separator
 * (dash, en-dash, colon, parenthesis, "|", "level"). Bare titles like
 * "Advanced Data Structures" keep their leading difficulty word.
 */
export function normalizeTopicKey(topic: string): string {
  const stripped = String(topic || '')
    .replace(/\s*(?:[\u2010-\u2015\-:|\u00b7]\s*)?\(\s*(beginner|intermediate|advanced|expert)\s*\)\s*$/i, '')
    .replace(/\s*[\u2010-\u2015\-:|\u00b7]\s*(beginner|intermediate|advanced|expert)\s*$/i, '')
    .replace(/\s+level:?\s*(beginner|intermediate|advanced|expert)\s*$/i, '')
    .trim();
  return slugifyGoalName(stripped);
}

/** Removes a trailing "_<difficulty>" segment from an already-slugified key. */
export function stripDifficultySuffixKey(slugKey: string): string {
  return String(slugKey || '').replace(
    new RegExp(`_(${DIFFICULTY_TIERS.join('|')})$`),
    ''
  );
}

function singularizeKey(key: string): string {
  return key.replace(/_?s$/, '');
}

export interface SubtopicKeyInput {
  name: string;
  slug: string;
}

/**
 * Matches a quiz's topic + question text against a goal's subtopics. Returns
 * the matched subtopics (deduped, insertion order preserved). Comparison is
 * slug-based with singular/plural tolerance, difficulty-label stripping, and
 * a minimum key length guard so short names never over-match. Pure function:
 * shared by the Express submit loop, the Edge submit loop, and tests.
 */
export function findGoalSubtopicMatches(
  quizTopic: string,
  questionText: string,
  subtopics: SubtopicKeyInput[]
): SubtopicKeyInput[] {
  const topicKey = normalizeTopicKey(quizTopic);
  const topicSingular = singularizeKey(topicKey);
  const textKey = slugifyGoalName(String(questionText || ''));

  const matched: SubtopicKeyInput[] = [];
  const seen = new Set<string>();
  for (const st of subtopics || []) {
    if (!st || !st.name) continue;
    const nameKey = normalizeTopicKey(st.name);
    if (nameKey.length < 4) continue; // over-broad containment guard
    const nameSingular = singularizeKey(nameKey);
    const slugKey = stripDifficultySuffixKey(slugifyGoalName(st.slug || st.name));
    const slugSingular = singularizeKey(slugKey);

    const topicMatches =
      topicKey === nameKey ||
      topicKey === slugKey ||
      (nameKey.length >= 4 &&
        (topicSingular === nameSingular ||
          topicSingular === slugSingular ||
          topicKey.startsWith(`${nameKey}_`) ||
          topicKey.startsWith(`${slugKey}_`) ||
          topicKey.startsWith(`${nameSingular}_`) ||
          topicKey.startsWith(`${slugSingular}_`)));
    const textMatches =
      textKey.length >= 4 &&
      (textKey.includes(nameKey) ||
        textKey.includes(slugKey) ||
        textKey.includes(nameKey.replace(/_/g, ' ')) ||
        textKey.includes(slugKey.replace(/_/g, ' ')));

    if (topicMatches || textMatches) {
      if (!seen.has(nameKey)) {
        seen.add(nameKey);
        matched.push(st);
      }
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Quiz ↔ goal linkage (delete-a-topic erases its quizzes)
// ---------------------------------------------------------------------------

/** Minimal shape of a learning_goals row needed to resolve a quiz's linkage. */
export interface GoalLinkRowLike {
  id: string;
  title: string;
  slug: string;
  /** Optional joined subtopics — quizzes are often named after a SUBTOPIC
   * ("Basic Data Structures" under a "DSA" goal), so linkage must consider
   * subtopic names/slugs too, or goal deletion strands those quizzes. */
  subtopics?: Array<{ name: string; slug: string }>;
}

export interface QuizInsertRowLike {
  created_by: string;
  topic: string;
  difficulty: string;
  total_questions: number;
  goal_linkage?: string | null;
}

/**
 * Resolves which learning goal a quiz topic belongs to, if any. Matching is
 * slug-based: exact title/slug equality, or a goal-title prefix relationship
 * ("Calculus Functions" ↔ "Calculus") — the same tolerance family as
 * findGoalSubtopicMatches. Pure function, mirrored in the Edge _shared copy.
 */
export function resolveGoalLinkage(
  quizTopic: string,
  goalRows: GoalLinkRowLike[]
): { goalId: string } | null {
  const key = normalizeTopicKey(quizTopic);
  if (!key) return null;
  for (const goal of goalRows || []) {
    if (!goal || !goal.id) continue;
    const titleKey = normalizeTopicKey(goal.title);
    const slugKey = slugifyGoalName(goal.slug || goal.title);
    if (key === titleKey || key === slugKey) return { goalId: goal.id };
    // Subdomain topics: "Calculus Functions" under a "Calculus" goal (both
    // directions), guarded to ≥4 chars so short slugs never over-match.
    if (titleKey.length >= 4 && key.startsWith(`${titleKey}_`)) return { goalId: goal.id };
    if (key.length >= 4 && titleKey.startsWith(`${key}_`)) return { goalId: goal.id };
    if (slugKey.length >= 4 && key.startsWith(`${slugKey}_`)) return { goalId: goal.id };
    if (key.length >= 4 && slugKey.startsWith(`${key}_`)) return { goalId: goal.id };
    // Subtopic-named quizzes: "Basic Data Structures – Beginner" under a
    // "DSA" goal whose subtopic is "Basic Data Structures".
    for (const st of goal.subtopics || []) {
      if (!st) continue;
      const stKey = normalizeTopicKey(st.name) || slugifyGoalName(st.slug || '');
      if (!stKey || stKey.length < 4) continue;
      const stSingular = stKey.replace(/_?s$/, '');
      const keySingular = key.replace(/_?s$/, '');
      if (
        key === stKey ||
        keySingular === stSingular ||
        key.startsWith(`${stKey}_`) ||
        key.startsWith(`${stSingular}_`)
      ) {
        return { goalId: goal.id };
      }
    }
  }
  return null;
}

export interface OrphanSweepResult {
  deleted: number;
  quizIds: string[];
}

/**
 * Erases already-orphaned quizzes SCOPE TO THE DELETED GOAL: unlinked rows
 * (goal_linkage IS NULL — created before the linkage column existed) whose
 * topic derives from the goal being deleted (its title, slug, or subtopics).
 *
 * SCOPE BUG (live-certification lesson): an earlier version swept ALL
 * unlinked quizzes matching no current goal — that erased the seeded judge
 * demo quiz and users' genuine standalone one-offs. Deleting ONE topic must
 * only take quizzes OF that topic. Everything else stays.
 *
 * Mirrored in _shared/goalMemory.ts.
 */
export async function sweepUnlinkedQuizzesForTopics(
  scopedClient: SupabaseClient,
  deletedGoal: GoalLinkRowLike,
  currentGoalRows: GoalLinkRowLike[]
): Promise<OrphanSweepResult> {
  const { data: unlinked, error } = await scopedClient
    .from('quizzes')
    .select('id, topic')
    .is('goal_linkage', null);
  if (error) throw new Error(error.message);

  const orphans = (unlinked || []).filter((q: any) => {
    if (!q?.id) return false;
    const belongsToDeletedGoal = resolveGoalLinkage(q.topic, [deletedGoal]) !== null;
    const belongsToCurrentGoal = resolveGoalLinkage(q.topic, currentGoalRows) !== null;
    return belongsToDeletedGoal && !belongsToCurrentGoal;
  });
  const orphanIds = orphans.map((q: any) => q.id);
  if (orphanIds.length === 0) return { deleted: 0, quizIds: [] };

  const { error: delError } = await scopedClient
    .from('quizzes')
    .delete()
    .in('id', orphanIds);
  if (delError) throw new Error(delError.message);
  return { deleted: orphanIds.length, quizIds: orphanIds };
}

/**
 * Builds the quizzes insert row with goal_linkage resolved. Standalone topics
 * get goal_linkage: null so the column stays clean (DB cascade only fires for
 * genuinely linked quizzes). Pure function shared by Express and Edge.
 */
export function buildQuizInsertRow(
  base: Omit<QuizInsertRowLike, 'goal_linkage'>,
  goalRows: GoalLinkRowLike[]
): QuizInsertRowLike {
  const linkage = resolveGoalLinkage(base.topic, goalRows);
  return { ...base, goal_linkage: linkage ? linkage.goalId : null };
}

/**
 * Performs the quizzes insert with deploy-order tolerance: if the database
 * has not yet received the goal_linkage migration (PGRST204 "Could not find
 * the 'goal_linkage' column"), retry ONCE without the column so quiz
 * generation degrades to pre-linkage behavior instead of breaking. Any other
 * error propagates untouched.
 */
export async function insertQuizRow(
  scopedClient: SupabaseClient,
  row: QuizInsertRowLike
): Promise<{ data: any; error: any; linkageDropped: boolean }> {
  const { data, error } = await scopedClient.from('quizzes').insert(row).select().single();
  if (!error) return { data, error, linkageDropped: false };

  const columnMissing =
    error.code === 'PGRST204' || /goal_linkage/i.test(String(error.message || ''));
  if (!columnMissing) return { data, error, linkageDropped: false };

  const { goal_linkage: _dropped, ...withoutLinkage } = row;
  const retry = await scopedClient.from('quizzes').insert(withoutLinkage).select().single();
  return { data: retry.data, error: retry.error, linkageDropped: true };
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

/**
 * Deletes a learning goal. The database's ON DELETE CASCADE handles the
 * destruction order (goal → subtopics → linked quizzes → their attempts,
 * telemetry, and question_concepts), so the application layer performs the
 * single goal delete and propagates any error verbatim.
 */
export async function deleteGoalCascade(
  scopedClient: SupabaseClient,
  goalId: string
): Promise<void> {
  const { error } = await scopedClient.from('learning_goals').delete().eq('id', goalId);
  if (error) throw new Error(error.message);
}
