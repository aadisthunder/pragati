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

    res.json({
      user: {
        id: userId,
        email: req.user!.email,
        full_name: profile?.full_name || req.user!.email?.split('@')[0],
        skill_rating: profile?.skill_rating || 1200,
        streak_days: profile?.streak_days || 0,
        avatar_url: profile?.avatar_url,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
