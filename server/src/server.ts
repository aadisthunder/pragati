import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root or local
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

import { authMiddleware } from './middleware/authMiddleware.js';
import { authRouter } from './routes/authRoutes.js';
import { instructorRouter } from './routes/instructorRoutes.js';
import { quizRouter } from './routes/quizRoutes.js';
import { analyticsRouter } from './routes/analyticsRoutes.js';

const app = express();
const port = process.env.PORT || 5000;

// Security & Parsing
app.use(helmet());
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '15mb' }));

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pragati-server', time: new Date().toISOString() });
});

// Authenticated API Routes
app.use('/api/auth', authMiddleware as any, authRouter);
app.use('/api/instructor', authMiddleware as any, instructorRouter);
app.use('/api/quizzes', authMiddleware as any, quizRouter);
app.use('/api/analytics', authMiddleware as any, analyticsRouter);

// Start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Pragati Express Server running on http://localhost:${port}`);
  });
}

export default app;
