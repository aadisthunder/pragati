import rateLimit from 'express-rate-limit';

/**
 * Tier 1: Global API Limiter
 * Applied across all /api/* routes.
 * 120 requests per minute per IP.
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true, // Return standard RateLimit-* headers
  legacyHeaders: false,  // Disable X-RateLimit-* headers
  message: {
    error: 'Too many requests. Please slow down and try again later.',
  },
});

/**
 * Tier 2: AI Instructor Chat Limiter
 * Applied to /api/instructor/chat.
 * 20 requests per minute per user (or IP fallback).
 */
export const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  message: {
    error: 'AI Instructor chat rate limit reached. Please wait a moment before sending another question.',
  },
});

/**
 * Tier 3: Vision OCR Limiter
 * Applied to /api/instructor/ocr.
 * 8 requests per minute per user (or IP fallback).
 */
export const ocrRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  message: {
    error: 'OCR problem upload limit reached. Please wait before uploading another problem snapshot.',
  },
});

/**
 * Tier 4: Quizzes & Analytics Limiter
 * Applied to /api/quizzes and /api/analytics.
 * 80 requests per minute per user (or IP fallback).
 */
export const quizRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  message: {
    error: 'Quiz and telemetry request limit reached. Please slow down.',
  },
});
