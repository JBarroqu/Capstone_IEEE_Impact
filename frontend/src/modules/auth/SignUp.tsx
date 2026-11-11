import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useConfig } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { AuthCard, GoogleButton, OrLine } from "./AuthCard";

export default function SignUp() {
  const { session } = useAuth();
  const { config, policy } = useConfig();
  const after = policy("ONBOARDING_REQUIRED") === false ? "/" : "/onboarding";  // D-01
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (session) return <Navigate to={after} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    setBusy(true); setError(null);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${after}` } });
    setBusy(false);
    if (error) setError(error.message);
    else if (data.session) nav(after);
    else setConfirm(true);
  };

  if (confirm) return <AuthCard title="Confirm your email" sub={<>We sent a link to <strong>{email}</strong>. Open it to finish signing up.</>}><span /></AuthCard>;
  return (
    <AuthCard title="Create your account" sub="Then tell us where you are now, and get your first move.">
      <GoogleButton onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=${after}` } })} />
      <OrLine />
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" hint="At least 8 characters."><Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" busy={busy}>Create account</Button>
      </form>
      {config?.privacy && <p className="mt-4 text-xs leading-5 text-secondary">{config.privacy}</p>}
      <p className="mt-4 text-sm"><Link className="text-primary hover:opacity-60" to="/auth/sign-in">I already have an account</Link></p>
    </AuthCard>
  );
}
