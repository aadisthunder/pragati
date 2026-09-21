import { describe, it, expect } from 'vitest';
import { cleanMarkdownText, buildQuizGeneratePrompt, formatRelativeTime } from './markdownCards';

describe('Markdown Cards Utilities', () => {
  describe('cleanMarkdownText', () => {
    it('strips leading list bullets', () => {
      expect(cleanMarkdownText('- Option A')).toBe('Option A');
      expect(cleanMarkdownText('* Option B')).toBe('Option B');
      expect(cleanMarkdownText('1. First item')).toBe('First item');
    });

    it('strips bold and italics markers', () => {
      expect(cleanMarkdownText('**Bold Title**: Description')).toBe('Bold Title: Description');
      expect(cleanMarkdownText('*Italic text*')).toBe('Italic text');
    });

    it('strips inline code ticks', () => {
      expect(cleanMarkdownText('Use `console.log` to print')).toBe('Use console.log to print');
    });
  });

  describe('buildQuizGeneratePrompt', () => {
    it('builds prompt with topic', () => {
      expect(buildQuizGeneratePrompt('Thermodynamics')).toBe(
        'generate a quiz to test my understanding on topic : Thermodynamics'
      );
    });

    it('handles empty query', () => {
      expect(buildQuizGeneratePrompt('')).toBe(
        'generate a quiz to test my understanding on topic : '
      );
    });
  });

  describe('formatRelativeTime', () => {
    it('formats times correctly relative to base timestamp', () => {
      const now = 1700000000000;
      expect(formatRelativeTime(now - 10000, now)).toBe('Just now');
      expect(formatRelativeTime(now - 120000, now)).toBe('2 min ago');
      expect(formatRelativeTime(now - 7200000, now)).toBe('2 hours ago');
    });
  });
});
