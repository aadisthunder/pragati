/**
 * High-performance In-Memory Client-side Cache
 * Provides Stale-While-Revalidate (SWR) support, request deduplication, and selective invalidation
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const cacheStore = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

// Default TTL: 2 minutes (120,000 ms)
const DEFAULT_TTL = 120_000;

/**
 * Get synchronously from cache if present (even if stale)
 */
export function getFromCache<T>(key: string): T | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  return entry.data as T;
}

/**
 * Checks if cache entry is fresh within its TTL
 */
export function isCacheFresh(key: string): boolean {
  const entry = cacheStore.get(key);
  if (!entry) return false;
  return Date.now() - entry.timestamp < entry.ttl;
}

/**
 * Store data in cache
 */
export function setInCache<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL): void {
  cacheStore.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  });
}

/**
 * Invalidate cache by key or key prefix
 */
export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    cacheStore.clear();
    return;
  }
  for (const key of cacheStore.keys()) {
    if (key.includes(pattern)) {
      cacheStore.delete(key);
    }
  }
}

/**
 * Fetches data with in-flight deduplication and caching
 */
export async function fetchWithDeduplication<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL
): Promise<T> {
  // If already in-flight, return the existing promise
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key) as Promise<T>;
  }

  const promise = fetcher()
    .then((data) => {
      setInCache(key, data, ttlMs);
      inFlightRequests.delete(key);
      return data;
    })
    .catch((err) => {
      inFlightRequests.delete(key);
      throw err;
    });

  inFlightRequests.set(key, promise);
  return promise;
}
