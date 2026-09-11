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
const port = process.env.PORT || 5000;

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

// Global Small Payload Limit to prevent heap exhaustion DOS
app.use(express.json({ limit: '100kb' }));

// Apply Global Rate Limiter to all /api/* routes
app.use('/api', globalLimiter);

// Health Check (exempt from auth and heavy rate limits)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pragati-server', time: new Date().toISOString() });
});

// Specific Sensitive Route Limiters
app.use('/api/instructor/chat', chatRateLimiter);
app.use('/api/instructor/ocr', ocrRateLimiter);
app.use('/api/quizzes', quizRateLimiter);
app.use('/api/analytics', quizRateLimiter);

// Authenticated API Routes
app.use('/api/auth', authMiddleware as any, authRouter);
app.use('/api/instructor', authMiddleware as any, instructorRouter);
app.use('/api/quizzes', authMiddleware as any, quizRouter);
app.use('/api/analytics', authMiddleware as any, analyticsRouter);

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
