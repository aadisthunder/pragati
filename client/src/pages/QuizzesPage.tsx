import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, apiRequestCached, getFromCache, invalidateCache } from '../api/client';
import {
  CheckSquare,
  ArrowRight,
  Loader2,
  Plus,
  BookOpen,
  Search,
  MoreVertical,
  Bot,
  Trash2,
  Share2,
  Check,
} from 'lucide-react';
import { getSecondaryBadgeClass, getResponsivePageContainerClass } from '../utils/theme';
import { buildQuizGeneratePrompt, formatRelativeTime } from '../utils/markdownCards';

interface Quiz {
  id: string;
  topic: string;
  difficulty: string;
  total_questions: number;
  created_at: string;
}

export const QuizzesPage: React.FC = () => {
  const cachedInitial = getFromCache<{ quizzes: Quiz[] }>('/api/quizzes');
  const [quizzes, setQuizzes] = useState<Quiz[]>(cachedInitial?.quizzes || []);
  const [loading, setLoading] = useState(!cachedInitial);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuQuizId, setActiveMenuQuizId] = useState<string | null>(null);
  const [copiedQuizId, setCopiedQuizId] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchQuizzes = async (forceSpinner = false) => {
    try {
      if (forceSpinner || !getFromCache('/api/quizzes')) {
        setLoading(true);
      }
      const data = await apiRequestCached<{ quizzes: Quiz[] }>('/api/quizzes');
      setQuizzes(data.quizzes || []);
    } catch (err) {
      console.error('Failed to load quizzes', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizzes();
  }, []);

  // Close 3-dot menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuQuizId(null);
    if (activeMenuQuizId) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [activeMenuQuizId]);

  const handleGenerateRedirect = () => {
    const prompt = buildQuizGeneratePrompt(searchQuery);
    navigate(`/instructor?prompt=${encodeURIComponent(prompt)}`);
  };

  const handleEditWithAI = (e: React.MouseEvent, quiz: Quiz) => {
    e.stopPropagation();
    setActiveMenuQuizId(null);
    const prompt = `Can you guide me Socratically through the concepts in "${quiz.topic}" (${quiz.difficulty} level) and help me practice?`;
    navigate(`/instructor?prompt=${encodeURIComponent(prompt)}`);
  };

  const handleDeleteQuiz = async (e: React.MouseEvent, quizId: string) => {
    e.stopPropagation();
    setActiveMenuQuizId(null);
    const confirmed = window.confirm(
      'Are you sure you want to delete this quiz? All associated progress and questions will be permanently removed.'
    );
    if (!confirmed) return;

    try {
      await apiRequest(`/api/quizzes/${quizId}`, { method: 'DELETE' });
      invalidateCache('/api/quizzes');
      invalidateCache('/api/analytics/dashboard');
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    } catch (err: any) {
      alert(`Failed to delete quiz: ${err.message}`);
    }
  };

  const handleShareQuiz = async (e: React.MouseEvent, quiz: Quiz) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/quizzes/${quiz.id}`;
    const shareData = {
      title: `Pragati Quiz: ${quiz.topic}`,
      text: `Attempt this ${quiz.difficulty} quiz on "${quiz.topic}" on Pragati!`,
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or share failed, fallback to clipboard
        await navigator.clipboard.writeText(shareUrl);
        setCopiedQuizId(quiz.id);
        setTimeout(() => setCopiedQuizId(null), 2000);
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedQuizId(quiz.id);
      setTimeout(() => setCopiedQuizId(null), 2000);
    }
  };

  const filteredQuizzes = quizzes.filter((q) => {
    if (!searchQuery.trim()) return true;
    const term = searchQuery.toLowerCase();
    return (
      q.topic.toLowerCase().includes(term) ||
      q.difficulty.toLowerCase().includes(term)
    );
  });

  return (
    <div className="h-full w-full max-w-full overflow-y-auto overflow-x-hidden subtle-scroll min-w-0">
      <div className={getResponsivePageContainerClass()}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="w-full sm:w-auto">
            <div className="pl-14 sm:pl-0 min-h-[42px] flex items-center">
              <h2 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                <CheckSquare className="w-5 h-5 sm:w-6 sm:h-6 text-slate-800" />
                <span>Quizzes Arena</span>
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Attempt curriculum quizzes generated by the Socratic AI agent
            </p>
          </div>

          {/* Search Bar & AI Generate Button */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search quizzes..."
                className="w-full pl-8 pr-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
              />
            </div>
            <button
              type="button"
              onClick={handleGenerateRedirect}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Generate</span>
            </button>
          </div>
        </div>

        {/* Quizzes Grid */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
            <p className="text-xs font-medium">Loading available quizzes...</p>
          </div>
        ) : filteredQuizzes.length === 0 ? (
          <div className="bg-white border border-slate-200 p-12 text-center rounded-2xl shadow-md">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-display font-bold text-slate-900">
              {searchQuery ? 'No matching quizzes found' : 'No quizzes generated yet'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchQuery
                ? 'Try a different search keyword or click Generate to create a custom quiz.'
                : 'Click Generate to chat with the AI Instructor and create your first custom quiz.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 min-w-0">
            {filteredQuizzes.map((quiz) => (
              <div
                key={quiz.id}
                className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-300 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 relative min-w-0"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={getSecondaryBadgeClass()}>
                      {quiz.difficulty}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-medium text-slate-500">
                        {formatRelativeTime(quiz.created_at)}
                      </span>

                      {/* Share Quiz Link Button */}
                      <button
                        type="button"
                        onClick={(e) => handleShareQuiz(e, quiz)}
                        aria-label="Share Quiz"
                        title={copiedQuizId === quiz.id ? 'Link copied!' : 'Share quiz link'}
                        className="p-1 text-slate-900 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                      >
                        {copiedQuizId === quiz.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Share2 className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* 3-Dot Action Menu */}
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveMenuQuizId(
                              activeMenuQuizId === quiz.id ? null : quiz.id
                            )
                          }
                          aria-label="Quiz Options"
                          className="p-1 text-slate-900 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {activeMenuQuizId === quiz.id && (
                          <div className="absolute right-0 top-full mt-1.5 w-40 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-30 animate-in fade-in zoom-in-95">
                            <button
                              type="button"
                              onClick={(e) => handleEditWithAI(e, quiz)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors text-left cursor-pointer"
                            >
                              <Bot className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Edit with AI</span>
                            </button>

                            <div className="my-1 border-t border-slate-100" />

                            <button
                              type="button"
                              onClick={(e) => handleDeleteQuiz(e, quiz.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              <span>Delete Quiz</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <h3 className="text-sm font-display font-bold text-slate-800 line-clamp-2">
                    {quiz.topic}
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 font-mono font-semibold">
                    {quiz.total_questions} Q/A
                  </p>
                </div>

                <button
                  onClick={() => navigate(`/quizzes/${quiz.id}`)}
                  className="mt-6 w-full py-2 text-xs font-semibold text-slate-800 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-300 hover:border-slate-400 rounded-xl shadow-xs transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-[0.99] cursor-pointer"
                >
                  <span>Attempt Quiz</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

