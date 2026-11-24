import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { PublicShell } from "@/client/components/PublicShell";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { StampCard } from "@/client/components/StampCard";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Spinner } from "@/client/components/ui/spinner";
import { Textarea } from "@/client/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import {
  HttpError,
  ensureCardId,
  getJson,
  postJson,
  storedCardId,
} from "@/client/lib/customer";
import type { CardSummary } from "@/server/orders";
import type { MenuItem, MenuSection } from "@/server/menu";
import { NEW_CARD_STAMPS, formatPrice, type OrderMode } from "@/shared/rules";

export const Route = createFileRoute("/p/m")({
  ssr: false,
  validateSearch: z.object({ t: z.string().max(20).optional() }),
  head: () => ({ meta: [{ title: "Menu" }] }),
  component: PublicMenu,
});

interface PublicMenuData {
  venueName: string;
  sections: MenuSection[];
  ordering: {
    closed: "off" | "paused" | "hours" | null;
    collect: boolean;
    car: boolean;
    table: boolean;
    tableName: string | null;
  };
  loyalty: { target: number; reward: string; shape: string } | null;
}

interface CartLine {
  itemId: string;
  name: string;
  size?: string;
  price: number;
  qty: number;
}

function PublicMenu() {
  const { t } = Route.useSearch();
  const navigate = useNavigate();
  const [menu, setMenu] = useState<PublicMenuData | null>(null);
  const [failed, setFailed] = useState(false);
  const [english, setEnglish] = useState(false);
  const [card, setCard] = useState<CardSummary | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);

  useEffect(() => {
    getJson<PublicMenuData>(`/p/api/menu${t ? `?t=${encodeURIComponent(t)}` : ""}`)
      .then(async (data) => {
        setMenu(data);
        if (!data.loyalty) return;
        const cardId = storedCardId();
        const fresh = { count: NEW_CARD_STAMPS, ...data.loyalty };
        if (!cardId) return setCard(fresh);
        try {
          setCard(await getJson<CardSummary>(`/p/api/card/${cardId}`));
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) setCard(fresh);
        }
      })
      .catch(() => setFailed(true));
  }, [t]);

  if (failed)
    return (
      <PublicShell>
        <EmptyState kind="error" title="The menu didn't load" description="Refresh the page to try again." />
      </PublicShell>
    );
  if (!menu)
    return (
      <PublicShell>
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </PublicShell>
    );

  const hasEnglish = menu.sections.some((s) => s.nameEn || s.items.some((i) => i.nameEn));
  const canOrder = menu.ordering.closed === null;
  const label = (thing: { name: string; nameEn: string }) =>
    english && thing.nameEn ? thing.nameEn : thing.name;

  function add(item: MenuItem, size?: { name: string; price: number }) {
    setCart((lines) => {
      const found = lines.find((l) => l.itemId === item.id && l.size === size?.name);
      if (found)
        return lines.map((l) => (l === found ? { ...l, qty: Math.min(20, l.qty + 1) } : l));
      return [
        ...lines,
        { itemId: item.id, name: item.name, size: size?.name, price: size?.price ?? item.price, qty: 1 },
      ];
    });
  }

  return (
    <PublicShell>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{menu.venueName || "Menu"}</h1>
        {hasEnglish ? (
          <SegmentedToggle
            showLabels
            value={english ? "en" : "original"}
            onChange={(next) => setEnglish(next === "en")}
            items={[
              { value: "original", label: "Original", icon: null },
              { value: "en", label: "English", icon: null },
            ]}
          />
        ) : null}
      </header>

      {menu.ordering.closed === "paused" || menu.ordering.closed === "hours" ? (
        <Alert>
          <AlertDescription>Not taking orders right now.</AlertDescription>
        </Alert>
      ) : null}

      {card ? <StampCard {...card} /> : null}

      {menu.sections.length === 0 ? (
        <EmptyState title="The menu is empty" />
      ) : (
        menu.sections.map((section) => (
          <section key={section.id} className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">{label(section)}</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs">
              {section.items.map((item) => (
                <li key={item.id} data-testid="public-item" className="flex gap-3 p-4">
                  {item.photoUrl ? (
                    <img
                      src={item.photoUrl}
                      alt={label(item)}
                      className="size-20 shrink-0 rounded-lg border border-border object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p data-testid="item-name" className="font-medium">
                        {label(item)}
                      </p>
                      {item.sizes.length === 0 ? (
                        <p className="tabular-nums">{formatPrice(item.price)}</p>
                      ) : null}
                    </div>
                    {item.description ? (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    ) : null}
                    {item.sizes.length > 0 ? (
                      <p className="text-sm tabular-nums">
                        {item.sizes.map((s) => `${s.name} ${formatPrice(s.price)}`).join(" · ")}
                      </p>
                    ) : null}
                    <Facts item={item} />
                    {item.soldOut ? <Badge variant="warning">Sold out</Badge> : null}
                    {canOrder && !item.soldOut ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {item.sizes.length === 0 ? (
                          <Button size="sm" variant="outline" onClick={() => add(item)}>
                            <Plus /> Add
                          </Button>
                        ) : (
                          item.sizes.map((size) => (
                            <Button
                              key={size.name}
                              size="sm"
                              variant="outline"
                              aria-label={`Add ${size.name}`}
                              onClick={() => add(item, size)}
                            >
                              <Plus /> {size.name}
                            </Button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {canOrder && cart.length > 0 ? (
        <Cart
          lines={cart}
          setLines={setCart}
          ordering={menu.ordering}
          tableCode={t}
          onSent={(token) => void navigate({ to: "/p/o/$token", params: { token } })}
        />
      ) : null}
    </PublicShell>
  );
}

function Facts({ item }: { item: MenuItem }) {
  const facts = [
    item.calories !== null ? `${item.calories} kcal` : null,
    item.caffeineMg !== null ? `${item.caffeineMg} mg caffeine` : null,
    item.allergens ? `Allergens: ${item.allergens}` : null,
  ].filter(Boolean);
  if (facts.length === 0 && !item.highSalt) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {facts.map((fact) => (
        <span key={fact}>{fact}</span>
      ))}
      {item.highSalt ? <Badge variant="outline">High in salt</Badge> : null}
    </div>
  );
}

function Cart({
  lines,
  setLines,
  ordering,
  tableCode,
  onSent,
}: {
  lines: CartLine[];
  setLines: (update: (lines: CartLine[]) => CartLine[]) => void;
  ordering: PublicMenuData["ordering"];
  tableCode?: string;
  onSent: (token: string) => void;
}) {
  const modes: { value: OrderMode; label: string }[] = [];
  if (ordering.table && ordering.tableName) modes.push({ value: "table", label: ordering.tableName });
  if (ordering.collect) modes.push({ value: "collect", label: "Collect" });
  if (ordering.car) modes.push({ value: "car", label: "Car" });
  const [mode, setMode] = useState<OrderMode | null>(modes[0]?.value ?? null);
  const [plate, setPlate] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0);

  function change(line: CartLine, delta: number) {
    setLines((all) =>
      all.flatMap((l) => (l === line ? (l.qty + delta <= 0 ? [] : [{ ...l, qty: Math.min(20, l.qty + delta) }]) : [l])),
    );
  }

  if (modes.length === 0) return null;
  return (
    <form
      data-testid="cart"
      className="space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!mode) return;
        setSending(true);
        setError(null);
        try {
          const { token } = await postJson<{ token: string }>("/p/api/order", {
            name,
            mode,
            plate: mode === "car" ? plate : undefined,
            tableCode: mode === "table" ? tableCode : undefined,
            note: note || undefined,
            cardId: ensureCardId(),
            items: lines.map((l) => ({ itemId: l.itemId, size: l.size, qty: l.qty })),
          });
          onSent(token);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "That didn't go through. Try again.");
          setSending(false);
        }
      }}
    >
      <h2 className="text-lg font-semibold tracking-tight">Your order</h2>
      <ul className="space-y-2 text-sm">
        {lines.map((line) => (
          <li key={`${line.itemId}:${line.size ?? ""}`} className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              {line.qty} × {line.name}
              {line.size ? ` (${line.size})` : ""}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Button type="button" size="icon-xs" variant="outline" aria-label={`One less ${line.name}`} onClick={() => change(line, -1)}>
                <Minus />
              </Button>
              <Button type="button" size="icon-xs" variant="outline" aria-label={`One more ${line.name}`} onClick={() => change(line, 1)}>
                <Plus />
              </Button>
              <span className="w-14 text-right tabular-nums">{formatPrice(line.price * line.qty)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between border-t border-border pt-2 font-medium">
        <span>Total</span>
        <span className="tabular-nums">{formatPrice(total)}</span>
      </p>

      <ToggleGroup
        value={mode ? [mode] : []}
        onValueChange={(next) => next[0] && setMode(next[0] as OrderMode)}
        variant="outline"
      >
        {modes.map((m) => (
          <ToggleGroupItem key={m.value} value={m.value} data-testid={`mode-${m.value}`}>
            {m.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {mode === "car" ? (
        <div className="space-y-1.5">
          <Label htmlFor="plate">Car plate</Label>
          <Input id="plate" required maxLength={20} value={plate} onChange={(e) => setPlate(e.target.value)} />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="note">Note</Label>
        <Textarea id="note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="customer-name">Your name</Label>
        <Input id="customer-name" required maxLength={40} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" pending={sending}>
        Send order
      </Button>
      <p className="text-center text-xs text-muted-foreground">You pay when you collect.</p>
    </form>
  );
}
