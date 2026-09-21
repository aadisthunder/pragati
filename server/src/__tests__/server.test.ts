import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('Pragati Express Server', () => {
  it('GET /health returns status 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('pragati-server');
  });

  it('GET /api/unknown returns 404 error with clean JSON', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('API route not found');
  });
});
