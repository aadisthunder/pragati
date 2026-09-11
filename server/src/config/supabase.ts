import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

import fs from 'fs';

// Robustly load .env from project root, server directory, or parent directory
const envCandidates = [
  path.resolve(process.cwd(), 'server/.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}
dotenv.config();

const getSupabaseConfig = () => ({
  url: process.env.SUPABASE_URL || '',
  anonKey: process.env.SUPABASE_ANON_KEY || 'mock-anon-key',
});

export const supabase = createClient(
  getSupabaseConfig().url,
  getSupabaseConfig().anonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export const createScopedClient = (accessToken: string) => {
  const config = getSupabaseConfig();
  return createClient(config.url, config.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};
