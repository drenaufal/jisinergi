import type { Metadata } from "next";
import { loadUnitPage } from "@/lib/finance/access";
import { LigaSummary } from "./liga-summary";
import { SchoolSummary } from "./school-summary";

export const metadata: Metadata = { title: "Ringkasan unit" };
export const dynamic = "force-dynamic";

/** The unit's summary. What it shows depends on the unit's type. */
export default async function UnitSummaryPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { unit } = await loadUnitPage(code);
  return unit.type === "liga" ? <LigaSummary unit={unit} /> : <SchoolSummary unit={unit} />;
}
