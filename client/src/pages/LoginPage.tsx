import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { signInWithGoogle, signInWithEmailOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setError(null);

    const { error: err } = await signInWithEmailOtp(email);
    setIsSubmitting(false);

    if (err) {
      setError(err);
    } else {
      setEmailSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#FAF8FD]">
      <div className="w-full max-w-md">
        {/* Header with Official Cognitive Prism Logo */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Pragati Logo"
            className="w-16 h-16 rounded-3xl object-cover shadow-lg shadow-purple-500/25 mb-4 mx-auto border border-purple-200/80"
          />
          <h1 className="text-3xl font-display font-extrabold text-[#2E1D5E] tracking-tight">Welcome to Pragati</h1>
          <p className="text-sm text-slate-500 mt-2 font-medium">
            AI-driven Socratic tutor and telemetry-backed learning arena
          </p>
        </div>

        {/* Frosted Glass Auth Card */}
        <div className="glass-card p-8 rounded-3xl shadow-sm">
          {error && (
            <div className="flex items-center gap-2 p-3.5 mb-6 text-sm text-red-700 bg-red-50/80 border border-red-200/80 rounded-2xl">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {emailSent ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-display font-bold text-[#2E1D5E]">Check your inbox</h3>
              <p className="text-sm text-slate-600 mt-2">
                We sent a passwordless sign-in link to <strong className="text-slate-900">{email}</strong>.
              </p>
              <button
                onClick={() => setEmailSent(false)}
                className="mt-6 text-xs font-semibold text-[#7A22E8] hover:text-[#6918C8] underline"
              >
                Sign in with a different email
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Option 1: Google OAuth */}
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold rounded-full border border-slate-200/90 shadow-sm transition-all duration-150 hover:shadow"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200/80 w-full" />
                <span className="bg-white px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider relative">
                  Or
                </span>
              </div>

              {/* Option 2: Passwordless Email Magic Link */}
              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-bold text-[#2E1D5E] uppercase tracking-wider mb-1.5 font-display">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@university.edu"
                      className="w-full pl-10 pr-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7A22E8]/30 focus:border-[#7A22E8] transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full btn-deezer-primary py-3 text-sm disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Send Magic Link</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Zero passwords required. Secure passwordless authentication via Supabase.
        </p>
      </div>
    </div>
  );
};
