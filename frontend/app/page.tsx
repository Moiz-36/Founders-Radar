import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="hero">
      <h1>Founder&apos;s Radar</h1>
      <p>
        Weekly competitive intelligence reports, automatically. Tell us who you compete
        with — or let us find them — and get a report of what actually changed: pricing,
        features, hiring, and news.
      </p>
      <Link href="/signup" className="btn">
        Get started
      </Link>{" "}
      <Link href="/login" className="btn btn-secondary">
        Log in
      </Link>
    </main>
  );
}
