"use client";

import Link from "next/link";
import { useState, type SubmitEvent } from "react";
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
      <main className="auth-page">
        <h1>Check your email</h1>
        <p>We sent a password reset link to {email}.</p>
        <Link href="/login" className="btn" style={{ marginTop: "1rem" }}>
          Back to login
        </Link>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <h1>Reset your password</h1>
      {error && <div className="form-error">{error}</div>}
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
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </button>
      </form>
      <p style={{ marginTop: "1.5rem", fontSize: "0.85rem" }}>
        <Link href="/login">Back to login</Link>
      </p>
    </main>
  );
}
