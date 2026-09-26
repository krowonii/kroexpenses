import { buildRange, todayIso } from "../lib/dashboard.ts";

const show = (name: string, r: ReturnType<typeof buildRange>) =>
  console.log(`${name}: from=${r.from} to=${r.to} prev=${r.prev ? `${r.prev.from}..${r.prev.to}` : "null"} label="${r.label}"`);

const today = todayIso();
console.log("today (Asia/Manila):", today);

show("custom explicit     ", buildRange("custom", { from: "2026-08-01", to: "2026-08-15" }));
show("custom fallback     ", buildRange("custom"));
show("custom from>to      ", buildRange("custom", { from: "2026-09-10", to: "2026-09-01" }));
show("custom garbage      ", buildRange("custom", { from: "garbage", to: "2026-09-01" }));
show("custom same month   ", buildRange("custom", { from: "2026-09-01", to: "2026-09-26" }));
show("thisMonth           ", buildRange("thisMonth"));
show("lastMonth           ", buildRange("lastMonth"));

// Assertions.
const explicit = buildRange("custom", { from: "2026-08-01", to: "2026-08-15" });
console.log(
  explicit.from === "2026-08-01" && explicit.to === "2026-08-15" && explicit.prev === null
    ? "PASS: explicit custom range used verbatim, no delta baseline"
    : "FAIL: explicit custom range"
);

const fallback = buildRange("custom");
const days = Math.round((Date.parse(fallback.to) - Date.parse(fallback.from)) / 86_400_000) + 1;
console.log(
  fallback.to === today && days === 90 && fallback.prev === null
    ? "PASS: fallback is the trailing 90-day window ending today"
    : `FAIL: fallback (to=${fallback.to}, days=${days})`
);

const crossed = buildRange("custom", { from: "2026-09-10", to: "2026-09-01" });
console.log(
  crossed.from === fallback.from && crossed.to === fallback.to
    ? "PASS: from>to falls back to the window"
    : "FAIL: from>to fallback"
);

const sameMonth = buildRange("custom", { from: "2026-09-01", to: "2026-09-26" });
console.log(
  sameMonth.label === "Sep 1 – Sep 26, 2026"
    ? "PASS: same-month label"
    : `FAIL: same-month label "${sameMonth.label}"`
);

const prevMonth = buildRange("thisMonth");
console.log(
  prevMonth.prev !== null ? "PASS: thisMonth keeps its previous-period baseline" : "FAIL: thisMonth prev"
);
