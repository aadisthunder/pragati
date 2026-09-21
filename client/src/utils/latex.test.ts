import { describe, expect, it } from 'vitest';
import { normalizeLatexDelimiters } from './latex';

describe('normalizeLatexDelimiters', () => {
  it('converts inline \\(...\\) to $...$', () => {
    expect(normalizeLatexDelimiters('\\(L_1\\) and \\(L_2\\) in parallel'))
      .toBe('$L_1$ and $L_2$ in parallel');
  });

  it('converts display \\[...\\] to $$...$$', () => {
    expect(normalizeLatexDelimiters('\\[ \\frac{1}{L_eq} = \\frac{1}{L_1}+\\frac{1}{L_2}. \\]'))
      .toBe('$$ \\frac{1}{L_eq} = \\frac{1}{L_1}+\\frac{1}{L_2}. $$');
  });

  it('wraps short bare-LaTeX strings (quiz options)', () => {
    expect(normalizeLatexDelimiters('3 \\text{mH}')).toBe('$3 \\text{mH}$');
  });

  it('does not wrap long explanations in math mode', () => {
    const long = 'Take the reciprocal of \\(\\frac{1}{3}\\ \\text{mH}\\): \\[ L_{eq} = 3\\ \\text{mH}. \\]';
    expect(normalizeLatexDelimiters(long)).toBe(
      'Take the reciprocal of $\\frac{1}{3}\\ \\text{mH}$: $$ L_{eq} = 3\\ \\text{mH}. $$'
    );
  });

  it('does not wrap long bare-TeX paragraphs', () => {
    const long = '\\frac{1}{x} plus a lot of trailing prose that pushes the string past the guard length so it stays untouched.';
    expect(normalizeLatexDelimiters(long)).toBe(long);
  });

  it('protects fenced code blocks from rewriting', () => {
    const src = '```latex\n\\(x\\)\n```';
    expect(normalizeLatexDelimiters(src)).toBe(src);
  });

  it('does not wrap plain text containing a dollar amount', () => {
    const src = 'That costs $5 in total.';
    expect(normalizeLatexDelimiters(src)).toBe(src);
  });

  it('returns empty string for empty input', () => {
    expect(normalizeLatexDelimiters('')).toBe('');
  });
});
