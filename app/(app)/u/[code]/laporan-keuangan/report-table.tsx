"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { FoldChevron } from "@/components/finance/collapse";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/client";
import type { LedgerRow } from "@/lib/finance/calc";

type MonthGroup = {
  monthKey: string;
  monthLabel: string;
  rows: LedgerRow[];
  totalIn: number;
  totalOut: number;
};

type YearGroup = {
  yearKey: string;
  yearLabel: string;
  months: MonthGroup[];
  totalIn: number;
  totalOut: number;
  rowCount: number;
};

export function ReportTable({
  rows,
  totalIn,
  totalOut,
}: {
  rows: LedgerRow[];
  totalIn: number;
  totalOut: number;
}) {
  const { fmt } = useI18n();

  const day = (iso: string) => fmt.date(iso, { day: "2-digit", month: "short", year: "numeric" });
  const month = (m: string) => fmt.date(`${m}-01`, { month: "short", year: "numeric" });
  const amount = (n: number) => (n ? fmt.number(n) : "");

  const yearGroups = useMemo<YearGroup[]>(() => {
    const yearsMap = new Map<string, Map<string, LedgerRow[]>>();

    for (const r of rows) {
      const year = r.date.slice(0, 4);
      const m = r.date.slice(0, 7);

      let monthsMap = yearsMap.get(year);
      if (!monthsMap) {
        monthsMap = new Map<string, LedgerRow[]>();
        yearsMap.set(year, monthsMap);
      }

      let mRows = monthsMap.get(m);
      if (!mRows) {
        mRows = [];
        monthsMap.set(m, mRows);
      }

      mRows.push(r);
    }

    // Chronological order: ascending (oldest year to newest, Jan to Dec)
    const sortedYears = [...yearsMap.keys()].sort((a, b) => a.localeCompare(b));

    return sortedYears.map((yearKey) => {
      const monthsMap = yearsMap.get(yearKey)!;
      const sortedMonths = [...monthsMap.keys()].sort((a, b) => a.localeCompare(b));

      let yearTotalIn = 0;
      let yearTotalOut = 0;
      let yearRowCount = 0;

      const months: MonthGroup[] = sortedMonths.map((monthKey) => {
        const mRows = monthsMap.get(monthKey)!;
        let monthTotalIn = 0;
        let monthTotalOut = 0;
        for (const r of mRows) {
          monthTotalIn += r.cashIn;
          monthTotalOut += r.cashOut;
        }
        yearTotalIn += monthTotalIn;
        yearTotalOut += monthTotalOut;
        yearRowCount += mRows.length;

        return {
          monthKey,
          monthLabel: fmt.date(`${monthKey}-01`, { month: "long", year: "numeric" }),
          rows: mRows,
          totalIn: monthTotalIn,
          totalOut: monthTotalOut,
        };
      });

      return {
        yearKey,
        yearLabel: `Tahun ${yearKey}`,
        months,
        totalIn: yearTotalIn,
        totalOut: yearTotalOut,
        rowCount: yearRowCount,
      };
    });
  }, [rows, fmt]);

  // All years & months collapsed by default as requested
  const [openYears, setOpenYears] = useState<Set<string>>(() => new Set());
  const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set());

  const toggleYear = (yearKey: string) => {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(yearKey)) {
        next.delete(yearKey);
      } else {
        next.add(yearKey);
      }
      return next;
    });
  };

  const toggleMonth = (monthKey: string) => {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };

  const allYearKeys = useMemo(() => yearGroups.map((y) => y.yearKey), [yearGroups]);
  const allMonthKeys = useMemo(() => yearGroups.flatMap((y) => y.months.map((m) => m.monthKey)), [yearGroups]);

  const isAllOpen =
    allYearKeys.length > 0 &&
    allYearKeys.every((k) => openYears.has(k)) &&
    allMonthKeys.every((k) => openMonths.has(k));
  const isAllClosed = openYears.size === 0 && openMonths.size === 0;

  const openAll = () => {
    setOpenYears(new Set(allYearKeys));
    setOpenMonths(new Set(allMonthKeys));
  };

  const closeAll = () => {
    setOpenYears(new Set());
    setOpenMonths(new Set());
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAll}
            disabled={isAllOpen}
            className="inline-flex h-8 items-center gap-1.5 border border-ink bg-white px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-black hover:text-white disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronsUpDown className="size-3.5" /> Buka semua
          </button>
          <button
            type="button"
            onClick={closeAll}
            disabled={isAllClosed}
            className="inline-flex h-8 items-center gap-1.5 border border-ink bg-white px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-black hover:text-white disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronsDownUp className="size-3.5" /> Ciutkan semua
          </button>
        </div>
        <span className="text-[11px] text-ink-muted">
          {yearGroups.length} tahun · {allMonthKeys.length} bulan · {rows.length} transaksi
        </span>
      </div>

      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH className="w-12 text-center">No</TH>
            <TH>Date</TH>
            <TH>Note</TH>
            <TH className="text-right">Absen</TH>
            <TH className="text-right">Gaji Satuan</TH>
            <TH className="text-right">Cash In</TH>
            <TH className="text-right">Cash Out</TH>
          </TR>
        </THead>
        <TBody>
          {yearGroups.map((yg) => {
            const isYearOpen = openYears.has(yg.yearKey);

            return (
              <Fragment key={yg.yearKey}>
                {/* ── Level 1: Tahun Header ── */}
                <tr
                  onClick={() => toggleYear(yg.yearKey)}
                  className="cursor-pointer select-none border-t-2 border-black bg-black text-white transition-colors hover:bg-neutral-800"
                  title={isYearOpen ? `Ciutkan ${yg.yearLabel}` : `Buka ${yg.yearLabel}`}
                >
                  <td className="px-3 py-2.5 text-center">
                    <FoldChevron open={isYearOpen} className="inline-block size-3.5 text-white" />
                  </td>
                  <td className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider">
                    {yg.yearLabel}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-white/70">
                    {fmt.number(yg.rowCount)} transaksi · {yg.months.length} bulan
                  </td>
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-white">
                    {amount(yg.totalIn)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-white">
                    {amount(yg.totalOut)}
                  </td>
                </tr>

                {/* ── Level 2: Bulan List ── */}
                {isYearOpen &&
                  yg.months.map((mg) => {
                    const isMonthOpen = openMonths.has(mg.monthKey);

                    return (
                      <Fragment key={mg.monthKey}>
                        <tr
                          onClick={() => toggleMonth(mg.monthKey)}
                          className="cursor-pointer select-none border-t border-line-soft bg-surface-2 transition-colors hover:bg-neutral-200"
                          title={isMonthOpen ? `Ciutkan ${mg.monthLabel}` : `Buka ${mg.monthLabel}`}
                        >
                          <td className="px-3 py-2 text-center">
                            <FoldChevron open={isMonthOpen} className="inline-block size-3.5 text-ink" />
                          </td>
                          <td className="pl-6 text-xs font-semibold text-ink">
                            {mg.monthLabel}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-ink-muted">
                            {fmt.number(mg.rows.length)} transaksi
                          </td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">
                            {amount(mg.totalIn)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">
                            {amount(mg.totalOut)}
                          </td>
                        </tr>

                        {/* ── Level 3: Transaksi Detail ── */}
                        {isMonthOpen &&
                          mg.rows.map((r) => (
                            <TR key={r.no} className="hover:bg-surface-2/60">
                              <TD className="text-center tabular-nums text-ink-muted">{r.no}</TD>
                              <TD className="whitespace-nowrap tabular-nums pl-8">{day(r.date)}</TD>
                              <TD>
                                <span className="font-medium text-ink">{r.note}</span>
                                <span className="block text-[11px] text-ink-muted">
                                  {r.direction === "in"
                                    ? (r.kind === "registration" ? "Registrasi" : "Iuran") +
                                      (r.period ? ` ${month(r.period)}` : "")
                                    : r.category}
                                </span>
                              </TD>
                              <TD className="text-right tabular-nums">{r.attendanceDays ?? ""}</TD>
                              <TD className="text-right tabular-nums">
                                {r.dailyRate != null ? fmt.number(r.dailyRate) : ""}
                              </TD>
                              <TD className="text-right font-medium tabular-nums text-ink">
                                {amount(r.cashIn)}
                              </TD>
                              <TD className="text-right font-medium tabular-nums text-ink">
                                {amount(r.cashOut)}
                              </TD>
                            </TR>
                          ))}
                      </Fragment>
                    );
                  })}
              </Fragment>
            );
          })}
        </TBody>
        <tfoot>
          <tr className="border-t-2 border-ink bg-surface-2 text-sm font-bold tabular-nums text-ink">
            <td colSpan={5} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider">
              Total · {fmt.number(rows.length)} baris
            </td>
            <td className="px-3 py-3 text-right">{fmt.number(totalIn)}</td>
            <td className="px-3 py-3 text-right">{fmt.number(totalOut)}</td>
          </tr>
        </tfoot>
      </Table>
    </div>
  );
}
