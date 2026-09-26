/** Format a peso amount, e.g. -350 → "-₱350", 17500 → "₱17,500". */
export const peso = (n: number) => {
  const sign = n < 0 ? "-" : "";
  return (
    sign + "₱" + Math.abs(n).toLocaleString("en-PH", { maximumFractionDigits: 0 })
  );
};

/** Prefix a signed amount with + for inflows, e.g. 17500 → "+₱17,500". */
export const signedPeso = (n: number) => (n > 0 ? "+" : "") + peso(n);

/** Format a stored "HH:MM" 24h time as "3:20 PM" — manual am/pm math, no
 *  Date parsing (avoids timezone round-trips). Empty string for null. */
export function timeLabel(txnTime: string | null | undefined): string {
  if (!txnTime) return "";
  const [h, m] = txnTime.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** Cap a long name for inline display — "…" marks the cut, and the full
 *  value belongs in a title (or similar hover) beside it. */
export function truncateName(name: string, max = 44): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1).trimEnd()}…`;
}
