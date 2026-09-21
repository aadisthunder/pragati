/**
 * Tests for the mobile-readability utilities: chat message + composer
 * typography, chip wrapping, and touch-friendly upload button.
 */
import { describe, it, expect } from 'vitest';
import {
  getChatMessageTextClass,
  getComposerTextareaClass,
  getUploadButtonClass,
  getSuggestionChipsContainerClass,
  getHeroSuggestionChipsContainerClass,
} from './theme';

describe('Mobile readability utilities', () => {
  it('chat message text is at least 15px on mobile', () => {
    expect(getChatMessageTextClass()).toContain('text-[15px]');
  });

  it('chat message text scales up on desktop', () => {
    expect(getChatMessageTextClass()).toMatch(/sm:text-/);
  });

  it('composer textarea uses a 16px floor on mobile to prevent iOS zoom-on-focus', () => {
    expect(getComposerTextareaClass()).toContain('text-[16px]');
  });

  it('composer textarea keeps leading and max-height for growth', () => {
    const cls = getComposerTextareaClass();
    expect(cls).toContain('leading-');
    expect(cls).toContain('max-h-');
  });

  it('upload button meets the 40px touch target minimum on mobile', () => {
    const cls = getUploadButtonClass();
    const sizes = cls.match(/w-(\d+)/)?.[1];
    expect(Number(sizes) * 4).toBeGreaterThanOrEqual(40);
  });

  it('suggestion chips wrap onto multiple lines instead of clipping offscreen', () => {
    for (const cls of [getSuggestionChipsContainerClass(), getHeroSuggestionChipsContainerClass()]) {
      expect(cls).toContain('flex-wrap');
      expect(cls).not.toContain('flex-nowrap');
      expect(cls).toContain('max-w-3xl');
      expect(cls).toContain('mx-auto');
    }
  });
});
