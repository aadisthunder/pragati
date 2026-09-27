import React from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Loader2 } from 'lucide-react';
import { handleModalBackdropClick, createModalEscapeHandler } from '../../utils/theme';

interface ConfirmDialogProps {
  open: boolean;
  /** Heading, e.g. "Delete Chat?" or "Remove topic?". */
  title: string;
  /** One-line subheading under the title. */
  subtitle?: string;
  /** Body copy; may include the item name. */
  message: React.ReactNode;
  /** Destructive CTA label, e.g. "Delete Chat". */
  confirmLabel: string;
  /** Shown on the CTA while the request is in flight. */
  confirmingLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reusable destructive-action confirmation modal (rose-themed), shared by the
 * sidebar "Delete Chat?" flow, the My Topics "Remove topic" flow, and any
 * future destructive action. Portal-rendered to document.body; backdrop click
 * and Escape dismiss (both ignored while busy).
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  subtitle,
  message,
  confirmLabel,
  confirmingLabel,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  // Escape closes (only when not mid-flight)
  React.useEffect(() => {
    if (!open) return;
    const onKey = createModalEscapeHandler(onCancel, busy);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in cursor-pointer"
      onClick={(e) => handleModalBackdropClick(e, onCancel, busy)}
      role="dialog"
      aria-modal="true"
      aria-label={title}
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
            <h3 className="text-base font-bold font-display text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">{message}</p>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{confirmingLabel || confirmLabel}</span>
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
