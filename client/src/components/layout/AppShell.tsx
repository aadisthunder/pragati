import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Bot, CheckSquare, BarChart3, LogOut, Award, Plus, MessageSquare, Trash2 } from 'lucide-react';
import { getSidebarNavItemClass, getSecondaryBadgeClass } from '../../utils/theme';
import { apiRequest, apiRequestCached, invalidateCache, getFromCache } from '../../api/client';

export const AppShell: React.FC = () => {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentSessionId = searchParams.get('session');

  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);

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
    const handleUpdated = () => fetchSessions();
    window.addEventListener('chat_sessions_updated', handleUpdated);
    return () => window.removeEventListener('chat_sessions_updated', handleUpdated);
  }, [fetchSessions, location.pathname, location.search]);

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

  const handleStartNewChat = async () => {
    try {
      const data = await apiRequest<{ session: { id: string } }>('/api/instructor/sessions', {
        method: 'POST',
      });
      invalidateCache('/api/instructor');
      navigate(`/instructor?session=${data.session.id}`);
      fetchSessions();
    } catch {
      navigate('/instructor?session=new');
    }
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

  const navItems = [
    { to: '/instructor', label: 'AI Instructor', icon: Bot },
    { to: '/quizzes', label: 'Quizzes', icon: CheckSquare },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="flex h-screen bg-white text-slate-900 overflow-hidden font-sans">
      {/* Fixed Minimal Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between p-4 z-20">
        <div>
          {/* Brand Logo */}
          <div className="flex items-center gap-3 px-3 py-4 mb-6">
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

          {/* Navigation Links - 3 Items */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isInstructor = item.to === '/instructor';
              return (
                <div key={item.to} className="space-y-1">
                  <NavLink
                    to={item.to}
                    className={({ isActive }) => getSidebarNavItemClass(isActive)}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>

                  {/* Sublinks under AI Instructor: New Chat & History */}
                  {isInstructor && (
                    <div className="pl-2 pr-1 pt-1.5 pb-0.5 space-y-1.5">
                      <button
                        onClick={handleStartNewChat}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-xs active:scale-[0.98]"
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
                                onClick={() => navigate(`/instructor?session=${sess.id}`)}
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

        {/* User Card & Rating */}
        <div className="pt-4 border-t border-slate-200">
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
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-red-600 hover:text-red-700 bg-white hover:bg-red-50/70 border border-red-200/80 hover:border-red-300 rounded-xl transition-colors shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area - Pure White Background */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white relative">
        <div className="relative z-10 flex-1 flex flex-col h-full min-h-0 bg-white overflow-hidden">
          <Outlet />
        </div>
      </main>

      {/* Delete Chat Confirmation Modal via Portal */}
      {sessionToDelete &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95">
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
