import { useState, useEffect, useRef } from 'react';

export interface TypewriterState {
  phraseIndex: number;
  charIndex: number;
  isDeleting: boolean;
  text: string;
}

/**
 * Pure state transition step for character-by-character typewriter animation
 */
export function stepTypewriterState(
  state: { phraseIndex: number; charIndex: number; isDeleting: boolean },
  phrases: string[]
): TypewriterState {
  if (!phrases || phrases.length === 0) {
    return { phraseIndex: 0, charIndex: 0, isDeleting: false, text: '' };
  }

  const currentPhrase = phrases[state.phraseIndex % phrases.length] || '';

  if (!state.isDeleting) {
    if (state.charIndex >= currentPhrase.length) {
      // Completed phrase, switch to deleting
      return {
        phraseIndex: state.phraseIndex % phrases.length,
        charIndex: currentPhrase.length,
        isDeleting: true,
        text: currentPhrase,
      };
    }
    const nextCharIndex = state.charIndex + 1;
    return {
      phraseIndex: state.phraseIndex % phrases.length,
      charIndex: nextCharIndex,
      isDeleting: false,
      text: currentPhrase.slice(0, nextCharIndex),
    };
  } else {
    if (state.charIndex <= 0) {
      // Finished deleting, advance to next phrase
      const nextPhraseIndex = (state.phraseIndex + 1) % phrases.length;
      return {
        phraseIndex: nextPhraseIndex,
        charIndex: 0,
        isDeleting: false,
        text: '',
      };
    }
    const nextCharIndex = state.charIndex - 1;
    return {
      phraseIndex: state.phraseIndex % phrases.length,
      charIndex: nextCharIndex,
      isDeleting: true,
      text: currentPhrase.slice(0, nextCharIndex),
    };
  }
}

/**
 * React hook that cycles through phrases with a character-by-character typewriter effect
 */
export function useTypewriterPlaceholder(
  phrases: string[],
  typingSpeedMs = 50,
  deletingSpeedMs = 25,
  pauseDurationMs = 2000
): string {
  const [state, setState] = useState<TypewriterState>({
    phraseIndex: 0,
    charIndex: 0,
    isDeleting: false,
    text: '',
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!phrases || phrases.length === 0) return;

    const currentPhrase = phrases[state.phraseIndex % phrases.length] || '';
    let delay = state.isDeleting ? deletingSpeedMs : typingSpeedMs;

    // Pause when fully typed
    if (!state.isDeleting && state.charIndex >= currentPhrase.length) {
      delay = pauseDurationMs;
    }

    timerRef.current = setTimeout(() => {
      setState((prev) => stepTypewriterState(prev, phrases));
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, phrases, typingSpeedMs, deletingSpeedMs, pauseDurationMs]);

  return state.text;
}
