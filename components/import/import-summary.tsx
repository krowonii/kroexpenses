"use client";

import Link from "next/link";
import { Panel } from "@/components/ui";
import type { ImportSummary } from "@/lib/import/types";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-2 border border-border-soft rounded-md px-3.5 py-3">
      <div className="mb-1.5 text-[11.5px] text-text-dim">{label}</div>
      <div className="font-mono text-[20px] font-medium">{value.toLocaleString()}</div>
    </div>
  );
}

/** Actual counts from the pipeline. Skipped/errored rows are never
 *  claimed as imported — they show in their own stats. */
export function ImportSummaryView({
  summary,
  onDone,
}: {
  summary: ImportSummary;
  onDone: () => void;
}) {
  const { categorization } = summary;

  return (
    <Panel>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="w-4 text-center font-mono text-[13px] text-income">✓</span>
        <h2 className="text-[15px] font-semibold">Import complete</h2>
        {!summary.saved ? (
          <span className="ml-auto text-[11.5px] text-warn">preview only</span>
        ) : null}
      </div>

      <div className="grid grid-cols-4 gap-3 max-[860px]:grid-cols-2">
        <Stat label="New transactions" value={summary.newCount} />
        <Stat label="Duplicates skipped" value={summary.duplicateCount} />
        <Stat label="Transfers reconciled" value={summary.transferCount} />
        <Stat label="Errors" value={summary.errorCount} />
      </div>

      <div className="mt-3.5 bg-surface-2 border border-border-soft rounded-md px-3.5 py-3">
        <div className="mb-1 text-[12.5px] font-medium">AI categorization</div>
        <div className="text-[12px] text-text-dim">
          {categorization.auto.toLocaleString()} automatically categorized ·{" "}
          {categorization.needReview.toLocaleString()} need your review
        </div>
        {summary.unmatchedCount > 0 ? (
          <div className="mt-1 text-[12px] text-text-dim">
            {summary.unmatchedCount.toLocaleString()} transfer-like transactions had no
            matching counterpart — counted as expenses unless you change them.
          </div>
        ) : null}
      </div>

      {!summary.saved && summary.saveNote ? (
        <div className="mt-3 text-[12px] text-warn">{summary.saveNote}</div>
      ) : null}

      {summary.issues.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1.5 text-[12.5px] font-medium">Issues</div>
          <ul className="flex flex-col gap-1">
            {summary.issues.map((issue, index) => (
              <li key={index} className="text-[12px] text-expense">
                {issue.fileName} — {issue.stage}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex gap-2.5">
        {categorization.needReview > 0 ? (
          <Link
            href="/review"
            className="rounded-sm bg-warn px-3.5 py-1.5 text-[12.5px] font-semibold text-bg hover:opacity-90"
          >
            Review {categorization.needReview.toLocaleString()}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onDone}
          className="rounded-sm border border-border bg-surface-2 px-3.5 py-1.5 text-[12.5px] hover:border-text-faint"
        >
          Done
        </button>
      </div>
    </Panel>
  );
}
