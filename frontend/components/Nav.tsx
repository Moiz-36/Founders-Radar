"use client";

import { Radar } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/NotificationBell";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

const LINKS = [
  { href: "/dashboard", label: "Tracked Companies" },
  { href: "/dashboard/custom", label: "Custom Widgets" },
  { href: "/notifications", label: "Notifications" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-20 border-b border-border bg-canvas/85 backdrop-blur dark:border-border-dark dark:bg-canvas-dark/85">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2 text-ink dark:text-ink-dark">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <Radar size={17} />
          </span>
          <span className="font-heading text-[15px] font-bold tracking-tight">Founder&apos;s Radar</span>
        </Link>

        <div className="flex flex-wrap items-center gap-1">
          {LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  isActive
                    ? "rounded-lg bg-info-bg px-3 py-1.5 text-sm font-medium text-brand dark:bg-info-bg-dark dark:text-info-dark"
                    : "rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-hover hover:text-ink dark:text-ink-muted-dark dark:hover:bg-hover-dark dark:hover:text-ink-dark"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
          <SignOutButton className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-hover hover:text-ink dark:text-ink-muted-dark dark:hover:bg-hover-dark dark:hover:text-ink-dark" />
        </div>
      </div>
    </nav>
  );
}
