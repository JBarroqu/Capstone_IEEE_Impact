import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { get } from "./api";
import { supabase } from "./supabase";
import { refreshTicket, track } from "./track";

export type Me = { userId: string; email: string | null; onboarded: boolean; handle: string | null; displayName: string };
type Ctx = { session: Session | null; me: Me | null; loading: boolean; refreshMe: () => Promise<Me | null>; signOut: () => Promise<void> };
const C = createContext<Ctx>({ session: null, me: null, loading: true, refreshMe: async () => null, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const m = await get<Me>("/api/v1/me");
      setMe(m);
      return m;
    } catch {
      setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) { await refreshMe(); void refreshTicket(); track("session_started"); }
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN") { void refreshMe(); void refreshTicket(); }
      if (event === "SIGNED_OUT") setMe(null);
    });
    return () => data.subscription.unsubscribe();
  }, [refreshMe]);

  const signOut = async () => { await supabase.auth.signOut(); setMe(null); };
  return <C.Provider value={{ session, me, loading, refreshMe, signOut }}>{children}</C.Provider>;
}

export const useAuth = () => useContext(C);
