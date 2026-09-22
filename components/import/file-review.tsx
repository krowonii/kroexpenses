"use client";

import { useRef } from "react";
import type { DetectedFile } from "@/lib/import/types";

const SOURCE_LABEL: Record<string, string> = {
  bdo: "BDO",
  gcash: "GCash",
  credit_card: "Credit Card",
  other: "Other",
};

function formatRange(range: { from: string; to: string } | null): string {
  if (!range) return "no dates detected";
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const short: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromStr = from.toLocaleDateString("en-PH", short);
  const toStr = to.toLocaleDateString("en-PH", {
    ...short,
    year: sameYear ? undefined : "numeric",
  });
  return `${fromStr} – ${toStr}`;
}

/**
 * Staged files with detection results and account pickers. Accounts are
 * preselected when detection was confident; only uncertain files ask.
 */
export function FileReview({
  files,
  accounts,
  selections,
  onAccountChange,
  onRemove,
  onAddFiles,
}: {
  files: DetectedFile[];
  accounts: { id: string | null; name: string }[];
  selections: Record<string, string>;
  onAccountChange: (fileName: string, accountName: string) => void;
  onRemove: (fileName: string) => void;
  onAddFiles: (files: File[]) => void;
}) {
  const addRef = useRef<HTMLInputElement>(null);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3.5">
        <h2 className="text-[13.5px] font-semibold">Confirm files</h2>
        <span className="text-[11.5px] text-text-faint">
          {files.length} file{files.length === 1 ? "" : "s"} · pick the account for each
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {files.map((file) => (
          <div
            key={file.fileName}
            className="bg-surface-2 border border-border-soft rounded-md px-3.5 py-3"
          >
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] text-text-dim">
                {SOURCE_LABEL[file.source] ?? "Other"}
              </span>
              <span className="flex-1 truncate text-[12.5px] font-medium">
                {file.fileName}
              </span>
              <button
                type="button"
                onClick={() => onRemove(file.fileName)}
                aria-label={`Remove ${file.fileName}`}
                className="text-[12.5px] text-text-faint hover:text-text"
              >
                ✕
              </button>
            </div>

            {file.parseError ? (
              <div className="mt-2 text-[12px] text-expense">{file.parseError}</div>
            ) : (
              <>
                <div className="mt-2 flex items-center gap-2.5">
                  <label
                    htmlFor={`acct-${file.fileName}`}
                    className="text-[11.5px] text-text-dim"
                  >
                    Account
                  </label>
                  <select
                    id={`acct-${file.fileName}`}
                    value={selections[file.fileName] ?? ""}
                    onChange={(event) =>
                      onAccountChange(file.fileName, event.target.value)
                    }
                    className="bg-surface border border-border rounded-sm px-2 py-1 text-[12.5px]"
                  >
                    <option value="" disabled>
                      Select account…
                    </option>
                    {accounts.map((account) => (
                      <option key={account.name} value={account.name}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-1.5 font-mono text-[11.5px] text-text-dim">
                  {file.rowCount.toLocaleString()} rows · {formatRange(file.dateRange)}
                </div>
              </>
            )}
          </div>
        ))}

        <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-border px-4 py-3 text-[12.5px] text-text-dim hover:border-text-faint hover:text-text">
          + Add more files
          <input
            ref={addRef}
            type="file"
            accept=".csv,.xlsx"
            multiple
            className="hidden"
            onChange={(event) => {
              onAddFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </label>
      </div>
    </section>
  );
}
