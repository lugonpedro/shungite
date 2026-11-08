import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export interface SessionState {
  session: Session | null;
  loading: boolean;
}

/**
 * Tracks the current Supabase session. Without a configured client there is
 * never a session and nothing to wait for.
 */
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabase !== null);

  useEffect(() => {
    if (!supabase) return;

    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
