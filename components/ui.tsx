import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared surface primitives. Styling mirrors docs/initial-ui.html —
 * keep new screens on these instead of restyling from scratch.
 */

/** Bordered surface panel with the standard 18px padding. */
export function Panel({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`bg-surface border border-border rounded-md px-[18px] py-[18px] ${className}`}
    >
      {children}
    </section>
  );
}

/** Panel title row: h2 on the left, optional hint on the right. */
export function PanelHead({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mb-3.5">
      <h2 className="text-[13.5px] font-semibold">{title}</h2>
      {hint ? <span className="text-[11.5px] text-text-faint">{hint}</span> : null}
    </div>
  );
}

export type CardTone = "income" | "expense" | "net";

const toneAccent: Record<CardTone, string> = {
  income: "bg-income",
  expense: "bg-expense",
  net: "bg-net",
};

/** Summary card with the colored accent bar along the top edge. */
export function Card({
  tone,
  label,
  amount,
  delta,
  deltaTone = "flat",
}: {
  tone: CardTone;
  label: string;
  amount: string;
  delta?: string;
  deltaTone?: "up" | "down" | "flat";
}) {
  const deltaClass =
    deltaTone === "up"
      ? "text-income"
      : deltaTone === "down"
        ? "text-expense"
        : "text-text-faint";

  return (
    <div
      className={`relative overflow-hidden bg-surface border border-border rounded-md px-[18px] py-4 before:content-[''] before:absolute before:top-0 before:left-0 before:w-full before:h-0.5 ${toneAccent[tone]}`}
    >
      <div className="text-xs text-text-dim mb-2">{label}</div>
      <div className="font-mono text-[26px] font-medium tracking-[-0.01em]">
        {amount}
      </div>
      {delta ? (
        <div className={`mt-1.5 text-xs font-mono ${deltaClass}`}>{delta}</div>
      ) : null}
    </div>
  );
}

/** Page wrapper for secondary screens (import, review, accounts, …). */
export function PageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="max-w-[1180px] mx-auto pt-7 px-6 pb-16 max-[520px]:pt-5 max-[520px]:px-3.5 max-[520px]:pb-12">
      <div className="flex items-baseline gap-2.5 mb-4">
        <h1 className="text-[17px] font-semibold tracking-[0.01em]">{title}</h1>
        <Link href="/" className="text-[12.5px] text-text-dim hover:text-text">
          ← Dashboard
        </Link>
      </div>
      {children}
    </div>
  );
}
