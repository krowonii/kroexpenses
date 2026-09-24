import type { Metadata } from "next";
import { Browser } from "@/components/transactions/browser";

export const metadata: Metadata = {
  title: "Transactions",
};

export default function TransactionsPage() {
  return <Browser />;
}
