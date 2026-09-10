import { getLLM } from '../agent/langchainAgent.js';

/**
 * Sanitizes and deduplicates vision model text outputs.
 * Eliminates repetitive token loops (e.g. repeated \\noindent), LaTeX document preambles,
 * and conversational prefixes.
 */
export function cleanExtractedVisionText(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';

  const lines = rawText.split('\n');
  const cleanedLines: string[] = [];
  let prevLine = '';
  let repeatCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines in sequence
    if (!line) {
      if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== '') {
        cleanedLines.push('');
      }
      continue;
    }

    // Skip LaTeX preambles & endings
    if (
      line.startsWith('\\documentclass') ||
      line.startsWith('\\begin{document}') ||
      line.startsWith('\\end{document}') ||
      line.startsWith('\\usepackage') ||
      line.startsWith('\\maketitle')
    ) {
      continue;
    }

    // Skip conversational boilerplate intros
    if (
      /^(here is the (extracted )?text|the text (and formulas )?in the image are|the image (shows|contains|reads):)/i.test(
        line
      )
    ) {
      continue;
    }

    // Track consecutive identical lines to prevent hallucinated repetition loops
    if (line === prevLine) {
      repeatCount++;
      // If line is \\noindent, do not allow repeated occurrences
      if (line === '\\noindent') {
        continue;
      }
      // For any other line, cap consecutive repetitions to 1
      if (repeatCount > 1) {
        continue;
      }
    } else {
      prevLine = line;
      repeatCount = 0;
    }

    cleanedLines.push(line);
  }

  const result = cleanedLines.join('\n').trim();

  // If the result only contains \noindent or no actual alphanumeric characters, return empty string
  const alphanumericOnly = result.replace(/\\noindent/g, '').replace(/[^a-zA-Z0-9]/g, '');
  if (alphanumericOnly.length === 0) {
    return '';
  }

  return result;
}

/**
 * High-performance vision extraction using Bedrock Mantle multimodal models.
 * Uses Qwen-VL (1.2s latency) as primary, with automatic Palmyra fallback and
 * strict deduplication filtering.
 */
export async function extractTextFromImage(imageBase64: string): Promise<string> {
  const formattedUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const prompt = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Extract all problem text, math equations, and diagrams from this image. Format all mathematical equations into clean LaTeX ($...$ for inline, $$...$$ for block). Return ONLY the extracted problem content without preamble, document tags, or conversational filler. If the image is blank or has no text, reply with NONE.',
        },
        {
          type: 'image_url',
          image_url: {
            url: formattedUrl,
          },
        },
      ],
    },
  ];

  let rawExtracted = '';

  // 1. Primary: Fast Qwen-VL (~1.2s latency, high LaTeX accuracy, no token loops)
  try {
    const primaryVisionLlm = getLLM('qwen.qwen3-vl-235b-a22b-instruct', 0.1);
    const response = await primaryVisionLlm.invoke(prompt as any);
    rawExtracted = typeof response.content === 'string' ? response.content.trim() : JSON.stringify(response.content);
  } catch (err: any) {
    console.warn('Qwen-VL primary vision call failed, falling back to Palmyra:', err.message);
  }

  // 2. Fallback to Palmyra 7B if Qwen failed or returned empty
  if (!rawExtracted || rawExtracted === 'NONE') {
    try {
      const fallbackVisionLlm = getLLM('writer.palmyra-vision-7b', 0.1);
      const fbResponse = await fallbackVisionLlm.invoke(prompt as any);
      rawExtracted = typeof fbResponse.content === 'string' ? fbResponse.content.trim() : JSON.stringify(fbResponse.content);
    } catch (fbErr: any) {
      console.warn('Palmyra fallback vision call failed:', fbErr.message);
    }
  }

  if (!rawExtracted || rawExtracted === 'NONE') {
    return '';
  }

  return cleanExtractedVisionText(rawExtracted);
}
