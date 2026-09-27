import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { getPermanentCardClass, getSecondaryBadgeClass } from '../../utils/theme';
import {
  getNextScrollLeft,
  getBandScrollState,
  getTopicQuizCardClass,
} from '../../utils/topicBand';
import { formatRelativeTime } from '../../utils/markdownCards';
import type { LinkedQuizGroup, QuizLike } from '../../utils/quizGrouping';

interface TopicQuizBandProps {
  group: LinkedQuizGroup;
  onOpenQuiz: (quizId: string) => void;
  renderMenu: (quiz: QuizLike) => React.ReactNode;
}

/**
 * One full-width horizontal band per linked topic: a fixed-height card (same
 * scale as one grid card) whose quiz cards overflow into a horizontal scroll.
 * Desktop gets prev/next chevron arrows that page through the row. The header
 * is deliberately minimal — just the topic heading.
 */
export const TopicQuizBand: React.FC<TopicQuizBandProps> = ({ group, onOpenQuiz, renderMenu }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { canPrev: prev, canNext: next } = getBandScrollState(el);
    setCanPrev(prev);
    setCanNext(next);
  }, []);

  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
  }, [updateScrollState, group.quizzes.length]);

  const scrollByDirection = (direction: 'prev' | 'next') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: getNextScrollLeft(el, direction), behavior: 'smooth' });
  };

  return (
    <div className={`${getPermanentCardClass()} overflow-hidden min-w-0`}>
      {/* Minimal header: just the topic heading */}
      <div className="px-4 sm:px-5 pt-4 pb-3">
        <h4 className="text-base sm:text-lg font-display font-extrabold text-slate-900 line-clamp-1">
          {group.subtopic?.name || group.label}
        </h4>
      </div>

      {/* Horizontal quiz row: overflow scrolls sideways (mobile swipe, desktop arrows) */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={updateScrollState}
          className="flex gap-3 overflow-x-auto no-scrollbar md-subtle-scroll snap-x snap-mandatory scroll-pl-4 sm:scroll-pl-5 px-4 sm:px-5 pb-4"
        >
          {group.quizzes.map((quiz) => (
            <div key={quiz.id} className={getTopicQuizCardClass()}>
              <div className="flex items-center justify-between mb-2.5">
                <span className={getSecondaryBadgeClass()}>
                  <span className="capitalize">{quiz.difficulty}</span>
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-mono font-medium text-slate-500">
                    {formatRelativeTime(quiz.created_at)}
                  </span>
                  {renderMenu(quiz)}
                </div>
              </div>
              <h5 className="text-sm font-display font-bold text-slate-800 line-clamp-2" title={quiz.topic}>
                {quiz.topic}
              </h5>
              <p className="text-xs text-slate-500 mt-1.5 font-mono font-semibold">
                {quiz.total_questions} Q/A
              </p>
              <div className="mt-auto pt-3">
                <button
                  type="button"
                  onClick={() => onOpenQuiz(quiz.id)}
                  title={`Attempt "${quiz.topic}" (${quiz.total_questions} questions)`}
                  className="w-full py-2 text-xs font-semibold text-slate-800 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-300 hover:border-slate-400 rounded-xl shadow-xs transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-[0.99] cursor-pointer"
                >
                  <span>Attempt Quiz</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop-only pagination chevrons */}
        {canPrev && (
          <button
            type="button"
            onClick={() => scrollByDirection('prev')}
            aria-label="Scroll topic quizzes left"
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-white/95 border border-slate-200 shadow-md text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {canNext && (
          <button
            type="button"
            onClick={() => scrollByDirection('next')}
            aria-label="Scroll topic quizzes right"
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-white/95 border border-slate-200 shadow-md text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
