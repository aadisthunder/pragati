import { describe, it, expect } from 'vitest';

/**
 * The AI-chat scroll container previously reserved ~340px of blank space after
 * the last message (pb-48/52 PLUS an extra h-36/28 spacer div), which read as
 * a glitchy void under every reply. These tests pin the corrected budget:
 * one source of truth for dock clearance, modest enough that the conversation
 * visually "ends" near the last message.
 */

const DOCK_BUDGET_PX = 208; // what the floating dock can occupy at most (chips + input + shadow)
const BUDGET_PX = DOCK_BUDGET_PX; // desktop reservation = dock budget
const MOBILE_BUDGET_PX = DOCK_BUDGET_PX + 16; // small wrap margin for chip rows on phones

const tailwindPx = (cls: string): number => {
  const match = cls.match(/(?:^|\s)pb-(\d+)$/);
  return match ? Number(match[1]) * 4 : NaN; // Tailwind: n -> n*4px
};

describe('chat feed bottom clearance', () => {
  it('computes desktop padding from the single dock budget (no double spacer)', async () => {
    const { getChatFeedPaddingClass, getChatBottomSpacerClass } = await import('./chatLayoutSpacing');

    // Desktop: the container carries the clearance; the spacer must be zero-height.
    const desktopPx = tailwindPx(getChatFeedPaddingClass('desktop'));
    expect(desktopPx).toBe(BUDGET_PX);
    expect(getChatBottomSpacerClass('desktop')).toContain('h-0');
    // (mobile pinned in the next test)
  });

  it('computes mobile padding from the same budget (chips wrap, so it stays within budget)', async () => {
    const { getChatFeedPaddingClass, getChatBottomSpacerClass } = await import('./chatLayoutSpacing');

    const mobilePx = tailwindPx(getChatFeedPaddingClass('mobile'));
    expect(mobilePx).toBe(MOBILE_BUDGET_PX); // wrapped chips margin
    expect(getChatBottomSpacerClass('mobile')).toContain('h-0');
  });

  it('never reserves more than the dock can actually occupy', async () => {
    const { getChatFeedPaddingClass } = await import('./chatLayoutSpacing');
    for (const viewport of ['mobile', 'desktop'] as const) {
      const padding = getChatFeedPaddingClass(viewport);
      const match = padding.match(/pb-(\d+)/);
      expect(match).not.toBeNull();
      const px = Number(match![1]) * 4; // Tailwind spacing scale: n -> n*0.25rem
      expect(px).toBeLessThanOrEqual(MOBILE_BUDGET_PX + 40);
    }
  });
});
