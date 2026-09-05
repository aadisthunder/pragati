/**
 * Markdown Card Components and Styling Tokens
 * Used to transform dense AI instructor markdown output into clean,
 * outline-bordered cards with generous vertical whitespace.
 */

export const markdownCardStyles = {
  list: 'space-y-2.5 my-3 list-none pl-0',
  cardItem:
    'rounded-xl border border-slate-200 bg-slate-50/60 p-3 my-1.5 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition-all text-slate-800 text-xs sm:text-sm block',
  heading3:
    'font-display font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-100 text-sm sm:text-base',
  blockquote:
    'bg-slate-50 border-l-4 border-slate-900 rounded-r-xl p-3 my-2 text-slate-700 text-xs sm:text-sm',
  paragraph: 'my-2 leading-relaxed text-slate-800',
};

export const interruptButtonStyles = {
  container:
    'w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full border-2 border-slate-900 bg-white hover:bg-rose-50 hover:border-rose-600 transition-all shadow-xs active:scale-95 cursor-pointer group',
  square:
    'w-3.5 h-3.5 bg-rose-600 rounded-[4px] group-hover:scale-110 transition-transform',
};
