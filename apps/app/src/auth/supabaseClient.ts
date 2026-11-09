import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Auth options shared by both builds. Sessions must survive a reload (and, on
 * iOS, the PWA being closed and reopened), so persistence in the browser's
 * storage is explicit instead of relying on the client's defaults.
 */
export const AUTH_OPTIONS = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
} satisfies SupabaseClientOptions<"public">;

/**
 * The Supabase client, or `null` when the app was built without Sync
 * configuration. The app is local-first: running without an account (and
 * therefore without a client) is a supported mode, not an error.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, AUTH_OPTIONS)
    : null;
