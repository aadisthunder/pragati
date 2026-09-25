import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Bot, CheckSquare, BarChart3, LogOut, Award, Plus, MessageSquare, Trash2, Menu, X, SquarePen, Target, Settings2, BookOpen } from 'lucide-react';
import {
  getSidebarNavItemClass,
  getSecondaryBadgeClass,
  getMobileDrawerClass,
  getMobileBackdropClass,
  getFloatingMenuButtonClass,
  getFloatingNewChatButtonClass,
  handleModalBackdropClick,
} from '../../utils/theme';
import { apiRequest, apiRequestCached, invalidateCache, getFromCache } from '../../api/client';
import { OnboardingGoalModal } from '../onboarding/OnboardingGoalModal';
import {
  fetchGoals,
  refreshGoals,
  getGoalsFromCache,
  GOALS_UPDATED_EVENT,
  saveDemoGoalsSession,
  getDemoGoalsSession,
  type GoalWithMastery,
} from '../../api/goals';

export const AppShell: React.FC = () => {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentSessionId = searchParams.get('session');

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);

  // Learning goals (persistent AI memory) + first-login onboarding popup
  const [goals, setGoals] = useState<GoalWithMastery[]>(() => getGoalsFromCache());
  const [goalsLoading, setGoalsLoading] = useState(() => !getFromCache('/api/goals'));
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [sessions, setSessions] = useState<Array<{ id: string; title: string }>>(() => {
    const cached = getFromCache<{ sessions: Array<{ id: string; title: string }> }>('/api/instructor/sessions');
    return cached?.sessions || [];
  });

  const fetchSessions = useCallback(async () => {
    try {
      const data = await apiRequestCached<{ sessions: Array<{ id: string; title: string }> }>('/api/instructor/sessions');
      setSessions(data.sessions || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    setIsMobileDrawerOpen(false);
    const handleUpdated = () => fetchSessions();
    window.addEventListener('chat_sessions_updated', handleUpdated);
    return () => window.removeEventListener('chat_sessions_updated', handleUpdated);
  }, [fetchSessions, location.pathname, location.search]);

  // Load goals once, then refresh whenever anything updates them
  // (onboarding modal, Topics page edits, quiz-driven mastery changes).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchGoals();
        if (!cancelled) setGoals(data);
      } catch {
        // Sidebar topics are non-critical; leave cached/empty state
      } finally {
        if (!cancelled) setGoalsLoading(false);
      }
    };
    load();
    const handleGoalsUpdated = () => {
      refreshGoals()
        .then((data) => !cancelled && setGoals(data))
        .catch(() => {});
    };
    window.addEventListener(GOALS_UPDATED_EVENT, handleGoalsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(GOALS_UPDATED_EVENT, handleGoalsUpdated);
    };
  }, []);

  // First-login popup: show when the server reports onboarding incomplete.
  // The read-only demo account can never persist the flag, so this fires on
  // every fresh load for that account — intentional (judge experience). The
  // once-per-mount guard prevents a profile refresh from re-opening the popup
  // right after the user closes it.
  const onboardingAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (!onboardingAutoOpenedRef.current && profile && profile.onboarding_completed === false) {
      onboardingAutoOpenedRef.current = true;
      setShowOnboarding(true);
    }
  }, [profile]);

  // Background preloading of sidebar page data & chunks sequentially
  useEffect(() => {
    let isCancelled = false;

    const preloadSidebarData = async () => {
      try {
        // Step 1: Preload Quizzes JS chunk
        import('../../pages/QuizzesPage').catch(() => {});

        // Step 2: Prefetch Quizzes data into memory cache
        if (!getFromCache('/api/quizzes')) {
          await apiRequestCached('/api/quizzes').catch(() => {});
        }

        if (isCancelled) return;
        await new Promise((r) => setTimeout(r, 200));

        // Step 3: Preload Analytics JS chunk
        import('../../pages/AnalyticsPage').catch(() => {});

        // Step 4: Prefetch Analytics data into memory cache
        if (!getFromCache('/api/analytics/dashboard')) {
          await apiRequestCached('/api/analytics/dashboard').catch(() => {});
        }

        if (isCancelled) return;
        await new Promise((r) => setTimeout(r, 200));

        // Step 5: Preload QuizArenaPage JS chunk
        import('../../pages/QuizArenaPage').catch(() => {});
      } catch {
        // Ignore background prefetch errors
      }
    };

    preloadSidebarData();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Close Delete Chat modal or mobile drawer on Escape key press
  useEffect(() => {
    if (!sessionToDelete && !isMobileDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sessionToDelete && !deletingSession) {
          setSessionToDelete(null);
        } else if (isMobileDrawerOpen) {
          setIsMobileDrawerOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionToDelete, deletingSession, isMobileDrawerOpen]);

  const handleStartNewChat = () => {
    navigate('/instructor?session=new');
  };

  const handleRequestDeleteSession = (e: React.MouseEvent, sess: { id: string; title: string }) => {
    e.stopPropagation();
    setSessionToDelete(sess);
  };

  const handleConfirmDeleteSession = async () => {
    if (!sessionToDelete || deletingSession) return;
    const targetSessionId = sessionToDelete.id;
    setDeletingSession(true);

    try {
      await apiRequest(`/api/instructor/sessions/${targetSessionId}`, {
        method: 'DELETE',
      });
      invalidateCache('/api/instructor');
      setSessions((prev) => prev.filter((s) => s.id !== targetSessionId));
      window.dispatchEvent(new Event('chat_sessions_updated'));

      if (currentSessionId === targetSessionId) {
        handleStartNewChat();
      }
      setSessionToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete session:', err);
      alert(`Failed to delete chat: ${err.message}`);
    } finally {
      setDeletingSession(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleOnboardingClose = async (submitted: boolean) => {
    setShowOnboarding(false);
    if (submitted) {
      // Refresh profile so the flag (now stamped) keeps the popup closed,
      // and pull the fresh goals into the sidebar.
      try {
        const data = await refreshGoals();
        setGoals(data);
      } catch {
        // non-critical
      }
      refreshProfile().catch(() => {});
    }
  };

  const handleGoalsCreated = (createdGoals: Array<{ id: string; title: string; masteryPct: number }>) => {
    // Read-only demo: persist the goals to sessionStorage so chat carries
    // goal memory for this session even though the DB writes are blocked.
    if (profile?.is_readonly_demo) {
      saveDemoGoalsSession(createdGoals.map((g) => ({ goalId: g.id, title: g.title, masteryPct: g.masteryPct, subtopics: [] })));
    }
  };

  const navItems = [
    { to: '/instructor', label: 'AI Instructor', icon: Bot },
    { to: '/quizzes', label: 'Quizzes', icon: CheckSquare },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  ];

  // Read-only demo fallback: session-stored goals when DB goals are blocked.
  const demoSessionGoals = profile?.is_readonly_demo ? getDemoGoalsSession() : [];
  const displayGoals: GoalWithMastery[] =
    goals.length > 0
      ? goals
      : demoSessionGoals.map((g) => ({ goalId: g.id, title: g.title, masteryPct: g.masteryPct, subtopics: [] }));

  return (
    <div className="flex h-screen bg-white text-slate-900 overflow-hidden font-sans">
      {/* First-login onboarding popup (also fires every load for the read-only demo) */}
      <OnboardingGoalModal open={showOnboarding} onClose={handleOnboardingClose} onGoalsCreated={handleGoalsCreated} />

      {/* Mobile Backdrop Overlay */}
      <div
        onClick={() => setIsMobileDrawerOpen(false)}
        className={getMobileBackdropClass(isMobileDrawerOpen)}
        aria-hidden="true"
      />

      {/* Sidebar: Slide-out drawer on mobile, static on desktop */}
      <aside className={getMobileDrawerClass(isMobileDrawerOpen)}>
        <div className="flex flex-col h-full justify-between overflow-y-auto subtle-scroll">
          <div>
            {/* Brand Logo & Mobile Close Button */}
            <div className="flex items-center justify-between px-3 py-3 mb-4">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="Pragati Logo"
                  className="w-10 h-10 rounded-xl object-cover border border-slate-200"
                />
                <div>
                  <h1 className="text-xl font-display font-extrabold tracking-tight text-slate-900">Pragati</h1>
                  <p className="text-[10px] font-bold text-slate-600 tracking-wider uppercase font-display">AI Learning System</p>
                </div>
              </div>

              {/* Close button for mobile drawer */}
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                aria-label="Close navigation"
                className="md:hidden p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Links - 3 Items */}
            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isInstructor = item.to === '/instructor';
                return (
                  <div key={item.to} className="space-y-1">
                    <NavLink
                      to={item.to}
                      onClick={() => setIsMobileDrawerOpen(false)}
                      className={({ isActive }) => getSidebarNavItemClass(isActive)}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </NavLink>

                    {/* Sublinks under AI Instructor: New Chat & History */}
                    {isInstructor && (
                      <div className="pl-2 pr-1 pt-1.5 pb-0.5 space-y-1.5">
                        <button
                          onClick={() => {
                            handleStartNewChat();
                            setIsMobileDrawerOpen(false);
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-xs active:scale-[0.98] cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-slate-200" />
                          <span>New Chat</span>
                        </button>

                        {sessions.length > 0 && (
                          <div className="pt-0.5 space-y-0.5">
                            {sessions.map((sess) => {
                              const isCurrentSession = currentSessionId === sess.id;
                              return (
                                <div
                                  key={sess.id}
                                  onClick={() => {
                                    navigate(`/instructor?session=${sess.id}`);
                                    setIsMobileDrawerOpen(false);
                                  }}
                                  className={`group w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left border border-transparent ${
                                    isCurrentSession
                                      ? 'bg-slate-100 text-slate-900 font-medium'
                                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                  }`}
                                  title={sess.title}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <MessageSquare className="w-3 h-3 flex-shrink-0 text-slate-400" />
                                    <span className="truncate">{sess.title || 'Untitled Chat'}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => handleRequestDeleteSession(e, sess)}
                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50/80 rounded transition-colors flex-shrink-0 cursor-pointer"
                                    title="Delete chat"
                                    aria-label="Delete chat"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* My Topics: persistent AI memory of what the user wants to master */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between pl-1 pr-0.5 mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-display flex items-center gap-1.5">
                  <Target className="w-3 h-3" />
                  My Topics
                </span>
                <NavLink
                  to="/topics"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className={({ isActive }) =>
                    `p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isActive
                        ? 'text-slate-900 bg-slate-100'
                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                    }`
                  }
                  title="Manage topics"
                  aria-label="Manage topics"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </NavLink>
              </div>

              {goalsLoading ? (
                <div className="pl-1 pr-2 py-1.5 flex items-center gap-2">
                  <div className="h-2.5 w-full max-w-[140px] rounded-full bg-slate-100 animate-pulse" />
                </div>
              ) : displayGoals.length === 0 ? (
                <NavLink
                  to="/topics"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="mx-0.5 flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>Add a topic to master</span>
                </NavLink>
              ) : (
                <div className="space-y-0.5">
                  {displayGoals.map((goal) => {
                    const isTopicsActive = location.pathname === '/topics';
                    return (
                      <NavLink
                        key={goal.goalId}
                        to="/topics"
                        onClick={() => setIsMobileDrawerOpen(false)}
                        title={`${goal.title} — ${goal.masteryPct}% mastered`}
                        className={`block px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                          isTopicsActive
                            ? 'bg-slate-50 text-slate-900'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate min-w-0">{goal.title}</span>
                          <span className="text-[10px] font-mono font-semibold text-slate-400 shrink-0">
                            {goal.masteryPct}%
                          </span>
                        </div>
                        {/* Mini mastery progress bar */}
                        <div className="mt-1.5 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-slate-800 transition-all duration-500"
                            style={{ width: `${Math.max(2, Math.min(100, goal.masteryPct))}%` }}
                          />
                        </div>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* User Card & Rating */}
          <div className="pt-4 border-t border-slate-200 mt-auto">
            <div className="p-3.5 rounded-xl mb-3 border border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-500">Skill Rating</span>
                <div className={getSecondaryBadgeClass()}>
                  <Award className="w-3 h-3 text-slate-600" />
                  <span className="font-mono">{profile?.skill_rating || 1200}</span>
                </div>
              </div>
              <p className="text-xs font-bold text-slate-800 truncate font-display">
                {profile?.full_name || user?.email?.split('@')[0]}
              </p>
              <p className="text-[11px] text-slate-400 truncate font-mono">{user?.email}</p>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-red-600 hover:text-red-700 bg-white hover:bg-red-50/70 border border-red-200/80 hover:border-red-300 rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area - Pure White Background */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white relative">
        {/* Floating Mobile Navigation Corner Buttons (< 768px) */}
        {!/^\/quizzes\/[^/]+$/.test(location.pathname) && (
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={isMobileDrawerOpen}
            className={getFloatingMenuButtonClass()}
          >
            <Menu className="w-5 h-5 text-slate-800" />
          </button>
        )}

        {/* Floating Mobile New Chat Button - Fixed on /instructor */}
        {location.pathname === '/instructor' && (
          <button
            type="button"
            onClick={handleStartNewChat}
            aria-label="Start new chat"
            className={getFloatingNewChatButtonClass()}
          >
            <SquarePen className="w-5 h-5 text-slate-800" />
          </button>
        )}

        <div className="relative z-10 flex-1 flex flex-col h-full min-h-0 bg-white overflow-hidden">
          <Outlet />
        </div>
      </main>

      {/* Delete Chat Confirmation Modal via Portal */}
      {sessionToDelete &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in cursor-pointer"
            onClick={(e) => handleModalBackdropClick(e, () => setSessionToDelete(null), deletingSession)}
          >
            <div
              className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-display text-slate-900">Delete Chat?</h3>
                  <p className="text-xs text-slate-500">This conversation will be permanently removed.</p>
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                Are you sure you want to delete <strong className="text-slate-900 font-semibold">&ldquo;{sessionToDelete.title || 'Untitled Chat'}&rdquo;</strong>? All messages and study history in this session will be removed.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSessionToDelete(null)}
                  disabled={deletingSession}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteSession}
                  disabled={deletingSession}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {deletingSession ? 'Deleting...' : 'Delete Chat'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
