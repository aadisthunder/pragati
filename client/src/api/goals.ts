import { apiRequest, apiRequestCached, invalidateCache, getFromCache } from './client';

// ---------------------------------------------------------------------------
// Types (mirror the server's GoalMasteryResult shape)
// ---------------------------------------------------------------------------

export interface SubtopicMastery {
  id: string;
  name: string;
  slug: string;
  masteryPct: number;
  attempts: number;
}

export interface GoalWithMastery {
  goalId: string;
  title: string;
  masteryPct: number;
  subtopics: SubtopicMastery[];
}

export interface SubtopicPlan {
  topic: string;
  subtopics: Array<{ name: string; slug: string }>;
}

export const GOALS_CACHE_KEY = '/api/goals';
export const GOALS_UPDATED_EVENT = 'learning_goals_updated';
/** sessionStorage key for the read-only demo's session-only goal memory. */
export const DEMO_GOALS_STORAGE_KEY = 'pragati_demo_goals';

export function dispatchGoalsUpdated() {
  window.dispatchEvent(new Event(GOALS_UPDATED_EVENT));
}

export function getGoalsFromCache(): GoalWithMastery[] {
  return getFromCache<{ goals: GoalWithMastery[] }>(GOALS_CACHE_KEY)?.goals || [];
}

export async function fetchGoals(): Promise<GoalWithMastery[]> {
  const data = await apiRequestCached<{ goals: GoalWithMastery[] }>(GOALS_CACHE_KEY);
  return data.goals || [];
}

export async function refreshGoals(): Promise<GoalWithMastery[]> {
  invalidateCache(GOALS_CACHE_KEY);
  return fetchGoals();
}

export async function createGoal(payload: {
  title: string;
  subtopics?: string[];
  source?: 'onboarding' | 'manual';
}): Promise<GoalWithMastery[]> {
  const data = await apiRequest<{ goals: GoalWithMastery[] }>(GOALS_CACHE_KEY, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  invalidateCache(GOALS_CACHE_KEY);
  return data.goals || [];
}

export async function deleteGoal(goalId: string): Promise<void> {
  await apiRequest(`/api/goals/${goalId}`, { method: 'DELETE' });
  invalidateCache(GOALS_CACHE_KEY);
}

export async function addSubtopic(goalId: string, name: string): Promise<void> {
  await apiRequest(`/api/goals/${goalId}/subtopics`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  invalidateCache(GOALS_CACHE_KEY);
}

export async function removeSubtopic(goalId: string, subtopicId: string): Promise<void> {
  await apiRequest(`/api/goals/${goalId}/subtopics/${subtopicId}`, { method: 'DELETE' });
  invalidateCache(GOALS_CACHE_KEY);
}

export async function generateSubtopics(topic: string): Promise<SubtopicPlan> {
  const data = await apiRequest<{ plan: SubtopicPlan }>('/api/goals/generate-subtopics', {
    method: 'POST',
    body: JSON.stringify({ topic }),
  });
  return data.plan;
}

export async function completeOnboarding(): Promise<void> {
  await apiRequest('/api/onboarding/complete', { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Read-only demo session memory (the demo account cannot persist goals)
// ---------------------------------------------------------------------------

export function saveDemoGoalsSession(goals: GoalWithMastery[]) {
  try {
    sessionStorage.setItem(
      DEMO_GOALS_STORAGE_KEY,
      JSON.stringify(
        goals.map((g) => ({
          id: g.goalId,
          title: g.title,
          masteryPct: g.masteryPct,
        }))
      )
    );
  } catch {
    // storage unavailable — chat simply runs without client goal memory
  }
}

export function getDemoGoalsSession(): Array<{ id: string; title: string; masteryPct: number }> {
  try {
    const raw = sessionStorage.getItem(DEMO_GOALS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
