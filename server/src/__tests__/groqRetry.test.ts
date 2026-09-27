import { describe, it, expect, vi, afterEach } from 'vitest';
import { withGroqRetry, isGroqRateLimitPayload, retryOnGroqRateLimit } from '../agent/tokenBudget';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function okResponse(body: any = { choices: [{ message: { content: 'ok' } }] }) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function rateLimitResponse(retryAfterSec?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (retryAfterSec) headers.set('retry-after', retryAfterSec);
  return new Response(
    JSON.stringify({
      error: {
        message: 'Rate limit reached for model openai/gpt-oss-120b on tokens per minute (TPM): Limit 8000',
        type: 'rate_limit_error',
      },
    }),
    { status: 429, headers }
  );
}

describe('withGroqRetry (Groq 429 handling)', () => {
  it('returns the response untouched when the first call succeeds', async () => {
    const fetcher = vi.fn().mockResolvedValue(okResponse());
    const res = await withGroqRetry(fetcher, { maxRetries: 2 });
    expect(res.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries once on 429 and succeeds', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(rateLimitResponse('1'))
      .mockResolvedValueOnce(okResponse());

    const promise = withGroqRetry(fetcher, { maxRetries: 2 });
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('honors the retry-after header (waits roughly that long)', async () => {
    const sleeps: number[] = [];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(rateLimitResponse('2'))
      .mockResolvedValueOnce(okResponse());

    const res = await withGroqRetry(fetcher, {
      maxRetries: 2,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    expect(res.status).toBe(200);
    expect(sleeps[0]).toBeGreaterThanOrEqual(2000); // header value honored
    expect(sleeps[0]).toBeLessThan(3000); // small margin, not the 1.5s fallback×2^n
  });

  it('gives up after maxRetries and returns the last 429 response', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(rateLimitResponse('1'));
    const promise = withGroqRetry(fetcher, { maxRetries: 2 });
    const wait = vi.runAllTimersAsync();
    const res = await promise;
    await wait;
    expect(res.status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does NOT retry non-429 errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const res = await withGroqRetry(fetcher, { maxRetries: 2 });
    expect(res.status).toBe(500);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('exposes a helper that detects Groq rate-limit payloads in raw text', () => {
    expect(
      isGroqRateLimitPayload('Rate limit reached for model openai/gpt-oss-120b on tokens per minute (TPM)')
    ).toBe(true);
    expect(isGroqRateLimitPayload('Some other failure')).toBe(false);
  });

  it('retryOnGroqRateLimit retries THROWN 429 errors (LangChain path) and succeeds', async () => {
    const calls = vi.fn()
      .mockRejectedValueOnce(new Error('Error: 429 Rate limit reached for model openai/gpt-oss-120b on tokens per minute (TPM): Limit 8000, try again in 0.5s'))
      .mockResolvedValueOnce('llm-reply');
    const result = await retryOnGroqRateLimit(calls, { maxRetries: 2, baseDelayMs: 1, sleep: () => Promise.resolve() });
    expect(result).toBe('llm-reply');
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('retryOnGroqRateLimit rethrows non-rate-limit errors immediately', async () => {
    const calls = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));
    await expect(
      retryOnGroqRateLimit(calls, { maxRetries: 2, baseDelayMs: 1, sleep: () => Promise.resolve() })
    ).rejects.toThrow('401 Unauthorized');
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('retryOnGroqRateLimit rethrows the last error after exhausting retries', async () => {
    const calls = vi.fn().mockRejectedValue(new Error('429 Rate limit reached (TPM)'));
    await expect(
      retryOnGroqRateLimit(calls, { maxRetries: 1, baseDelayMs: 1, sleep: () => Promise.resolve() })
    ).rejects.toThrow('429 Rate limit reached');
    expect(calls).toHaveBeenCalledTimes(2);
  });
});
