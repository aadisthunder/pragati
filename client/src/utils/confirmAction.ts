/**
 * Shared state transitions behind the reusable delete-confirmation modal
 * (ConfirmDialog). Both the AppShell "Delete Chat?" flow and the Topics page
 * "Remove topic" flow drive the same component with these helpers, so the
 * busy/dismiss guards behave identically everywhere.
 */

export interface PendingConfirmation {
  /** Stable id of the item awaiting confirmation (session id, goal id, ...). */
  id: string;
  /** True while the destructive request is in flight; blocks dismiss/re-entry. */
  busy: boolean;
}

/** Open (or retarget) the confirmation modal for a new item. */
export function requestConfirmation(
  current: PendingConfirmation | null,
  id: string
): PendingConfirmation {
  if (current?.busy) return current;
  return { id, busy: false };
}

/** Close the modal; ignored while the destructive action is running. */
export function dismissConfirmation(
  current: PendingConfirmation | null
): PendingConfirmation | null {
  if (current?.busy) return current;
  return null;
}

/** Arm the destructive action exactly once (prevents double-submit). */
export function beginConfirmation(
  current: PendingConfirmation | null
): PendingConfirmation | null {
  if (!current || current.busy) return current;
  return { ...current, busy: true };
}
