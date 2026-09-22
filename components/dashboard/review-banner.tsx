import Link from "next/link";

/** Amber action-required banner — links to the review queue. Hidden at 0. */
export function ReviewBanner({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <Link
      href="/review"
      className="flex items-center justify-between gap-3 bg-warn/8 border border-warn/35 rounded-md px-4 py-[11px] mb-5 hover:bg-warn/13 transition-colors duration-100"
    >
      <span className="flex items-center gap-2.5 text-[13.5px]">
        <span className="w-[7px] h-[7px] rounded-full bg-warn shrink-0" />
        <span>
          <span className="font-mono text-warn font-medium">{count}</span>{" "}
          transactions need your review
        </span>
      </span>
      <span className="text-warn text-sm">→</span>
    </Link>
  );
}
