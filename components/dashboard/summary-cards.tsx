import { Card } from "@/components/ui";
import { peso } from "@/lib/format";

export interface SummaryData {
  income: number;
  expense: number;
  net: number;
  incomeDelta: string;
  expenseDelta: string;
  netDelta: string;
}

export function SummaryCards({ data }: { data: SummaryData }) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-5 max-[860px]:grid-cols-1">
      <Card
        tone="income"
        label="Income"
        amount={peso(data.income)}
        delta={data.incomeDelta}
        deltaTone="up"
      />
      <Card
        tone="expense"
        label="Expenses"
        amount={peso(data.expense)}
        delta={data.expenseDelta}
        deltaTone="down"
      />
      <Card
        tone="net"
        label="Net"
        amount={peso(data.net)}
        delta={data.netDelta}
      />
    </div>
  );
}
