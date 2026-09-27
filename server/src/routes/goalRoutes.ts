import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { createScopedClient } from '../config/supabase.js';
import {
  loadGoalMastery,
  slugifyGoalName,
  deleteGoalCascade,
  sweepUnlinkedQuizzesForGoals,
  MAX_SUBTOPICS_PER_GOAL,
} from '../services/goalService.js';

export const goalsRouter = Router();

// GET /api/goals - List the user's learning goals with live mastery percentages
goalsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;

  try {
    const goals = await loadGoalMastery(scopedClient, userId);
    res.json({ goals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/goals/generate-subtopics - AI subtopic plan for a topic (no writes)
goalsRouter.post('/generate-subtopics', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim().slice(0, 80) : '';
  if (!topic) {
    res.status(400).json({ error: 'A topic is required' });
    return;
  }

  try {
    const { getLLM } = await import('../agent/langchainAgent.js');
    const llm = getLLM(process.env.GROQ_MODEL || 'openai/gpt-oss-120b', 0.4, 500);
    const response = await llm.invoke(
      `A student wants to master the topic "${topic}". Break it into the 4 to 6 most essential subtopics a learner must master, ordered from foundational to advanced. Each subtopic name must be at most 5 words. Return ONLY a JSON object exactly like: {"topic":"<the topic>","subtopics":["<name>","<name>"]}`
    );
    const rawContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    const { parseSubtopicPlan } = await import('../services/goalService.js');
    const plan = parseSubtopicPlan(rawContent, topic);
    if (!plan || plan.subtopics.length === 0) {
      res.status(502).json({ error: 'Could not generate subtopics for that topic. Try adding them manually.' });
      return;
    }
    res.json({ plan });
  } catch (err: any) {
    console.error('generate-subtopics failed:', err.message);
    res.status(502).json({ error: 'Subtopic generation failed. Try again or add subtopics manually.' });
  }
});

// POST /api/goals - Create a goal (optionally with its reviewed subtopic plan)
goalsRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;

  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 80) : '';
  const source = req.body?.source === 'onboarding' ? 'onboarding' : 'manual';
  const subtopics: string[] = Array.isArray(req.body?.subtopics)
    ? req.body.subtopics
        .filter((s: any) => typeof s === 'string' && s.trim().length >= 1)
        .map((s: string) => s.trim().slice(0, 60))
    : [];

  if (!title) {
    res.status(400).json({ error: 'A topic title is required' });
    return;
  }

  try {
    const slug = slugifyGoalName(title);
    const { data: existing } = await scopedClient
      .from('learning_goals')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (existing) {
      res.status(409).json({ error: `You already have a goal for "${title}"` });
      return;
    }

    const { data: goal, error: goalError } = await scopedClient
      .from('learning_goals')
      .insert({ user_id: userId, title, slug, source })
      .select()
      .single();
    if (goalError || !goal) {
      res.status(500).json({ error: goalError?.message || 'Failed to create goal' });
      return;
    }

    if (subtopics.length > 0) {
      const rows = subtopics.slice(0, MAX_SUBTOPICS_PER_GOAL).map((name, idx) => ({
        goal_id: goal.id,
        user_id: userId,
        name,
        slug: slugifyGoalName(name),
        order_index: idx,
      }));
      const { error: stError } = await scopedClient.from('goal_subtopics').insert(rows);
      if (stError) console.error('goal_subtopics insert failed (non-fatal):', stError.message);
    }

    // First-login onboarding completed: stamp the flag so the popup does not
    // reappear for this account (RLS blocks the read-only demo account).
    if (source === 'onboarding') {
      await scopedClient
        .from('user_profiles')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', userId);
    }

    const goals = await loadGoalMastery(scopedClient, userId);
    res.status(201).json({ goal, goals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/goals/:id/subtopics - Add a subtopic to a goal
goalsRouter.post('/:id/subtopics', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;
  const goalId = req.params.id;

  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
  if (!name) {
    res.status(400).json({ error: 'A subtopic name is required' });
    return;
  }

  try {
    const { count } = await scopedClient
      .from('goal_subtopics')
      .select('id', { count: 'exact', head: true })
      .eq('goal_id', goalId);
    if ((count ?? 0) >= MAX_SUBTOPICS_PER_GOAL) {
      res.status(400).json({ error: `A goal can have at most ${MAX_SUBTOPICS_PER_GOAL} subtopics` });
      return;
    }

    const { data: goalExists } = await scopedClient
      .from('learning_goals')
      .select('id')
      .eq('id', goalId)
      .maybeSingle();
    if (!goalExists) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    const { data: subtopic, error } = await scopedClient
      .from('goal_subtopics')
      .insert({ goal_id: goalId, user_id: userId, name, slug: slugifyGoalName(name), order_index: count ?? 0 })
      .select()
      .single();
    if (error) {
      if ((error as any).code === '23505') {
        res.status(409).json({ error: 'That subtopic already exists on this goal' });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json({ subtopic });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/goals/:id/subtopics/:sid - Remove a subtopic from a goal
goalsRouter.delete('/:id/subtopics/:sid', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);

  try {
    const { error } = await scopedClient
      .from('goal_subtopics')
      .delete()
      .eq('id', req.params.sid)
      .eq('goal_id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/goals/:id - Remove a goal. The schema's ON DELETE CASCADE
// erases its subtopics AND every quiz linked via quizzes.goal_linkage (plus
// those quizzes' attempts, telemetry, and concept mappings). A post-delete
// sweep then erases any remaining ORPHANED unlinked quizzes whose topic
// matches no current goal/subtopic (covers pre-migration quizzes).
goalsRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;

  try {
    await deleteGoalCascade(scopedClient, req.params.id);
    // Sweep AFTER the goal is gone: any unlinked quiz whose topic no longer
    // matches a current goal is orphaned and must not linger in the Quizzes
    // Arena. Best-effort: a sweep failure must not fail the delete itself.
    let swept: { deleted: number; quizIds: string[] } | null = null;
    try {
      const goals = await loadGoalMastery(scopedClient, userId);
      const goalRows = goals.map((g) => ({
        id: g.goalId || '',
        title: g.title,
        slug: slugifyGoalName(g.title),
        subtopics: g.subtopics.map((s) => ({ name: s.name, slug: s.slug })),
      }));
      swept = await sweepUnlinkedQuizzesForGoals(scopedClient, goalRows, userId);
    } catch (sweepErr: any) {
      console.error('orphan quiz sweep failed (non-fatal):', sweepErr?.message || sweepErr);
    }
    res.json({ success: true, swept });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
