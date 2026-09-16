import { MarketingShell } from "@/components/MarketingShell";

export const metadata = { title: "Security — Founder's Radar" };

export default function SecurityPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold text-ink dark:text-ink-dark">Security</h1>
        <p className="mt-3 text-sm text-ink-muted dark:text-ink-muted-dark">
          An honest account of current practices — not a formal certification.
        </p>
        <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-ink-muted dark:text-ink-muted-dark">
          <p>
            Founder&apos;s Radar is a solo-built project. It has not gone through a formal third-party
            security audit or certification (SOC 2, ISO 27001, or similar) — treat that as a gap,
            not a claim otherwise. Here&apos;s what is in place:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium text-ink dark:text-ink-dark">Row-level data isolation.</span>{" "}
              Every tracked company, competitor, source, snapshot, report, and dashboard widget is
              scoped to its owning account via Postgres row-level security — one user&apos;s data isn&apos;t
              readable by another&apos;s, except where a report is explicitly made public or shared.
            </li>
            <li>
              <span className="font-medium text-ink dark:text-ink-dark">Authentication.</span> Sign-in
              is handled by Supabase Auth (Google/GitHub OAuth or email + password) — passwords are
              never stored or seen by Founder&apos;s Radar&apos;s own code.
            </li>
            <li>
              <span className="font-medium text-ink dark:text-ink-dark">Encryption in transit.</span>{" "}
              All traffic to the app and its API runs over HTTPS/TLS.
            </li>
            <li>
              <span className="font-medium text-ink dark:text-ink-dark">No ad trackers.</span> No
              third-party advertising or analytics trackers are loaded on this site — see{" "}
              <a className="text-brand hover:underline" href="/cookies">
                Cookie Preferences
              </a>
              .
            </li>
          </ul>
          <p>
            Found a problem? See{" "}
            <a className="text-brand hover:underline" href="/security-disclosure">
              Security Disclosure
            </a>{" "}
            for how to report it.
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
