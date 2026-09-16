import { MarketingShell } from "@/components/MarketingShell";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata = { title: "Terms of Service — Founder's Radar" };

export default function TermsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold text-ink dark:text-ink-dark">Terms of Service</h1>
        <p className="mt-2 text-xs text-ink-muted dark:text-ink-muted-dark">Last updated 2026-09-15.</p>
        <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-ink-muted dark:text-ink-muted-dark">
          <section>
            <h2 className="font-heading text-base font-semibold text-ink dark:text-ink-dark">The short version</h2>
            <p className="mt-2">
              This is a solo-maintained product provided as-is, with no uptime guarantee and no
              warranty. Use your own judgment before acting on anything a report or the chat
              assistant tells you — the analysis is LLM-generated from public page content and can
              be wrong or incomplete.
            </p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-ink dark:text-ink-dark">Acceptable use</h2>
            <p className="mt-2">
              Only add source URLs you have a legitimate reason to monitor (your own competitors,
              your own company). Don&apos;t use this to scrape or monitor sites you don&apos;t have the
              right to, and don&apos;t use the service to violate another site&apos;s terms of service on
              your behalf.
            </p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-ink dark:text-ink-dark">Changes</h2>
            <p className="mt-2">
              Features can be added, changed, or removed at any time — this is an actively
              developed, single-maintainer project, not a product with a contractual SLA.
            </p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-ink dark:text-ink-dark">Contact</h2>
            <p className="mt-2">
              Questions about these terms:{" "}
              <a className="text-brand hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </MarketingShell>
  );
}
