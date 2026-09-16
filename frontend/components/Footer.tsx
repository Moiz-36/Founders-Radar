import { Radar } from "lucide-react";
import Link from "next/link";

// "Platform"/"Resources" describe the product's actual capabilities but don't have their own
// public pages — there's nothing to show a signed-out visitor beyond what login does, so they
// route straight to /login rather than to placeholder pages.
const PLATFORM_LINKS = [
  { label: "Pricing & feature tracking", href: "/login" },
  { label: "Hiring signals", href: "/login" },
  { label: "Review & community monitoring", href: "/login" },
  { label: "Custom dashboards", href: "/login" },
];

const RESOURCES_LINKS = [
  { label: "How it works", href: "/login" },
  { label: "Report samples", href: "/login" },
  { label: "Changelog", href: "/login" },
];

const COMPANY_LINKS = [
  { label: "About", href: "/about" },
  { label: "Careers", href: "/careers" },
  { label: "Press kit", href: "/press" },
  { label: "Security", href: "/security" },
  { label: "Contact", href: "/contact" },
];

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Security Disclosure", href: "/security-disclosure" },
  { label: "Cookie Preferences", href: "/cookies" },
];

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase dark:text-ink-muted-dark">
        {title}
      </h3>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-sm text-ink-muted transition hover:text-ink dark:text-ink-muted-dark dark:hover:text-ink-dark"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-canvas dark:border-border-dark dark:bg-canvas-dark">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2 text-ink dark:text-ink-dark">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
                <Radar size={17} />
              </span>
              <span className="font-heading text-[15px] font-bold tracking-tight">Founder&apos;s Radar</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-ink-muted dark:text-ink-muted-dark">
              Automated competitor tracking for startup founders — pricing, features, hiring, reviews,
              and news, turned into a plain-English report.
            </p>
          </div>

          <FooterColumn title="Platform" links={PLATFORM_LINKS} />
          <FooterColumn title="Resources" links={RESOURCES_LINKS} />
          <FooterColumn title="Company" links={COMPANY_LINKS} />
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-border-dark">
          <p className="text-xs text-ink-muted dark:text-ink-muted-dark">
            © {new Date().getFullYear()} Founder&apos;s Radar. Built by one person, not a company.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-xs text-ink-muted transition hover:text-ink dark:text-ink-muted-dark dark:hover:text-ink-dark"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
