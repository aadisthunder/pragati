/**
 * Horizontal scroller math for the Quizzes Arena "From your topics" bands.
 *
 * Each topic band is a full-width card with a fixed max height and a row of
 * quiz cards that scrolls horizontally when they overflow. On desktop, chevron
 * arrows page through the row; this module keeps all scroll math pure and
 * unit-testable (client tests run in Node without a DOM).
 */

export interface ScrollableStateLike {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export type BandScrollDirection = 'prev' | 'next';

/** Minimum arrow page width so narrow containers still move a useful amount. */
export const TOPIC_BAND_MIN_PAGE_PX = 240;

/** Fixed quiz-card width inside a topic band (matches getTopicQuizCardClass). */
export const TOPIC_BAND_CARD_MIN_WIDTH_PX = 224; // w-56

/** How far a chevron click scrolls: ~one viewport of cards, edge-clamped. */
export function getNextScrollLeft(
  el: ScrollableStateLike,
  direction: BandScrollDirection
): number {
  const page = Math.max(TOPIC_BAND_MIN_PAGE_PX, Math.floor(el.clientWidth * 0.8));
  const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
  const raw =
    direction === 'next' ? el.scrollLeft + page : el.scrollLeft - page;
  return Math.max(0, Math.min(maxScrollLeft, raw));
}

/** Which chevrons should be enabled for the current scroll position. */
export function getBandScrollState(el: ScrollableStateLike): {
  canPrev: boolean;
  canNext: boolean;
} {
  const maxScrollLeft = el.scrollWidth - el.clientWidth;
  if (maxScrollLeft <= 1) return { canPrev: false, canNext: false }; // fits, no overflow
  return {
    canPrev: el.scrollLeft > 1,
    canNext: el.scrollLeft < maxScrollLeft - 1,
  };
}

/** Quiz card styling inside a topic band: fixed width, never shrinks. */
export function getTopicQuizCardClass(): string {
  return 'w-56 shrink-0 snap-start bg-white border border-slate-200 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 p-4 flex flex-col min-w-0';
}
