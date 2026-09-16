import { MarketingShell } from "@/components/MarketingShell";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata = { title: "Privacy Policy — Founder's Radar" };

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold text-ink dark:text-ink-dark">Privacy Policy</h1>
        <p className="mt-2 text-xs text-ink-muted dark:text-ink-muted-dark">Last updated 2026-09-15.</p>
        <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-ink-muted dark:text-ink-muted-dark">
          <section>
            <h2 className="font-heading text-base font-semibold text-ink dark:text-ink-dark">What&apos;s collected</h2>
            <p className="mt-2">
              Your email, and if you sign up with email/password, the company name and job title
              you provide. If you sign in with Google or GitHub, only the basic profile info those
              providers share (name, email, avatar) is used. Beyond that, the app stores whatever
              you enter to use it: the companies and competitors you track, the source URLs you
              add, the reports and signals generated from them, chat messages you send the Q&amp;A
              assistant, and dashboard widgets you build.
            </p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-ink dark:text-ink-dark">Where it&apos;s stored, and who else sees it</h2>
            <p className="mt-2">
              Data is stored in a Supabase-hosted Postgres database and Supabase Storage (for
              generated PDF reports). Two other third parties process data as part of the pipeline:
              Groq (runs the LLM that analyzes page changes and answers chat questions) and Tavily
              (web search used during competitor/source discovery). Neither receives your account
              email or password — they see the competitor names, URLs, and page content involved
              in generating your reports. No data is sold, and nothing is shared for advertising.
            </p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-ink dark:text-ink-dark">Report sharing</h2>
            <p className="mt-2">
              Reports are private by default. If you mark a report public or invite someone by
              email, that report becomes visible to whoever you shared it with — this is
              intentional and under your control on the report page.
            </p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-ink dark:text-ink-dark">Cookies</h2>
            <p className="mt-2">
              See the{" "}
              <a className="text-brand hover:underline" href="/cookies">
                Cookie Preferences
              </a>{" "}
              page — only an essential sign-in session cookie is used.
            </p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-ink dark:text-ink-dark">Deleting your data</h2>
            <p className="mt-2">
              You can delete a tracked company (and everything under it — competitors, sources,
              reports, signals) at any time from its dashboard card or detail page. To delete your
              account entirely, email{" "}
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
