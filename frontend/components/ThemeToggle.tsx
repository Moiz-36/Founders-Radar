"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  // layout.tsx's inline script already set the .dark class before paint (see globals.css) —
  // this just syncs this component's own state to match on mount.
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private browsing / blocked storage — theme just won't persist across reloads.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-hover dark:text-ink-muted-dark dark:hover:bg-hover-dark"
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
