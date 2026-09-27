/**
 * Single source of truth for the floating chat dock clearance.
 *
 * The scrollable message feed must reserve exactly one clearance band for the
 * floating composer (chips + input). It previously reserved that band TWICE
 * (container padding-bottom plus an extra spacer div), leaving ~340px of dead
 * blank space after the last AI message — the "glitchy void".
 *
 * Budget: dock ≈ chips (32px) + input (44px) + gaps/shadow (16px) ≈ 92-208px
 * depending on wrap; we cap the reservation at 224px with the spacer removed.
 */

export type ChatViewport = 'mobile' | 'desktop';

export function getChatFeedPaddingClass(viewport: ChatViewport): string {
  // Tailwind spacing: pb-56 = 14rem = 224px (mobile, chips may wrap),
  // pb-52 = 13rem = 208px (desktop, single-row chips).
  return viewport === 'mobile' ? 'pb-56' : 'pb-52';
}

export function getChatBottomSpacerClass(_viewport: ChatViewport): string {
  // Kept as a scroll anchor only — must not add height of its own.
  return 'h-0';
}
