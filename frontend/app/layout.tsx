import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Per DESIGN.md's typography spec: Plus Jakarta Sans for headings, Inter for body/data, and
// JetBrains Mono reserved for metrics/diffs/exact-change feeds.
const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-plus-jakarta" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains-mono" });

export const metadata = {
  title: "Founder's Radar",
  description: "Competitive intelligence reports",
};

// Applies the stored/system theme before first paint, so the redesigned pages (which use
// Tailwind's `dark:` variant via the .dark class — see globals.css) never flash the wrong
// theme on load. Plain inline <script> in <head>, not next/script: it must block render.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the theme-init script below deliberately adds/omits .dark on
    // this element before React hydrates (it must run pre-paint, from localStorage/system
    // preference the server can't know) — expected, one-element-deep mismatch, not a bug.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
