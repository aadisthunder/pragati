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
        <Loader2 className="w-8 h-8 animate-spin text-[#7A22E8]" />
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
    <div className="max-w-5xl mx-auto w-full p-4 md:p-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/80">
        <div>
          <h2 className="text-2xl font-display font-extrabold text-[#2E1D5E] tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-[#7A22E8]" />
            <span>Student Performance Analytics</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Cognitive telemetry, dwell time distribution, and topic mastery curves
          </p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-3xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 font-display">Skill Rating</span>
            <div className="w-9 h-9 rounded-2xl bg-[#F3ECFF] text-[#7A22E8] flex items-center justify-center border border-[#D8B4FE] shadow-sm">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#7A22E8] font-mono mt-3">
            {profile?.skill_rating || 1200}
          </p>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">Dynamic ELO score</span>
        </div>

        <div className="glass-card p-5 rounded-3xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 font-display">Overall Accuracy</span>
            <div className="w-9 h-9 rounded-2xl bg-[#F3ECFF] text-[#7A22E8] flex items-center justify-center border border-[#D8B4FE] shadow-sm">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#2E1D5E] font-mono mt-3">
            {metrics?.overall_accuracy || 0}%
          </p>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">
            Across {metrics?.total_attempts || 0} attempts
          </span>
        </div>

        <div className="glass-card p-5 rounded-3xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 font-display">Avg Question Dwell</span>
            <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/60 shadow-sm">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#2E1D5E] font-mono mt-3">
            {metrics?.avg_dwell_time_sec || 0}s
          </p>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">Active deliberation</span>
        </div>

        <div className="glass-card p-5 rounded-3xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 font-display">Total Practice Time</span>
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60 shadow-sm">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#2E1D5E] font-mono mt-3">
            {metrics?.total_time_spent_min || 0}m
          </p>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">
            {metrics?.total_questions_answered || 0} questions
          </span>
        </div>
      </div>

      {/* Accuracy & Speed Performance Curve */}
      <div className="glass-card p-6 rounded-3xl space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-display font-bold text-[#2E1D5E]">Quiz Accuracy Progression Curve</h3>
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
                    borderRadius: '1rem',
                    borderColor: '#D8B4FE',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(122, 34, 232, 0.1)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#7A22E8"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#7A22E8' }}
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
        <div className="glass-card p-6 rounded-3xl space-y-4 shadow-sm">
          <h3 className="text-base font-display font-bold text-[#2E1D5E]">Curriculum Topic Mastery</h3>
          {topicMastery.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No topic data available yet.</p>
          ) : (
            <div className="space-y-4">
              {topicMastery.map((tm: any, idx: number) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 font-display">{tm.topic}</span>
                    <span className="font-mono font-semibold text-slate-500">{tm.accuracy_pct}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        tm.accuracy_pct >= 75
                          ? 'bg-[#7A22E8]'
                          : tm.accuracy_pct >= 50
                          ? 'bg-purple-400'
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
        <div className="glass-card p-6 rounded-3xl space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-display font-bold text-[#2E1D5E] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span>Questions to Review</span>
            </h3>
            <span className="text-xs font-semibold text-slate-400">Struggled Concepts</span>
          </div>

          {missedQuestions.length === 0 ? (
            <p className="text-xs text-emerald-600 font-semibold py-8 text-center bg-emerald-50/50 rounded-2xl border border-emerald-100">
              Great job! You have zero unreviewed missed questions.
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto subtle-scroll pr-1">
              {missedQuestions.map((q: any) => (
                <div key={q.id} className="p-4 rounded-2xl bg-white/90 border border-slate-200/80 space-y-2.5 hover:border-[#D8B4FE] transition shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#7A22E8] bg-[#F3ECFF] px-2.5 py-0.5 rounded-full border border-[#D8B4FE] font-display">
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
                      className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-[#7A22E8] hover:text-white bg-[#F3ECFF] hover:bg-[#7A22E8] rounded-full border border-[#D8B4FE] transition font-display"
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
