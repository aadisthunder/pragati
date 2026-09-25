import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { createScopedClient } from '../config/supabase.js';

export const onboardingRouter = Router();

// POST /api/onboarding/complete - Stamp the first-login popup flag
onboardingRouter.post('/complete', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;

  try {
    const { error } = await scopedClient
      .from('user_profiles')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    // The read-only demo account is policy-blocked here; that is expected.
    res.status(500).json({ error: err.message });
  }
});
