"use client";

import { Radar } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-canvas/85 backdrop-blur dark:border-border-dark dark:bg-canvas-dark/85">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-ink dark:text-ink-dark">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <Radar size={17} />
          </span>
          <span className="font-heading text-[15px] font-bold tracking-tight">Founder&apos;s Radar</span>
        </Link>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link
            href="/login"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-hover hover:text-ink dark:text-ink-muted-dark dark:hover:bg-hover-dark dark:hover:text-ink-dark"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
