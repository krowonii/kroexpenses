"use client";

import { Panel, PanelHead } from "@/components/ui";

/** The pipeline stages shown while an import runs on the server. */
export const IMPORT_STAGES = [
  "Reading statements",
  "Extracting transactions",
  "Checking duplicates",
  "Reconciling transfers",
  "Categorizing transactions",
  "Saving transactions",
] as const;

export function ProcessingState({ activeIndex }: { activeIndex: number }) {
  return (
    <Panel>
      <PanelHead
        title="Processing import"
        hint="this usually takes a few seconds"
      />
      <ul>
        {IMPORT_STAGES.map((stage, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li key={stage} className="flex items-center gap-2.5 py-1.5">
              <span
                className={`w-4 text-center font-mono text-[12px] ${
                  done ? "text-income" : active ? "text-net animate-pulse" : "text-text-faint"
                }`}
              >
                {done ? "✓" : active ? "●" : "○"}
              </span>
              <span
                className={`text-[12.5px] ${done || active ? "" : "text-text-dim"}`}
              >
                {stage}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
