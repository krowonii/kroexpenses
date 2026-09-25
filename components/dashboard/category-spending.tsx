"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, PanelHead } from "@/components/ui";
import { peso } from "@/lib/format";

export interface CategorySpend {
  name: string;
  amount: number;
  pct: number;
  /** Optional CSS color (e.g. from the categories table); falls back to the default palette. */
  color?: string | null;
}

/* Tailwind utility classes for the default category palette — static strings,
 * so Tailwind's scanner sees them (dynamic construction never compiles). */
const defaultColors: Record<string, string> = {
  Food: "bg-cat-food",
  Shopping: "bg-cat-shopping",
  Bills: "bg-cat-bills",
  Transportation: "bg-cat-transport",
  Entertainment: "bg-cat-entertainment",
  Other: "bg-cat-other",
};

/* The same palette as raw var() references for the donut's inline fills —
 * CSS vars resolve in style props but not in SVG presentation attributes. */
const defaultFills: Record<string, string> = {
  Food: "var(--color-cat-food)",
  Shopping: "var(--color-cat-shopping)",
  Bills: "var(--color-cat-bills)",
  Transportation: "var(--color-cat-transport)",
  Entertainment: "var(--color-cat-entertainment)",
  Other: "var(--color-cat-other)",
};

const fillFor = (c: { name: string; color?: string | null }) =>
  c.color ?? defaultFills[c.name] ?? "var(--color-cat-other)";

/** Remembered chart view (per device). */
const VIEW_KEY = "spending-view";

/* Donut geometry: a 120×120 viewBox rendered at 160px — the hole fits the
 * center label. Angles start at 12 o'clock and run clockwise. */
const CX = 60;
const CY = 60;
const R_OUTER = 48;
const R_INNER = 30;
const FULL_SPAN = Math.PI * 2 - 0.001; // a 100% slice can't be a closed arc

function polar(r: number, angle: number): [number, number] {
  return [CX + r * Math.sin(angle), CY - r * Math.cos(angle)];
}

