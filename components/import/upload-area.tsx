"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { Panel, PanelHead } from "@/components/ui";

const SOURCES = ["BDO", "GCash", "Credit Card", "Other"];

/** Drag-and-drop upload area — CSV + XLSX, multiple files per import. */
export function UploadArea({
  onFiles,
  busy = false,
}: {
  onFiles: (files: File[]) => void;
  busy?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    onFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <Panel>
      <PanelHead title="Import Transactions" hint="CSV or XLSX" />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center gap-3 rounded-md border border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-net bg-net/5" : "border-border hover:border-text-faint"
        }`}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          className="text-text-dim"
          aria-hidden
        >
          <path
            d="M12 16V4m0 0l-4 4m4-4l4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div className="text-[13.5px]">Drag & drop statements here</div>

        <div className="max-w-[420px] text-[12px] leading-[1.55] text-text-dim">
          Upload your bank or wallet statements. The system will automatically
          process, deduplicate, categorize, and reconcile transactions.
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mt-1 rounded-sm border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] hover:border-text-faint disabled:opacity-50"
        >
          {busy ? "Reading files…" : "or Browse files"}
        </button>

        <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
          {SOURCES.map((source) => (
            <span
              key={source}
              className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-text-dim"
            >
              {source}
            </span>
          ))}
        </div>

        <div className="text-[11px] text-text-faint">Multiple files supported</div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        multiple
        className="hidden"
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </Panel>
  );
}
