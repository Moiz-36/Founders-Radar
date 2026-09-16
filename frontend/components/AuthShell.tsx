import { Radar } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

// Shared header/footer chrome for every signed-out auth page (login, signup, forgot/reset
// password) — same card-on-dim-canvas layout, just different card contents per page.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas-dim dark:bg-canvas-dark">
      <header className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 text-ink dark:text-ink-dark">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <Radar size={17} />
          </span>
          <span className="font-heading text-[15px] font-bold tracking-tight">Founder&apos;s Radar</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">{children}</main>

      <footer className="px-5 py-4 text-center text-xs text-ink-muted dark:text-ink-muted-dark">
        © {new Date().getFullYear()} Founder&apos;s Radar
      </footer>
    </div>
  );
}
