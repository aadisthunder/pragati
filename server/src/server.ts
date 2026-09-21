import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root or local
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

import {
  globalLimiter,
  chatRateLimiter,
  ocrRateLimiter,
  quizRateLimiter,
} from './middleware/rateLimiter.js';
import { authMiddleware } from './middleware/authMiddleware.js';
import { authRouter } from './routes/authRoutes.js';
import { instructorRouter } from './routes/instructorRoutes.js';
import { quizRouter } from './routes/quizRoutes.js';
import { analyticsRouter } from './routes/analyticsRoutes.js';

const app = express();
// Number("0") is 0 (falsy) so a PORT env of "0" or "" safely falls back to 5000,
// unlike `process.env.PORT || 5000` where the string "0" is truthy and binds an ephemeral port.
const port = Number(process.env.PORT) || 5000;

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map(s => s.trim()) : []),
  ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : []),
];

// Security & Compression
app.use(helmet());
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers.accept?.includes('text/event-stream')) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        /^https:\/\/.*\.vercel\.app$/.test(origin)
      ) {
        return callback(null, true);
      }
      callback(new Error(`CORS origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// Global Small Payload Limit to prevent heap exhaustion DOS.
// The /api/instructor/chat and /api/instructor/ocr routes mount their own 5MB parser AFTER
// this global one runs, so the global limit must be >= the largest route payload or every
// large image upload dies with a 413 'payload too large' before the route parser runs.
app.use(express.json({ limit: '6mb' }));

// Apply Global Rate Limiter to all /api/* routes
app.use('/api', globalLimiter);

// Health Check (exempt from auth and heavy rate limits)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pragati-server', time: new Date().toISOString() });
});

// Authenticate first so the per-user rate limiters below can key on req.user.id.
// (The limiters previously ran before auth, so req.user was always undefined and
// every "per-user" limit silently degraded to per-IP — a classroom behind one NAT IP
// would exhaust the shared chat limit together.)
app.use('/api/auth', authMiddleware, authRouter);
app.use('/api/instructor', authMiddleware);
app.use('/api/quizzes', authMiddleware);
app.use('/api/analytics', authMiddleware);

// Sensitive Route Limiters (per authenticated user, IP fallback for safety)
app.use('/api/instructor/chat', chatRateLimiter);
app.use('/api/instructor/ocr', ocrRateLimiter);
app.use('/api/quizzes', quizRateLimiter);
app.use('/api/analytics', quizRateLimiter);

// Routers
app.use('/api/instructor', instructorRouter);
app.use('/api/quizzes', quizRouter);
app.use('/api/analytics', analyticsRouter);

// 404 Handler for undefined API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Global Centralized JSON Error Handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err.message);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal Server Error',
  });
});

// Start server if not in test environment with connection timeouts
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => {
    console.log(`Pragati Express Server running on http://localhost:${port}`);
  });
  server.headersTimeout = 20000;
  server.requestTimeout = 30000;
  server.keepAliveTimeout = 5000;
}

export default app;
