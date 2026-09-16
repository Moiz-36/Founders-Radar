import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock,
  MessageSquareText,
  Newspaper,
  Sparkles,
  Star,
  Tag,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";

const FEATURES = [
  {
    icon: Tag,
    title: "Pricing & feature tracking",
    description:
      "Every pricing and feature page you point it at is checked on your schedule. When something changes, you get the diff, not just a hunch.",
  },
  {
    icon: Briefcase,
    title: "Hiring & community signals",
    description:
      "New job postings and buying-intent chatter (\"switching from X\", \"X alternative\") surface automatically — the signals founders usually catch by accident.",
  },
  {
    icon: Star,
    title: "Reviews & news monitoring",
    description:
      "G2/Capterra/Trustpilot activity and general news coverage roll into the same report, scored alongside everything else.",
  },
];

const ANALYST_CHECKLIST = [
  "Explains what changed in plain English, not a raw diff",
  "Scores every signal's priority automatically",
  "Always cites the exact source it came from",
  "Suggests a next step when one's obvious",
];

const STRIP_ITEMS = [
  { icon: Zap, label: "Autonomous", description: "Runs on Cloud Scheduler — no manual checks." },
  { icon: Target, label: "High-signal", description: "LLM-filtered, not a raw keyword match." },
  { icon: Sparkles, label: "Founder-ready", description: "Short, plain-English, no jargon." },
  { icon: Clock, label: "Scheduled tracking", description: "Daily to monthly, set per company." },
];

