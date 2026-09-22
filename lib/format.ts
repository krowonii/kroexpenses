/** Format a peso amount, e.g. -350 → "-₱350", 17500 → "₱17,500". */
export const peso = (n: number) => {
  const sign = n < 0 ? "-" : "";
  return (
    sign + "₱" + Math.abs(n).toLocaleString("en-PH", { maximumFractionDigits: 0 })
  );
};

/** Prefix a signed amount with + for inflows, e.g. 17500 → "+₱17,500". */
export const signedPeso = (n: number) => (n > 0 ? "+" : "") + peso(n);
