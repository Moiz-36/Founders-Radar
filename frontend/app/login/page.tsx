"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type SubmitEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    router.push(searchParams.get("next") || "/dashboard");
    router.refresh();
  }

  async function handleOAuthSignIn(provider: "google" | "github") {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="auth-page">
      <h1>Log in</h1>
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p style={{ marginTop: "1.5rem", fontSize: "0.85rem" }}>
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
      <p style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
        No account? <Link href="/signup">Sign up</Link>
      </p>
    </main>
  );
}
