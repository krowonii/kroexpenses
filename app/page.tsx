"use client";

import { useEffect, useState } from "react";
import { DashboardHeader, type PeriodKey } from "@/components/dashboard/header";
import { ReviewBanner } from "@/components/dashboard/review-banner";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { CategorySpending } from "@/components/dashboard/category-spending";
import { SpendingOverTime } from "@/components/dashboard/spending-over-time";
import { IncomeVsExpenses } from "@/components/dashboard/income-vs-expenses";
import { BudgetProgress } from "@/components/dashboard/budget-progress";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { DashboardSkeleton } from "@/components/dashboard/skeletons";
import { emptyDashboard, type DashboardData } from "@/lib/dashboard";

export default function DashboardPage() {
  const [period, setPeriod] = useState<PeriodKey>("thisMonth");
  const [data, setData] = useState<DashboardData>(emptyDashboard("…"));
  const [dbReady, setDbReady] = useState(true);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = (silent = false) => {
      // Skeletons for the initial load and period switches; a live
      // refresh (manual add / review decision) updates in place instead.
      if (!silent) setPending(true);
      fetch(`/api/summary?period=${period}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (!alive) return;
          setDbReady(json?.dbReady !== false);
          setData(json?.data ?? emptyDashboard("—"));
          setPending(false);
        })
        .catch(() => {
          if (!alive) return;
          setDbReady(false);
          setData(emptyDashboard("—"));
          setPending(false);
        });
    };
    load();
    // Manual adds (and review decisions) announce themselves so the
    // dashboard updates without leaving the page.
    const onChanged = () => load(true);
    window.addEventListener("expenses:changed", onChanged);
    return () => {
      alive = false;
      window.removeEventListener("expenses:changed", onChanged);
    };
  }, [period]);

  return (
    <div className="max-w-[1180px] mx-auto pt-7 px-6 pb-16 max-[520px]:pt-5 max-[520px]:px-3.5 max-[520px]:pb-12">
      <DashboardHeader
        period={period}
        rangeLabel={pending ? "…" : data.rangeLabel}
        onPeriodChange={setPeriod}
      />

      {!dbReady && (
        <div className="flex items-center gap-2.5 bg-warn/8 border border-warn/35 rounded-md px-4 py-[11px] mb-5 text-[13px]">
          <span className="w-[7px] h-[7px] rounded-full bg-warn shrink-0" />
          Couldn't reach the database — check Supabase is configured and
          you're signed in.
        </div>
      )}

      {pending ? (
        <DashboardSkeleton />
      ) : (
        <>
          <ReviewBanner count={data.reviewCount} />

          <SummaryCards data={data} />

          <div className="grid grid-cols-[1.65fr_1fr] gap-3 items-start mb-3 max-[860px]:grid-cols-1">
            <div className="flex flex-col gap-3">
              <CategorySpending categories={data.categories} total={data.expense} />
              <SpendingOverTime daily={data.daily} axisLabels={data.axisLabels} />
            </div>
            <div className="flex flex-col gap-3">
              <IncomeVsExpenses weeks={data.weeks} />
              <BudgetProgress budgets={data.budgets} />
            </div>
          </div>

          <TransactionsTable txns={data.txns} />
        </>
      )}
    </div>
  );
}
