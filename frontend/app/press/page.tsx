import { MarketingShell } from "@/components/MarketingShell";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata = { title: "Press Kit — Founder's Radar" };

export default function PressPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold text-ink dark:text-ink-dark">Press kit</h1>
        <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-ink-muted dark:text-ink-muted-dark">
          <p>
            Founder&apos;s Radar is a solo-built competitive-intelligence tool for startup founders:
            it tracks competitors&apos; pricing, features, hiring, reviews, and news, and turns what
            changes into a short, plain-English report.
          </p>
          <div>
            <h2 className="font-heading text-base font-semibold text-ink dark:text-ink-dark">Quick facts</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Independent, single-founder project — not a funded company.</li>
              <li>Tracks pricing, feature, hiring, review, community, and news signals.</li>
              <li>Reports are generated automatically on a per-company schedule.</li>
            </ul>
          </div>
          <p>
            There&apos;s no formal media kit (logo files, screenshots, etc.) assembled yet. For press
            inquiries or to request assets, email{" "}
            <a className="text-brand hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
