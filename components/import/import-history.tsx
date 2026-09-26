"use client";

import { Panel, PanelHead } from "@/components/ui";
import { truncateName } from "@/lib/format";

export interface HistoryRow {
  id: string;
  file_name: string;
  new_count: number;
  duplicate_count: number;
  transfer_count: number;
  review_count: number;
  error_count: number;
  status: string;
  created_at: string;
}

/** Recent imports. Reads from the database once it is connected; until
 *  then it shows an honest empty state rather than sample rows. */
export function ImportHistory({ imports }: { imports: HistoryRow[] }) {
  return (
    <Panel>
      <PanelHead title="Recent imports" hint="saved to your database" />
      {imports.length === 0 ? (
        <div className="py-1 text-[12.5px] text-text-dim">
          No imports yet — processed imports will appear here once the
          database is connected.
        </div>
      ) : (
        <div className="flex flex-col">
          {imports.map((row, index) => {
            const last = index === imports.length - 1;
            return (
              <div
                key={row.id}
                className={`flex items-center gap-3 py-2.5 ${last ? "" : "border-b border-border-soft"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium" title={row.file_name}>
                    {truncateName(row.file_name)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-text-faint">
                    {new Date(row.created_at).toLocaleString("en-PH", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="whitespace-nowrap font-mono text-[11.5px] text-text-dim">
                  {row.new_count.toLocaleString()} new ·{" "}
                  {row.duplicate_count.toLocaleString()} dup ·{" "}
                  {row.review_count.toLocaleString()} review
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                    row.status === "completed"
                      ? "bg-surface-2 text-text-dim"
                      : "bg-warn/8 text-warn"
                  }`}
                >
                  {row.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
