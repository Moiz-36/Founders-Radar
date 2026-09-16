import { MarketingShell } from "@/components/MarketingShell";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata = { title: "Security Disclosure — Founder's Radar" };

export default function SecurityDisclosurePage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold text-ink dark:text-ink-dark">
          Security disclosure
        </h1>
        <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-ink-muted dark:text-ink-muted-dark">
          <p>
            If you&apos;ve found a security vulnerability in Founder&apos;s Radar, please report it
            privately by emailing{" "}
            <a className="text-brand hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{" "}
            rather than filing a public issue. Include steps to reproduce and, if possible, the
            impact you&apos;d expect.
          </p>
          <p>
            This is a solo-maintained project without a bug bounty program, but reports are taken
            seriously and a genuine effort will be made to fix confirmed issues promptly and credit
            the reporter if they&apos;d like.
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