function arcPath(a0: number, a1: number): string {
  const [x0, y0] = polar(R_OUTER, a0);
  const [x1, y1] = polar(R_OUTER, a1);
  const [x2, y2] = polar(R_INNER, a1);
  const [x3, y3] = polar(R_INNER, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const f = (n: number) => n.toFixed(3);
  return `M ${f(x0)} ${f(y0)} A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)} A ${R_INNER} ${R_INNER} 0 ${large} 0 ${f(x3)} ${f(y3)} Z`;
}

export function CategorySpending({
  categories,
  total,
}: {
  categories: CategorySpend[];
  total: number;
}) {
  const [view, setView] = useState<"bars" | "pie">("bars");
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(VIEW_KEY) === "pie") setView("pie");
    } catch {
      // Storage blocked — the view just doesn't persist.
    }
  }, []);

  function changeView(next: "bars" | "pie") {
    setView(next);
    setHovered(null);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage blocked — the view just doesn't persist.
    }
  }

  // Donut slices: by amount, capped — the tail past 8 folds into one
  // "Everything else" slice rather than generating more hues.
  const slices = useMemo(() => {
    const list = [...categories].sort((a, b) => b.amount - a.amount);
    const cap = 8;
    if (list.length <= cap) return list.map((c) => ({ ...c, label: c.name }));
    const head = list.slice(0, cap - 1);
    const rest = list.slice(cap - 1).reduce((sum, c) => sum + c.amount, 0);
    return [
      ...head.map((c) => ({ ...c, label: c.name })),
      {
        name: "",
        label: "Everything else",
        amount: rest,
        pct: total > 0 ? (rest / total) * 100 : 0,
        color: null as string | null,
      },
    ];
  }, [categories, total]);

  const toggle =
    categories.length > 0 ? (
      <div className="flex rounded-sm border border-border-soft overflow-hidden">
        <button
          type="button"
          onClick={() => changeView("bars")}
          aria-pressed={view === "bars"}
          className={`px-2.5 py-1 text-[12px] ${
            view === "bars"
              ? "bg-net/10 text-text font-medium"
              : "text-text-dim hover:text-text"
          }`}
        >
          Bars
        </button>
        <button
          type="button"
          onClick={() => changeView("pie")}
          aria-pressed={view === "pie"}
          className={`px-2.5 py-1 text-[12px] border-l border-border-soft ${
            view === "pie"
              ? "bg-net/10 text-text font-medium"
              : "text-text-dim hover:text-text"
          }`}
        >
          Pie
        </button>
      </div>
    ) : null;

  const hover = hovered !== null ? slices[hovered] : null;

  return (
    <Panel>
      <PanelHead title="Spending by category" hint={`of ${peso(total)}`} action={toggle} />
      {categories.length === 0 ? (
        <div className="text-[12.5px] text-text-faint pt-2 pb-0.5">
          No spending in this period yet.
        </div>
      ) : view === "pie" ? (
        <div className="flex items-center gap-6 pt-1 max-sm:flex-col max-sm:items-start">
          <div className="relative w-40 h-40 shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full" role="img" aria-label="Spending share by category">
              {slices.map((c, i) => {
                const a0 = slices.slice(0, i).reduce((sum, s) => sum + (s.pct / 100) * Math.PI * 2, 0);
                const a1 = a0 + Math.min((c.pct / 100) * Math.PI * 2, FULL_SPAN);
                return (
                  <path
                    key={`${c.label}-${i}`}
                    d={arcPath(a0, a1)}
                    style={{ fill: fillFor(c) }}
                    /* The surface-colored stroke is the 2px gap between fills. */
                    stroke="var(--color-surface)"
                    strokeWidth={hovered === i ? 0 : 2}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-3">
              {hover ? (
                <>
                  <span className="text-[11px] text-text-dim truncate max-w-full">{hover.label}</span>
                  <span className="font-mono text-[13.5px] text-text whitespace-nowrap">
                    {peso(hover.amount)}
                  </span>
                  <span className="font-mono text-[11px] text-text-dim">
                    {hover.pct.toFixed(0)}%
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[11px] text-text-dim">Total spent</span>
                  <span className="font-mono text-[13.5px] text-text whitespace-nowrap">
                    {peso(total)}
                  </span>
                </>
              )}
            </div>
          </div>
          {/* Legend — the visible-labels relief for the palette's low-contrast
              entries; identity is never color-alone. */}
          <div className="flex-1 min-w-0 w-full flex flex-col">
            {slices.map((c, i) => (
              <div
                key={`${c.label}-${i}`}
                className="grid grid-cols-[12px_1fr_auto] items-center gap-2.5 py-[6px]"
              >
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: fillFor(c) }}
                  aria-hidden="true"
                />
                <div className="text-[13px] whitespace-nowrap overflow-hidden text-ellipsis">
                  {c.label}
                </div>
                <div className="font-mono text-[12.5px] text-text-dim text-right whitespace-nowrap">
                  {peso(c.amount)} · {c.pct.toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          {categories.map((c) => (
            <div
              key={c.name}
              className="grid grid-cols-[100px_1fr_78px] items-center gap-2.5 py-[7px] max-[520px]:grid-cols-[78px_1fr_66px]"
            >
              <div className="text-[13px] whitespace-nowrap overflow-hidden text-ellipsis">
                {c.name}
              </div>
              <div className="h-2 bg-surface-2 rounded-[3px] overflow-hidden">
                <div
                  className={`h-full rounded-[3px] ${
                    c.color ? "" : (defaultColors[c.name] ?? "bg-cat-other")
                  }`}
                  style={{ background: c.color ?? undefined, width: `${c.pct}%` }}
                />
              </div>
              <div className="font-mono text-[12.5px] text-text-dim text-right whitespace-nowrap">
                {peso(c.amount)} · {c.pct.toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
