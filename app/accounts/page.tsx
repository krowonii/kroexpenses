import type { Metadata } from "next";
import { PageShell, Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Accounts",
};

export default function AccountsPage() {
  return (
    <PageShell title="Accounts">
      <Panel>
        <p className="text-[13.5px] text-text-dim">
          Accounts establish where a transaction came from or went to — BDO
          Savings, GCash, Cash, Credit Card, and any other bank. Each has a
          name, type, institution, and active status. Balances are not tracked.
        </p>
      </Panel>
    </PageShell>
  );
}
