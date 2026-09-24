"use client";

import { useState } from "react";

/**
 * Calculator-style amount pad (mobile): basic operations on the top row,
 * digits below, OK bottom-right. Builds an expression like "12.5+8"; OK
 * evaluates it in place so the display always ends at a plain amount.
 */

type KeyKind = "op" | "digit" | "dot" | "back" | "clear" | "ok";

const ROWS: { label: string; kind: KeyKind }[][] = [
  [
    { label: "+", kind: "op" },
    { label: "−", kind: "op" },
    { label: "×", kind: "op" },
    { label: "/", kind: "op" },
  ],
  [
    { label: "7", kind: "digit" },
    { label: "8", kind: "digit" },
    { label: "9", kind: "digit" },
    { label: "⌫", kind: "back" },
  ],
  [
    { label: "4", kind: "digit" },
    { label: "5", kind: "digit" },
    { label: "6", kind: "digit" },
    { label: "C", kind: "clear" },
  ],
  [
    { label: "1", kind: "digit" },
    { label: "2", kind: "digit" },
    { label: "3", kind: "digit" },
    { label: ".", kind: "dot" },
  ],
];

const base =
  "h-12 rounded-sm border border-border-soft bg-surface-2 font-mono text-[15px] text-text active:bg-surface transition-colors select-none";

/**
 * Evaluate a +−×/ expression. Returns null when the expression is
 * incomplete, malformed, or divides by zero — the caller keeps the user
 * on the pad.
 */
export function evaluateAmount(raw: string): number | null {
  const expr = raw.replace(/×/g, "*").replace(/−/g, "-").replace(/\s/g, "");
  if (!expr || !/^\d*\.?\d+([*/+-]\d*\.?\d+)*$/.test(expr)) return null;

  const tokens = expr.match(/\d*\.?\d+|[*/+-]/g) ?? [];
  // First pass: resolve * and / in place, left to right.
  const folded: (string | number)[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if ((token === "*" || token === "/") && folded.length >= 1) {
      const left = Number(folded.pop());
      const right = Number(tokens[++i]);
      if (!Number.isFinite(left) || !Number.isFinite(right) || (token === "/" && right === 0)) {
        return null;
      }
      folded.push(token === "*" ? left * right : left / right);
    } else {
      folded.push(token);
    }
  }
  // Second pass: + and −.
  let total = 0;
  let sign = 1;
  for (const token of folded) {
    if (token === "+") sign = 1;
    else if (token === "-") sign = -1;
    else total += sign * Number(token);
  }
  return Number.isFinite(total) ? Math.round(total * 100) / 100 : null;
}

export function NumberPad({
  expr,
  onChange,
}: {
  expr: string;
  onChange: (next: string) => void;
}) {
  const [error, setError] = useState(false);

  function press(label: string, kind: KeyKind) {
    if (kind === "back") {
      setError(false);
      onChange(expr.slice(0, -1));
      return;
    }
    if (kind === "clear") {
      setError(false);
      onChange("");
      return;
    }
    if (kind === "ok") {
      const amount = evaluateAmount(expr);
      if (amount === null) {
        setError(true); // incomplete or malformed — keep the expression
        return;
      }
      setError(false);
      onChange(String(amount));
      return;
    }
    if (kind === "op") {
      setError(false);
      // Replace a trailing operator; never start an expression with one.
      onChange(
        (/[+\-×/]$/.test(expr) ? expr.slice(0, -1) : expr) + label
      );
      return;
    }
    if (kind === "dot") {
      setError(false);
      // One dot per number segment (the text after the last operator).
      const segment = expr.split(/[+\-×/]/).pop() ?? "";
      if (segment.includes(".")) return;
      onChange(expr + (segment === "" ? "0." : "."));
      return;
    }
    setError(false);
    onChange(expr + label);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {ROWS.map((row, i) => (
        <div key={i} className="grid grid-cols-4 gap-1.5">
          {row.map((key) => (
            <button
              key={key.label}
              type="button"
              onClick={() => press(key.label, key.kind)}
              className={`${base} ${key.kind === "op" ? "text-text-dim" : ""}`}
            >
              {key.label}
            </button>
          ))}
        </div>
      ))}
      <div className="grid grid-cols-4 gap-1.5">
        <button type="button" onClick={() => press("0", "digit")} className={`${base} col-span-3`}>
          0
        </button>
        <button
          type="button"
          onClick={() => press("OK", "ok")}
          className={`h-12 rounded-sm bg-net font-mono text-[15px] font-semibold text-bg active:opacity-90 transition-opacity select-none ${error ? "opacity-60" : ""}`}
        >
          OK
        </button>
      </div>
      <p className={`text-[11.5px] text-expense h-4 ${error ? "" : "invisible"}`}>
        Incomplete — finish the expression, then OK
      </p>
    </div>
  );
}
