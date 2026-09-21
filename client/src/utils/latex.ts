/**
 * LaTeX delimiter normalization for markdown math rendering.
 *
 * remark-math only parses `$...$` (inline) and `$$...$$` (display) delimiters, but
 * OpenAI-style models frequently emit `\(...\)` and `\[...\]`. Unnormalized, those
 * render as raw TeX source in the chat/quiz UI. This normalizer rewrites them into
 * the delimiters remark-math understands, while protecting fenced code blocks and
 * adding a guard for short bare-LaTeX option strings (e.g. "3 \text{mH}").
 */

const FENCE_TOKEN = '\u0000FENCE';

const LATEX_COMMAND_RE =
  /\\(frac|dfrac|sqrt|cos|sin|tan|ln|log|sum|int|times|cdot|partial|pi|theta|alpha|beta|gamma|text)/;

/** Bare-LaTeX fallback only applies to short strings (quiz options, answers). */
const MAX_BARE_LATEX_LENGTH = 80;

export function normalizeLatexDelimiters(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return '';

  // 1. Protect fenced code blocks so their content is never rewritten.
  const fences: string[] = [];
  let text = input.replace(/```[\s\S]*?```/g, (match) => {
    fences.push(match);
    return `${FENCE_TOKEN}${fences.length - 1}${FENCE_TOKEN}`;
  });

  // 2. Display math: \[ ... \] -> $$ ... $$
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, body: string) => `$$${body}$$`);

  // 3. Inline math: \( ... \) -> $ ... $
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_m, body: string) => `$${body}$`);

  // 4. Guard for legacy bare LaTeX with no delimiters at all (e.g. option "3 \text{mH}").
  //    Only short strings are wrapped — wrapping a long explanation in math mode would
  //    render the whole paragraph in KaTeX italic math font.
  const trimmed = text.trim();
  if (
    trimmed.length > 0 &&
    trimmed.length <= MAX_BARE_LATEX_LENGTH &&
    !trimmed.includes('$') &&
    LATEX_COMMAND_RE.test(trimmed)
  ) {
    text = `$${trimmed}$`;
  }

  // 5. Restore fenced code blocks.
  text = text.replace(new RegExp(`${FENCE_TOKEN}(\\d+)${FENCE_TOKEN}`, 'g'), (_m, i: string) =>
    fences[Number(i)]
  );

  return text;
}
