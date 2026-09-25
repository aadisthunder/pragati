/**
 * Feature-tour slide configuration.
 *
 * Pure data + pure helpers so the tour content and slide math stay unit-testable;
 * `FeatureTourModal.tsx` renders the previews and animation on top of this.
 */

export interface TourSlide {
  id: string;
  title: string;
  description: string;
  /** Key of the stylized mock preview rendered by FeatureTourModal. */
  preview: string;
  /** Short feature bullets shown on the slide. */
  features: string[];
  /** Label for the primary (Next) button on this slide. */
  cta: string;
}

export const TOUR_SLIDES: TourSlide[] = [
  {
    id: 'welcome',
    title: 'Welcome to Pragati',
    description:
      'Your AI learning system: a Socratic tutor, adaptive quizzes, and mastery tracking that all remember what you are trying to learn.',
    preview: 'brand',
    features: ['AI tutor with persistent goal memory', 'Adaptive quizzes that target weak spots', 'Live mastery analytics'],
    cta: 'Next',
  },
  {
    id: 'instructor',
    title: 'AI Instructor',
    description:
      'Chat with a tutor that never forgets your goals. Ask anything — it explains with math rendering, and can generate a quiz to test you.',
    preview: 'chat',
    features: ['Socratic, step-by-step explanations', 'Remembers your topics across chats', 'Turns any chat into a quiz'],
    cta: 'Next',
  },
  {
    id: 'quizzes',
    title: 'Quizzes Arena',
    description:
      'Every quiz the AI generates lives here. Attempt them, get instant grading, and review hints and explanations per question.',
    preview: 'quiz',
    features: ['Instant scoring and telemetry', 'Difficulty badges and search', 'Hints without spoiling the answer'],
    cta: 'Next',
  },
  {
    id: 'topics',
    title: 'My Topics',
    description:
      'Tell Pragati what you want to master. It drafts an AI subtopic plan you can edit, and tracks each one separately.',
    preview: 'topics',
    features: ['AI-generated subtopic plans', 'Add or remove subtopics anytime', 'Jump back in with one click'],
    cta: 'Next',
  },
  {
    id: 'mastery',
    title: 'Topic Mastery',
    description:
      'The heart of Pragati: every quiz moves your mastery bars. The system adapts — scheduling review of weak subtopics and rating you with a dynamic ELO skill score.',
    preview: 'mastery',
    features: [
      'Mastery bars move with every quiz you take',
      'Adaptive review of your weakest subtopics',
      'Dynamic skill rating that rises as you improve',
    ],
    cta: 'Get Started',
  },
];

/**
 * Horizontal translate percentage for the sliding track at the given index.
 * Clamped to the valid slide range; slides move leftward (negative X) smoothly.
 */
export function tourTrackOffset(index: number, total: number = TOUR_SLIDES.length): number {
  const clamped = Math.max(0, Math.min(total - 1, index));
  return clamped === 0 ? 0 : -100 * clamped; // avoid -0
}
