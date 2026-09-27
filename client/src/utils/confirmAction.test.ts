import { describe, it, expect } from 'vitest';
import {
  requestConfirmation,
  dismissConfirmation,
  beginConfirmation,
  type PendingConfirmation,
} from './confirmAction';

describe('confirmAction state transitions (shared delete-confirm modal)', () => {
  it('requestConfirmation opens a fresh pending confirmation', () => {
    expect(requestConfirmation(null, 'goal-1')).toEqual({ id: 'goal-1', busy: false });
  });

  it('requestConfirmation replaces a stale pending item with the new one', () => {
    const cur: PendingConfirmation = { id: 'goal-1', busy: false };
    expect(requestConfirmation(cur, 'goal-2')).toEqual({ id: 'goal-2', busy: false });
  });

  it('requestConfirmation is a no-op while the current action is busy', () => {
    const cur: PendingConfirmation = { id: 'goal-1', busy: true };
    expect(requestConfirmation(cur, 'goal-2')).toEqual(cur);
  });

  it('dismissConfirmation closes an idle confirmation', () => {
    expect(dismissConfirmation({ id: 'goal-1', busy: false })).toBeNull();
    expect(dismissConfirmation(null)).toBeNull();
  });

  it('dismissConfirmation cannot close while the action is running', () => {
    const cur: PendingConfirmation = { id: 'goal-1', busy: true };
    expect(dismissConfirmation(cur)).toEqual(cur);
  });

  it('beginConfirmation flips an idle confirmation to busy', () => {
    expect(beginConfirmation({ id: 'goal-1', busy: false })).toEqual({ id: 'goal-1', busy: true });
  });

  it('beginConfirmation never restarts an already-busy confirmation', () => {
    const cur: PendingConfirmation = { id: 'goal-1', busy: true };
    expect(beginConfirmation(cur)).toEqual(cur);
    expect(beginConfirmation(null)).toBeNull();
  });
});
