import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

export function Nav() {
  return (
    <nav className="nav">
      <Link href="/dashboard" className="nav-brand">
        Founder&apos;s Radar
      </Link>
      <div className="nav-links">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/dashboard/custom">My Dashboard</Link>
        <Link href="/settings">Settings</Link>
        <SignOutButton />
      </div>
    </nav>
  );
}
