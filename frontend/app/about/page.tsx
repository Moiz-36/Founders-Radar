import { Mail } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { CONTACT_EMAIL, FOUNDER_GITHUB, FOUNDER_LINKEDIN } from "@/lib/contact";

export const metadata = { title: "About — Founder's Radar" };

// lucide-react dropped its brand icons (GitHub/LinkedIn/etc.) — same inline-SVG approach as
// GoogleIcon/GitHubIcon in app/login/page.tsx.
function GitHubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-1.94c-3.2.7-3.87-1.54-3.87-1.54-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.13v3.16c0 .31.21.66.79.55A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.45-2.14 2.94v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z" />
    </svg>
  );
}

export default function AboutPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold text-ink dark:text-ink-dark">About</h1>
        <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-ink-muted dark:text-ink-muted-dark">
          <p>
            Founder&apos;s Radar is a competitive-intelligence tool for startup founders. Tell it who
            you compete with — or let it search and suggest competitors for you — and it watches
            their pricing pages, feature pages, job postings, reviews, and public chatter for
            changes, then turns what it finds into a short, plain-English report: what changed,
            why it probably matters, and what to do about it.
          </p>
          <p>
            It&apos;s built and maintained by one person, not a company. It started as a single report
            sent to a real startup founder as a demo, then grew into the multi-tenant product you
            can sign up for today. There&apos;s no funding, no team, and no roadmap beyond what
            actually gets built — see the <a className="text-brand hover:underline" href="/careers">Careers</a> page
            for what that means in practice.
          </p>
          <p>
            The pipeline itself is straightforward: scheduled scrapers detect page/content changes,
            an LLM reads the diff and writes a short analysis, a scoring pass ranks it by priority,
            and everything lands in a per-company dashboard and report — web and PDF.
          </p>
        </div>

        <div className="mt-10 border-t border-border pt-8 dark:border-border-dark">
          <h2 className="font-heading text-base font-semibold text-ink dark:text-ink-dark">The founder</h2>
          <p className="mt-2 text-sm text-ink-muted dark:text-ink-muted-dark">
            Built by Moiz Mansoor. Say hi, check the code, or connect:
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <a
              href={FOUNDER_LINKEDIN}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-canvas px-4 text-sm font-medium text-ink transition hover:bg-hover dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-hover-dark"
            >
              <LinkedInIcon />
              LinkedIn
            </a>
            <a
              href={FOUNDER_GITHUB}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-canvas px-4 text-sm font-medium text-ink transition hover:bg-hover dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-hover-dark"
            >
              <GitHubIcon />
              GitHub
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-canvas px-4 text-sm font-medium text-ink transition hover:bg-hover dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:hover:bg-hover-dark"
            >
              <Mail size={15} />
              Email
            </a>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
