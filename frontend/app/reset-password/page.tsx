"use client";

import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/lib/supabase/client";

// Reached via the link emailed by resetPasswordForEmail() — the Supabase JS client
// auto-detects the recovery token in the URL and establishes a session before this
// form is submitted, so updateUser() here just needs the new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell>
      <div className="w-full max-w-[380px]">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas-dim px-3 py-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:border-border-dark dark:bg-surface-dark dark:text-ink-muted-dark">
            Founder&apos;s Radar account
          </span>
          <h1 className="mt-4 font-heading text-[26px] font-semibold text-ink dark:text-ink-dark">
            Set a new password
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted dark:text-ink-muted-dark">
            Choose a new password for your account.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-canvas p-6 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark">
          {error && (
            <div className="mb-4 rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical dark:bg-critical-bg-dark dark:text-critical-dark">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-medium text-ink dark:text-ink-dark">
                New password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted dark:text-ink-muted-dark" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-canvas pr-9 pl-9 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-muted hover:text-ink dark:text-ink-muted-dark dark:hover:text-ink-dark"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
            >
              {loading ? "Saving…" : "Save new password"}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>
        </div>
      </div>
    </AuthShell>
  );
}
