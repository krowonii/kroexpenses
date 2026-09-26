"use client";

import { Panel, PanelHead } from "@/components/ui";
import { IMPORT_STAGES } from "@/lib/import/types";

export { IMPORT_STAGES };

/**
 * The pipeline stages shown while an import runs on the server. The stage
 * checklist is driven by the pipeline's streamed progress (not a timer), so
 * it tracks the real work — the categorization stage shows its sub-progress
 * and any rate-limit waits instead of sitting still.
 */
export function ProcessingState({
  activeIndex,
  detail,
  elapsed,
}: {
  activeIndex: number;
  detail?: string | null;
  elapsed?: number;
}) {
  return (
    <Panel>
      <PanelHead
        title="Processing import"
        hint={
          elapsed && elapsed > 0 ? `${elapsed}s elapsed` : "this usually takes a few seconds"
        }
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
              {active && detail ? (
                <span className="ml-auto text-right font-mono text-[11.5px] text-text-dim">
                  {detail}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
