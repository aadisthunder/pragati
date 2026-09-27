/**
 * Pure quiz-grouping logic for the Quizzes Arena page.
 *
 * Quizzes generated from a "Test me" flow carry the goal subtopic in their
 * topic (often with a difficulty label appended, e.g. "Fundamental Data
 * Structures – Beginner"). Grouping those into one linked card per topic —
 * and matching the group back to the user's learning goal — makes progress
 * legible: one bigger box per My-Topics entry, mastery included, with the
 * standalone one-off quizzes listed separately below.
 */

export interface QuizLike {
  id: string;
  topic: string;
  difficulty: string;
  total_questions: number;
  created_at: string;
}

export interface GoalSubtopicLike {
  id: string;
  name: string;
  slug: string;
  masteryPct: number;
  attempts: number;
}

export interface GoalLike {
  goalId: string;
  title: string;
  masteryPct: number;
  subtopics: GoalSubtopicLike[];
}

export interface LinkedQuizGroup {
  /** Normalized topic key shared by every quiz in the group. */
  key: string;
  /** Display topic: the most recent quiz's raw topic. */
  label: string;
  quizzes: QuizLike[];
  goal: GoalLike | null;
  /** The goal subtopic whose name/slug matches the topic, when identifiable. */
  subtopic: GoalSubtopicLike | null;
}

/** Mirror of goalService.normalizeTopicKey for the client (difficulty-label aware). */
export function buildTopicKey(topic: string): string | null {
  const stripped = String(topic || '')
    .replace(/\s*(?:[\u2010-\u2015\-:|\u00b7]\s*)?\(\s*(beginner|intermediate|advanced|expert)\s*\)\s*$/i, '')
    .replace(/\s*[\u2010-\u2015\-:|\u00b7]\s*(beginner|intermediate|advanced|expert)\s*$/i, '')
    .replace(/\s+level:?\s*(beginner|intermediate|advanced|expert)\s*$/i, '')
    .trim();
  const key = stripped
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return key || null;
}

function singularize(key: string): string {
  return key.replace(/_?s$/, '');
}

/**
 * Groups quizzes by normalized topic. A group only forms when two or more
 * quizzes share a topic key, or when the topic matches one of the user's
 * goals/subtopics — a lone quiz with a unique unrelated topic stays
 * independent (no artificial one-item boxes).
 */
export function groupQuizzesByTopic(
  quizzes: QuizLike[],
  goals: GoalLike[]
): { groups: LinkedQuizGroup[]; independents: QuizLike[] } {
  const safeQuizzes = (quizzes || []).filter((q) => q && q.id && q.topic);

  // Build topic keys -> quizzes (stable, newest-first inside each group).
  const byKey = new Map<string, QuizLike[]>();
  for (const q of safeQuizzes) {
    const key = buildTopicKey(q.topic);
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push(q);
    byKey.set(key, list);
  }
  for (const list of byKey.values()) {
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // A topic is "goal-linked" when it matches a goal title, a subtopic name, or a subtopic slug.
  const findGoalFor = (key: string): { goal: GoalLike | null; subtopic: GoalSubtopicLike | null } => {
    const keySingular = singularize(key);
    for (const goal of goals || []) {
      const titleKey = buildTopicKey(goal.title);
      if (titleKey && (titleKey === key || singularize(titleKey) === keySingular)) {
        return { goal, subtopic: null };
      }
      for (const st of goal.subtopics || []) {
        const nameKey = buildTopicKey(st.name) || st.slug;
        const stSingular = singularize(nameKey);
        if (
          nameKey === key ||
          stSingular === keySingular ||
          key.startsWith(`${nameKey}_`) ||
          key.startsWith(`${stSingular}_`)
        ) {
          return { goal, subtopic: st };
        }
      }
    }
    return { goal: null, subtopic: null };
  };

  const groups: LinkedQuizGroup[] = [];
  const independents: QuizLike[] = [];

  for (const [key, list] of byKey.entries()) {
    const { goal, subtopic } = findGoalFor(key);
    if (list.length >= 2 || goal) {
      groups.push({
        key,
        label: list[0].topic,
        quizzes: list,
        goal,
        subtopic,
      });
    } else {
      independents.push(...list);
    }
  }

  // Groups by most recent activity; independents by recency too.
  groups.sort(
    (a, b) =>
      new Date(b.quizzes[0].created_at).getTime() - new Date(a.quizzes[0].created_at).getTime()
  );
  independents.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return { groups, independents };
}