function HeroPreviewPanel() {
  return (
    <div className="mx-auto mt-12 w-full max-w-3xl">
      <div className="overflow-hidden rounded-xl border border-border bg-canvas shadow-[0_8px_24px_-4px_rgba(60,64,67,0.16)] dark:border-border-dark dark:bg-surface-dark">
        <div className="flex items-center justify-between border-b border-border px-5 py-3 dark:border-border-dark">
          <span className="text-sm font-medium text-ink dark:text-ink-dark">
            Northwind Compliance — Competitive Radar
          </span>
          <span className="rounded-full bg-positive-bg px-2 py-0.5 text-[11px] font-semibold text-positive dark:bg-positive-bg-dark dark:text-positive-dark">
            3 new signals
          </span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border dark:divide-border-dark dark:border-border-dark">
          {[
            { label: "Competitors tracked", value: "4" },
            { label: "Sources monitored", value: "16" },
            { label: "Signals this week", value: "7" },
          ].map((stat) => (
            <div key={stat.label} className="px-5 py-4">
              <div className="font-heading text-xl font-semibold text-ink dark:text-ink-dark">{stat.value}</div>
              <div className="mt-0.5 text-xs text-ink-muted dark:text-ink-muted-dark">{stat.label}</div>
            </div>
          ))}
        </div>
        <div className="divide-y divide-border dark:divide-border-dark">
          {[
            {
              name: "Vertex Security",
              type: "Pricing",
              tone: "critical" as const,
              text: "Added a new \"Team\" tier at $89/seat/mo — undercuts your Growth plan.",
            },
            {
              name: "Beacon GRC",
              type: "Hiring",
              tone: "warning" as const,
              text: "Posted 3 new sales roles in EU markets — expansion signal.",
            },
            {
              name: "Vertex Security",
              type: "Review",
              tone: "positive" as const,
              text: "G2 rating dropped from 4.6 to 4.3 after a support-complaint wave.",
            },
          ].map((row, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-3.5">
              <span
                className={
                  row.tone === "critical"
                    ? "mt-1 h-2 w-2 shrink-0 rounded-full bg-critical dark:bg-critical-dark"
                    : row.tone === "warning"
                      ? "mt-1 h-2 w-2 shrink-0 rounded-full bg-warning dark:bg-warning-dark"
                      : "mt-1 h-2 w-2 shrink-0 rounded-full bg-positive dark:bg-positive-dark"
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink dark:text-ink-dark">{row.name}</span>
                  <span className="rounded bg-canvas-dim px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink-muted uppercase dark:bg-hover-dark dark:text-ink-muted-dark">
                    {row.type}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-ink-muted dark:text-ink-muted-dark">{row.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-ink-muted dark:text-ink-muted-dark">
        Illustrative preview — not real company data.
      </p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="px-4 pt-16 pb-8 sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas-dim px-3 py-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:border-border-dark dark:bg-surface-dark dark:text-ink-muted-dark">
            Automated competitor tracking
          </span>
          <h1 className="mt-5 font-heading text-4xl leading-tight font-semibold text-ink sm:text-5xl dark:text-ink-dark">
            The command dashboard for focused founders.
          </h1>
          <p className="mt-4 text-lg text-ink-muted dark:text-ink-muted-dark">
            Tell it who you compete with — or let it find them — and get a plain-English report of
            what actually changed: pricing, features, hiring, reviews, and news.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="flex h-10 items-center gap-1.5 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-hover"
            >
              Get started
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/login"
              className="flex h-10 items-center rounded-lg border border-border px-5 text-sm font-medium text-ink transition hover:bg-hover dark:border-border-dark dark:text-ink-dark dark:hover:bg-hover-dark"
            >
              Sign in
            </Link>
          </div>
        </div>
        <HeroPreviewPanel />
      </section>

      {/* Feature architecture */}
      <section className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-2xl font-semibold text-ink sm:text-3xl dark:text-ink-dark">
              Operating rhythm, simplified.
            </h2>
            <p className="mt-3 text-ink-muted dark:text-ink-muted-dark">
              The architecture of a focused competitive-intelligence workflow — no manual tab-checking.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-border bg-canvas p-6 dark:border-border-dark dark:bg-surface-dark"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-bg text-brand dark:bg-info-bg-dark dark:text-info-dark">
                  <feature.icon size={17} />
                </span>
                <h3 className="mt-4 font-heading text-base font-semibold text-ink dark:text-ink-dark">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-ink-muted dark:text-ink-muted-dark">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Turn signals into focus */}
      <section className="border-t border-border bg-canvas-dim px-4 py-20 sm:px-6 dark:border-border-dark dark:bg-surface-dark">
        <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-heading text-2xl font-semibold text-ink sm:text-3xl dark:text-ink-dark">
              Turn signals into focus.
            </h2>
            <p className="mt-3 text-ink-muted dark:text-ink-muted-dark">
              A raw page diff isn&apos;t a report. An LLM reads every change and writes it up the way
              you&apos;d want a sharp analyst to:
            </p>
            <ul className="mt-5 space-y-2.5">
              {ANALYST_CHECKLIST.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-ink dark:text-ink-dark">
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-positive dark:text-positive-dark" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-canvas p-5 dark:border-border-dark dark:bg-canvas-dark">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-critical-bg px-2 py-0.5 text-[11px] font-semibold text-critical dark:bg-critical-bg-dark dark:text-critical-dark">
                High priority
              </span>
              <span className="text-xs text-ink-muted dark:text-ink-muted-dark">Vertex Security — Pricing</span>
            </div>
            <p className="mt-3 text-sm font-medium text-ink dark:text-ink-dark">
              What changed: added a $89/seat/mo &quot;Team&quot; tier between Starter and Enterprise.
            </p>
            <p className="mt-2 text-sm text-ink-muted dark:text-ink-muted-dark">
              Why it matters: directly undercuts your Growth plan for 10–50 seat buyers, your
              highest-volume segment.
            </p>
            <p className="mt-2 border-t border-border pt-2 text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
              Suggested response: revisit Growth-tier pricing for that seat range before your next
              renewal cycle.
            </p>
          </div>
        </div>
      </section>

      {/* Guide every decision */}
      <section className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-2xl font-semibold text-ink sm:text-3xl dark:text-ink-dark">
              Guide every decision forward.
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-lg border border-border bg-canvas p-6 dark:border-border-dark dark:bg-surface-dark">
              <div className="flex items-center gap-2 text-ink-muted dark:text-ink-muted-dark">
                <MessageSquareText size={16} />
                <span className="text-xs font-semibold tracking-wide uppercase">Weekly report</span>
              </div>
              <p className="mt-3 text-sm font-medium text-ink dark:text-ink-dark">
                Executive summary, up top, every time.
              </p>
              <p className="mt-2 text-sm text-ink-muted dark:text-ink-muted-dark">
                Each report opens with a short synthesis of the week across every tracked
                competitor, then breaks down into individual signal cards — each with its own
                source link and raw diff you can expand and verify yourself.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-canvas p-6 dark:border-border-dark dark:bg-surface-dark">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-bg text-brand dark:bg-info-bg-dark dark:text-info-dark">
                <TrendingUp size={17} />
              </span>
              <p className="mt-4 text-sm font-medium text-ink dark:text-ink-dark">
                Runs on your schedule, not a fixed one.
              </p>
              <p className="mt-2 text-sm text-ink-muted dark:text-ink-muted-dark">
                Set each company&apos;s report interval anywhere from daily to monthly — and build
                custom dashboard widgets for anything you want to watch continuously between reports.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Strip */}
      <section className="border-t border-border px-4 py-14 sm:px-6 dark:border-border-dark">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 sm:grid-cols-4">
          {STRIP_ITEMS.map((item) => (
            <div key={item.label}>
              <item.icon size={18} className="text-brand dark:text-info-dark" />
              <h3 className="mt-2.5 font-heading text-sm font-semibold text-ink dark:text-ink-dark">
                {item.label}
              </h3>
              <p className="mt-1 text-xs text-ink-muted dark:text-ink-muted-dark">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why this exists */}
      <section className="border-t border-border bg-canvas-dim px-4 py-20 sm:px-6 dark:border-border-dark dark:bg-surface-dark">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-2xl font-semibold text-ink sm:text-3xl dark:text-ink-dark">
              Built to catch what founders track by hand.
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-canvas p-6 dark:border-border-dark dark:bg-canvas-dark">
              <Newspaper size={17} className="text-ink-muted dark:text-ink-muted-dark" />
              <p className="mt-3 text-sm text-ink dark:text-ink-dark">
                Most founders check a handful of competitor pricing pages and job boards by hand,
                on no particular schedule, and usually only remember to when something reminds
                them. That&apos;s the exact gap this fills — the checking, not the judgment.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-canvas p-6 dark:border-border-dark dark:bg-canvas-dark">
              <Sparkles size={17} className="text-ink-muted dark:text-ink-muted-dark" />
              <p className="mt-3 text-sm text-ink dark:text-ink-dark">
                Built and maintained by one person, starting as a report sent directly to a real
                startup founder as a demo. See{" "}
                <Link href="/about" className="text-brand hover:underline">
                  About
                </Link>{" "}
                for the full story.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 py-24 text-center sm:px-6">
        <h2 className="font-heading text-3xl font-semibold text-ink sm:text-4xl dark:text-ink-dark">
          Built for clarity. Ready today.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-ink-muted dark:text-ink-muted-dark">
          Add your first competitor and get your first report on your own schedule.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="flex h-10 items-center gap-1.5 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-hover"
          >
            Get started
            <ArrowRight size={15} />
          </Link>
          <Link
            href="/login"
            className="flex h-10 items-center rounded-lg border border-border px-5 text-sm font-medium text-ink transition hover:bg-hover dark:border-border-dark dark:text-ink-dark dark:hover:bg-hover-dark"
          >
            Sign in
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
