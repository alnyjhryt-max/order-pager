import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { usePolling } from "@/client/lib/usePolling";
import { getBoard } from "@/serverFunctions/orders";

export const Route = createFileRoute("/screen")({
  loader: () => getBoard(),
  head: () => ({ meta: [{ title: "Screen · Order Pager" }] }),
  component: Screen,
});

/** For a screen customers can see: numbers being prepared and ready. */
function Screen() {
  const initial = Route.useLoaderData();
  const [orders, setOrders] = useState(initial.orders);
  usePolling(async () => setOrders((await getBoard()).orders), 2000);
  const preparing = orders.filter((o) => o.status === "waiting");
  const ready = orders.filter((o) => o.status === "ready");
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Screen" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Column title="Preparing" testId="screen-preparing" numbers={preparing.map((o) => o.number)} />
        <Column title="Ready" testId="screen-ready" numbers={ready.map((o) => o.number)} highlight />
      </div>
    </AppShell>
  );
}

function Column({
  title,
  testId,
  numbers,
  highlight = false,
}: {
  title: string;
  testId: string;
  numbers: string[];
  highlight?: boolean;
}) {
  return (
    <section className="min-h-72 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs">
      <h2 className="mb-4 text-xl font-semibold tracking-tight">{title}</h2>
      <ul data-testid={testId} className="flex flex-wrap gap-3">
        {numbers.map((number) => (
          <li
            key={number}
            className={
              highlight
                ? "rounded-lg bg-success/10 px-4 py-2 text-5xl font-semibold text-success tabular-nums"
                : "rounded-lg bg-muted px-4 py-2 text-5xl font-semibold text-muted-foreground tabular-nums"
            }
          >
            {number}
          </li>
        ))}
      </ul>
    </section>
  );
}
