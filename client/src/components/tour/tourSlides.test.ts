import { describe, it, expect } from 'vitest';
import { TOUR_SLIDES, tourTrackOffset } from './tourSlides';

describe('TOUR_SLIDES', () => {
  it('has at least 5 screens covering every main feature', () => {
    expect(TOUR_SLIDES.length).toBeGreaterThanOrEqual(5);
    const ids = TOUR_SLIDES.map((s) => s.id);
    expect(ids).toContain('welcome');
    expect(ids).toContain('instructor');
    expect(ids).toContain('quizzes');
    expect(ids).toContain('topics');
    expect(ids).toContain('mastery');
  });

  it('ends with the Topic Mastery screen as the last slide', () => {
    expect(TOUR_SLIDES[TOUR_SLIDES.length - 1].id).toBe('mastery');
  });

  it('gives every slide a unique id, title, description and preview key', () => {
    const ids = TOUR_SLIDES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const slide of TOUR_SLIDES) {
      expect(slide.title.trim().length).toBeGreaterThan(0);
      expect(slide.description.trim().length).toBeGreaterThan(0);
      expect(slide.preview.length).toBeGreaterThan(0);
    }
  });

  it('mentions key feature bullets on the mastery slide (bars, adaptivity, rating)', () => {
    const mastery = TOUR_SLIDES.find((s) => s.id === 'mastery');
    const bullets = (mastery?.features || []).join(' ').toLowerCase();
    expect(bullets).toContain('mastery');
    expect(bullets).toContain('adapt');
    expect(bullets).toContain('rating');
  });

  it('ends with a completion CTA label for the last slide button', () => {
    const last = TOUR_SLIDES[TOUR_SLIDES.length - 1];
    expect(last.cta).toBe('Get Started');
  });
});

describe('tourTrackOffset', () => {
  it('offsets the slide track leftward for smooth translate animation', () => {
    expect(tourTrackOffset(0)).toBe(0);
    expect(tourTrackOffset(1)).toBe(-100);
    expect(tourTrackOffset(4)).toBe(-400);
    expect(tourTrackOffset(-1)).toBe(0);
    expect(tourTrackOffset(99)).toBe(-400); // clamped to last slide
  });
});
