import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Bot, CheckSquare, BarChart3, LogOut, Award } from 'lucide-react';

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
    <div className="flex h-screen bg-[#FAF8FD] text-slate-900 overflow-hidden font-sans">
      {/* Fixed Frosted Glassmorphism Sidebar with Cognitive Prism Theme */}
      <aside className="w-64 flex-shrink-0 glass-panel border-r border-slate-200/85 flex flex-col justify-between p-4 z-20">
        <div>
          {/* Brand Logo - Cognitive Prism Icon */}
          <div className="flex items-center gap-3 px-3 py-4 mb-6">
            <img
              src="/logo.png"
              alt="Pragati Logo"
              className="w-11 h-11 rounded-2xl object-cover shadow-md shadow-purple-500/20 border border-purple-200/60"
            />
            <div>
              <h1 className="text-xl font-display font-extrabold tracking-tight text-[#2E1D5E]">Pragati</h1>
              <p className="text-[10px] font-bold text-[#7A22E8] tracking-wider uppercase font-display">AI Learning System</p>
            </div>
          </div>

          {/* Navigation Links - 3 Items */}
          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                      isActive
                        ? 'bg-[#F3ECFF] text-[#7A22E8] border border-[#D8B4FE] shadow-sm font-bold'
                        : 'text-slate-600 hover:text-[#2E1D5E] hover:bg-white/80 font-medium'
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
          <div className="glass-card p-3.5 rounded-2xl mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-500">Skill Rating</span>
              <div className="flex items-center gap-1 text-[#7A22E8] font-mono font-bold text-xs bg-[#F3ECFF] px-2.5 py-0.5 rounded-full border border-[#D8B4FE]">
                <Award className="w-3 h-3" />
                <span>{profile?.skill_rating || 1200}</span>
              </div>
            </div>
            <p className="text-xs font-bold text-[#2E1D5E] truncate font-display">
              {profile?.full_name || user?.email?.split('@')[0]}
            </p>
            <p className="text-[11px] text-slate-500 truncate font-mono">{user?.email}</p>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-bold text-red-600 bg-red-50/50 hover:bg-red-100/70 border border-red-200 hover:border-red-300 rounded-xl transition-all shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto subtle-scroll bg-[#FAF8FD]">
        <Outlet />
      </main>
    </div>
  );
};
