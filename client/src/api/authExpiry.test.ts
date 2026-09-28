import { describe, it, expect, vi } from 'vitest';

/**
 * Defect observed in playtest: an expired session (dead refresh token) left
 * the UI rendering "No quizzes generated yet" — a logged-out state dressed up
 * as empty data. The API client must reset auth state (signOut) when a 401
 * persists after its one refresh attempt, so ProtectedRoute bounces the user
 * to /login instead of showing misleading empty states.
 */

const signOutMock = vi.fn(async () => ({ error: null }));
const refreshSessionMock = vi.fn(async () => ({ data: { session: null }, error: null }));
const getSessionMock = vi.fn(async () => ({
  data: {
    session: {
      access_token: 'stale-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    },
  },
  error: null,
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSessionMock(),
      refreshSession: () => refreshSessionMock(),
      signOut: () => signOutMock(),
    },
  },
}));

import { apiRequest } from './client';

describe('apiRequest: expired-session handling', () => {
  it('resets auth state (signOut) when a 401 persists after refresh fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401 })
      )
    );

    await expect(apiRequest('/api/quizzes')).rejects.toThrow('Invalid or expired token');
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT sign out when the refresh succeeds and the retry passes', async () => {
    refreshSessionMock.mockResolvedValueOnce({
      data: { session: { access_token: 'fresh-token' } },
      error: null,
    } as any);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'jwt expired' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ quizzes: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await apiRequest<{ quizzes: unknown[] }>('/api/quizzes');
    expect(data.quizzes).toEqual([]);
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
