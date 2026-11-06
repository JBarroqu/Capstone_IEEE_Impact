import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { AuthCard } from "./AuthCard";

export default function ResetPassword() {
  const nav = useNavigate();
  const [recovery, setRecovery] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "PASSWORD_RECOVERY") setRecovery(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  if (recovery) {
    return (
      <AuthCard title="Choose a new password">
        <form className="flex flex-col gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await supabase.auth.updateUser({ password });
          if (error) setError(error.message); else nav("/");
        }}>
          <Field label="New password" hint="At least 8 characters."><Input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit">Save password</Button>
        </form>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Reset your password" sub="We'll email you a link.">
      <form className="flex flex-col gap-4" onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset-password` });
        if (error) setError(error.message); else setMsg("If that email has an account, a reset link is on its way.");
      }}>
        <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        {msg && <p className="text-sm text-growth">{msg}</p>}
        <Button type="submit">Send reset link</Button>
      </form>
    </AuthCard>
  );
}
