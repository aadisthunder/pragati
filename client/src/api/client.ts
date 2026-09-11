import { supabase } from '../lib/supabase';
import {
  getFromCache,
  isCacheFresh,
  setInCache,
  invalidateCache,
  fetchWithDeduplication,
} from './cache';

export { getFromCache, isCacheFresh, setInCache, invalidateCache };

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function formatApiUrl(base: string, endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const cleanBase = (base || '').replace(/\/$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (!cleanBase) {
    return cleanEndpoint;
  }

  // Deduplicate /api if base already ends with /api and endpoint starts with /api/
  if (cleanBase.endsWith('/api') && cleanEndpoint.startsWith('/api/')) {
    return `${cleanBase}${cleanEndpoint.slice(4)}`;
  }

  return `${cleanBase}${cleanEndpoint}`;
}

export function resolveApiUrl(endpoint: string): string {
  return formatApiUrl(API_BASE, endpoint);
}

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

  const targetUrl = resolveApiUrl(endpoint);
  let response = await fetch(targetUrl, {
    ...options,
    headers,
  });

  // If 401 (token expired), attempt one session refresh and retry
  if (response.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session?.access_token) {
      headers.set('Authorization', `Bearer ${refreshed.session.access_token}`);
      response = await fetch(targetUrl, {
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

/**
 * Perform cached API request with SWR support
 */
export async function apiRequestCached<T = any>(
  endpoint: string,
  options: RequestInit = {},
  ttlMs: number = 120_000
): Promise<T> {
  const isGet = !options.method || options.method.toUpperCase() === 'GET';

  // For non-GET, bypass cache
  if (!isGet) {
    return apiRequest<T>(endpoint, options);
  }

  // If fresh data is in cache, return immediately
  if (isCacheFresh(endpoint)) {
    return getFromCache<T>(endpoint)!;
  }

  // Fetch with deduplication
  return fetchWithDeduplication<T>(endpoint, () => apiRequest<T>(endpoint, options), ttlMs);
}

/**
 * Stream SSE events from an endpoint
 */
export async function apiStreamRequest(
  endpoint: string,
  options: RequestInit = {},
  onEvent: (event: any) => void
): Promise<any> {
  let { data: { session } } = await supabase.auth.getSession();
  if (session && session.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session) session = refreshed.session;
  }
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'text/event-stream');
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const targetUrl = resolveApiUrl(endpoint);
  const response = await fetch(targetUrl, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    return await response.json().catch(() => ({}));
  }

  if (!response.body) {
    throw new Error('ReadableStream not supported');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          onEvent(parsed);
          if (parsed.type === 'done') {
            finalResult = parsed;
          } else if (parsed.type === 'error') {
            throw new Error(parsed.error || 'Agent execution failed');
          }
        } catch (err: any) {
          if (err.message && err.message !== 'Unexpected end of JSON input') {
            throw err;
          }
        }
      }
    }
  }

  return finalResult;
}
