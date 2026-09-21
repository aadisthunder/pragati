import { describe, it, expect } from 'vitest';
import {
  calculateTextareaHeight,
  shouldSubmitOnEnter,
  getSuggestionChipsContainerClass,
  getHeroSuggestionChipsContainerClass,
  getResponsivePageContainerClass,
  formatDeltaBadge,
} from './theme';

describe('Theme and Layout Utilities', () => {
  describe('calculateTextareaHeight', () => {
    it('clamps height within minLines and maxLines', () => {
      const lineHeight = 24;
      const minLines = 1;
      const maxLines = 5;

      // When scrollHeight is smaller than min
      const small = calculateTextareaHeight(10, lineHeight, minLines, maxLines);
      expect(small.height).toBe(24);
      expect(small.overflowY).toBe('hidden');

      // When scrollHeight is within range
      const mid = calculateTextareaHeight(72, lineHeight, minLines, maxLines);
      expect(mid.height).toBe(72);
      expect(mid.overflowY).toBe('hidden');

      // When scrollHeight exceeds max
      const large = calculateTextareaHeight(200, lineHeight, minLines, maxLines);
      expect(large.height).toBe(120);
      expect(large.overflowY).toBe('auto');
    });
  });

  describe('shouldSubmitOnEnter', () => {
    it('submits on Enter on desktop without Shift', () => {
      expect(shouldSubmitOnEnter({ key: 'Enter', shiftKey: false }, false)).toBe(true);
    });

    it('does not submit on Shift+Enter on desktop', () => {
      expect(shouldSubmitOnEnter({ key: 'Enter', shiftKey: true }, false)).toBe(false);
    });

    it('does not submit on Enter on mobile devices', () => {
      expect(shouldSubmitOnEnter({ key: 'Enter', shiftKey: false }, true)).toBe(false);
    });
  });

  describe('Centered Chat Layout Alignment', () => {
    it('suggestion chips enforce centered max-w-3xl layout', () => {
      const chipsClass = getSuggestionChipsContainerClass();
      expect(chipsClass).toContain('max-w-3xl');
      expect(chipsClass).toContain('mx-auto');
    });

    it('hero suggestion chips enforce centered max-w-3xl layout', () => {
      const heroChipsClass = getHeroSuggestionChipsContainerClass();
      expect(heroChipsClass).toContain('max-w-3xl');
      expect(heroChipsClass).toContain('mx-auto');
    });

    it('responsive page container enforces max-w-5xl and mx-auto', () => {
      const containerClass = getResponsivePageContainerClass();
      expect(containerClass).toContain('max-w-5xl');
      expect(containerClass).toContain('mx-auto');
    });
  });

  describe('formatDeltaBadge', () => {
    it('returns positive formatted badge', () => {
      const badge = formatDeltaBadge(25);
      expect(badge).not.toBeNull();
      expect(badge?.text).toBe('(+25)');
      expect(badge?.isPositive).toBe(true);
    });

    it('returns negative formatted badge', () => {
      const badge = formatDeltaBadge(-10);
      expect(badge).not.toBeNull();
      expect(badge?.text).toBe('(-10)');
      expect(badge?.isPositive).toBe(false);
    });

    it('returns null for zero or undefined', () => {
      expect(formatDeltaBadge(0)).toBeNull();
      expect(formatDeltaBadge(null)).toBeNull();
      expect(formatDeltaBadge(undefined)).toBeNull();
    });
  });
});
