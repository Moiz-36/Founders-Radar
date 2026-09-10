import Link from "next/link";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { Report, TargetCompany } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("target_companies")
    .select("*")
    .order("created_at", { ascending: false });

  const companyList = (companies ?? []) as TargetCompany[];
  const companyIds = companyList.map((c) => c.id);

  let reportsByCompany: Record<string, Report[]> = {};
  if (companyIds.length > 0) {
    const { data: reports } = await supabase
      .from("reports")
      .select("*")
      .in("target_company_id", companyIds)
      .order("created_at", { ascending: false });

    reportsByCompany = (reports ?? []).reduce((acc: Record<string, Report[]>, report) => {
      const key = report.target_company_id;
      acc[key] = acc[key] ? [...acc[key], report] : [report];
      return acc;
    }, {});
  }

  return (
    <>
      <Nav />
      <main className="page">
        <h1>Your companies</h1>
        <p className="page-subtitle">Track any company's competitors and get a weekly report.</p>

        <Link href="/company/new" className="btn" style={{ marginBottom: "1.5rem", display: "inline-block" }}>
          + Add a company
        </Link>

        {companyList.length === 0 ? (
          <div className="empty-state">
            You&apos;re not tracking any companies yet. Add your first one to get started.
          </div>
        ) : (
          companyList.map((company) => {
            const reports = reportsByCompany[company.id] ?? [];
            const latest = reports[0];
            return (
              <Link key={company.id} href={`/company/${company.id}`} className="list-item">
                <div>
                  <div className="list-item-title">{company.name}</div>
                  <div className="list-item-meta">
                    {reports.length} report{reports.length === 1 ? "" : "s"}
                    {latest ? ` — latest ${latest.week_start} to ${latest.week_end}` : ""}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </main>
    </>
  );
}
