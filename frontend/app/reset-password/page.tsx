"use client";

import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { createClient } from "@/lib/supabase/client";

// Reached via the link emailed by resetPasswordForEmail() — the Supabase JS client
// auto-detects the recovery token in the URL and establishes a session before this
// form is submitted, so updateUser() here just needs the new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
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
    <main className="auth-page">
      <h1>Set a new password</h1>
      {error && <div className="form-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="password">
          New password
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
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save new password"}
        </button>
      </form>
    </main>
  );
}
