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

/**
 * Sticky Mobile Header styling for screens below 768px
 */
export function getMobileHeaderClass(): string {
  return 'md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-white/95 backdrop-blur-md border-b border-slate-200';
}

/**
 * Slide-out Navigation Drawer styling for mobile, static sidebar on desktop
 */
export function getMobileDrawerClass(isOpen: boolean): string {
  const base =
    'fixed inset-y-0 left-0 z-50 w-72 sm:w-80 bg-white border-r border-slate-200 flex flex-col justify-between p-4 shadow-2xl transition-transform duration-300 ease-in-out md:static md:w-64 md:translate-x-0 md:shadow-none';
  return `${base} ${isOpen ? 'translate-x-0' : '-translate-x-full'}`;
}

/**
 * Mobile Backdrop Overlay styling
 */
export function getMobileBackdropClass(isOpen: boolean): string {
  const base =
    'fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 md:hidden transition-opacity duration-300 ease-in-out';
  return `${base} ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;
}

/**
 * Touch-friendly Mobile Hamburger Button styling
 */
export function getMobileHamburgerBtnClass(): string {
  return 'p-2 text-slate-800 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-slate-200 shadow-xs active:scale-[0.96]';
}

/**
 * Responsive Page Container layout with mobile gutters and max width constraint
 * Constrained with max-w-full, min-w-0, and overflow-x-hidden to prevent mobile horizontal swiping
 */
export function getResponsivePageContainerClass(): string {
  return 'max-w-5xl mx-auto w-full max-w-full overflow-x-hidden min-w-0 pt-2 px-3 pb-6 sm:px-5 sm:py-4 md:px-6 md:py-5 space-y-4 sm:space-y-5 font-sans';
}

/**
 * Format color-coded upgrade/downgrade delta badges for ratings and accuracy
 * Returns null if delta is null, undefined, or 0
 */
export function formatDeltaBadge(
  delta: number | null | undefined,
  isPercent = false
): { text: string; isPositive: boolean; colorClass: string } | null {
  if (delta === null || delta === undefined || delta === 0) {
    return null;
  }

  const isPositive = delta > 0;
  const sign = isPositive ? '+' : '';
  const suffix = isPercent ? '%' : '';
  const text = `(${sign}${delta}${suffix})`;

  const colorClass = isPositive
    ? 'text-emerald-600'
    : 'text-rose-600';

  return { text, isPositive, colorClass };
}

/**
 * Metric Card Stat & Delta typography class ensuring identical font, font-weight,
 * and responsive scaling across mobile and desktop viewports.
 * Max values (e.g. 100.0% (+100.0%) or 3200 (+150)) fit comfortably on a single line.
 */
export function getMetricStatTypographyClass(): string {
  return 'text-sm sm:text-lg lg:text-2xl font-extrabold font-mono tracking-tight shrink-0';
}

/**
 * Metric Card Stat Row container ensuring stat and delta fit on a single line
 * without wrapping on both mobile and web.
 */
export function getMetricStatRowClass(): string {
  return 'flex items-baseline gap-1 sm:gap-2 mt-3 flex-nowrap whitespace-nowrap overflow-hidden';
}

/**
 * Permanent drop shadow styling for cards and dialog boxes with subtle micro-lift on hover
 */
export function getPermanentCardClass(): string {
  return 'bg-white border border-slate-200 rounded-xl sm:rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200';
}


/**
 * Submit Quiz Answered Card styling - neutral monochrome slate without misleading green
 */
export function getSubmitModalAnsweredCardClass(): string {
  return 'p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center text-slate-800';
}

/**
 * Submit Quiz Subtitle text indicating evaluation occurs upon submission
 */
export const SUBMIT_MODAL_SUBTITLE = 'Answers are graded after submission.';

/**
 * Universal Modal Backdrop Click Dismissal
 * Dismisses when clicking the backdrop overlay directly, but ignores clicks inside modal content or while busy.
 */
export function handleModalBackdropClick(
  event: { target: any; currentTarget: any },
  onClose: () => void,
  isBusy?: boolean
): void {
  if (isBusy) return;
  if (event.target === event.currentTarget) {
    onClose();
  }
}

/**
 * Universal Modal Escape Key Handler
 * Listens for Escape key press to dismiss modal unless busy.
 */
export function createModalEscapeHandler(
  onClose: () => void,
  isBusy?: boolean
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !isBusy) {
      onClose();
    }
  };
}

/**
 * Calculate dynamic height and overflow behavior for expanding chat textarea
 */
export function calculateTextareaHeight(
  scrollHeight: number,
  lineHeight: number,
  minLines: number,
  maxLines: number
): { height: number; overflowY: 'hidden' | 'auto' } {
  const minHeight = minLines * lineHeight;
  const maxHeight = maxLines * lineHeight;
  const clampedHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
  const overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  return { height: clampedHeight, overflowY };
}

/**
 * Determine if keyboard Enter should submit the chat message
 * On desktop: Enter submits, Shift+Enter creates a new line.
 * On mobile touch screens: Send button submits, Enter allows typing multi-line text.
 */
export function shouldSubmitOnEnter(
  e: { key: string; shiftKey: boolean },
  isMobile: boolean
): boolean {
  if (isMobile) return false;
  return e.key === 'Enter' && !e.shiftKey;
}

/**
 * Clean borderless attachment upload icon button styling
 */
export function getUploadButtonClass(): string {
  return 'w-10 h-10 flex-shrink-0 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
}

/**
 * Chat message body typography. 15px on mobile so answers stay comfortably
 * readable without zooming; slightly roomier leading for small screens.
 */
export function getChatMessageTextClass(): string {
  return 'text-[15px] sm:text-[15.5px] leading-relaxed';
}

/**
 * Composer textarea typography — 16px floor on mobile prevents iOS Safari
 * from zooming the viewport when the input gains focus; 15px on desktop.
 */
export function getComposerTextareaClass(): string {
  return 'flex-1 px-2 sm:px-3 py-1.5 bg-white text-[16px] sm:text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none resize-none transition disabled:bg-transparent disabled:text-slate-500 leading-normal max-h-32 sm:max-h-48 subtle-scroll';
}

/**
 * Suggestion chips container styling without visible scrollbar while preserving swipe
 */
export function getSuggestionChipsContainerClass(): string {
  return 'pointer-events-auto flex flex-wrap items-center gap-1.5 sm:gap-2 py-1 px-1 justify-center w-full max-w-3xl mx-auto';
}

/**
 * Suggestion chips container styling for empty / hero state
 * Enforces a single centered line on desktop, while smoothly scrolling without visible scrollbar on mobile
 */
export function getHeroSuggestionChipsContainerClass(): string {
  return 'pointer-events-auto flex flex-wrap items-center gap-1.5 sm:gap-2 py-1 px-2 w-full max-w-3xl mx-auto justify-center';
}

/**
 * Floating hamburger menu button with outline on mobile
 */
export function getFloatingMenuButtonClass(): string {
  return 'fixed top-3 left-3 z-30 md:hidden p-2 text-slate-800 hover:text-slate-900 bg-white border border-slate-200 shadow-xs rounded-xl active:scale-95 transition-all cursor-pointer flex items-center justify-center';
}

/**
 * Floating outline-free New Chat button on mobile
 */
export function getFloatingNewChatButtonClass(): string {
  return 'fixed top-3 right-3 z-30 md:hidden p-2 text-slate-800 hover:text-slate-900 active:scale-95 transition-all cursor-pointer flex items-center justify-center';
}

