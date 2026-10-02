import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, ArrowLeft, Bot, CheckSquare, Target, BarChart3, MessageSquare, Sparkles, TrendingUp, Award, Check } from 'lucide-react';
import { handleModalBackdropClick } from '../../utils/theme';
import { TOUR_SLIDES, tourTrackOffset } from './tourSlides';

interface FeatureTourModalProps {
  open: boolean;
  /** Called when the tour is finished or skipped; parent opens the next popup. */
  onClose: () => void;
}

/**
 * First-login feature tour: a sliding carousel of stylized screen mockups so a
 * judge (or any first-time user) sees what each feature does without exploring.
 * Slide content/sequencing lives in `tourSlides.ts` (unit-tested); this file is
 * presentation + slide-state only. Last slide is Topic Mastery, per spec.
 */
export const FeatureTourModal: React.FC<FeatureTourModalProps> = ({ open, onClose }) => {
  const [index, setIndex] = useState(0);
  const total = TOUR_SLIDES.length;

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Escape dismisses the tour at any step.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleNext = useCallback(() => {
    setIndex((i) => {
      if (i >= total - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [total, onClose]);

  const handleBack = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  if (!open || typeof document === 'undefined') return null;

  const slide = TOUR_SLIDES[index];
  const isLast = index === total - 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm cursor-pointer pragati-fade-in"
      onClick={(e) => handleModalBackdropClick(e, onClose)}
      role="dialog"
      aria-modal="true"
      aria-label="Pragati feature tour"
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden cursor-default pragati-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: brand mark + step counter + close */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="w-7 h-7 rounded-lg border border-slate-200" />
            <div>
              <p className="text-xs font-display font-extrabold text-slate-900 leading-none">Pragati</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                Quick tour · {index + 1} of {total}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Skip tour"
            className="p-2 -m-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sliding track */}
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(${tourTrackOffset(index, total)}%)` }}
          >
            {TOUR_SLIDES.map((s, i) => (
              <div key={s.id} className="w-full shrink-0 px-5" aria-hidden={i !== index}>
                {/* Stylized mock preview */}
                <div className="h-44 rounded-2xl border border-slate-200 bg-slate-50/80 overflow-hidden relative">
                  <SlidePreview preview={s.preview} />
                </div>

                {/* Copy */}
                <div className="pt-4 pb-1 min-h-[168px]">
                  <h3 className="text-lg font-display font-extrabold text-slate-900 tracking-tight">{s.title}</h3>
                  <p className="text-sm sm:text-xs text-slate-500 leading-relaxed mt-1.5">{s.description}</p>
                  <ul className="mt-3 space-y-1.5">
                    {s.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[13px] sm:text-xs text-slate-700">
                        <Check className="w-3.5 h-3.5 text-slate-800 shrink-0 mt-px" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer: dots + controls */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            {TOUR_SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}: ${s.title}`}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                  i === index ? 'w-5 bg-slate-900' : 'w-2 bg-slate-200 hover:bg-slate-300'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm sm:text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm sm:text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              <span>{isLast ? slide.cta : 'Next'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

/** Stylized, hand-built mini-mockups of each screen — crisp, theme-matched, never stale. */
const SlidePreview: React.FC<{ preview: string }> = ({ preview }) => {
  if (preview === 'brand') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="w-12 h-12 rounded-2xl border border-slate-200 shadow-sm" />
          <div className="text-left">
            <p className="text-lg font-display font-extrabold text-slate-900 tracking-tight">Pragati</p>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">AI Learning System</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {[
            { icon: Bot, label: 'Tutor' },
            { icon: CheckSquare, label: 'Quizzes' },
            { icon: Target, label: 'Topics' },
            { icon: BarChart3, label: 'Analytics' },
          ].map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg shadow-xs"
            >
              <Icon className="w-3 h-3" />
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (preview === 'chat') {
    return (
      <div className="h-full flex flex-col justify-end gap-2 p-4">
        <div className="self-end max-w-[75%] px-3 py-2 bg-slate-900 text-white text-[10px] font-medium rounded-2xl rounded-br-md shadow-xs">
          Explain the chain rule step by step
        </div>
        <div className="self-start max-w-[85%] px-3 py-2 bg-white border border-slate-200 rounded-2xl rounded-bl-md shadow-xs space-y-1.5">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3 text-slate-400" />
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">AI Instructor</span>
          </div>
          <p className="text-[10px] text-slate-700 leading-snug">
            Let&rsquo;s build it together: if y = f(g(x)), what is the outer function here?
          </p>
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[9px] font-semibold text-slate-700">
            <Sparkles className="w-2.5 h-2.5" />
            Generate quiz from this chat
          </div>
        </div>
      </div>
    );
  }

  if (preview === 'quiz') {
    return (
      <div className="h-full p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Quizzes Arena</span>
          <span className="px-1.5 py-0.5 text-[8px] font-bold bg-slate-900 text-white rounded-full">+ Generate</span>
        </div>
        {[
          { topic: 'Calculus — Derivatives', diff: 'Intermediate', pct: 80 },
          { topic: 'Limits & Continuity', diff: 'Foundation', pct: 55 },
        ].map((q) => (
          <div key={q.topic} className="flex items-center justify-between gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl shadow-xs">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-slate-800 truncate">{q.topic}</p>
              <p className="text-[9px] text-slate-400">{q.diff} · 5 questions</p>
            </div>
            <div className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-slate-700 border border-slate-200 rounded-lg bg-slate-50">
              <CheckSquare className="w-2.5 h-2.5" />
              Attempt
            </div>
          </div>
        ))}
        <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full w-3/5 rounded-full bg-slate-800" />
        </div>
      </div>
    );
  }

  if (preview === 'topics') {
    return (
      <div className="h-full p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">My Topics</span>
          <span className="px-1.5 py-0.5 text-[8px] font-bold bg-slate-900 text-white rounded-full">+ Add Topic</span>
        </div>
        <div className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl shadow-xs">
          <p className="text-[10px] font-bold text-slate-900">Calculus</p>
          <p className="text-[9px] text-slate-400 mt-0.5">Focus next: Chain Rule (30%)</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {['Functions', 'Limits', 'Power Rule', 'Chain Rule'].map((chip) => (
              <span
                key={chip}
                className="px-1.5 py-0.5 text-[9px] font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-md"
              >
                {chip}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold text-slate-700 border border-slate-300 rounded-md bg-white">
              <Sparkles className="w-2.5 h-2.5" />
              AI plan
            </span>
          </div>
        </div>
        <p className="text-[9px] text-slate-400 leading-snug">
          Pragati drafts subtopics with AI — edit them anytime, mastery is tracked per subtopic.
        </p>
      </div>
    );
  }

  // 'mastery' — the finale screen
  return (
    <div className="h-full p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Topic Mastery</span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full">
          <TrendingUp className="w-2.5 h-2.5" />
          +12% Power Rule
        </span>
      </div>
      {[
        { name: 'Functions', pct: 88 },
        { name: 'Limits', pct: 75 },
        { name: 'Power Rule', pct: 44 },
      ].map((row) => (
        <div key={row.name} className="flex items-center gap-2">
          <span className="w-16 text-[9px] font-medium text-slate-600 truncate">{row.name}</span>
          <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full bg-slate-800 transition-all duration-500" style={{ width: `${row.pct}%` }} />
          </div>
          <span className="text-[9px] font-mono font-bold text-slate-500 w-7 text-right">{row.pct}%</span>
        </div>
      ))}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl shadow-xs mt-1">
        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-slate-600">
          <Award className="w-3 h-3" />
          Skill rating
        </span>
        <span className="text-[9px] font-mono font-bold text-slate-800">
          1226 <span className="text-emerald-600">(+26)</span>
        </span>
      </div>
    </div>
  );
};
