import { createClient } from "@supabase/supabase-js";

const url = process.env.REACT_APP_SUPABASE_URL;
const publishableKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY;

export const demoMode = process.env.REACT_APP_DEMO_MODE === "true" || !url || !publishableKey;

const sessionStorageAdapter = typeof window !== "undefined" ? window.sessionStorage : undefined;

export const supabase = demoMode
  ? null
  : createClient(url, publishableKey, {
      auth: {
        // Keep the user signed in while this browser tab is open, including refreshes,
        // but do not remember the login across a closed tab/browser session.
        persistSession: true,
        storage: sessionStorageAdapter,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

