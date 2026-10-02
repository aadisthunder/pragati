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

  it('allows CORS from localhost on any port (e.g. 5174)', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5174');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5174');
  });

  it('allows CORS from Firebase web.app and firebaseapp.com domains', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://pragati-aadi.web.app');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://pragati-aadi.web.app');
  });
});

