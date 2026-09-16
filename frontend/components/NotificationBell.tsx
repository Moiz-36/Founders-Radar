"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchRecentSignalCount } from "@/lib/notifications";

export function NotificationBell() {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      fetchRecentSignalCount(supabase, user.id).then((n) => {
        if (!cancelled) setCount(n);
      });
    });

    return () => {
      cancelled = true;
    };
    // Re-check when navigating (e.g. back from /notifications) so the count reflects
    // whatever's changed, without needing a global "read" state we don't track.
  }, [pathname]);

  const isActive = pathname === "/notifications";

  return (
    <Link
      href="/notifications"
      aria-label={count ? `${count} recent signals` : "Notifications"}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition ${
        isActive
          ? "bg-info-bg text-brand dark:bg-info-bg-dark dark:text-info-dark"
          : "text-ink-muted hover:bg-hover dark:text-ink-muted-dark dark:hover:bg-hover-dark"
      }`}
    >
      <Bell size={17} />
      {!!count && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 font-mono text-[10px] font-bold text-white dark:bg-critical-dark dark:text-[#3c1f1d]">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
