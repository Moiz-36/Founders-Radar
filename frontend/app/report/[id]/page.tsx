import { notFound } from "next/navigation";
import { SignalCard } from "@/components/SignalCard";
import { supabase } from "@/lib/supabase";
import { Report, Signal } from "@/lib/types";

async function getReport(id: string): Promise<{ report: Report; signals: Signal[] } | null> {
  const { data: report } = await supabase.from("reports").select("*").eq("id", id).single();
  if (!report) return null;

  const { data: signals } = await supabase
    .from("signals")
    .select("*")
    .in("id", report.signal_ids ?? []);

  return { report, signals: signals ?? [] };
}

export default async function ReportPage({ params }: { params: { id: string } }) {
  const data = await getReport(params.id);
  if (!data) notFound();

  const { report, signals } = data;

  return (
    <main className="report">
      <h1 className="headline">{report.headline}</h1>
      <div className="subtitle">
        {report.week_start} to {report.week_end}
      </div>

      <div className="summary">{report.executive_summary}</div>

      {signals.map((signal) => (
        <SignalCard key={signal.id} signal={signal} />
      ))}
    </main>
  );
}
