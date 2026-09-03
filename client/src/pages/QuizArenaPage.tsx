import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Clock, Hourglass, Lightbulb, SkipForward, CheckCircle2, XCircle, ArrowRight, Loader2, Award } from 'lucide-react';

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

  // Timers
  const [totalTimeLeftSec, setTotalTimeLeftSec] = useState(600); // 10 min default
  const [questionDwellSec, setQuestionDwellSec] = useState(0);
  const [hintVisible, setHintVisible] = useState(false);

  // Results State
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attemptResult, setAttemptResult] = useState<any>(null);

  // Fetch Quiz & Questions
  useEffect(() => {
    if (!quizId) return;
    apiRequest<{ quiz: Quiz; questions: Question[] }>(`/api/quizzes/${quizId}`)
      .then((data) => {
        setQuiz(data.quiz);
        setQuestions(data.questions);
        setTotalTimeLeftSec(data.questions.length * 120); // 2 mins per question
        setLoading(false);
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
          handleSubmit();
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
    setHintVisible(false);

    const interval = setInterval(() => {
      setQuestionDwellSec((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentIndex, loading, isSubmitted]);

  const currentQuestion = questions[currentIndex];

  const handleSelectOption = (optionId: string) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        question_id: currentQuestion.id,
        selected_answer: optionId,
        dwell_time_sec: (prev[currentQuestion.id]?.dwell_time_sec || 0) + questionDwellSec,
        hints_used: prev[currentQuestion.id]?.hints_used || (hintVisible ? 1 : 0),
      },
    }));
  };

  const handleRevealHint = () => {
    if (!hintVisible && currentQuestion) {
      setHintVisible(true);
      setAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: {
          ...prev[currentQuestion.id],
          question_id: currentQuestion.id,
          dwell_time_sec: (prev[currentQuestion.id]?.dwell_time_sec || 0) + questionDwellSec,
          hints_used: (prev[currentQuestion.id]?.hints_used || 0) + 1,
        },
      }));
    }
  };

  const handleNext = () => {
    // Record dwell time for current question before advancing
    if (currentQuestion) {
      setAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: {
          ...prev[currentQuestion.id],
          question_id: currentQuestion.id,
          dwell_time_sec: (prev[currentQuestion.id]?.dwell_time_sec || 0) + questionDwellSec,
          hints_used: prev[currentQuestion.id]?.hints_used || (hintVisible ? 1 : 0),
        },
      }));
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleSkip = () => {
    if (currentQuestion) {
      setAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: {
          question_id: currentQuestion.id,
          selected_answer: undefined,
          dwell_time_sec: (prev[currentQuestion.id]?.dwell_time_sec || 0) + questionDwellSec,
          hints_used: prev[currentQuestion.id]?.hints_used || (hintVisible ? 1 : 0),
        },
      }));
    }
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleSubmit = async () => {
    if (submitting || !quizId) return;
    setSubmitting(true);

    // Ensure current question time is recorded
    const finalAnswersObj = {
      ...answers,
      ...(currentQuestion
        ? {
            [currentQuestion.id]: {
              ...answers[currentQuestion.id],
              question_id: currentQuestion.id,
              dwell_time_sec: (answers[currentQuestion.id]?.dwell_time_sec || 0) + questionDwellSec,
              hints_used: answers[currentQuestion.id]?.hints_used || (hintVisible ? 1 : 0),
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
        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
      </div>
    );
  }

  // --- POST-TEST RESULTS SCREEN ---
  if (isSubmitted && attemptResult) {
    const { summary, results } = attemptResult;
    return (
      <div className="max-w-4xl mx-auto w-full p-4 md:p-8 space-y-6">
        {/* Score Card */}
        <div className="glass-card p-6 md:p-8 rounded-2xl border-2 border-sky-300/80 bg-white/95 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 mb-4 border border-sky-200">
            <Award className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900">Quiz Completed!</h2>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">{quiz?.topic}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70">
              <span className="text-xs text-slate-500 font-medium">Score</span>
              <p className="text-2xl font-black text-sky-600 font-mono mt-0.5">
                {summary.score} / {summary.total_questions}
              </p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70">
              <span className="text-xs text-slate-500 font-medium">Accuracy</span>
              <p className="text-2xl font-black text-slate-900 font-mono mt-0.5">
                {summary.accuracy_pct}%
              </p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70">
              <span className="text-xs text-slate-500 font-medium">Total Duration</span>
              <p className="text-2xl font-black text-slate-900 font-mono mt-0.5">
                {formatTimer(summary.total_time_sec)}
              </p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70">
              <span className="text-xs text-slate-500 font-medium">Rating Change</span>
              <p className="text-2xl font-black text-violet-600 font-mono mt-0.5">
                {summary.rating_change >= 0 ? `+${summary.rating_change}` : summary.rating_change} ELO
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => navigate('/quizzes')}
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm transition"
            >
              Back to Catalog
            </button>
            <button
              onClick={() => navigate('/instructor')}
              className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              <span>Review Missed with AI</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Detailed Question Review */}
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-900">Question-by-Question Diagnostic</h3>
          {results.map((r: any, idx: number) => (
            <div key={idx} className="glass-card p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Question {idx + 1}</span>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1.5 ${
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-2">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold">Your Choice</span>
                  <span className="font-bold text-slate-800">{r.selected_answer || 'None (Skipped)'}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-200">
                  <span className="text-emerald-600 block text-[10px] uppercase font-sans font-bold">Correct Answer</span>
                  <span className="font-bold text-emerald-800">{r.correct_answer}</span>
                </div>
              </div>

              {r.explanation && (
                <div className="p-3 bg-sky-50/60 border border-sky-200/70 rounded-xl text-xs text-slate-700 leading-relaxed">
                  <strong className="text-sky-900 font-bold block mb-1">Explanation:</strong>
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {r.explanation}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- ACTIVE QUIZ TAKING SCREEN ---
  return (
    <div className="max-w-3xl mx-auto w-full p-4 md:p-8 flex flex-col h-full justify-between">
      {/* Top Bar with Dual Monospace Timers */}
      <div className="glass-panel p-3.5 rounded-2xl flex items-center justify-between border border-slate-200 mb-6 shadow-sm">
        <div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {quiz?.topic}
          </span>
          <p className="text-xs text-slate-700 font-bold font-mono mt-0.5">
            Question {currentIndex + 1} of {questions.length}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Question Dwell Timer */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 rounded-xl border border-violet-200 font-mono text-xs font-bold">
            <Hourglass className="w-3.5 h-3.5" />
            <span>{formatTimer(questionDwellSec)}</span>
          </div>

          {/* Overall Test Timer */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 text-sky-700 rounded-xl border border-sky-200 font-mono text-xs font-bold">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatTimer(totalTimeLeftSec)}</span>
          </div>
        </div>
      </div>

      {/* Question Card with LaTeX Rendering */}
      {currentQuestion && (
        <div className="glass-card p-6 md:p-8 rounded-2xl space-y-6 flex-1 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="prose prose-base max-w-none text-slate-900 font-medium">
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {currentQuestion.prompt}
              </ReactMarkdown>
            </div>

            {/* Hint reveal drawer */}
            {hintVisible && currentQuestion.hint && (
              <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-900 animate-in fade-in">
                <strong className="font-bold block mb-0.5 flex items-center gap-1">
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Targeted Hint:</span>
                </strong>
                <span>{currentQuestion.hint}</span>
              </div>
            )}

            {/* Options List */}
            <div className="space-y-2.5 pt-2">
              {currentQuestion.options.map((opt) => {
                const isSelected = answers[currentQuestion.id]?.selected_answer === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelectOption(opt.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl text-left text-sm font-semibold transition-all border ${
                      isSelected
                        ? 'bg-sky-50 border-sky-500 text-sky-900 shadow-sm ring-1 ring-sky-500'
                        : 'bg-white/80 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                        isSelected
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {opt.id}
                    </span>
                    <span className="flex-1">{opt.text}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Bar */}
          <div className="pt-6 border-t border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentQuestion.hint && !hintVisible && (
                <button
                  onClick={handleRevealHint}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/70 rounded-xl transition"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Request Hint</span>
                </button>
              )}
              <button
                onClick={handleSkip}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span>Skip</span>
              </button>
            </div>

            {currentIndex < questions.length - 1 ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-sm transition"
              >
                <span>Next Question</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Submit Quiz</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
