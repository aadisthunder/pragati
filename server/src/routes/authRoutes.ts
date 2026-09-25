import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { createScopedClient } from '../config/supabase.js';

export const authRouter = Router();

// GET /api/auth/me - Verify session & fetch user profile
authRouter.get('/me', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;

  try {
    const { data: profile } = await scopedClient
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    // Onboarding is complete when the flag is stamped OR the account already
    // has goals (legacy users get no popup). Demo logins always report
    // incomplete so the popup appears on every fresh load — and the read-only
    // demo additionally can never persist the flag at all.
    const DEMO_LOGIN_EMAILS = new Set(['judge.pragati@gmail.com', 'judge.demo@pragati.app']);
    const isDemoLogin = DEMO_LOGIN_EMAILS.has(req.user!.email || '');
    const { count: goalCount } = await scopedClient
      .from('learning_goals')
      .select('id', { count: 'exact', head: true });

    res.json({
      user: {
        id: userId,
        email: req.user!.email,
        full_name: profile?.full_name || req.user!.email?.split('@')[0],
        skill_rating: profile?.skill_rating || 1200,
        streak_days: profile?.streak_days || 0,
        avatar_url: profile?.avatar_url,
        onboarding_completed: !isDemoLogin && Boolean(profile?.onboarding_completed_at || (goalCount ?? 0) > 0),
        is_readonly_demo: isDemoLogin,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
