import { describe, it, expect } from 'vitest';
import { nextPopupAfterTour, POPUP_GOAL_MODAL } from './onboardingFlow';

describe('onboardingFlow', () => {
  it('returns the goal modal when no topics exist (tour first, then new topic modal)', () => {
    expect(nextPopupAfterTour(false)).toBe(POPUP_GOAL_MODAL);
    expect(nextPopupAfterTour(0)).toBe(POPUP_GOAL_MODAL);
  });

  it('returns null when topics already exist (no duplicate topic creation popup)', () => {
    expect(nextPopupAfterTour(true)).toBeNull();
    expect(nextPopupAfterTour(1)).toBeNull();
    expect(nextPopupAfterTour(3)).toBeNull();
  });
});
