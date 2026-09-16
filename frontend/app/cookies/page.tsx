import { MarketingShell } from "@/components/MarketingShell";

export const metadata = { title: "Cookie Preferences — Founder's Radar" };

export default function CookiesPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold text-ink dark:text-ink-dark">Cookie Preferences</h1>
        <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-ink-muted dark:text-ink-muted-dark">
          <p>
            There&apos;s no preference toggle here because there&apos;s nothing optional to turn off —
            this site doesn&apos;t load any advertising, analytics, or third-party tracking cookies.
          </p>
          <p>
            The only cookie in use is an essential one set by Supabase Auth to keep you signed in.
            It&apos;s required for the app to work and isn&apos;t used for tracking. Your light/dark theme
            choice is stored in your browser&apos;s local storage, not a cookie, and never leaves your
            device.
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
