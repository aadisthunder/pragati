import { Bot, Target, CheckSquare, BarChart3, CircleHelp, type LucideIcon } from 'lucide-react';

export interface SidebarNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Sidebar link that opens the feature tour instead of navigating. */
export const HELP_TOUR_PATH = '/help/tour';

/**
 * Main sidebar navigation order: AI Instructor, then My Topics (promoted from
 * the bottom of the sidebar to a normal nav link), then Quizzes, Analytics and
 * a Help link at the bottom that replays the first-login feature tour slides.
 */
export function buildSidebarNavItems(): SidebarNavItem[] {
  return [
    { to: '/instructor', label: 'AI Instructor', icon: Bot },
    { to: '/topics', label: 'My Topics', icon: Target },
    { to: '/quizzes', label: 'Quizzes', icon: CheckSquare },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: HELP_TOUR_PATH, label: 'Help', icon: CircleHelp },
  ];
}
