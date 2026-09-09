import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { apiRequest, invalidateCache } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Clock,
  Lightbulb,
  SkipForward,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Award,
  MoreVertical,
  Bot,
  Trash2,
  AlertTriangle,
  Send,
} from 'lucide-react';
import {
  getSubmitModalAnsweredCardClass,
  SUBMIT_MODAL_SUBTITLE,
  handleModalBackdropClick,
} from '../utils/theme';
import {
  toggleAnswer,
  canNavigatePrevious,
  canNavigateNext,
  getAnswerCounts,
  getQuestionSquareStatus,
  getQuestionSquareClasses,
} from '../utils/quizNavigation';

export function formatMathForMarkdown(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  // If text contains LaTeX math commands but is missing enclosing $ signs, wrap with $
  if (/\\(frac|sqrt|cos|sin|tan|ln|log|sum|int|times|cdot|partial|pi|theta|alpha|beta|gamma)/.test(trimmed) && !trimmed.includes('$')) {
    return `$${trimmed}$`;
  }
  return trimmed;
}

export function sanitizePromptText(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  // Remove accidental duplicate LaTeX formula patterns e.g. $f(x) = ...$f(x) = ...
  cleaned = cleaned.replace(/\$(\s*f\(x\)\s*=\s*[^\$]+)\s*\$\s*f\(x\)\s*=\s*[^\?\n]+/i, '$$$1$$');
  return formatMathForMarkdown(cleaned);
}

interface QuestionOption {
  id: string;
  text: string;
}

interface Question {
  id: string;
  quiz_id: string;
  prompt: string;
  options: QuestionOption[];
  hint?: string;
  order_index: number;
}

interface Quiz {
  id: string;
  topic: string;
  difficulty: string;
  total_questions: number;
}

interface UserAnswerState {
  question_id: string;
  selected_answer?: string;
  dwell_time_sec: number;
  hints_used: number;
}

