"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * One-time sign-in. The session persists in cookies and proxy.ts refreshes
 * it, so this screen only appears when signed out — after the first login
 * the app recognizes you on every boot. A fresh sign-up also seeds the
 * starter accounts via the database trigger.
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);

    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      if (!data.session) {
        // Email confirmation is enabled in the Supabase project — no
        // session until the address is confirmed.
        setInfo(
          "Account created — confirm it from the email we sent, then sign in below."
        );
        setMode("signin");
        setBusy(false);
        return;
      }
    }

    // Signed in (and a fresh sign-up seeded the starter accounts via the
    // DB trigger). Everything else takes it from here.
    router.push("/");
    router.refresh();
  }

  if (!isSupabaseConfigured()) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6">
        <div className="w-full max-w-[340px] bg-surface border border-border-soft rounded-md px-5 py-4">
          <h1 className="text-[15px] font-semibold mb-1.5">
            Supabase isn't configured
          </h1>
          <p className="text-[12.5px] text-text-dim">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in
            .env.local, then restart the dev server.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-6">
      <div className="w-full max-w-[340px]">
        <div className="mb-5">
          <h1 className="text-[17px] font-semibold tracking-[0.01em]">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-text-dim">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              className="bg-surface-2 border border-border-soft rounded-sm px-3 py-2 text-[13px] text-text placeholder:text-text-faint focus:outline-none focus:border-net"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-text-dim">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="••••••••"
              className="bg-surface-2 border border-border-soft rounded-sm px-3 py-2 text-[13px] text-text placeholder:text-text-faint focus:outline-none focus:border-net"
            />
          </label>

          {error && <p className="text-[12px] text-expense">{error}</p>}
          {info && <p className="text-[12px] text-text-dim">{info}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1.5 rounded-sm bg-net px-3 py-2 text-[13px] font-semibold text-bg hover:opacity-90 disabled:opacity-60"
          >
            {busy
              ? "Working…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          className="mt-4 text-[12px] text-text-dim hover:text-text"
        >
          {mode === "signin"
            ? "First time? Create your account"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
