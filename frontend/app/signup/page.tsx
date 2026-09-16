"use client";

import { ArrowRight, Briefcase, Building2, Eye, EyeOff, Lock, Mail, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6c-2 1.5-4.6 2.5-7.7 2.5-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.5 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-1.94c-3.2.7-3.87-1.54-3.87-1.54-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.13v3.16c0 .31.21.66.79.55A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Read by the handle_new_user() trigger (infra/sql/schema.sql) to populate
      // the profiles table — works even though there's no session yet below.
      options: { data: { company_name: companyName, job_title: jobTitle } },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    // Email confirmation may be required depending on the Supabase project's auth
    // settings — if there's no session yet, the user needs to confirm via email first.
    if (!data.session) {
      setConfirmationSent(true);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleOAuthSignIn(provider: "google" | "github") {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  if (confirmationSent) {
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
            We sent a confirmation link to <span className="font-medium text-ink dark:text-ink-dark">{email}</span>.
            Click it, then sign in.
          </p>
          <Link
            href="/login"
            className="mt-6 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand text-sm font-semibold text-white transition hover:bg-brand-hover"
          >
            Go to sign in
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
            Create your account
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted dark:text-ink-muted-dark">
            Track competitor pricing, features, hiring, and news — all in one dashboard.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-canvas p-6 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] dark:border-border-dark dark:bg-surface-dark">
          {error && (
            <div className="mb-4 rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical dark:bg-critical-bg-dark dark:text-critical-dark">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleOAuthSignIn("google")}
              className="flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-canvas-dim text-sm font-medium text-ink transition hover:bg-hover dark:border-border-dark dark:bg-hover-dark dark:text-ink-dark dark:hover:bg-border-dark"
            >
              <GoogleIcon />
              Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuthSignIn("github")}
              className="flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-canvas-dim text-sm font-medium text-ink transition hover:bg-hover dark:border-border-dark dark:bg-hover-dark dark:text-ink-dark dark:hover:bg-border-dark"
            >
              <GitHubIcon />
              GitHub
            </button>
          </div>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border dark:bg-border-dark" />
            <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
              Or continue with email
            </span>
            <div className="h-px flex-1 bg-border dark:bg-border-dark" />
          </div>

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

            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-medium text-ink dark:text-ink-dark">
                Password
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

            <div>
              <label htmlFor="companyName" className="mb-1 block text-xs font-medium text-ink dark:text-ink-dark">
                Company name
              </label>
              <div className="relative">
                <Building2 size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted dark:text-ink-muted-dark" />
                <input
                  id="companyName"
                  type="text"
                  required
                  placeholder="Acme Inc."
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-canvas pr-3 pl-9 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark"
                />
              </div>
            </div>

            <div>
              <label htmlFor="jobTitle" className="mb-1 block text-xs font-medium text-ink dark:text-ink-dark">
                Your role at the company
              </label>
              <div className="relative">
                <Briefcase size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted dark:text-ink-muted-dark" />
                <input
                  id="jobTitle"
                  type="text"
                  required
                  placeholder="Founder / CEO"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-canvas pr-3 pl-9 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create account"}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-ink-muted dark:text-ink-muted-dark">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
