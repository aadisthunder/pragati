import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { createScopedClient } from '../config/supabase.js';
import { calculateAttemptSummary, calculateUpdatedRating } from '../services/analyticsService.js';

export function sanitizeQuestionsForStudent(questions: any[]) {
  return questions.map(q => {
    const { correct_answer, explanation, ...safeQuestion } = q;
    return safeQuestion;
  });
}

export const quizRouter = Router();

// GET /api/quizzes - List all available quizzes
quizRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  try {
    const { data: quizzes, error } = await scopedClient
      .from('quizzes')
      .select('id, topic, difficulty, total_questions, created_at, created_by')
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ quizzes: quizzes || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/quizzes/:id - Fetch single quiz with sanitized questions for active attempt
quizRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const quizId = req.params.id;

  try {
    const { data: quiz, error: quizError } = await scopedClient
      .from('quizzes')
      .select('*')
      .eq('id', quizId)
      .single();

    if (quizError || !quiz) {
      res.status(404).json({ error: 'Quiz not found' });
      return;
    }

    const { data: questions, error: qError } = await scopedClient
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('order_index', { ascending: true });

    if (qError) {
      res.status(500).json({ error: qError.message });
      return;
    }

    res.json({
      quiz,
      questions: sanitizeQuestionsForStudent(questions || []),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/quizzes/:id/submit - Submit quiz attempt & telemetry
quizRouter.post('/:id/submit', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const quizId = req.params.id;
  const userId = req.user!.id;
  const { answers } = req.body;

  if (!Array.isArray(answers) || answers.length === 0) {
    res.status(400).json({ error: 'answers must be a non-empty array' });
    return;
  }

  try {
    // 1. Fetch real questions to verify answers
    const { data: questions, error: qError } = await scopedClient
      .from('questions')
      .select('id, correct_answer, explanation, prompt')
      .eq('quiz_id', quizId);

    if (qError || !questions || questions.length === 0) {
      res.status(500).json({ error: 'Failed to retrieve quiz questions' });
      return;
    }

    const qMap = new Map(questions.map(q => [q.id, q]));

    // 2. Evaluate answers
    const evaluatedTelemetry: any[] = [];
    for (const ans of answers) {
      const q = qMap.get(ans.question_id);
      if (!q) continue;

      const is_skipped = !ans.selected_answer;
      const is_correct = !is_skipped && ans.selected_answer === q.correct_answer;
      const dwell = Math.max(0, Math.min(7200, Number(ans.dwell_time_sec) || 0));
      const hints = Math.max(0, Math.min(10, Number(ans.hints_used) || 0));

      evaluatedTelemetry.push({
        question_id: ans.question_id,
        user_id: userId,
        selected_answer: ans.selected_answer || null,
        is_correct,
        is_skipped,
        dwell_time_sec: dwell,
        hints_used: hints,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        prompt: q.prompt,
      });
    }

    // 3. Compute attempt summary
    const summary = calculateAttemptSummary(evaluatedTelemetry);

    // 4. Save attempt record
    const { data: attempt, error: attemptError } = await scopedClient
      .from('quiz_attempts')
      .insert({
        user_id: userId,
        quiz_id: quizId,
        score: summary.score,
        total_questions: summary.total_questions,
        total_time_sec: summary.total_time_sec,
        accuracy_pct: summary.accuracy_pct,
      })
      .select()
      .single();

    if (attemptError || !attempt) {
      res.status(500).json({ error: attemptError?.message || 'Failed to save attempt' });
      return;
    }

    // 5. Save telemetry records
    const telemetryToInsert = evaluatedTelemetry.map(t => ({
      attempt_id: attempt.id,
      question_id: t.question_id,
      user_id: userId,
      selected_answer: t.selected_answer,
      is_correct: t.is_correct,
      is_skipped: t.is_skipped,
      dwell_time_sec: t.dwell_time_sec,
      hints_used: t.hints_used,
    }));

    await scopedClient.from('question_telemetry').insert(telemetryToInsert);

    // 6. Update user's rating in user_profiles
    const { data: profile } = await scopedClient
      .from('user_profiles')
      .select('skill_rating')
      .eq('id', userId)
      .single();

    const currentRating = profile?.skill_rating || 1200;
    const newRating = calculateUpdatedRating(currentRating, summary.accuracy_pct);

    await scopedClient
      .from('user_profiles')
      .update({ skill_rating: newRating, updated_at: new Date().toISOString() })
      .eq('id', userId);

    res.json({
      attempt_id: attempt.id,
      summary: {
        ...summary,
        old_rating: currentRating,
        new_rating: newRating,
        rating_change: newRating - currentRating,
      },
      results: evaluatedTelemetry,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper for cascading quiz deletion
export async function deleteQuizCascade(
  scopedClient: any,
  quizId: string
): Promise<{ success: boolean; message: string }> {
  // 1. Find attempts for this quiz
  const { data: attempts } = await scopedClient
    .from('quiz_attempts')
    .select('id')
    .eq('quiz_id', quizId);

  const attemptIds = (attempts || []).map((a: any) => a.id);

  // 2. Find questions for this quiz
  const { data: questions } = await scopedClient
    .from('questions')
    .select('id')
    .eq('quiz_id', quizId);

  const questionIds = (questions || []).map((q: any) => q.id);

  // 3. Delete question telemetry by attempt_ids or question_ids
  if (attemptIds.length > 0) {
    await scopedClient
      .from('question_telemetry')
      .delete()
      .in('attempt_id', attemptIds);
  }
  if (questionIds.length > 0) {
    await scopedClient
      .from('question_telemetry')
      .delete()
      .in('question_id', questionIds);
  }

  // 4. Delete quiz attempts
  await scopedClient
    .from('quiz_attempts')
    .delete()
    .eq('quiz_id', quizId);

  // 5. Delete questions
  await scopedClient
    .from('questions')
    .delete()
    .eq('quiz_id', quizId);

  // 6. Delete quiz record
  const { error: quizError } = await scopedClient
    .from('quizzes')
    .delete()
    .eq('id', quizId);

  if (quizError) {
    throw new Error(quizError.message);
  }

  return { success: true, message: 'Quiz deleted successfully' };
}

// DELETE /api/quizzes/:id - Delete a quiz and all associated data
quizRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const quizId = req.params.id;

  try {
    const result = await deleteQuizCascade(scopedClient, quizId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

