import { createFileRoute } from "@tanstack/react-router";
import { BellRing, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { PublicShell } from "@/client/components/PublicShell";
import { StampCard } from "@/client/components/StampCard";
import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import {
  HttpError,
  ensureCardId,
  getJson,
  postJson,
  ring,
} from "@/client/lib/customer";
import { usePolling } from "@/client/lib/usePolling";
import type { PublicOrder } from "@/server/orders";
import { formatPrice } from "@/shared/rules";

export const Route = createFileRoute("/p/o/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Your order" }] }),
  component: OrderPage,
});

const STATUS_TEXT: Record<PublicOrder["status"], string> = {
  pending: "Waiting for the venue to accept",
  waiting: "Being prepared",
  ready: "Ready for pickup",
  done: "Collected",
  cancelled: "Cancelled",
  rejected: "Not accepted",
};

function OrderPage() {
  const { token } = Route.useParams();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [missing, setMissing] = useState(false);
  const [alerts, setAlerts] = useState<NotificationPermission | "unsupported">(
    () => ("Notification" in window ? Notification.permission : "unsupported"),
  );
  const previous = useRef<PublicOrder["status"] | null>(null);
  const claimed = useRef(false);
  const seen = useRef(false);

  async function load() {
    try {
      const next = await getJson<PublicOrder>(`/p/api/o/${token}`);
      const live = ["pending", "waiting", "ready"].includes(next.status);
      if (next.loyalty && live && !claimed.current) {
        claimed.current = true;
        await postJson(`/p/api/o/${token}/claim`, { cardId: ensureCardId() });
        setOrder(await getJson<PublicOrder>(`/p/api/o/${token}`));
      } else {
        setOrder(next);
      }
      if (next.status === "ready") {
        if (previous.current && previous.current !== "ready") ring();
        if (!seen.current && document.visibilityState === "visible") {
          seen.current = true;
          await postJson(`/p/api/o/${token}/seen`).catch(() => undefined);
        }
      }
      previous.current = next.status;
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) setMissing(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  usePolling(load, 2500);

  async function turnOnAlerts() {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast("Keep this page open: it will ring when your order is ready.");
      setAlerts("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    setAlerts(permission);
    if (permission !== "granted") return;
    try {
      const registration = await navigator.serviceWorker.register("/p/sw.js", {
        scope: `/p/o/${token}`,
      });
      await navigator.serviceWorker.ready;
      const { key } = await getJson<{ key: string }>("/p/api/push-key");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: fromBase64Url(key),
      });
      await postJson(`/p/api/o/${token}/push`, { endpoint: subscription.endpoint });
    } catch {
      toast("Alerts didn't turn on. Keep this page open instead.");
    }
  }

  if (missing)
    return (
      <PublicShell>
        <EmptyState kind="error" title="This order link doesn't work" description="Ask the staff for a new code." />
      </PublicShell>
    );
  if (!order)
    return (
      <PublicShell>
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </PublicShell>
    );

  const ready = order.status === "ready";
  const waiting = order.status === "pending" || order.status === "waiting";
  return (
    <PublicShell>
      {order.venueName ? (
        <p className="text-center text-sm text-muted-foreground">{order.venueName}</p>
      ) : null}
      <section
        className={
          ready
            ? "space-y-3 rounded-2xl border border-success/30 bg-success/10 p-6 text-center"
            : "space-y-3 rounded-2xl border border-border bg-card p-6 text-center text-card-foreground shadow-xs"
        }
      >
        <p className="text-sm text-muted-foreground">Order</p>
        <p data-testid="order-number" className="text-6xl font-semibold tracking-tight tabular-nums">
          {order.number}
        </p>
        {order.label ? <p className="text-muted-foreground">{order.label}</p> : null}
        <p
          data-testid="order-status"
          className={ready ? "text-2xl font-semibold text-success" : "text-xl font-medium"}
        >
          {STATUS_TEXT[order.status]}
        </p>
        {ready && order.delivery !== "coming" ? (
          <Button
            size="lg"
            className="w-full"
            onClick={async () => {
              try {
                await postJson(`/p/api/o/${token}/coming`);
                await load();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Try again.");
              }
            }}
          >
            On my way
          </Button>
        ) : null}
        {ready && order.delivery === "coming" ? (
          <p className="flex items-center justify-center gap-1.5 text-sm">
            <Check className="size-4" aria-hidden /> The staff know you're coming
          </p>
        ) : null}
        {waiting && alerts !== "granted" ? (
          <Button variant="outline" className="w-full" onClick={() => void turnOnAlerts()}>
            <BellRing /> Turn on alerts
          </Button>
        ) : null}
        {waiting && alerts === "denied" ? (
          <p className="text-sm text-muted-foreground">
            Alerts are blocked in this browser. Keep this page open and it will ring.
          </p>
        ) : null}
        {waiting && alerts === "granted" ? (
          <p className="text-sm text-muted-foreground">Your phone will ring when it's ready.</p>
        ) : null}
      </section>

      {order.items.length > 0 ? (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm text-card-foreground shadow-xs">
          <p className="font-medium">
            {order.customerName}
            {order.mode === "car" ? ` · Car ${order.plate}` : order.mode === "table" ? ` · ${order.tableName}` : " · Collect"}
          </p>
          <ul className="space-y-1">
            {order.items.map((item, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span>
                  {item.qty} × {item.name}
                  {item.size ? ` (${item.size})` : ""}
                </span>
                <span className="tabular-nums">{formatPrice(item.price * item.qty)}</span>
              </li>
            ))}
          </ul>
          {order.note ? <p className="text-muted-foreground">{order.note}</p> : null}
          <p className="text-muted-foreground">Pay when you collect.</p>
        </section>
      ) : null}

      {order.card ? <StampCard {...order.card} /> : null}

      <p className="text-center">
        <a href="/p/m" className="text-sm text-primary underline-offset-4 hover:underline">
          See the menu
        </a>
      </p>
    </PublicShell>
  );
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const text = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(text.length));
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
