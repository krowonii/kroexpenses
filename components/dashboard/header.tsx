"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SettingsCog } from "@/components/settings/settings-cog";
import { todayIso } from "@/lib/dashboard";

const PERIODS = [
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "custom", label: "Custom range" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

const dateInputClass =
  "w-full bg-surface-2 border border-border-soft rounded-sm px-2.5 py-1.5 text-[12.5px] text-text focus:outline-none focus:border-net";

/**
 * The dashboard header: title + range, Import link, the period tabs, and
 * the settings cog. "Custom range" opens a small picker instead of
 * switching right away — Apply switches the period to the picked range
 * (a second click on the tab re-opens the picker to adjust it).
 */
export function DashboardHeader({
  period,
  rangeLabel,
  customRange,
  onPeriodChange,
  onCustomApply,
}: {
  period: PeriodKey;
  rangeLabel: string;
  customRange: { from: string; to: string } | null;
  onPeriodChange: (p: PeriodKey) => void;
  onCustomApply: (range: { from: string; to: string }) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState({ from: "", to: "" });

  // Esc closes the picker.
  useEffect(() => {
    if (!pickerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPickerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  function openPicker() {
    // Pre-fill with the current custom range; otherwise a sensible
    // starting point — the first of this month through today.
    setDraft(customRange ?? { from: `${todayIso().slice(0, 8)}01`, to: todayIso() });
    setPickerOpen(true);
  }

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(draft.from) && draft.from <= draft.to && /^\d{4}-\d{2}-\d{2}$/.test(draft.to);

  function apply() {
    if (!valid) return;
    onCustomApply({ from: draft.from, to: draft.to });
    setPickerOpen(false);
  }

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap mb-[18px]">
      <div className="flex items-baseline gap-2.5">
        <h1 className="text-[17px] font-semibold tracking-[0.01em]">Expenses</h1>
        <span className="font-mono text-[12.5px] text-text-faint">
          {rangeLabel}
        </span>
      </div>
      <div className="flex items-center gap-2.5 flex-wrap">
        <Link
          href="/import"
          className="inline-flex rounded-sm bg-net px-3 py-1.5 text-[13px] font-semibold text-bg whitespace-nowrap hover:opacity-90"
        >
          Import
        </Link>
        <div
          className="relative inline-flex bg-surface border border-border rounded-md p-0.75 gap-0.5"
          role="tablist"
          aria-label="Period"
        >
          {PERIODS.map((p) => {
            const isCustom = p.key === "custom";
            return (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={period === p.key}
                aria-expanded={isCustom ? pickerOpen : undefined}
                aria-haspopup={isCustom ? "dialog" : undefined}
                onClick={() => (isCustom ? openPicker() : onPeriodChange(p.key))}
                className={`appearance-none border-0 text-[13px] px-3 py-1.5 rounded-sm cursor-pointer whitespace-nowrap transition-colors duration-100 ${
                  period === p.key
                    ? "bg-surface-2 text-text"
                    : "bg-transparent text-text-dim hover:text-text"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <SettingsCog />

          {pickerOpen && (
            <>
              {/* Click-away layer — closes the picker without a dimmed
                  backdrop; it's a popover, not a modal. */}
              <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
              <div
                role="dialog"
                aria-label="Custom range"
                className="absolute right-0 top-full z-50 mt-1.5 w-[290px] max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-md p-3.5 shadow-lg"
              >
                <div className="text-[11.5px] text-text-dim mb-2">Custom range</div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label htmlFor="range-from" className="block text-[11.5px] text-text-faint mb-1">
                      From
                    </label>
                    <input
                      id="range-from"
                      type="date"
                      value={draft.from}
                      max={todayIso()}
                      onChange={(event) => setDraft((d) => ({ ...d, from: event.target.value }))}
                      className={dateInputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="range-to" className="block text-[11.5px] text-text-faint mb-1">
                      To
                    </label>
                    <input
                      id="range-to"
                      type="date"
                      value={draft.to}
                      max={todayIso()}
                      onChange={(event) => setDraft((d) => ({ ...d, to: event.target.value }))}
                      className={dateInputClass}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    className="rounded-sm border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] hover:border-text-faint"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={apply}
                    disabled={!valid}
                    className="rounded-sm bg-net px-3.5 py-1.5 text-[12.5px] font-semibold text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
