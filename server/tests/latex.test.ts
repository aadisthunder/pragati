import { describe, expect, it } from 'vitest';
import { normalizeLatexDelimiters } from '../src/agent/langchainAgent.js';

describe('normalizeLatexDelimiters', () => {
  it('converts inline \\(...\\) to $...$', () => {
    expect(normalizeLatexDelimiters('Both inductors are \\(L_1 = 6\\ \\text{mH}\\).'))
      .toBe('Both inductors are $L_1 = 6\\ \\text{mH}$.');
  });

  it('converts display \\[...\\] to $$...$$', () => {
    expect(normalizeLatexDelimiters('\\[ \\frac{1}{L_eq} = \\frac{1}{L_1}+\\frac{1}{L_2}. \\]'))
      .toBe('$$ \\frac{1}{L_eq} = \\frac{1}{L_1}+\\frac{1}{L_2}. $$');
  });

  it('leaves $...$ and $$...$$ untouched', () => {
    const src = 'Inline $E = mc^2$ and display $$\\int x dx$$ stay as-is.';
    expect(normalizeLatexDelimiters(src)).toBe(src);
  });

  it('protects fenced code blocks from rewriting', () => {
    const src = 'Use \\(x\\) then:\n```latex\n\\(not math\\)\n```';
    expect(normalizeLatexDelimiters(src)).toBe('Use $x$ then:\n```latex\n\\(not math\\)\n```');
  });

  it('passes through plain text without delimiters', () => {
    const src = 'No math in this sentence.';
    expect(normalizeLatexDelimiters(src)).toBe(src);
  });

  it('handles multi-line display math', () => {
    const src = '\\[\n\\frac{1}{L_{eq}} = \\frac{1}{L_1}\n\\]';
    expect(normalizeLatexDelimiters(src)).toBe('$$\n\\frac{1}{L_{eq}} = \\frac{1}{L_1}\n$$');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeLatexDelimiters('')).toBe('');
  });
});
