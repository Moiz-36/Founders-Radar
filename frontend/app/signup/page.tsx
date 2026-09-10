"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
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
      <main className="auth-page">
        <h1>Check your email</h1>
        <p>We sent a confirmation link to {email}. Click it, then log in.</p>
        <Link href="/login" className="btn" style={{ marginTop: "1rem" }}>
          Go to login
        </Link>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <h1>Sign up</h1>
      {error && <div className="form-error">{error}</div>}
      <button type="button" className="btn" onClick={() => handleOAuthSignIn("google")}>
        Continue with Google
      </button>
      <button
        type="button"
        className="btn"
        style={{ marginTop: "0.5rem" }}
        onClick={() => handleOAuthSignIn("github")}
      >
        Continue with GitHub
      </button>
      <p style={{ margin: "1rem 0", fontSize: "0.85rem", textAlign: "center" }}>or</p>
      <form onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="input"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="input"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="field-label" htmlFor="companyName">
          Company name
        </label>
        <input
          id="companyName"
          className="input"
          type="text"
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
        <label className="field-label" htmlFor="jobTitle">
          Your role at the company
        </label>
        <input
          id="jobTitle"
          className="input"
          type="text"
          required
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
        />
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Signing up..." : "Sign up"}
        </button>
      </form>
      <p style={{ marginTop: "1.5rem", fontSize: "0.85rem" }}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
