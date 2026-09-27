import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Target,
  Plus,
  Loader2,
  X,
  Sparkles,
  Trash2,
  AlertCircle,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import {
  fetchGoals,
  refreshGoals,
  deleteGoal,
  addSubtopic,
  removeSubtopic,
  generateSubtopics,
  GOALS_UPDATED_EVENT,
  type GoalWithMastery,
} from '../api/goals';
import { OnboardingGoalModal } from '../components/onboarding/OnboardingGoalModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { notifyGoalDeleted } from '../utils/deleteRefresh';
import {
  requestConfirmation,
  dismissConfirmation,
  beginConfirmation,
  type PendingConfirmation,
} from '../utils/confirmAction';
import { getResponsivePageContainerClass, getPermanentCardClass } from '../utils/theme';
import { buildTestMePrompt } from '../utils/quizDifficulty';

const MAX_SUBTOPICS = 6;

/**
 * Topics page: manage the user's mastery goals. Each goal card shows a
 * mastery progress bar (derived live from quiz evidence), per-subtopic chips
 * with individual percentages, and add/remove controls. Add-topic reuses the
 * onboarding modal so the AI subtopic plan flow is identical everywhere.
 */
export const TopicsPage: React.FC = () => {
  const [goals, setGoals] = useState<GoalWithMastery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyGoalId, setBusyGoalId] = useState<string | null>(null);
  const [generatingGoalId, setGeneratingGoalId] = useState<string | null>(null);
  const [goalToDelete, setGoalToDelete] = useState<PendingConfirmation | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [subtopicDrafts, setSubtopicDrafts] = useState<Record<string, string>>({});
  const draftsRef = useRef(subtopicDrafts);
  draftsRef.current = subtopicDrafts;

  const navigate = useNavigate();

  const load = useCallback(async (force = false) => {
    setError(null);
    try {
      const data = force ? await refreshGoals() : await fetchGoals();
      setGoals(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load your topics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onGoalsUpdated = () => load(true);
    window.addEventListener(GOALS_UPDATED_EVENT, onGoalsUpdated);
    return () => window.removeEventListener(GOALS_UPDATED_EVENT, onGoalsUpdated);
  }, [load]);

  // Trash icon opens the shared ConfirmDialog (same modal as Delete Chat)
  // instead of the old two-click pattern.
  const handleRequestRemoveGoal = (goal: GoalWithMastery) => {
    setGoalToDelete((cur) => requestConfirmation(cur, goal.goalId));
  };

  const goalToDeleteTitle =
    (goals.find((g) => g.goalId === goalToDelete?.id) || null)?.title ?? null;

  const handleConfirmRemoveGoal = async () => {
    const pending = goalToDelete;
    const goalId = pending?.id;
    const armed = beginConfirmation(pending);
    if (!goalId || !armed) return;
    setGoalToDelete(armed);
    setBusyGoalId(goalId);
    try {
      await deleteGoal(goalId);
      // Server cascade erased the goal, its subtopics, and every quiz linked
      // to it (quizzes.goal_linkage). Drop every goal-derived client cache so
      // the Quizzes Arena stops showing the deleted topic immediately.
      notifyGoalDeleted();
      const data = await refreshGoals();
      setGoals(data);
      setGoalToDelete(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to remove the topic.');
      setGoalToDelete(dismissConfirmation(armed));
    } finally {
      setBusyGoalId(null);
    }
  };

  const handleAddSubtopic = async (goal: GoalWithMastery) => {
    const name = (draftsRef.current[goal.goalId] || '').trim().slice(0, 60);
    if (!name || busyGoalId) return;
    const duplicate = goal.subtopics.some((s) => s.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      setError('That subtopic already exists on this goal.');
      return;
    }
    setError(null);
    setBusyGoalId(goal.goalId);
    try {
      await addSubtopic(goal.goalId, name);
      setSubtopicDrafts((prev) => ({ ...prev, [goal.goalId]: '' }));
      const data = await refreshGoals();
      setGoals(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to add the subtopic.');
    } finally {
      setBusyGoalId(null);
    }
  };

  const handleRemoveSubtopic = async (goalId: string, subtopicId: string) => {
    if (busyGoalId) return;
    setBusyGoalId(goalId);
    try {
      await removeSubtopic(goalId, subtopicId);
      const data = await refreshGoals();
      setGoals(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to remove the subtopic.');
    } finally {
      setBusyGoalId(null);
    }
  };

  const handleGenerateSubtopics = async (goal: GoalWithMastery) => {
    if (generatingGoalId) return;
    const remaining = MAX_SUBTOPICS - goal.subtopics.length;
    if (remaining <= 0) return;

    setGeneratingGoalId(goal.goalId);
    setError(null);
    try {
      const plan = await generateSubtopics(goal.title);
      const existing = new Set(goal.subtopics.map((s) => s.name.toLowerCase()));
      const fresh = plan.subtopics.map((s) => s.name).filter((n) => !existing.has(n.toLowerCase()));
      if (fresh.length === 0) {
        setError('The AI plan only suggested subtopics you already have.');
        return;
      }
      // Add up to the remaining capacity, one by one (tolerant of duplicates).
      for (const name of fresh.slice(0, remaining)) {
        try {
          await addSubtopic(goal.goalId, name);
        } catch {
          // skip duplicates/limits, keep adding the rest
        }
      }
      const data = await refreshGoals();
      setGoals(data);
    } catch (err: any) {
      setError(err?.message || 'AI subtopic generation failed. Add them manually instead.');
    } finally {
      setGeneratingGoalId(null);
    }
  };

  const masteryBarColor = (pct: number) => {
    if (pct >= 80) return 'bg-emerald-600';
    if (pct >= 40) return 'bg-slate-800';
    return 'bg-slate-400';
  };

  return (
    <div className="h-full w-full max-w-full overflow-y-auto overflow-x-hidden subtle-scroll min-w-0">
      <div className={getResponsivePageContainerClass()}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="pl-14 sm:pl-0 min-h-[42px] flex items-center">
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Target className="w-5 h-5 sm:w-6 sm:h-6 text-slate-800" />
              <span>My Topics</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="hidden sm:inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Topic</span>
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-800">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto p-0.5 text-amber-500 hover:text-amber-700 cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Goal cards */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
            <p className="text-xs font-medium">Loading your topics...</p>
          </div>
        ) : goals.length === 0 ? (
          <div className="bg-white border border-slate-200 p-12 text-center rounded-2xl shadow-md">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-display font-bold text-slate-900">No topics yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Add a topic you want to master. Pragati will remember it, generate subtopics, and track your mastery as
              you take quizzes.
            </p>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="mt-5 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add your first topic</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {goals.map((goal) => {
              const isBusy = busyGoalId === goal.goalId;
              const isGenerating = generatingGoalId === goal.goalId;
              const canGenerate = goal.subtopics.length < MAX_SUBTOPICS;
              const weakest = [...goal.subtopics].sort((a, b) => a.masteryPct - b.masteryPct)[0];

              return (
                <div key={goal.goalId} className={`${getPermanentCardClass()} p-4 sm:p-5`}>
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-display font-bold text-slate-900 truncate">{goal.title}</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {goal.subtopics.length === 0
                          ? 'No subtopics yet'
                          : weakest && weakest.masteryPct < 100
                          ? `Focus next: ${weakest.name} (${weakest.masteryPct}%)`
                          : 'All subtopics look strong'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRequestRemoveGoal(goal)}
                      disabled={isBusy || isGenerating}
                      title="Remove topic"
                      aria-label="Remove topic"
                      className="p-2 rounded-xl border transition-colors shrink-0 cursor-pointer disabled:opacity-40 text-slate-400 hover:text-rose-600 hover:bg-rose-50/70 border-slate-200 hover:border-rose-200"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Overall mastery bar */}
                  <div className="mt-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-display">
                        Mastery
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-800">{goal.masteryPct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${masteryBarColor(goal.masteryPct)}`}
                        style={{ width: `${Math.max(1, Math.min(100, goal.masteryPct))}%` }}
                      />
                    </div>
                  </div>

                  {/* Subtopic chips with per-subtopic mastery */}
                  {goal.subtopics.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {goal.subtopics.map((st) => (
                        <div
                          key={st.id}
                          className="flex items-center gap-2.5 group"
                        >
                          <span className="text-xs font-medium text-slate-700 w-28 sm:w-40 truncate shrink-0" title={st.name}>
                            {st.name}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden min-w-8">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${masteryBarColor(st.masteryPct)}`}
                              style={{ width: `${Math.max(1, Math.min(100, st.masteryPct))}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono font-semibold text-slate-500 w-8 text-right shrink-0">
                            {st.masteryPct}%
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSubtopic(goal.goalId, st.id)}
                            disabled={isBusy || isGenerating}
                            aria-label={`Remove ${st.name}`}
                            title="Remove subtopic"
                            className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Card actions */}
                  <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="text"
                        value={subtopicDrafts[goal.goalId] || ''}
                        onChange={(e) =>
                          setSubtopicDrafts((prev) => ({ ...prev, [goal.goalId]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubtopic(goal);
                          }
                        }}
                        maxLength={60}
                        placeholder={
                          goal.subtopics.length >= MAX_SUBTOPICS
                            ? `Max ${MAX_SUBTOPICS} subtopics reached`
                            : 'Add a subtopic...'
                        }
                        disabled={isBusy || isGenerating || goal.subtopics.length >= MAX_SUBTOPICS}
                        className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddSubtopic(goal)}
                        disabled={isBusy || isGenerating || !(subtopicDrafts[goal.goalId] || '').trim() || goal.subtopics.length >= MAX_SUBTOPICS}
                        aria-label="Add subtopic"
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                      >
                        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {canGenerate && (
                        <button
                          type="button"
                          onClick={() => handleGenerateSubtopics(goal)}
                          disabled={isBusy || isGenerating}
                          title="Generate subtopics with AI"
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                        >
                          {isGenerating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span className="hidden sm:inline">Generate with AI</span>
                          <span className="sm:hidden">AI</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const testPrompt = buildTestMePrompt(goal);
                          navigate(`/instructor?prompt=${encodeURIComponent(testPrompt)}`);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs cursor-pointer"
                      >
                        <span>Test me</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Remove-topic confirmation — shared ConfirmDialog (same modal as Delete Chat) */}
      <ConfirmDialog
        open={goalToDelete !== null}
        title="Remove topic?"
        subtitle="This topic and its mastery history will be removed."
        message={
          <>
            Are you sure you want to remove{' '}
            <strong className="text-slate-900 font-semibold">&ldquo;{goalToDeleteTitle ?? 'this topic'}&rdquo;</strong>
            ? Quizzes linked to it stay, but mastery tracking for this topic stops.
          </>
        }
        confirmLabel="Remove topic"
        confirmingLabel="Removing..."
        busy={goalToDelete?.busy ?? false}
        onConfirm={handleConfirmRemoveGoal}
        onCancel={() => setGoalToDelete((cur) => dismissConfirmation(cur))}
      />

      {/* Add-topic modal (reuses the onboarding flow, manual source) */}
      <OnboardingGoalModal
        open={showAddModal}
        source="manual"
        onClose={(submitted) => {
          setShowAddModal(false);
          if (submitted) load(true);
        }}
      />
    </div>
  );
};
