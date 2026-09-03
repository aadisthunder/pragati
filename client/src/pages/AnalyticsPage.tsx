import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import {
  ResponsiveContainer,
  LineChart,
  Line,
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

export const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    apiRequest('/api/analytics/dashboard')
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
        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
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
    <div className="max-w-5xl mx-auto w-full p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/80">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-sky-600" />
            <span>Student Performance Analytics</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Cognitive telemetry, dwell time distribution, and topic mastery curves
          </p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Skill Rating</span>
            <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center border border-violet-200/60">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-violet-700 font-mono mt-3">
            {profile?.skill_rating || 1200}
          </p>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">Dynamic ELO score</span>
        </div>

        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Overall Accuracy</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-200/60">
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

        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Avg Question Dwell</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/60">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono mt-3">
            {metrics?.avg_dwell_time_sec || 0}s
          </p>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">Active deliberation</span>
        </div>

        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Practice Time</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60">
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
      <div className="glass-card p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Quiz Accuracy Progression Curve</h3>
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
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderRadius: '0.75rem',
                    borderColor: '#E2E8F0',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#0284C7"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#0284C7' }}
                  name="Accuracy %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-12 text-center text-xs font-semibold text-slate-400">
            No quiz attempts recorded yet. Attempt quizzes to see your growth curve.
          </div>
        )}
      </div>

      {/* Topic Mastery & Missed Questions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Topic Mastery */}
        <div className="glass-card p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Curriculum Topic Mastery</h3>
          {topicMastery.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No topic data available yet.</p>
          ) : (
            <div className="space-y-3.5">
              {topicMastery.map((tm: any, idx: number) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">{tm.topic}</span>
                    <span className="font-mono font-semibold text-slate-500">{tm.accuracy_pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        tm.accuracy_pct >= 75
                          ? 'bg-emerald-500'
                          : tm.accuracy_pct >= 50
                          ? 'bg-sky-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.max(5, tm.accuracy_pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Missed & Skipped Questions with Direct AI Tutor Button */}
        <div className="glass-card p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
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
                <div key={q.id} className="p-3.5 rounded-xl bg-white border border-slate-200/80 space-y-2 hover:border-slate-300 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
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
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 rounded-lg transition"
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
  );
};
