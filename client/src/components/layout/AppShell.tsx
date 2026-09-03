import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Bot, CheckSquare, BarChart3, LogOut, Award, Sparkles } from 'lucide-react';

export const AppShell: React.FC = () => {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();

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
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      {/* Fixed Glassmorphism Sidebar */}
      <aside className="w-64 flex-shrink-0 glass-panel border-r border-slate-200/80 flex flex-col justify-between p-4 z-20">
        <div>
          {/* Brand Logo */}
          <div className="flex items-center gap-3 px-3 py-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Pragati</h1>
              <p className="text-xs font-semibold text-sky-600 tracking-wider uppercase">AI Learning System</p>
            </div>
          </div>

          {/* Navigation Links - 3 Items */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-sky-50 text-sky-700 border border-sky-200/70 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* User Card & Rating */}
        <div className="pt-4 border-t border-slate-200/70">
          <div className="glass-card p-3 rounded-xl mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-500">Skill Rating</span>
              <div className="flex items-center gap-1 text-violet-700 font-mono font-bold text-xs bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200/60">
                <Award className="w-3 h-3" />
                <span>{profile?.skill_rating || 1200}</span>
              </div>
            </div>
            <p className="text-xs font-bold text-slate-900 truncate">
              {profile?.full_name || user?.email?.split('@')[0]}
            </p>
            <p className="text-[11px] text-slate-500 truncate font-mono">{user?.email}</p>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50/80 rounded-lg transition-colors border border-transparent hover:border-red-200/50"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto subtle-scroll bg-gradient-to-br from-slate-50 via-white to-sky-50/30">
        <Outlet />
      </main>
    </div>
  );
};
