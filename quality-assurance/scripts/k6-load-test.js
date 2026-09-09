import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '20s', target: 10 }, // Ramp-up to 10 users
    { duration: '30s', target: 25 }, // Steady load at 25 users
    { duration: '20s', target: 50 }, // Stress spike to 50 users
    { duration: '15s', target: 0 },  // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1200'], // 95% of requests should complete under 1.2s
    http_req_failed: ['rate<0.02'],    // Error rate must be under 2%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:5000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'TEST_JWT_TOKEN';

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${AUTH_TOKEN}`,
  };

  // 1. Health Endpoint (Baseline check)
  const resHealth = http.get(`${BASE_URL}/health`);
  check(resHealth, {
    'health check status 200': (r) => r.status === 200,
    'health response body valid': (r) => r.body && r.body.includes('pragati-server'),
  });

  // 2. Chat sessions endpoint (Simulating authenticated user loading dashboard)
  const resSessions = http.get(`${BASE_URL}/api/instructor/sessions`, { headers });
  check(resSessions, {
    'sessions endpoint responded': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);
}
