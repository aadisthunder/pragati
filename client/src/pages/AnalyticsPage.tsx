import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, apiRequestCached, getFromCache, invalidateCache } from '../api/client';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  BarChart3,
  Award,
  Clock,
  Target,
  AlertCircle,
  ArrowRight,
  Loader2,
  BookOpen,
  Trash2,
} from 'lucide-react';
import { buildTutorMissedPrompt } from '../utils/markdownCards';
import {
  getResponsivePageContainerClass,
  formatDeltaBadge,
  getPermanentCardClass,
  getMetricStatTypographyClass,
  getMetricStatRowClass,
} from '../utils/theme';

const CHART_PALETTE = ['#0F172A', '#334155', '#475569', '#64748B', '#94A3B8'];

export const AnalyticsPage: React.FC = () => {
  const cachedInitial = getFromCache<any>('/api/analytics/dashboard');
  const [data, setData] = useState<any>(cachedInitial || null);
  const [loading, setLoading] = useState(!cachedInitial);
  const [clearingMissed, setClearingMissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!getFromCache('/api/analytics/dashboard')) {
      setLoading(true);
    }
    apiRequestCached('/api/analytics/dashboard')
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const handleDeleteMissed = async (id: string) => {
    // Optimistic UI update
    setData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        missed_questions: (prev.missed_questions || []).filter((q: any) => q.id !== id),
      };
    });
    try {
      await apiRequest(`/api/analytics/missed-questions/${id}`, { method: 'DELETE' });
      invalidateCache('/api/analytics');
    } catch (err) {
      console.error('Failed to delete missed question:', err);
    }
  };

  const handleClearAllMissed = async () => {
    if (!window.confirm('Are you sure you want to clear all questions to review?')) return;
    setClearingMissed(true);
    setData((prev: any) => {
      if (!prev) return prev;
      return { ...prev, missed_questions: [] };
    });
    try {
      await apiRequest('/api/analytics/missed-questions', { method: 'DELETE' });
      invalidateCache('/api/analytics');
    } catch (err) {
      console.error('Failed to clear all missed questions:', err);
    } finally {
      setClearingMissed(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-800" />
      </div>
    );
  }

  const profile = data?.profile;
  const metrics = data?.metrics;
  const topicMastery = data?.topic_mastery || [];
  const recentAttempts = data?.recent_attempts || [];
  const missedQuestions = data?.missed_questions || [];

  const ratingBadge = formatDeltaBadge(metrics?.rating_delta);
  const accuracyBadge = formatDeltaBadge(metrics?.accuracy_delta, true);

  // Format curve data
  const chartData = recentAttempts.map((att: any, idx: number) => ({
    attempt: `Quiz ${idx + 1}`,
    accuracy: att.accuracy_pct,
    dwell_time: Math.round(att.total_time_sec / (att.total_questions || 1)),
  }));

  const handleTutorMissed = (q: any) => {
    const prompt = buildTutorMissedPrompt(q);
    navigate(`/instructor?session=new&prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="h-full w-full max-w-full overflow-y-auto overflow-x-hidden subtle-scroll min-w-0">
      <div className={getResponsivePageContainerClass()}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="w-full sm:w-auto">
            <div className="pl-14 sm:pl-0 min-h-[42px] flex items-center">
              <h2 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-slate-800" />
                <span>Student Analytics</span>
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Cognitive telemetry, dwell time distribution, and topic mastery curves
            </p>
          </div>
        </div>

      {/* Metric Cards Grid with Permanent Crisp Drop Shadows & Delta Indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 min-w-0">
        <div className={`${getPermanentCardClass()} p-3 sm:p-4 min-w-0`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 font-display">Skill Rating</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center border border-slate-200 shadow-xs shrink-0">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className={getMetricStatRowClass()}>
            <p className={`text-slate-900 ${getMetricStatTypographyClass()}`}>
              {profile?.skill_rating || 1200}
            </p>
            {ratingBadge && (
              <span className={`${getMetricStatTypographyClass()} ${ratingBadge.colorClass}`}>
                {ratingBadge.text}
              </span>
            )}
          </div>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">Dynamic ELO score</span>
        </div>

        <div className={`${getPermanentCardClass()} p-3 sm:p-4 min-w-0`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 font-display">Overall Accuracy</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center border border-slate-200 shadow-xs shrink-0">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className={getMetricStatRowClass()}>
            <p className={`text-slate-900 ${getMetricStatTypographyClass()}`}>
              {metrics?.overall_accuracy || 0}%
            </p>
            {accuracyBadge && (
              <span className={`${getMetricStatTypographyClass()} ${accuracyBadge.colorClass}`}>
                {accuracyBadge.text}
              </span>
            )}
          </div>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">
            Across {metrics?.total_attempts || 0} attempts
          </span>
        </div>

        <div className={`${getPermanentCardClass()} p-3 sm:p-4 min-w-0`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 font-display">Avg Question Dwell</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/60 shadow-xs shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className={getMetricStatRowClass()}>
            <p className={`text-slate-900 ${getMetricStatTypographyClass()}`}>
              {metrics?.avg_dwell_time_sec || 0}s
            </p>
          </div>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">Active deliberation</span>
        </div>

        <div className={`${getPermanentCardClass()} p-3 sm:p-4 min-w-0`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 font-display">Total Practice Time</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60 shadow-xs shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className={getMetricStatRowClass()}>
            <p className={`text-slate-900 ${getMetricStatTypographyClass()}`}>
              {metrics?.total_time_spent_min || 0}m
            </p>
          </div>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">
            {metrics?.total_questions_answered || 0} questions
          </span>
        </div>
      </div>

      {/* Accuracy & Speed Performance Curve */}
      <div className={`${getPermanentCardClass()} p-3.5 sm:p-5 space-y-3 min-w-0 overflow-hidden`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-display font-bold text-slate-900">Quiz Accuracy Progression Curve</h3>
          <span className="text-xs font-mono font-semibold text-slate-400">Past Attempts</span>
        </div>

        {chartData.length > 0 ? (
          <div className="h-56 sm:h-60 w-full min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="attempt" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    borderRadius: '0.75rem',
                    borderColor: '#E2E8F0',
                    fontSize: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#0F172A"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#0F172A' }}
                  isAnimationActive={true}
                  animationDuration={1000}
                  animationEasing="ease-out"
                  name="Accuracy %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center border border-slate-200 shadow-xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-700">No quiz attempts recorded yet</p>
            <p className="text-[11px] text-slate-400 max-w-xs">
              Complete your first quiz with the AI Instructor to record accuracy telemetry.
            </p>
          </div>
        )}
      </div>

      {/* Topic Mastery Animated Bar Chart & Missed Questions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
        {/* Topic Mastery - Animated Bar Chart */}
        <div className={`${getPermanentCardClass()} p-4 sm:p-6 space-y-4 min-w-0 overflow-hidden`}>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-display font-bold text-slate-900">Curriculum Topic Mastery</h3>
            <span className="text-xs font-mono font-semibold text-slate-400">Mastery %</span>
          </div>

          {topicMastery.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center border border-slate-200 shadow-xs">
                <Target className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-700">No topic mastery telemetry yet</p>
              <p className="text-[11px] text-slate-400 max-w-xs">
                As you answer questions across curriculum topics, animated mastery telemetry will display here.
              </p>
            </div>
          ) : (
            <div className="h-60 w-full min-w-0 overflow-hidden">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={topicMastery}
                  margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="topic"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.98)',
                      borderRadius: '0.75rem',
                      borderColor: '#E2E8F0',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                    }}
                    formatter={(value: any) => [`${value}%`, 'Accuracy']}
                  />
                  <Bar
                    dataKey="accuracy_pct"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={true}
                    animationDuration={1100}
                    animationEasing="ease-out"
                  >
                    {topicMastery.map((_entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_PALETTE[index % CHART_PALETTE.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Missed & Skipped Questions with Direct AI Tutor Button */}
        <div className={`${getPermanentCardClass()} p-4 sm:p-6 space-y-4 min-w-0 overflow-hidden`}>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-display font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span>Questions to Review</span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 hidden sm:inline">Struggled Concepts</span>
              {missedQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllMissed}
                  disabled={clearingMissed}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer disabled:opacity-50 font-display"
                  title="Clear all questions to review"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          </div>

          {missedQuestions.length === 0 ? (
            <p className="text-xs text-emerald-600 font-semibold py-8 text-center bg-emerald-50/50 rounded-xl border border-emerald-100">
              Great job! You have zero unreviewed missed questions.
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto subtle-scroll pr-1">
              {missedQuestions.map((q: any) => (
                <div key={q.id} className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-2.5 hover:border-slate-300 hover:shadow-xs transition-all duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-700 bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-200 font-display">
                      {q.topic}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-400">
                        {q.dwell_time_sec}s dwell time
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteMissed(q.id)}
                        aria-label="Dismiss question"
                        title="Dismiss question"
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs font-medium text-slate-800 line-clamp-2">{q.prompt}</p>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-red-600 font-mono">
                      Choice: {q.selected_answer || 'Skipped'}
                    </span>
                    <button
                      onClick={() => handleTutorMissed(q)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:text-white bg-white hover:bg-slate-900 rounded-lg border border-slate-200 hover:border-slate-900 transition-colors font-display shadow-xs active:scale-[0.98]"
                    >
                      <span>Tutor with AI</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
};
