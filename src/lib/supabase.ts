import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * 🛰️ Olive Pizza Restaurant Management - Dedicated Supabase Realtime Client
 * 
 * STRICT ARCHITECTURAL INVARIANT (Sections 10, 17, 18, 19):
 * Subscribes directly to Supabase Realtime delivery_locations for live fleet monitoring.
 * Consumed by the Shared Live Rider Store across Dashboard, Live Orders, and Rider Management.
 */

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '') as string;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '') as string;

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