export const QuizArenaPage: React.FC = () => {
  const { id: quizId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, UserAnswerState>>({});
  const [loading, setLoading] = useState(true);

  // Timers & Hints
  const [totalTimeLeftSec, setTotalTimeLeftSec] = useState(600);
  const [questionDwellSec, setQuestionDwellSec] = useState(0);
  const [revealedHints, setRevealedHints] = useState<Record<string, boolean>>({});

  // Modals & 3-Dot Menu
  const [menuOpen, setMenuOpen] = useState(false);
  const [deletingQuiz, setDeletingQuiz] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Results State
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attemptResult, setAttemptResult] = useState<any>(null);

  // Visited Questions tracking for square palette
  const [visitedQuestionIds, setVisitedQuestionIds] = useState<Set<string>>(new Set());

  // Close 3-dot menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setMenuOpen(false);
    if (menuOpen) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [menuOpen]);

  // Close modals on Escape key press
  useEffect(() => {
    if (!showSubmitModal && !showExitModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSubmitModal && !submitting) {
          setShowSubmitModal(false);
        } else if (showExitModal) {
          setShowExitModal(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSubmitModal, showExitModal, submitting]);

  // Fetch Quiz & Questions
  useEffect(() => {
    if (!quizId) return;
    apiRequest<{ quiz: Quiz; questions: Question[] }>(`/api/quizzes/${quizId}`)
      .then((data) => {
        setQuiz(data.quiz);
        setQuestions(data.questions);
        setTotalTimeLeftSec(data.questions.length * 120);
        setLoading(false);
        if (data.questions.length > 0) {
          setVisitedQuestionIds(new Set([data.questions[0].id]));
        }
      })
      .catch((err) => {
        alert(`Failed to load quiz: ${err.message}`);
        navigate('/quizzes');
      });
  }, [quizId]);

  // Total countdown timer
  useEffect(() => {
    if (loading || isSubmitted) return;
    const interval = setInterval(() => {
      setTotalTimeLeftSec((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          executeSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, isSubmitted]);

  // Per-question dwell timer
  useEffect(() => {
    if (loading || isSubmitted) return;
    setQuestionDwellSec(0);

    const interval = setInterval(() => {
      setQuestionDwellSec((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentIndex, loading, isSubmitted]);

  const currentQuestion = questions[currentIndex];

  // Track visited questions whenever current question changes
  useEffect(() => {
    if (currentQuestion) {
      setVisitedQuestionIds((prev) => {
        if (prev.has(currentQuestion.id)) return prev;
        const next = new Set(prev);
        next.add(currentQuestion.id);
        return next;
      });
    }
  }, [currentQuestion]);

  const navigateToQuestion = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= questions.length || targetIndex === currentIndex) return;

    if (currentQuestion) {
      const isHintActive = revealedHints[currentQuestion.id] || false;
      setAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: {
          question_id: currentQuestion.id,
          selected_answer: prev[currentQuestion.id]?.selected_answer,
          dwell_time_sec: (prev[currentQuestion.id]?.dwell_time_sec || 0) + questionDwellSec,
          hints_used: prev[currentQuestion.id]?.hints_used || (isHintActive ? 1 : 0),
        },
      }));
    }
    const nextQuestion = questions[targetIndex];
    if (nextQuestion) {
      setVisitedQuestionIds((prev) => {
        if (prev.has(nextQuestion.id)) return prev;
        const next = new Set(prev);
        next.add(nextQuestion.id);
        return next;
      });
    }
    setQuestionDwellSec(0);
    setCurrentIndex(targetIndex);
  };

  const handleSelectOption = (optionId: string) => {
    if (!currentQuestion) return;
    const currentSelected = answers[currentQuestion.id]?.selected_answer;
    const newSelected = toggleAnswer(currentSelected, optionId);
    const isHintActive = revealedHints[currentQuestion.id] || false;

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        question_id: currentQuestion.id,
        selected_answer: newSelected,
        dwell_time_sec: (prev[currentQuestion.id]?.dwell_time_sec || 0) + questionDwellSec,
        hints_used: prev[currentQuestion.id]?.hints_used || (isHintActive ? 1 : 0),
      },
    }));
    setQuestionDwellSec(0);
  };

  const handleRevealHint = () => {
    if (!currentQuestion) return;
    setRevealedHints((prev) => ({ ...prev, [currentQuestion.id]: true }));
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        question_id: currentQuestion.id,
        selected_answer: prev[currentQuestion.id]?.selected_answer,
        dwell_time_sec: (prev[currentQuestion.id]?.dwell_time_sec || 0) + questionDwellSec,
        hints_used: (prev[currentQuestion.id]?.hints_used || 0) + 1,
      },
    }));
    setQuestionDwellSec(0);
  };

  const handleNext = () => {
    if (canNavigateNext(currentIndex, questions.length)) {
      navigateToQuestion(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (canNavigatePrevious(currentIndex)) {
      navigateToQuestion(currentIndex - 1);
    }
  };

  const handleSkip = () => {
    if (canNavigateNext(currentIndex, questions.length)) {
      navigateToQuestion(currentIndex + 1);
    }
  };

  const handleEditWithAI = () => {
    setMenuOpen(false);
    if (!currentQuestion) return;
    const promptText = `Can you guide me Socratically through this question on "${quiz?.topic || 'this topic'}"?\n\nQuestion: ${currentQuestion.prompt}\n\nOptions:\n${currentQuestion.options.map((o) => `${o.id}: ${o.text}`).join('\n')}`;
    navigate(`/instructor?prompt=${encodeURIComponent(promptText)}`);
  };

  const handleDeleteQuiz = async () => {
    setMenuOpen(false);
    if (!quizId) return;
    const confirmed = window.confirm(
      'Are you sure you want to delete this quiz? All associated progress and telemetry will be permanently removed.'
    );
    if (!confirmed) return;

    setDeletingQuiz(true);
    try {
      await apiRequest(`/api/quizzes/${quizId}`, { method: 'DELETE' });
      invalidateCache('/api/quizzes');
      invalidateCache('/api/analytics/dashboard');
      navigate('/quizzes');
    } catch (err: any) {
      alert(`Failed to delete quiz: ${err.message}`);
    } finally {
      setDeletingQuiz(false);
    }
  };

  const executeSubmit = async () => {
    if (submitting || !quizId) return;
    setSubmitting(true);
    setShowSubmitModal(false);

    const isHintActive = currentQuestion ? (revealedHints[currentQuestion.id] || false) : false;
    const finalAnswersObj = {
      ...answers,
      ...(currentQuestion
        ? {
            [currentQuestion.id]: {
              ...answers[currentQuestion.id],
              question_id: currentQuestion.id,
              selected_answer: answers[currentQuestion.id]?.selected_answer,
              dwell_time_sec: (answers[currentQuestion.id]?.dwell_time_sec || 0) + questionDwellSec,
              hints_used: answers[currentQuestion.id]?.hints_used || (isHintActive ? 1 : 0),
            },
          }
        : {}),
    };

    const payload = questions.map((q) => {
      const recorded = finalAnswersObj[q.id];
      return {
        question_id: q.id,
        selected_answer: recorded?.selected_answer,
        dwell_time_sec: recorded?.dwell_time_sec || 0,
        hints_used: recorded?.hints_used || 0,
      };
    });

    try {
      const data = await apiRequest(`/api/quizzes/${quizId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers: payload }),
      });
      setAttemptResult(data);
      setIsSubmitted(true);
      await refreshProfile();
    } catch (err: any) {
      alert(`Submission error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remaining = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
      </div>
    );
  }

  // --- POST-TEST RESULTS SCREEN ---
  if (isSubmitted && attemptResult) {
    const { summary, results } = attemptResult;
    return (
      <div className="h-full overflow-y-auto subtle-scroll">
        <div className="max-w-4xl mx-auto w-full p-4 md:p-8 space-y-6 font-sans">
          {/* Score Card */}
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 text-center shadow-xs">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-slate-800 mb-4 border border-slate-200 shadow-xs">
              <Award className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">Quiz Completed!</h2>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">{quiz?.topic}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-xs text-slate-500 font-medium">Score</span>
                <p className="text-2xl font-black text-slate-900 font-mono mt-0.5">
                  {summary.score} / {summary.total_questions}
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-xs text-slate-500 font-medium">Accuracy</span>
                <p className="text-2xl font-black text-slate-900 font-mono mt-0.5">
                  {summary.accuracy_pct}%
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-xs text-slate-500 font-medium">Total Duration</span>
                <p className="text-2xl font-black text-slate-900 font-mono mt-0.5">
                  {formatTimer(summary.total_time_sec)}
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-xs text-slate-500 font-medium">Rating Change</span>
                <p className="text-2xl font-black text-slate-900 font-mono mt-0.5">
                  {summary.rating_change >= 0 ? `+${summary.rating_change}` : summary.rating_change} ELO
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 mt-8">
              <button
                onClick={() => navigate('/quizzes')}
                className="px-5 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-xs font-display"
              >
                Back to Catalog
              </button>
              <button
                onClick={() => navigate('/instructor')}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs font-display"
              >
                <span>Review Missed with AI</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        {/* Detailed Question Review */}
        <div className="space-y-4">
          <h3 className="text-lg font-display font-bold text-slate-900">Question-by-Question Diagnostic</h3>
          {results.map((r: any, idx: number) => (
            <div key={idx} className="bg-white border border-slate-200 p-6 rounded-3xl space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 font-display">Question {idx + 1}</span>
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                    r.is_correct
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : r.is_skipped
                      ? 'bg-slate-100 text-slate-600 border border-slate-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {r.is_correct ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{r.is_correct ? 'Correct' : r.is_skipped ? 'Skipped' : 'Incorrect'}</span>
                </span>
              </div>

              <div className="prose prose-sm max-w-none font-medium text-slate-900">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {r.prompt}
                </ReactMarkdown>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono pt-2">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold">Your Choice</span>
                  <div className="font-bold text-slate-800 font-sans mt-0.5">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {formatMathForMarkdown(r.selected_answer || 'None (Skipped)')}
                    </ReactMarkdown>
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-200">
                  <span className="text-emerald-600 block text-[10px] uppercase font-sans font-bold">Correct Answer</span>
                  <div className="font-bold text-emerald-800 font-sans mt-0.5">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {formatMathForMarkdown(r.correct_answer)}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>

              {r.explanation && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 leading-relaxed">
                  <strong className="text-slate-900 font-display font-bold block mb-1">Explanation:</strong>
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {formatMathForMarkdown(r.explanation)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      </div>
    );
  }

  // Counts for submission diagnostic
  const counts = getAnswerCounts(questions, answers);
  const isCurrentHintVisible = currentQuestion ? (revealedHints[currentQuestion.id] || false) : false;

  // --- ACTIVE QUIZ TAKING SCREEN ---
  return (
    <div className="h-full flex flex-col overflow-hidden font-sans relative bg-white">
      {/* Sticky Top Header: Exit Quiz (Left), Quiz Topic & Question Index (Center), Countdown Timer (Right) */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-3 sm:px-6 py-2.5 sm:py-3.5 border-b border-slate-200 shrink-0 flex items-center justify-between gap-2 sm:gap-4 shadow-xs">
        <button
          type="button"
          onClick={() => setShowExitModal(true)}
          aria-label="Exit Quiz"
          className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all shadow-xs cursor-pointer shrink-0 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
          <span className="hidden xs:inline sm:inline">Exit Quiz</span>
        </button>

        <div className="text-center min-w-0 flex-1 px-1 sm:px-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-display block truncate">
            {quiz?.topic || 'Curriculum Quiz'}
          </span>
          <span className="text-[11px] font-mono text-slate-400 block truncate">
            Question {currentIndex + 1} of {questions.length}
          </span>
        </div>

        {/* Right Side: Countdown Timer + Submit Quiz */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-semibold text-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span>{formatTimer(totalTimeLeftSec)}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            disabled={submitting}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 active:scale-95 shrink-0"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-slate-300" />}
            <span className="hidden sm:inline">Submit Quiz</span>
            <span className="sm:hidden">Submit</span>
          </button>
        </div>
      </div>

      {/* Main Content Body: Central Question Card + Right-Hand/Top Square Palette */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row gap-3 sm:gap-6 px-3 sm:px-6 pb-4 sm:pb-6 pt-2 sm:pt-4 min-h-0">
        {/* Central Question Card Area */}
        <div className="flex-1 flex flex-col justify-between overflow-y-auto subtle-scroll min-w-0 pr-1">
          <div className="max-w-3xl w-full mx-auto flex-1 flex flex-col justify-between">
            {currentQuestion && (
              <div className="bg-white border border-slate-200 p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl space-y-4 sm:space-y-6 flex-1 flex flex-col justify-between shadow-xs relative">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="prose prose-base max-w-none text-slate-900 font-medium flex-1">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {sanitizePromptText(currentQuestion.prompt)}
                      </ReactMarkdown>
                    </div>

                    {/* 3-Dot Action Menu */}
                    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setMenuOpen((prev) => !prev)}
                        aria-label="Question Options"
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {menuOpen && (
                        <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-30 animate-in fade-in zoom-in-95">
                          <button
                            type="button"
                            onClick={handleEditWithAI}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors text-left cursor-pointer"
                          >
                            <Bot className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Edit with AI</span>
                          </button>

                          <div className="my-1 border-t border-slate-100" />

                          <button
                            type="button"
                            onClick={handleDeleteQuiz}
                            disabled={deletingQuiz}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>{deletingQuiz ? 'Deleting...' : 'Delete Quiz'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Options List */}
                  <div className="space-y-3 pt-2">
                    {currentQuestion.options.map((opt) => {
                      const isSelected = answers[currentQuestion.id]?.selected_answer === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleSelectOption(opt.id)}
                          className={`w-full flex items-center gap-4 p-4 rounded-2xl text-left text-sm font-semibold transition-all border cursor-pointer ${
                            isSelected
                              ? 'bg-slate-50 border-slate-900 text-slate-900 shadow-xs ring-1 ring-slate-900'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <span
                            className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono text-xs font-bold shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-slate-900 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {opt.id}
                          </span>
                          <div className="flex-1 font-sans text-sm font-medium">
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {formatMathForMarkdown(opt.text)}
                            </ReactMarkdown>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Hint reveal drawer */}
                  {isCurrentHintVisible && currentQuestion.hint && (
                    <div className="p-4 bg-amber-50/90 border border-amber-200/90 rounded-2xl text-xs text-amber-900 animate-in fade-in transition-all">
                      <strong className="font-bold block mb-1 flex items-center gap-1.5 font-display">
                        <Lightbulb className="w-4 h-4 text-amber-600" />
                        <span>Targeted Hint:</span>
                      </strong>
                      <div className="prose prose-xs max-w-none text-amber-900 font-medium leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {formatMathForMarkdown(currentQuestion.hint)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Bar with Full Navigation */}
                <div className="pt-6 border-t border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {/* Previous Question Button */}
                    <button
                      type="button"
                      onClick={handlePrevious}
                      disabled={!canNavigatePrevious(currentIndex)}
                      aria-label="Previous Question"
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Previous</span>
                    </button>

                    {currentQuestion.hint && !isCurrentHintVisible && (
                      <button
                        type="button"
                        onClick={handleRevealHint}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-xl transition-colors cursor-pointer"
                      >
                        <Lightbulb className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Request Hint</span>
                      </button>
                    )}

                    {canNavigateNext(currentIndex, questions.length) && (
                      <button
                        type="button"
                        onClick={handleSkip}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        <span>Skip</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {canNavigateNext(currentIndex, questions.length) ? (
                      <button
                        type="button"
                        onClick={handleNext}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs font-display cursor-pointer"
                      >
                        <span>Next</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowSubmitModal(true)}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs font-display disabled:opacity-50 cursor-pointer"
                      >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        <span>Submit Quiz</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Question Palette: Horizontal bar on mobile, right-hand vertical column on desktop */}
        <aside className="w-full md:w-14 h-auto md:h-fit self-center shrink-0 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-xs flex flex-row md:flex-col items-center justify-start md:justify-center gap-2 overflow-x-auto md:overflow-y-auto subtle-scroll order-first md:order-last max-h-none md:max-h-[calc(100vh-140px)]">
          {questions.map((q, idx) => {
            const isActive = idx === currentIndex;
            const status = getQuestionSquareStatus(q.id, answers, visitedQuestionIds);
            const classes = getQuestionSquareClasses(status, isActive);
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => navigateToQuestion(idx)}
                aria-label={`Jump to Question ${idx + 1}`}
                className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 ${classes}`}
                title={`Question ${idx + 1} (${status === 'attempted' ? 'Attempted' : status === 'unattempted' ? 'Not Attempted' : 'Unvisited'})`}
              >
                <span>Q{idx + 1}</span>
              </button>
            );
          })}
        </aside>
      </div>

      {/* Exit Confirmation Modal rendered via Portal to cover the whole viewport including the sidebar */}
      {showExitModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in cursor-pointer"
            onClick={(e) => handleModalBackdropClick(e, () => setShowExitModal(false))}
          >
            <div
              className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-display text-slate-900">Exit Quiz?</h3>
                  <p className="text-xs text-slate-500">Unsubmitted progress will be discarded.</p>
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                Are you sure you want to leave this quiz? Your answers and telemetry for this session will not be saved.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExitModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Continue Quiz
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/quizzes')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs cursor-pointer"
                >
                  Exit to Catalog
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Submit Confirmation Modal rendered via Portal */}
      {showSubmitModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in cursor-pointer"
            onClick={(e) => handleModalBackdropClick(e, () => setShowSubmitModal(false), submitting)}
          >
            <div
              className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-900 flex items-center justify-center border border-slate-200 shrink-0">
                  <Send className="w-5 h-5 text-slate-800" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-display text-slate-900">Submit Quiz?</h3>
                  <p className="text-xs text-slate-500">{SUBMIT_MODAL_SUBTITLE}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                  <span className="text-[11px] font-semibold text-slate-500 block">Total</span>
                  <span className="text-lg font-bold font-mono text-slate-900 mt-0.5 block">{counts.total}</span>
                </div>
                <div className={getSubmitModalAnsweredCardClass()}>
                  <span className="text-[11px] font-semibold text-slate-600 block">Answered</span>
                  <span className="text-lg font-bold font-mono text-slate-900 mt-0.5 block">{counts.answered}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                  <span className="text-[11px] font-semibold text-slate-500 block">Unanswered</span>
                  <span className="text-lg font-bold font-mono text-slate-700 mt-0.5 block">{counts.unanswered}</span>
                </div>
              </div>

              {counts.unanswered > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 leading-relaxed">
                  You have <strong>{counts.unanswered} unanswered question{counts.unanswered > 1 ? 's' : ''}</strong> remaining. You can review them using the navigation bar before finalizing.
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Review Questions
                </button>
                <button
                  type="button"
                  onClick={executeSubmit}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Confirm & Submit</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

