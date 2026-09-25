import { describe, it, expect } from 'vitest';
import { nextPopupAfterTour, POPUP_GOAL_MODAL } from './onboardingFlow';

describe('onboardingFlow', () => {
  it('returns the goal modal after the tour finishes (tour first, then goal popup)', () => {
    expect(nextPopupAfterTour()).toBe(POPUP_GOAL_MODAL);
  });
});
