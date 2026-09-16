import { Mail } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata = { title: "Contact — Founder's Radar" };

export default function ContactPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold text-ink dark:text-ink-dark">Contact</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted dark:text-ink-muted-dark">
          Questions, feedback, bug reports, or anything else — email works best. It&apos;s read and
          answered by the person who built this, not a support team.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          <Mail size={15} />
          {CONTACT_EMAIL}
        </a>
      </div>
    </MarketingShell>
  );
}
