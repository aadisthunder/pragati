/**
 * Popup sequencing for the first-login onboarding experience.
 *
 * Order (per product decision): the feature tour plays FIRST, then the existing
 * "What do you want to master?" goal modal opens. Pure data so the AppShell
 * wiring stays trivial and testable.
 */

export const POPUP_TOUR = 'tour' as const;
export const POPUP_GOAL_MODAL = 'goal-modal' as const;

/** What should open once the feature tour has been dismissed/finished. */
export function nextPopupAfterTour(): typeof POPUP_GOAL_MODAL {
  return POPUP_GOAL_MODAL;
}
