/**
 * Minimalist Design System Tokens and Utilities
 * Strict Monochrome Minimalist: White & Slate
 */

export const THEME_COLORS = {
  primary: 'slate',
  secondary: 'slate',
  background: '#FFFFFF',
};

/**
 * Sidebar Navigation Link styling with clean grey border and darker charcoal outline for active state
 */
export function getSidebarNavItemClass(isActive: boolean): string {
  if (isActive) {
    return 'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-colors duration-150 border border-slate-700 bg-white text-slate-900 font-semibold shadow-xs';
  }
  return 'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-colors duration-150 border border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50 font-medium';
}

/**
 * Neutral Badge styling with clean slate pill styling
 */
export function getSecondaryBadgeClass(): string {
  return 'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider font-display px-2.5 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700';
}

/**
 * Primary CTA Button styling with sleek charcoal slate-900
 */
export function getPrimaryButtonClass(): string {
  return 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-xs';
}
