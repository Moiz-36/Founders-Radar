import { Mail } from "lucide-react";
import { Nav } from "@/components/Nav";
import { SignOutButton } from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-canvas-dim dark:bg-canvas-dark">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold text-ink dark:text-ink-dark">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted dark:text-ink-muted-dark">Account details.</p>

        <div className="mt-6 rounded-lg border border-border bg-canvas p-5 dark:border-border-dark dark:bg-surface-dark">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-bg text-brand dark:bg-info-bg-dark dark:text-info-dark">
              <Mail size={16} />
            </span>
            <div>
              <div className="text-xs font-medium text-ink-muted dark:text-ink-muted-dark">Email</div>
              <div className="text-sm text-ink dark:text-ink-dark">{user?.email}</div>
            </div>
          </div>

          <div className="mt-5 border-t border-border pt-5 dark:border-border-dark">
            <SignOutButton className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium text-ink transition hover:bg-hover dark:border-border-dark dark:text-ink-dark dark:hover:bg-hover-dark" />
          </div>
        </div>
      </main>
    </div>
  );
}
