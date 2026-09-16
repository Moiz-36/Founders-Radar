import { MarketingShell } from "@/components/MarketingShell";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata = { title: "Careers — Founder's Radar" };

export default function CareersPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold text-ink dark:text-ink-dark">Careers</h1>
        <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-ink-muted dark:text-ink-muted-dark">
          <p>
            Founder&apos;s Radar is a solo-built project — there&apos;s no team and no open roles right
            now.
          </p>
          <p>
            If that changes, this page will say so. In the meantime, if you&apos;re interested in
            collaborating or have relevant experience you&apos;d want considered down the line, feel
            free to{" "}
            <a className="text-brand hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              reach out
            </a>
            .
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
