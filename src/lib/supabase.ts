import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Optional run-history client.
 *
 * Only the *publishable* key belongs here. It is safe in the browser only
 * because Row Level Security is enabled on the table (see supabase/migrations).
 * Never put a secret / service-role key in this project.
 */
function makeClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  try {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  } catch {
    // A malformed URL should never break the simulator.
    return null;
  }
}

export const supabase: SupabaseClient | null = makeClient();

export const RUNS_TABLE = 'simulation_runs';
