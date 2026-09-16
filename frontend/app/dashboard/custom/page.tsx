import Link from "next/link";
import { DashboardBuilder } from "@/components/DashboardBuilder";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { DashboardWidget, TargetCompany } from "@/lib/types";

export default async function CustomDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: companies } = await supabase
    .from("target_companies")
    .select("id,name")
    .order("name");

  const companyList = (companies ?? []) as Pick<TargetCompany, "id" | "name">[];
  const companyIds = companyList.map((c) => c.id);

  let competitorsByCompany: Record<string, { id: string; name: string; is_self: boolean }[]> = {};
  if (companyIds.length > 0) {
    const { data: competitors } = await supabase
      .from("competitors")
      .select("id,name,is_self,target_company_id")
      .in("target_company_id", companyIds)
      .order("is_self", { ascending: false })
      .order("name");

    competitorsByCompany = (competitors ?? []).reduce(
      (
        acc: Record<string, { id: string; name: string; is_self: boolean }[]>,
        c: { id: string; name: string; is_self: boolean; target_company_id: string }
      ) => {
        const entry = { id: c.id, name: c.name, is_self: c.is_self };
        acc[c.target_company_id] = acc[c.target_company_id] ? [...acc[c.target_company_id], entry] : [entry];
        return acc;
      },
      {}
    );
  }

  const { data: widgets } = await supabase
    .from("dashboard_widgets")
    .select("*")
    .order("position", { ascending: true });

  return (
    <div className="min-h-screen bg-canvas-dim dark:bg-canvas-dark">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold text-ink dark:text-ink-dark">Custom Widgets</h1>
        <p className="mt-1 text-sm text-ink-muted dark:text-ink-muted-dark">
          Mix and match feeds and charts from any company you track — drag a widget&apos;s handle to reorder it.
        </p>

        {companyList.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center text-sm text-ink-muted dark:border-border-dark dark:text-ink-muted-dark">
            You need at least one tracked company before you can build a dashboard.{" "}
            <Link href="/company/new" className="font-medium text-brand hover:text-brand-hover">
              Add one first
            </Link>
            .
          </div>
        ) : (
          <div className="mt-6">
            <DashboardBuilder
              ownerId={user?.id ?? ""}
              companies={companyList}
              competitorsByCompany={competitorsByCompany}
              initialWidgets={(widgets ?? []) as DashboardWidget[]}
            />
          </div>
        )}
      </main>
    </div>
  );
}
