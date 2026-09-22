import type { Metadata } from "next";
import { PageShell, Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Transactions",
};

export default function TransactionsPage() {
  return (
    <PageShell title="Transactions">
      <Panel>
        <p className="text-[13.5px] text-text-dim">
          The full transaction ledger — every imported and manually created
          transaction, standardized with type, category, source, status, and
          confidence.
        </p>
      </Panel>
    </PageShell>
  );
}
