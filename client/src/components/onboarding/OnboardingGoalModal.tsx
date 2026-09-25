import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Target, Loader2, Sparkles, X, Plus, Check, RefreshCw, AlertCircle, ArrowRight } from 'lucide-react';
import { handleModalBackdropClick } from '../../utils/theme';
import {
  generateSubtopics,
  createGoal,
  completeOnboarding,
  type SubtopicPlan,
} from '../../api/goals';

interface OnboardingGoalModalProps {
  open: boolean;
  /** Called after the user submits (or skips); the parent closes the modal. */
  onClose: (submitted: boolean) => void;
  /** Called with the session goals the user just created (read-only demo). */
  onGoalsCreated?: (goals: Array<{ id: string; title: string; masteryPct: number }>) => void;
  /** 'onboarding' = first-login popup; 'manual' = Topics page add-topic. */
  source?: 'onboarding' | 'manual';
}

/**
 * First-login popup: Step 1 asks what the user wants to master, Step 2 lets
 * them review the AI-generated subtopic plan (remove chips, add their own,
 * regenerate) before saving. Every async path has loading / disabled / error
 * states; an LLM failure degrades to manual subtopic entry.
 */
export const OnboardingGoalModal: React.FC<OnboardingGoalModalProps> = ({
  open,
  onClose,
  onGoalsCreated,
  source = 'onboarding',
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [topic, setTopic] = useState('');
  const [plan, setPlan] = useState<SubtopicPlan | null>(null);
  const [customSubtopics, setCustomSubtopics] = useState<string[]>([]);
  const [newSubtopic, setNewSubtopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topicInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setTopic('');
      setPlan(null);
      setCustomSubtopics([]);
      setNewSubtopic('');
      setGenerating(false);
      setSaving(false);
      setError(null);
      setTimeout(() => topicInputRef.current?.focus(), 100);
    }
  }, [open]);

  // Escape closes (only when not mid-flight)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !generating && !saving) onClose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, generating, saving, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const handleGeneratePlan = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanTopic = topic.trim().slice(0, 80);
    if (!cleanTopic || generating) return;

    setGenerating(true);
    setError(null);
    try {
      const result = await generateSubtopics(cleanTopic);
      setPlan(result);
      setCustomSubtopics([]);
      setStep(2);
    } catch (err: any) {
      // LLM failed: still continue to step 2 with a manual plan so the
      // onboarding never dead-ends.
      setPlan({ topic: cleanTopic, subtopics: [] });
      setStep(2);
      setError(
        err?.message
          ? `AI subtopic generation failed (${err.message}). You can add subtopics manually below.`
          : 'AI subtopic generation failed. You can add subtopics manually below.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateSubtopics(plan?.topic || topic.trim());
      setPlan(result);
      setCustomSubtopics([]);
    } catch (err: any) {
      setError('Could not regenerate the plan. You can edit the subtopics manually.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddCustomSubtopic = () => {
    const name = newSubtopic.trim().slice(0, 60);
    if (!name) return;
    const exists = [...(plan?.subtopics.map((s) => s.name) || []), ...customSubtopics].some(
      (n) => n.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      setError('That subtopic is already in the plan.');
      return;
    }
    if ((plan?.subtopics.length || 0) + customSubtopics.length >= 6) {
      setError('A goal can have at most 6 subtopics.');
      return;
    }
    setError(null);
    setCustomSubtopics((prev) => [...prev, name]);
    setNewSubtopic('');
  };

  const handleSave = async () => {
    if (saving) return;
    const cleanTopic = (plan?.topic || topic.trim()).slice(0, 80);
    if (!cleanTopic) return;

    const finalSubtopics = [...(plan?.subtopics.map((s) => s.name) || []), ...customSubtopics];

    setSaving(true);
    setError(null);
    try {
      const goals = await createGoal({
        title: cleanTopic,
        subtopics: finalSubtopics,
        source,
      });
      // Best-effort flag stamp; the read-only demo is policy-blocked (expected).
      try {
        await completeOnboarding();
      } catch {
        // expected for the read-only demo account
      }
      onGoalsCreated?.(goals.map((g) => ({ id: g.goalId, title: g.title, masteryPct: g.masteryPct })));
      onClose(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to save your goal. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const aiSubtopics = plan?.subtopics.map((s) => s.name) || [];
  const allSubtopics = [...aiSubtopics, ...customSubtopics];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300 cursor-pointer"
      onClick={(e) => handleModalBackdropClick(e, () => !generating && !saving && onClose(false))}
      role="dialog"
      aria-modal="true"
      aria-label="Set your mastery goal"
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto subtle-scroll cursor-default animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 sm:p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-display font-extrabold text-slate-900 tracking-tight">
                {step === 1 ? 'What do you want to master?' : 'Your learning plan'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {step === 1
                  ? 'Pragati will remember your goal and track your mastery over time.'
                  : 'Review the AI-generated subtopics. Remove, add, or regenerate.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !generating && !saving && onClose(false)}
            disabled={generating || saving}
            aria-label="Close"
            className="p-2 -m-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1: topic input */}
        {step === 1 && (
          <form onSubmit={handleGeneratePlan} className="px-5 sm:px-6 pb-6 space-y-4">
            <input
              ref={topicInputRef}
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={80}
              placeholder="e.g. Calculus, Organic Chemistry, World History..."
              className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
            />
            <button
              type="submit"
              disabled={!topic.trim() || generating}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] cursor-pointer"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Designing your learning plan...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Create my learning plan</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onClose(false)}
              className="w-full text-center text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              Maybe later — I'll set a goal from the Topics page
            </button>
          </form>
        )}

        {/* Step 2: subtopic review */}
        {step === 2 && (
          <div className="px-5 sm:px-6 pb-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-800">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-display">Goal</p>
              <p className="text-sm font-display font-bold text-slate-900 mt-0.5">{plan?.topic || topic}</p>
            </div>

            {allSubtopics.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {aiSubtopics.map((name, idx) => (
                  <button
                    key={`${name}-${idx}`}
                    type="button"
                    disabled={generating || saving}
                    onClick={() => setPlan((p) => (p ? { ...p, subtopics: p.subtopics.filter((_, i) => i !== idx) } : p))}
                    title="Remove subtopic"
                    className="group inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 hover:border-rose-300 hover:bg-rose-50/50 hover:text-rose-700 rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <span>{name}</span>
                    <X className="w-3 h-3 text-slate-300 group-hover:text-rose-500 transition-colors" />
                  </button>
                ))}
                {customSubtopics.map((name, idx) => (
                  <button
                    key={`custom-${name}-${idx}`}
                    type="button"
                    disabled={generating || saving}
                    onClick={() => setCustomSubtopics((prev) => prev.filter((_, i) => i !== idx))}
                    title="Remove subtopic"
                    className="group inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white border border-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <span>{name}</span>
                    <X className="w-3 h-3 text-slate-400 group-hover:text-white transition-colors" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 px-1">
                No subtopics yet — add at least one below so Pragati can track your mastery.
              </p>
            )}

            {/* Add subtopic */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newSubtopic}
                onChange={(e) => setNewSubtopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomSubtopic();
                  }
                }}
                maxLength={60}
                placeholder="Add your own subtopic..."
                className="flex-1 px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
              />
              <button
                type="button"
                onClick={handleAddCustomSubtopic}
                disabled={!newSubtopic.trim() || generating || saving}
                aria-label="Add subtopic"
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={generating || saving}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                <span>Regenerate</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={generating || saving || allSubtopics.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Start learning</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
