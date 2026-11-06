import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Button, Chip, ChipRow, ErrorNote, Field, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AuthCard, GoogleButton, OrLine } from "./AuthCard";

export default function SignIn() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const nav = useNavigate();
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  if (session) return <Navigate to={next} replace />;

  const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message); else nav(next);
    } else {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
      if (error) setError(error.message); else setSent(true);
    }
    setBusy(false);
  };

  if (sent) {
    return <AuthCard title="Check your email" sub={<>We sent a sign-in link to <strong>{email}</strong>. Open it on this device.</>}>
      <Button kind="text" onClick={() => setSent(false)}>Use a different email</Button>
    </AuthCard>;
  }
  return (
    <AuthCard title="Sign in" sub="Pick up where you left off.">
      <GoogleButton onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect } })} />
      <OrLine />
      <ChipRow label="Sign-in method">
        <Chip on={mode === "password"} onClick={() => setMode("password")}>Password</Chip>
        <Chip on={mode === "link"} onClick={() => setMode("link")}>Email me a link</Chip>
      </ChipRow>
      <form className="mt-3 flex flex-col gap-4" onSubmit={submit}>
        <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {mode === "password" && (
          <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" busy={busy}>{mode === "password" ? "Sign in" : "Send sign-in link"}</Button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-2 text-sm">
        <Link className="text-primary hover:opacity-60" to={`/auth/sign-up?next=${encodeURIComponent(next)}`}>Create an account</Link>
        <Link className="text-primary hover:opacity-60" to="/auth/reset-password">Forgot password?</Link>
      </div>
    </AuthCard>
  );
}
