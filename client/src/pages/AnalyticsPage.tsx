import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequestCached, getFromCache } from '../api/client';
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
} from 'lucide-react';

const CHART_PALETTE = ['#0F172A', '#334155', '#475569', '#64748B', '#94A3B8'];

export const AnalyticsPage: React.FC = () => {
  const cachedInitial = getFromCache<any>('/api/analytics/dashboard');
  const [data, setData] = useState<any>(cachedInitial || null);
  const [loading, setLoading] = useState(!cachedInitial);
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
      .catch((err) => {
        console.error('Failed to load analytics', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
      </div>
    );
  }

  const profile = data?.profile;
  const metrics = data?.metrics;
  const topicMastery = data?.topic_mastery || [];
  const recentAttempts = data?.recent_attempts || [];
  const missedQuestions = data?.missed_questions || [];

  // Format curve data
  const chartData = recentAttempts.map((att: any, idx: number) => ({
    attempt: `Quiz ${idx + 1}`,
    accuracy: att.accuracy_pct,
    dwell_time: Math.round(att.total_time_sec / (att.total_questions || 1)),
  }));

  const handleTutorMissed = (q: any) => {
    navigate('/instructor', {
      state: {
        autoPrompt: `I struggled with this question on ${q.topic}: "${q.prompt}". My choice was ${q.selected_answer || 'none (skipped)'}, but the correct answer is ${q.correct_answer}. Can you teach me the underlying concepts step-by-step?`,
      },
    });
  };

  return (
    <div className="h-full overflow-y-auto subtle-scroll">
      <div className="max-w-5xl mx-auto w-full p-4 md:p-8 space-y-6 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-slate-800" />
            <span>Student Performance Analytics</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Cognitive telemetry, dwell time distribution, and topic mastery curves
          </p>
        </div>
      </div>

      {/* Metric Cards Grid with Micro-Hover Lift */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 font-display">Skill Rating</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center border border-slate-200 shadow-xs">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono mt-3">
            {profile?.skill_rating || 1200}
          </p>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">Dynamic ELO score</span>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 font-display">Overall Accuracy</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center border border-slate-200 shadow-xs">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono mt-3">
            {metrics?.overall_accuracy || 0}%
          </p>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">
            Across {metrics?.total_attempts || 0} attempts
          </span>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 font-display">Avg Question Dwell</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/60 shadow-xs">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono mt-3">
            {metrics?.avg_dwell_time_sec || 0}s
          </p>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">Active deliberation</span>
        </div>

        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 font-display">Total Practice Time</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60 shadow-xs">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono mt-3">
            {metrics?.total_time_spent_min || 0}m
          </p>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">
            {metrics?.total_questions_answered || 0} questions
          </span>
        </div>
      </div>

      {/* Accuracy & Speed Performance Curve */}
      <div className="bg-white border border-slate-200/80 p-6 rounded-2xl space-y-4 shadow-xs hover:shadow-sm transition-all duration-200">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-display font-bold text-slate-900">Quiz Accuracy Progression Curve</h3>
          <span className="text-xs font-mono font-semibold text-slate-400">Past Attempts</span>
        </div>

        {chartData.length > 0 ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Topic Mastery - Animated Bar Chart */}
        <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-xs hover:shadow-sm transition-all duration-200">
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
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
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
        <div className="bg-white border border-slate-200/80 p-6 rounded-2xl space-y-4 shadow-xs hover:shadow-sm transition-all duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-display font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span>Questions to Review</span>
            </h3>
            <span className="text-xs font-semibold text-slate-400">Struggled Concepts</span>
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
                    <span className="text-[11px] font-mono text-slate-400">
                      {q.dwell_time_sec}s dwell time
                    </span>
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
