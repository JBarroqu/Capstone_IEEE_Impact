import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ErrorNote } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AuthCard } from "./AuthCard";

/** Magic links, email confirmations and Google all land here. supabase-js exchanges the PKCE code itself on load
 *  (detectSessionInUrl); exchanging it again here would fail because the verifier is used up. */
export default function Callback() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refreshMe } = useAuth();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const go = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setError(params.get("error_description") || "This link is no longer valid."); return; }
      const me = await refreshMe();
      nav(me && !me.onboarded ? "/onboarding" : params.get("next") || "/", { replace: true });
    };
    void go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <AuthCard title="Signing you in">{error ? <ErrorNote>{error}</ErrorNote> : <p className="text-secondary">One moment...</p>}</AuthCard>;
}
