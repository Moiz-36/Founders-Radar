"use client";

import { ArrowRight, Mail, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, type SubmitEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell>
        <div className="w-full max-w-[380px] text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-info-bg dark:bg-info-bg-dark">
            <MailCheck size={22} className="text-brand" />
          </div>
          <h1 className="mt-4 font-heading text-[26px] font-semibold text-ink dark:text-ink-dark">
            Check your email
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted dark:text-ink-muted-dark">
            We sent a password reset link to <span className="font-medium text-ink dark:text-ink-dark">{email}</span>.
          </p>
          <Link
            href="/login"
            className="mt-6 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand text-sm font-semibold text-white transition hover:bg-brand-hover"
          >
            Back to sign in
            <ArrowRight size={15} />
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="w-full max-w-[380px]">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas-dim px-3 py-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:border-border-dark dark:bg-surface-dark dark:text-ink-muted-dark">
            Founder&apos;s Radar account
          </span>
          <h1 className="mt-4 font-heading text-[26px] font-semibold text-ink dark:text-ink-dark">
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted dark:text-ink-muted-dark">
            Enter your email and we&apos;ll send you a link to set a new one.
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
              <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink dark:text-ink-dark">
                Work email
              </label>
              <div className="relative">
                <Mail size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted dark:text-ink-muted-dark" />
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="founder@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-canvas pr-3 pl-9 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send reset link"}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-ink-muted dark:text-ink-muted-dark">
          <Link href="/login" className="font-medium text-brand hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
