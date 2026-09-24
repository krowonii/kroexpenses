import { Panel, Skeleton } from "@/components/ui";

/** Loading placeholders mirroring the dashboard's layout — shown while
 *  /api/summary is in flight instead of blank/empty panels. */
export function DashboardSkeleton() {
  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5 max-[860px]:grid-cols-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-surface border border-border rounded-md px-[18px] py-4"
          >
            <Skeleton className="h-3 w-14 mb-3" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1.65fr_1fr] gap-3 items-start mb-3 max-[860px]:grid-cols-1">
        <div className="flex flex-col gap-3">
          {/* Spending by category */}
          <Panel>
            <div className="flex items-baseline justify-between mb-3.5">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="grid grid-cols-[100px_1fr_78px] items-center gap-2.5 max-[520px]:grid-cols-[78px_1fr_66px]"
                >
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          </Panel>

          {/* Spending over time */}
          <Panel>
            <div className="flex items-baseline justify-between mb-3.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-8" />
            </div>
            <div className="flex items-end gap-[3px] h-[120px] pt-1.5">
              {[38, 62, 25, 74, 45, 55, 30, 68, 42, 82, 35, 58, 48, 70, 28, 60, 40, 76, 33, 52].map(
                (height, i) => (
                  <Skeleton
                    key={i}
                    className="flex-1 rounded-t-xs"
                    style={{ height: `${height}%` }}
                  />
                )
              )}
            </div>
            <div className="flex justify-between mt-1.5">
              <Skeleton className="h-2.5 w-8" />
              <Skeleton className="h-2.5 w-8" />
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-3">
          {/* Income vs expenses */}
          <Panel>
            <div className="flex items-baseline justify-between mb-3.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <Skeleton className="h-2.5 w-14 mb-[5px]" />
                  <div className="flex flex-col gap-[3px]">
                    <Skeleton className="h-[7px] w-full" />
                    <Skeleton className="h-[7px] w-3/5" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-1">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </Panel>

          {/* Budget progress */}
          <Panel>
            <Skeleton className="h-3.5 w-28 mb-3.5" />
            <div className="flex flex-col gap-3.5">
              {[0, 1].map((i) => (
                <div key={i}>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-1.5 w-full" />
                  <Skeleton className="h-2.5 w-12 mt-1" />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* Recent transactions */}
      <Panel>
        <div className="flex items-baseline justify-between mb-3.5">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-12 shrink-0" />
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3.5 w-20 shrink-0 rounded-full" />
              <Skeleton className="h-3 w-16 ml-auto shrink-0" />
              <Skeleton className="h-3 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
