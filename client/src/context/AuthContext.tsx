import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { apiRequest } from '../api/client';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  skill_rating: number;
  streak_days: number;
  avatar_url?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmailOtp: (email: string) => Promise<{ error?: string }>;
  signInAsJudge: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Demo judge credentials are sourced from env so they can be rotated (or pointed at a
 * disposable demo account) without a code change. NOTE: anything in the client bundle is
 * public — the real protection for the demo account must come from Supabase RLS
 * (see supabase/schema.sql for a read-only demo-account policy).
 */
const DEMO_JUDGE_EMAIL = import.meta.env.VITE_DEMO_JUDGE_EMAIL || 'judge.pragati@gmail.com';
const DEMO_JUDGE_PASSWORD = import.meta.env.VITE_DEMO_JUDGE_PASSWORD || 'JudgeDemoPassword2026!';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const profileFetchRef = useRef<Promise<void> | null>(null);

  // Deduplicated profile fetch: supabase.auth.onAuthStateChange fires for several events in
  // quick succession (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED...). Without dedup each one
  // spawned a parallel /api/auth/me request; failures also left a silently stale profile.
  const fetchProfile = async () => {
    if (profileFetchRef.current) return profileFetchRef.current;
    profileFetchRef.current = (async () => {
      try {
        const data = await apiRequest<{ user: UserProfile }>('/api/auth/me');
        setProfile(data.user);
      } catch (err) {
        console.error('Failed to fetch profile', err);
      } finally {
        profileFetchRef.current = null;
      }
    })();
    return profileFetchRef.current;
  };

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile();
      }
      setLoading(false);
    });

    // 2. Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile();
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  };

  const signInWithEmailOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { error: error.message };
    return {};
  };

  const signInAsJudge = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: DEMO_JUDGE_EMAIL,
      password: DEMO_JUDGE_PASSWORD,
    });
    if (error) throw error;
    if (data.session) {
      setSession(data.session);
      setUser(data.user);
      await fetchProfile();
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signInWithGoogle,
        signInWithEmailOtp,
        signInAsJudge,
        signOut,
        refreshProfile: fetchProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
