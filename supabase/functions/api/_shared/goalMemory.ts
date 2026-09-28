/**
 * Goal-memory shared helpers — pure TypeScript (no Deno APIs, no network) so
 * the same logic runs in the Supabase Edge Function, the Express server, and
 * the vitest suite.
 *
 * Responsibilities:
 *   - parseSubtopicPlan: robust extraction of an LLM-generated subtopic plan
 *   - computeGoalMastery: derive per-subtopic and per-goal mastery percentages
 *     from learner_concept_state (the single mastery source of truth)
 *   - buildGoalMemoryBlock: the "persistent memory" block injected into the
 *     chat system prompt so the agent knows the user's mastery goals
 *   - sanitizeClientGoals: safe ingestion of client-provided goals for the
 *     read-only demo account (no DB writes allowed there)
 */

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const MAX_SUBTOPICS_PER_GOAL = 6;
export const MAX_SUBTOPIC_NAME_LENGTH = 60;
export const MAX_GOAL_TITLE_LENGTH = 80;
export const MAX_CLIENT_GOALS = 8;

/**
 * Subtopic slug keys that carry a trailing difficulty tier the quiz agent
 * appends to topics ("Fundamental Data Structures – Beginner" →
 * "fundamental_data_structures_beginner"). Stripped during matching so a
 * beginner quiz on a subtopic attributes to that subtopic's single concept
 * instead of fragmenting mastery across per-difficulty concepts.
 * Mirrors server/src/services/goalService.ts (production parity).
 */
const DIFFICULTY_TIERS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;

export function normalizeTopicKey(topic: string): string {
  const stripped = String(topic || '')
    .replace(/\s*(?:[\u2010-\u2015\-:|\u00b7]\s*)?\(\s*(beginner|intermediate|advanced|expert)\s*\)\s*$/i, '')
    .replace(/\s*[\u2010-\u2015\-:|\u00b7]\s*(beginner|intermediate|advanced|expert)\s*$/i, '')
    .replace(/\s+level:?\s*(beginner|intermediate|advanced|expert)\s*$/i, '')
    .trim();
  return slugifyGoalName(stripped);
}

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
 * Matches a quiz's topic + question text against a goal's subtopics (deduped).
 * Slug-based with singular/plural tolerance, difficulty-label stripping, and a
 * minimum key length guard. Pure; shared by the Edge submit loop and tests.
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
// Subtopic plan parsing (LLM output -> sanitized plan)
// ---------------------------------------------------------------------------

export interface SubtopicTag {
  name: string;
  slug: string;
}

export interface SubtopicPlan {
  topic: string;
  subtopics: SubtopicTag[];
}

/** Converts a concept/topic name to the canonical slug form used across the schema. */
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

/**
 * Trims, strips control chars, and collapses whitespace in one pass.
 * When `truncate` is false, values longer than maxLength return '' — callers
 * use this to REJECT oversized entries instead of silently mangling them.
 */
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

/**
 * Attempts JSON.parse with the same bracket-repair strategy the quiz
 * generator uses, then line-splitting as a last resort. Never throws.
 */
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
      // fall through to bracket repair
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

/** Extracts candidate subtopic names from free text when JSON parsing fails. */
function extractLineItems(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length >= 2 && line.length <= MAX_SUBTOPIC_NAME_LENGTH);
}

/**
 * Robust extractor for an LLM-generated subtopic plan.
 * Accepts fenced JSON, prose-wrapped JSON, or a plain numbered/bulleted list.
 * Returns null only when nothing usable exists.
 */
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
    // Oversized entries are LLM garbage (run-on sentences), not subtopics:
    // reject rather than truncate to a meaningless prefix.
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
  title: string;
  masteryPct: number;
  subtopics: SubtopicMastery[];
}

/**
 * Derives per-subtopic mastery (0-100 int) from learner concept state, plus a
 * goal-level average. learner_concept_state stays the single source of truth;
 * goals only *reference* concepts by slug/name, never duplicate mastery.
 */
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
    // Match precedence: exact slug -> slugified-name equality -> singular/plural
    // bridge -> slug-derived name prefix (learner concept slugs are sometimes
    // name-derived with suffixes, or generated in singular vs plural form).
    // DB joins on exact slugs remain the primary attribution path; name
    // matching is a fallback for cross-referenced concepts.
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
}

/**
 * Builds the compact "persistent memory" block appended to the chat system
 * prompt. This is how the agent *knows* what the user is trying to master and
 * how far along they are — without re-reading the DB every turn in prose.
 *
 * Directives keep tool selection semantic: the model is told to offer a test
 * when the conversation genuinely touches a goal topic, and to answer
 * anything else normally. No keyword gating happens here.
 */
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
 * ("Calculus Functions" ↔ "Calculus") — the same tolerance family as the
 * subtopic matcher above. Pure function; mirrored in server/src/services/
 * goalService.ts and covered by the shared vitest suite.
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
 * Mirrored in goalService.ts.
 */
export async function sweepUnlinkedQuizzesForTopics(
  scopedClient: { from: (table: string) => any },
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
 * error propagates untouched. Mirrored in server/src/services/goalService.ts.
 */
export async function insertQuizRow(
  scopedClient: { from: (table: string) => any },
  row: QuizInsertRowLike
): Promise<{ data: any; error: any; linkageDropped: boolean }> {
  const { data, error } = await scopedClient.from('quizzes').insert(row).select().single();
  if (!error) return { data, error, linkageDropped: false };

  const columnMissing =
    (error as any).code === 'PGRST204' || /goal_linkage/i.test(String((error as any).message || ''));
  if (!columnMissing) return { data, error, linkageDropped: false };

  const { goal_linkage: _dropped, ...withoutLinkage } = row;
  const retry = await scopedClient.from('quizzes').insert(withoutLinkage).select().single();
  return { data: retry.data, error: retry.error, linkageDropped: true };
}

// ---------------------------------------------------------------------------
// Client-goal sanitization (read-only demo fallback)
// ---------------------------------------------------------------------------

export interface ClientGoalLite {
  id: string;
  title: string;
  masteryPct: number;
}

/**
 * Sanitizes goals supplied by the browser for the read-only demo account
 * (which cannot persist goals server-side). Caps count, clamps percentages,
 * and strips newlines/control characters so a malicious client cannot inject
 * prompt directives through goal titles.
 */
export function sanitizeClientGoals(raw: unknown): ClientGoalLite[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g): g is Record<string, unknown> => Boolean(g) && typeof g === 'object')
    .map((g) => ({
      id: cleanLabel(g.id, 64) || 'client-goal',
      title: cleanLabel(g.title, MAX_GOAL_TITLE_LENGTH),
      masteryPct: Math.round(Math.max(0, Math.min(100, Number(g.masteryPct) || 0))),
    }))
    // Single-character topics (e.g. "R") are legitimate; only empty drops.
    .filter((g) => g.title.length >= 1)
    .slice(0, MAX_CLIENT_GOALS);
}
