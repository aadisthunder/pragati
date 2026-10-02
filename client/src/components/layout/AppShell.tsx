import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, Plus, MessageSquare, Trash2, Menu, X, SquarePen } from 'lucide-react';
import {
  getSidebarNavItemClass,
  getMobileDrawerClass,
  getMobileBackdropClass,
  getFloatingMenuButtonClass,
  getFloatingNewChatButtonClass,
} from '../../utils/theme';
import { apiRequest, apiRequestCached, invalidateCache, getFromCache } from '../../api/client';
import { OnboardingGoalModal } from '../onboarding/OnboardingGoalModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  requestConfirmation,
  dismissConfirmation,
  beginConfirmation,
  type PendingConfirmation,
} from '../../utils/confirmAction';
import { buildSidebarNavItems, filterVisibleChatSessions, HELP_TOUR_PATH } from './sidebarNav';
import { FeatureTourModal } from '../tour/FeatureTourModal';
import { nextPopupAfterTour, POPUP_GOAL_MODAL } from '../tour/onboardingFlow';
import {
  refreshGoals,
  saveDemoGoalsSession,
} from '../../api/goals';

const GithubIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

export const AppShell: React.FC = () => {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentSessionId = searchParams.get('session');

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<PendingConfirmation | null>(null);
  const [sessionTitles, setSessionTitles] = useState<Record<string, string>>({});

  // Learning goals for the read-only demo's chat goal-memory + onboarding popups
  const [showTour, setShowTour] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Help-link replay must not chain into the goal-setting popup.
  const tourOpenedViaHelpRef = useRef(false);

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

  // First-login popup sequence: feature tour FIRST, then the goal modal.
  // The demo accounts can never persist the onboarding flag, so this sequence
  // fires on every fresh load for them — intentional (judge experience). The
  // once-per-mount guard prevents a profile refresh from re-opening popups
  // right after the user closes them.
  const onboardingAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (!onboardingAutoOpenedRef.current && profile && profile.onboarding_completed === false) {
      onboardingAutoOpenedRef.current = true;
      setShowTour(true);
    }
  }, [profile]);

  const handleTourClose = useCallback(() => {
    setShowTour(false);
    // Tour finished/skipped: open the goal-setting popup next, but only for the
    // first-login sequence — replaying from the Help link skips it.
    if (
      !tourOpenedViaHelpRef.current &&
      nextPopupAfterTour() === POPUP_GOAL_MODAL
    ) {
      setShowOnboarding(true);
    }
    tourOpenedViaHelpRef.current = false;
  }, []);

  // Help sidebar link: pops the same slides shown on first login.
  const handleHelpClick = useCallback(() => {
    setIsMobileDrawerOpen(false);
    tourOpenedViaHelpRef.current = true;
    setShowTour(true);
  }, []);

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

  // Close the mobile drawer on Escape; the Delete Chat modal handles its own Escape.
  useEffect(() => {
    if (!isMobileDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileDrawerOpen]);

  const handleStartNewChat = () => {
    navigate('/instructor?session=new');
  };

  const handleRequestDeleteSession = (e: React.MouseEvent, sess: { id: string; title: string }) => {
    e.stopPropagation();
    // Reuse the shared ConfirmDialog: it owns busy/Escape/backdrop guards.
    setSessionTitles((prev) => ({ ...prev, [sess.id]: sess.title }));
    setSessionToDelete((cur) => requestConfirmation(cur, sess.id));
  };

  const handleConfirmDeleteSession = async () => {
    const pending = sessionToDelete;
    const armed = beginConfirmation(pending);
    if (!pending || !armed) return;
    setSessionToDelete(armed);
    const targetSessionId = pending.id;

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
      setSessionToDelete(dismissConfirmation(armed));
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleOnboardingClose = async (submitted: boolean) => {
    setShowOnboarding(false);
    if (submitted) {
      // Pull the fresh goals so the demo session goal-memory stays in sync.
      refreshGoals().catch(() => {});
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

  const navItems = buildSidebarNavItems();

  return (
    <div className="flex h-screen bg-white text-slate-900 overflow-hidden font-sans">
      {/* First-login popup sequence: feature tour, then the goal modal (also
          fires every load for the demo accounts) */}
      <FeatureTourModal open={showTour} onClose={handleTourClose} />
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
                const isHelpTour = item.to === HELP_TOUR_PATH;
                const isLinkActive = isHelpTour ? showTour : undefined;
                return (
                  <div key={item.to} className="space-y-1">
                    {isHelpTour ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleHelpClick}
                          className={`${getSidebarNavItemClass(false)} flex-1 justify-center`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{item.label}</span>
                        </button>
                        <a
                          href="https://github.com/aadisthunder/pragati"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="GitHub Repository"
                          title="View Pragati on GitHub"
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors duration-150 border border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50 font-medium cursor-pointer shadow-xs"
                        >
                          <GithubIcon className="w-4 h-4 shrink-0" />
                          <span>GitHub</span>
                        </a>
                      </div>
                    ) : (
                    <NavLink
                      to={item.to}
                      onClick={() => setIsMobileDrawerOpen(false)}
                      className={({ isActive }) =>
                        typeof isLinkActive === 'boolean'
                          ? getSidebarNavItemClass(isLinkActive)
                          : getSidebarNavItemClass(isActive)
                      }
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </NavLink>
                    )}

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
                            {filterVisibleChatSessions(sessions).map((sess) => {
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
          </div>

          {/* Compact User Card & Integrated Sign Out */}
          <div className="pt-3 border-t border-slate-200 mt-auto">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate font-display">
                  {profile?.full_name || user?.email?.split('@')[0]}
                </p>
                <p className="text-[11px] text-slate-500 truncate font-mono mt-0.5">{user?.email}</p>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-white hover:bg-rose-50/70 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors shadow-2xs cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
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

      {/* Delete Chat confirmation — shared ConfirmDialog (same modal as topic delete) */}
      <ConfirmDialog
        open={sessionToDelete !== null}
        title="Delete Chat?"
        subtitle="This conversation will be permanently removed."
        message={
          <>
            Are you sure you want to delete{' '}
            <strong className="text-slate-900 font-semibold">
              &ldquo;{(sessionToDelete && sessionTitles[sessionToDelete.id]) || 'Untitled Chat'}&rdquo;
            </strong>
            ? All messages and study history in this session will be removed.
          </>
        }
        confirmLabel="Delete Chat"
        confirmingLabel="Deleting..."
        busy={sessionToDelete?.busy ?? false}
        onConfirm={handleConfirmDeleteSession}
        onCancel={() => setSessionToDelete((cur) => dismissConfirmation(cur))}
      />
    </div>
  );
};
