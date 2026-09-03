import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { createScopedClient } from '../config/supabase.js';

export const analyticsRouter = Router();

// GET /api/analytics/dashboard - Aggregate performance and missed questions
analyticsRouter.get('/dashboard', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;

  try {
    // 1. Fetch user profile
    const { data: profile } = await scopedClient
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    // 2. Fetch attempts
    const { data: attempts } = await scopedClient
      .from('quiz_attempts')
      .select('id, quiz_id, score, total_questions, accuracy_pct, total_time_sec, completed_at, quizzes(topic, difficulty)')
      .eq('user_id', userId)
      .order('completed_at', { ascending: true });

    const attemptsList = attempts || [];
    const totalAttempts = attemptsList.length;

    let totalScore = 0;
    let totalQuestions = 0;
    let totalTimeSec = 0;

    for (const att of attemptsList) {
      totalScore += att.score;
      totalQuestions += att.total_questions;
      totalTimeSec += att.total_time_sec;
    }

    const overallAccuracy = totalQuestions > 0 
      ? Number(((totalScore / totalQuestions) * 100).toFixed(1)) 
      : 0;

    const avgDwellTimeSec = totalQuestions > 0 
      ? Number((totalTimeSec / totalQuestions).toFixed(1)) 
      : 0;

    // 3. Topic breakdown
    const topicMap: Record<string, { attempts: number; score: number; total: number }> = {};
    for (const att of attemptsList) {
      const topic = (att.quizzes as any)?.topic || 'General';
      if (!topicMap[topic]) topicMap[topic] = { attempts: 0, score: 0, total: 0 };
      topicMap[topic].attempts++;
      topicMap[topic].score += att.score;
      topicMap[topic].total += att.total_questions;
    }

    const topicMastery = Object.entries(topicMap).map(([topic, stats]) => ({
      topic,
      attempts: stats.attempts,
      accuracy_pct: stats.total > 0 ? Number(((stats.score / stats.total) * 100).toFixed(1)) : 0,
    }));

    // 4. Fetch missed and skipped questions with prompts for review
    const { data: missedQuestions } = await scopedClient
      .from('question_telemetry')
      .select('id, question_id, attempt_id, selected_answer, is_correct, is_skipped, dwell_time_sec, hints_used, created_at, questions(prompt, options, correct_answer, explanation, quiz_id, quizzes(topic))')
      .eq('user_id', userId)
      .or('is_correct.eq.false,is_skipped.eq.true')
      .order('created_at', { ascending: false })
      .limit(10);

    const formattedMissed = (missedQuestions || []).map(m => ({
      id: m.id,
      question_id: m.question_id,
      topic: (m.questions as any)?.quizzes?.topic || 'General',
      prompt: (m.questions as any)?.prompt,
      selected_answer: m.selected_answer,
      correct_answer: (m.questions as any)?.correct_answer,
      explanation: (m.questions as any)?.explanation,
      dwell_time_sec: m.dwell_time_sec,
      hints_used: m.hints_used,
      is_skipped: m.is_skipped,
    }));

    res.json({
      profile: {
        email: req.user!.email,
        full_name: profile?.full_name || req.user!.email?.split('@')[0],
        skill_rating: profile?.skill_rating || 1200,
        streak_days: profile?.streak_days || 0,
      },
      metrics: {
        total_attempts: totalAttempts,
        total_questions_answered: totalQuestions,
        overall_accuracy: overallAccuracy,
        avg_dwell_time_sec: avgDwellTimeSec,
        total_time_spent_min: Math.round(totalTimeSec / 60),
      },
      topic_mastery: topicMastery,
      recent_attempts: attemptsList.slice(-10),
      missed_questions: formattedMissed,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
