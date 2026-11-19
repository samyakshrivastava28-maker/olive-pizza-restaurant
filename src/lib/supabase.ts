import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * 🛰️ Olive Pizza Restaurant Management - Supabase Client
 * 
 * ARCHITECTURAL MIGRATION (R2, R3):
 * Direct Supabase Realtime table queries and subscriptions on `delivery_locations` have been
 * eliminated per R2. Live fleet monitoring is now streamed via the canonical backend
 * WebSocket server (`/ws`) and Redis ephemeral tracking with HTTP polling fallback.
 * 
 * This client is preserved for non-fleet legacy touchpoint compatibility without breaking dependencies.
 */

const DEFAULT_SUPABASE_URL = 'https://tdjrkqmhdynbaciguyvr.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkanJrcW1oZHluYmFjaWd1eXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDE4MzUsImV4cCI6MjA5Nzg3NzgzNX0.03rt77yV0zfnxbLNqbEOWijqpT0iAuEgYqSTGN0HPtI';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL) as string;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY) as string;

let client: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });
  } catch (err: any) {
    console.warn('[Supabase Live Fleet] Failed to initialize Supabase client:', err?.message);
  }
}

export const supabase = client;
