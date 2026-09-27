import { describe, it, expect } from 'vitest';
import { getNextScrollLeft, getBandScrollState, getTopicQuizCardClass, TOPIC_BAND_CARD_MIN_WIDTH_PX } from './topicBand';

interface ScrollableLike {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

const el = (scrollLeft: number, scrollWidth: number, clientWidth: number): ScrollableLike => ({
  scrollLeft,
  scrollWidth,
  clientWidth,
});

describe('topic band horizontal scroller (Quizzes Arena)', () => {
  describe('getNextScrollLeft', () => {
    it('advances right by one page on next', () => {
      // clientWidth 400 -> page 320; 480 + 320 = 800
      expect(getNextScrollLeft(el(480, 2000, 400), 'next')).toBe(800);
    });

    it('steps back by one page on prev', () => {
      // 480 - 320 = 160
      expect(getNextScrollLeft(el(480, 2000, 400), 'prev')).toBe(160);
    });

    it('never scrolls past the right edge', () => {
      // max scroll = 2000 - 400 = 1600; 1500 + 320 clamps to 1600
      expect(getNextScrollLeft(el(1500, 2000, 400), 'next')).toBe(1600);
    });

    it('never scrolls left of zero', () => {
      expect(getNextScrollLeft(el(50, 2000, 400), 'prev')).toBe(0);
    });

    it('uses a minimum page width on very narrow containers', () => {
      // clientWidth 100 would give an unusable 80px page; must clamp to 240
      expect(getNextScrollLeft(el(0, 1000, 100), 'next')).toBe(240);
    });
  });

  describe('getBandScrollState', () => {
    it('disables prev at the far left, enables next when there is overflow', () => {
      expect(getBandScrollState(el(0, 2000, 400))).toEqual({ canPrev: false, canNext: true });
    });

    it('enables both arrows in the middle of the overflow', () => {
      expect(getBandScrollState(el(800, 2000, 400))).toEqual({ canPrev: true, canNext: true });
    });

    it('disables next at the far right', () => {
      expect(getBandScrollState(el(1600, 2000, 400))).toEqual({ canPrev: true, canNext: false });
    });

    it('disables both arrows when everything fits (no overflow)', () => {
      expect(getBandScrollState(el(0, 400, 400))).toEqual({ canPrev: false, canNext: false });
    });

    it('tolerates sub-pixel overflow noise (within 1px is treated as no overflow)', () => {
      expect(getBandScrollState(el(0, 400.5, 400))).toEqual({ canPrev: false, canNext: false });
    });
  });

  describe('topic quiz card sizing', () => {
    it('cards are fixed-width and never shrink inside the horizontal scroller', () => {
      const cls = getTopicQuizCardClass();
      expect(cls).toContain('w-56');
      expect(cls).toContain('shrink-0');
    });

    it('exports a matching pixel width used by arrow page math', () => {
      expect(TOPIC_BAND_CARD_MIN_WIDTH_PX).toBeGreaterThan(0);
    });
  });
});
