import { supabase } from '../lib/supabase';

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  let { data: { session } } = await supabase.auth.getSession();

  // If session is nearing expiry (within 60s), proactively refresh it
  if (session && session.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session) {
      session = refreshed.session;
    }
  }

  const token = session?.access_token;

  if (!token) {
    throw new Error('Not authenticated');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(endpoint, {
    ...options,
    headers,
  });

  // If 401 (token expired), attempt one session refresh and retry
  if (response.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session?.access_token) {
      headers.set('Authorization', `Bearer ${refreshed.session.access_token}`);
      response = await fetch(endpoint, {
        ...options,
        headers,
      });
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}
