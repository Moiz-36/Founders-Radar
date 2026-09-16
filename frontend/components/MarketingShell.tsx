import { Footer } from "@/components/Footer";
import { MarketingNav } from "@/components/MarketingNav";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas dark:bg-canvas-dark">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
