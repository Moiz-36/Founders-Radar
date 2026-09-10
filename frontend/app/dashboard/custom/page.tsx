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

  let competitorsByCompany: Record<string, { id: string; name: string }[]> = {};
  if (companyIds.length > 0) {
    const { data: competitors } = await supabase
      .from("competitors")
      .select("id,name,target_company_id")
      .in("target_company_id", companyIds)
      .order("name");

    competitorsByCompany = (competitors ?? []).reduce(
      (acc: Record<string, { id: string; name: string }[]>, c: { id: string; name: string; target_company_id: string }) => {
        acc[c.target_company_id] = acc[c.target_company_id]
          ? [...acc[c.target_company_id], { id: c.id, name: c.name }]
          : [{ id: c.id, name: c.name }];
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
    <>
      <Nav />
      <main className="page" style={{ maxWidth: "1080px" }}>
        <h1>My Dashboard</h1>
        <p className="page-subtitle">
          Mix and match feeds and charts from any company you track — drag a widget's handle to
          reorder it.
        </p>

        {companyList.length === 0 ? (
          <div className="empty-state">
            You need at least one tracked company before you can build a dashboard.{" "}
            <Link href="/company/new">Add one first</Link>.
          </div>
        ) : (
          <DashboardBuilder
            ownerId={user?.id ?? ""}
            companies={companyList}
            competitorsByCompany={competitorsByCompany}
            initialWidgets={(widgets ?? []) as DashboardWidget[]}
          />
        )}
      </main>
    </>
  );
}
