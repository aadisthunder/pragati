import { describe, it, expect, vi } from 'vitest';
import { authMiddleware } from './authMiddleware.js';
import type { Request, Response, NextFunction } from 'express';

describe('authMiddleware', () => {
  it('should return 401 if Authorization header is missing', async () => {
    const req = { headers: {} } as Request;
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const res = { status: statusMock } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await authMiddleware(req, res, next);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Missing authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if token format is not Bearer', async () => {
    const req = { headers: { authorization: 'Basic 12345' } } as Request;
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const res = { status: statusMock } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await authMiddleware(req, res, next);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid token format' });
    expect(next).not.toHaveBeenCalled();
  });
});
