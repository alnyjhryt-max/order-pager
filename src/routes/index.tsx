import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { CopyButton } from "@/client/components/CopyButton";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { QrCode } from "@/client/components/QrCode";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { errorMessage } from "@/client/lib/errors";
import { usePolling } from "@/client/lib/usePolling";
import type { BoardOrder } from "@/server/orders";
import { formatPrice } from "@/shared/rules";
import {
  changeOrder,
  createOrder,
  getBoard,
  giveReward,
} from "@/serverFunctions/orders";

export const Route = createFileRoute("/")({
  loader: () => getBoard(),
  head: () => ({ meta: [{ title: "Orders · Order Pager" }] }),
  component: Board,
});

const STATE_LABEL: Record<BoardOrder["status"], string> = {
  pending: "New",
  waiting: "Preparing",
  ready: "Ready",
  done: "Done",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

const DELIVERY_LABEL = {
  sent: "Sent",
  delivered: "Delivered",
  seen: "Seen",
  coming: "Coming",
} as const;

function Board() {
  const initial = Route.useLoaderData();
  const [orders, setOrders] = useState(initial.orders);
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<{ number: string; token: string } | null>(
    null,
  );

  async function refresh() {
    setOrders((await getBoard()).orders);
  }
  usePolling(refresh, 2000);

  async function run(work: () => Promise<unknown>) {
    try {
      await work();
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const groups = [
    { title: "New", list: orders.filter((o) => o.status === "pending") },
    { title: "Preparing", list: orders.filter((o) => o.status === "waiting") },
    { title: "Ready", list: orders.filter((o) => o.status === "ready") },
    {
      title: "Finished today",
      list: orders
        .filter((o) => ["done", "cancelled", "rejected"].includes(o.status))
        .reverse(),
    },
  ];

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Orders" />

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!number.trim() || busy) return;
          setBusy(true);
          void run(async () => {
            const created = await createOrder({
              data: { number: number.trim(), label: label.trim() },
            });
            setNumber("");
            setLabel("");
            setTicket({ number: created.number, token: created.token });
          }).finally(() => setBusy(false));
        }}
      >
        <Input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Order number"
          aria-label="Order number"
          inputMode="numeric"
          className="w-36 bg-card"
          maxLength={12}
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          aria-label="Label"
          className="min-w-40 flex-1 bg-card"
          maxLength={60}
        />
        <Button type="submit" disabled={busy || !number.trim()}>
          Add order
        </Button>
      </form>

      {orders.length === 0 ? (
        <EmptyState
          title="No orders today"
          description="Type an order number above and give the customer the code it shows."
        />
      ) : (
        groups.map((group) =>
          group.list.length === 0 ? null : (
            <section key={group.title} className="space-y-3">
              <h2 className="text-base font-semibold tracking-tight">
                {group.title}{" "}
                <span className="text-muted-foreground tabular-nums">
                  {group.list.length}
                </span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.list.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onChange={(to) =>
                      run(() => changeOrder({ data: { id: order.id, to } }))
                    }
                    onReward={() =>
                      run(async () => {
                        await giveReward({ data: { id: order.id } });
                        toast.success("Reward given");
                      })
                    }
                    onShowCode={() =>
                      setTicket({ number: order.number, token: order.token })
                    }
                  />
                ))}
              </div>
            </section>
          ),
        )
      )}

      <TicketDialog ticket={ticket} onClose={() => setTicket(null)} />
    </AppShell>
  );
}

function OrderCard({
  order,
  onChange,
  onReward,
  onShowCode,
}: {
  order: BoardOrder;
  onChange: (to: "waiting" | "rejected" | "ready" | "done" | "cancelled") => void;
  onReward: () => void;
  onShowCode: () => void;
}) {
  const live = ["pending", "waiting", "ready"].includes(order.status);
  const where =
    order.mode === "car"
      ? `Car · ${order.plate}`
      : order.mode === "table"
        ? order.tableName
        : order.mode === "collect"
          ? "Collect"
          : null;
  const total = order.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  return (
    <article
      data-testid="order-card"
      data-number={order.number}
      data-status={order.status}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {order.number}
          </p>
          {order.label ? (
            <p className="truncate text-sm text-muted-foreground">{order.label}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge
            data-testid="order-state"
            variant={
              order.status === "ready"
                ? "success"
                : order.status === "pending"
                  ? "warning"
                  : order.status === "waiting"
                    ? "info"
                    : "secondary"
            }
          >
            {STATE_LABEL[order.status]}
          </Badge>
          {order.delivery ? (
            <Badge data-testid="order-delivery" variant="outline">
              {DELIVERY_LABEL[order.delivery]}
            </Badge>
          ) : null}
        </div>
      </div>

      {order.source === "phone" ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            {order.customerName}
            {where ? <span className="text-muted-foreground"> · {where}</span> : null}
          </p>
          <ul>
            {order.items.map((item, index) => (
              <li key={index}>
                {item.qty} × {item.name}
                {item.size ? ` (${item.size})` : ""}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground tabular-nums">{formatPrice(total)}</p>
          {order.note ? (
            <p className="rounded-md bg-muted px-2 py-1">{order.note}</p>
          ) : null}
        </div>
      ) : null}

      {order.card ? (
        <p className="text-sm text-muted-foreground">
          Stamps{" "}
          <span data-testid="order-stamps" className="font-medium text-foreground tabular-nums">
            {Math.min(order.card.count, order.card.target)}/{order.card.target}
          </span>
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2">
        {order.status === "pending" && (
          <>
            <Button size="sm" onClick={() => onChange("waiting")}>
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => onChange("rejected")}>
              Reject
            </Button>
          </>
        )}
        {order.status === "waiting" && (
          <Button size="sm" onClick={() => onChange("ready")}>
            Ready
          </Button>
        )}
        {order.status === "ready" && (
          <Button size="sm" onClick={() => onChange("done")}>
            Done
          </Button>
        )}
        {order.card &&
          order.card.count >= order.card.target &&
          order.status !== "cancelled" &&
          order.status !== "rejected" && (
          <Button size="sm" variant="secondary" onClick={onReward}>
            Give reward
          </Button>
        )}
        {live && (
          <Button size="sm" variant="ghost" onClick={onShowCode}>
            Code
          </Button>
        )}
        {(order.status === "waiting" || order.status === "ready") && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onChange("cancelled")}
          >
            Cancel
          </Button>
        )}
      </div>
    </article>
  );
}

function TicketDialog({
  ticket,
  onClose,
}: {
  ticket: { number: string; token: string } | null;
  onClose: () => void;
}) {
  const url = ticket ? `${window.location.origin}/p/o/${ticket.token}` : "";
  return (
    <Dialog open={ticket !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Order {ticket?.number}</DialogTitle>
        </DialogHeader>
        {ticket ? (
          <div className="flex flex-col items-center gap-3">
            <QrCode value={url} label={`QR code for order ${ticket.number}`} />
            <a
              data-testid="ticket-link"
              href={url}
              target="_blank"
              rel="noreferrer"
              className="max-w-full truncate text-sm text-primary underline-offset-4 hover:underline"
            >
              {url}
            </a>
          </div>
        ) : null}
        <DialogFooter>
          <CopyButton value={url} successMessage="Link copied" label="Copy link" />
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
