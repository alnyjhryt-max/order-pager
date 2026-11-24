import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { batch, db, rawStatement, statement } from "@/db";
import {
  loyaltyCards,
  orderAttempts,
  orderItems,
  orders,
  pushSubscriptions,
  stamps,
} from "@/db/schema";
import { itemsById, parseSizes } from "@/server/menu";
import { sendPush } from "@/server/push";
import { tableByCode } from "@/server/tables";
import { getSettings, orderingClosedReason, today, type Settings } from "@/server/venue";
import {
  MAX_STAMPS_PER_DAY,
  type Delivery,
  type OrderMode,
  type OrderStatus,
} from "@/shared/rules";

export class OrderError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

type OrderRow = typeof orders.$inferSelect;

export interface CardSummary {
  count: number;
  target: number;
  reward: string;
  shape: string;
}

export interface OrderLine {
  name: string;
  size: string;
  qty: number;
  price: number;
}

export interface BoardOrder {
  id: string;
  token: string;
  number: string;
  label: string;
  source: "staff" | "phone";
  status: OrderStatus;
  delivery: Delivery | null;
  mode: OrderMode | null;
  plate: string;
  tableName: string;
  customerName: string;
  note: string;
  createdAt: string;
  items: OrderLine[];
  card: CardSummary | null;
}

// ---- Loyalty cards ------------------------------------------------------

export async function cardSummaries(
  cardIds: string[],
  s: Settings,
): Promise<Map<string, CardSummary>> {
  const result = new Map<string, CardSummary>();
  if (!s.loyaltyEnabled || cardIds.length === 0) return result;
  const rows = await db
    .select({
      id: loyaltyCards.id,
      bonus: loyaltyCards.bonus,
      stamped: sql<number>`(select count(*) from stamps s where s.card_id = "loyalty_cards"."id" and s.round = "loyalty_cards"."round")`,
    })
    .from(loyaltyCards)
    .where(inArray(loyaltyCards.id, [...new Set(cardIds)]));
  for (const row of rows) {
    result.set(row.id, {
      count: row.bonus + Number(row.stamped),
      target: s.stampsNeeded,
      reward: s.rewardText,
      shape: s.stampShape,
    });
  }
  return result;
}

export async function getCard(cardId: string) {
  const s = await getSettings();
  if (!s.loyaltyEnabled) return null;
  return (await cardSummaries([cardId], s)).get(cardId) ?? null;
}

/** Records a reward on a full card and starts its next round. */
export async function giveReward(orderId: string, userId: string) {
  const s = await getSettings();
  if (!s.loyaltyEnabled) throw new OrderError("The loyalty card is off.");
  const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order?.cardId) throw new OrderError("This order has no card.");
  const [inserted] = await batch([
    rawStatement(
      `insert into rewards (id, card_id, order_id, round, given_by)
      select ?, c.id, ?, c.round, ?
      from loyalty_cards c
      where c.id = ?
        and c.bonus + (select count(*) from stamps s where s.card_id = c.id and s.round = c.round) >= ?
      on conflict do nothing`,
      crypto.randomUUID(),
      orderId,
      userId,
      order.cardId,
      s.stampsNeeded,
    ),
    rawStatement(
      `update loyalty_cards set round = round + 1, bonus = 0
      where id = ?
        and exists (select 1 from rewards r where r.card_id = loyalty_cards.id and r.round = loyalty_cards.round)`,
      order.cardId,
    ),
  ]);
  if (!inserted.meta.changes) throw new OrderError("The card isn't full yet.");
}

// ---- The board ------------------------------------------------------------

const ACTIVE: OrderStatus[] = ["pending", "waiting", "ready"];

export async function listBoard(): Promise<BoardOrder[]> {
  const s = await getSettings();
  const rows = await db
    .select()
    .from(orders)
    .where(or(inArray(orders.status, ACTIVE), eq(orders.day, today(s))))
    .orderBy(asc(orders.createdAt), asc(orders.id));
  return withDetails(rows, s);
}

async function withDetails(rows: OrderRow[], s: Settings) {
  const ids = rows.map((r) => r.id);
  const lines = ids.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids))
    : [];
  const cards = await cardSummaries(
    rows.flatMap((r) => (r.cardId ? [r.cardId] : [])),
    s,
  );
  return rows.map((row) => ({
    id: row.id,
    token: row.token,
    number: row.number,
    label: row.label,
    source: row.source,
    status: row.status,
    delivery: row.delivery,
    mode: row.mode,
    plate: row.plate,
    tableName: row.tableName,
    customerName: row.customerName,
    note: row.note,
    createdAt: row.createdAt,
    items: lines
      .filter((l) => l.orderId === row.id)
      .map((l) => ({ name: l.name, size: l.size, qty: l.qty, price: l.price })),
    card: row.cardId ? (cards.get(row.cardId) ?? null) : null,
  }));
}

export const createOrderInput = z
  .object({
    number: z.string().trim().min(1, "Type the order number").max(12),
    label: z.string().trim().max(60),
  })
  .strict();

export async function createStaffOrder(
  userId: string,
  input: z.infer<typeof createOrderInput>,
) {
  const s = await getSettings();
  const clash = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.number, input.number), inArray(orders.status, ACTIVE)))
    .get();
  if (clash) throw new OrderError(`Order ${input.number} is already on the board.`);
  const id = crypto.randomUUID();
  const token = randomToken();
  await db.insert(orders).values({
    id,
    token,
    number: input.number,
    label: input.label,
    source: "staff",
    status: "waiting",
    day: today(s),
    createdBy: userId,
  });
  return { id, token, number: input.number };
}

export const changeInput = z
  .object({
    id: z.string().uuid(),
    to: z.enum(["waiting", "rejected", "ready", "done", "cancelled"]),
  })
  .strict();

const FROM: Record<z.infer<typeof changeInput>["to"], OrderStatus[]> = {
  waiting: ["pending"],
  rejected: ["pending"],
  ready: ["waiting"],
  done: ["ready"],
  cancelled: ["waiting", "ready"],
};

/**
 * Moves an order on. Ready stamps the attached card (at most three a day);
 * a cancel takes that stamp back. Returns the push to send, if any.
 */
export async function changeStatus(
  input: z.infer<typeof changeInput>,
): Promise<{ pushEndpoint: string | null }> {
  const s = await getSettings();
  const now = sql`(current_timestamp)`;
  const move = db
    .update(orders)
    .set({
      status: input.to,
      updatedAt: now,
      ...(input.to === "ready" ? { readyAt: now } : {}),
    })
    .where(and(eq(orders.id, input.id), inArray(orders.status, FROM[input.to])));
  const day = today(s);
  if (input.to === "ready") {
    const [moved] = await batch([
      statement(move),
      rawStatement(
        `insert into stamps (order_id, card_id, round, day)
        select o.id, o.card_id, c.round, ?
        from orders o join loyalty_cards c on c.id = o.card_id
        where o.id = ? and o.status = 'ready' and ? = 1
          and (select count(*) from stamps s where s.card_id = o.card_id and s.day = ?) < ?
        on conflict do nothing`,
        day,
        input.id,
        s.loyaltyEnabled ? 1 : 0,
        day,
        MAX_STAMPS_PER_DAY,
      ),
    ]);
    if (!moved.meta.changes) return { pushEndpoint: null };
    const subscription = await db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.orderId, input.id))
      .get();
    return { pushEndpoint: subscription?.endpoint ?? null };
  }
  if (input.to === "cancelled") {
    await batch([
      statement(move),
      rawStatement(
        `delete from stamps where order_id = ?
        and exists (select 1 from orders where id = ? and status = 'cancelled')`,
        input.id,
        input.id,
      ),
    ]);
    return { pushEndpoint: null };
  }
  await move;
  return { pushEndpoint: null };
}

/** After Ready: wake the customer's phone and record that it was sent. */
export async function ringPhone(orderId: string, endpoint: string, subject: string) {
  const result = await sendPush(endpoint, subject);
  if (result === "sent") await advanceDelivery({ id: orderId }, "sent");
  if (result === "gone")
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.orderId, orderId));
}

// ---- The customer's side (public, by token) -----------------------------

const RANK: Record<Delivery, number> = { sent: 1, delivered: 2, seen: 3, coming: 4 };

/** Delivery only moves forward, and only while the order is ready. */
async function advanceDelivery(
  where: { id: string } | { token: string },
  to: Delivery,
): Promise<boolean> {
  const match = "id" in where ? eq(orders.id, where.id) : eq(orders.token, where.token);
  const rank = sql`case ${orders.delivery} when 'sent' then 1 when 'delivered' then 2 when 'seen' then 3 when 'coming' then 4 else 0 end`;
  const result = await db
    .update(orders)
    .set({ delivery: to, updatedAt: sql`(current_timestamp)` })
    .where(and(match, eq(orders.status, "ready"), sql`${rank} < ${RANK[to]}`));
  return result.meta.changes > 0;
}

export async function customerAction(token: string, action: "delivered" | "seen" | "coming") {
  const order = await orderByToken(token);
  if (!order) throw new OrderError("No such order.", 404);
  if (order.status !== "ready") throw new OrderError("This order isn't ready.");
  await advanceDelivery({ token }, action);
}

export function orderByToken(token: string) {
  return db.select().from(orders).where(eq(orders.token, token)).get();
}

export interface PublicOrder {
  number: string;
  label: string;
  status: OrderStatus;
  delivery: Delivery | null;
  mode: OrderMode | null;
  tableName: string;
  plate: string;
  customerName: string;
  note: string;
  items: OrderLine[];
  venueName: string;
  loyalty: boolean;
  card: CardSummary | null;
}

/** Only what the customer holding this order's link may see. */
export async function publicOrder(token: string): Promise<PublicOrder | null> {
  const row = await orderByToken(token);
  if (!row) return null;
  const s = await getSettings();
  const [details] = await withDetails([row], s);
  return {
    number: details.number,
    label: details.label,
    status: details.status,
    delivery: details.delivery,
    mode: details.mode,
    tableName: details.tableName,
    plate: details.plate,
    customerName: details.customerName,
    note: details.note,
    items: details.items,
    venueName: s.venueName,
    loyalty: s.loyaltyEnabled,
    card: details.card,
  };
}

const LIVE: OrderStatus[] = ["pending", "waiting", "ready"];

/** Attaches the customer's card to the order once; a new card starts with two stamps. */
export async function claimOrder(token: string, cardId: string) {
  const order = await orderByToken(token);
  if (!order) throw new OrderError("No such order.", 404);
  if (!LIVE.includes(order.status)) throw new OrderError("This order is closed.");
  await batch([
    statement(
      db
        .update(orders)
        .set({ cardId })
        .where(and(eq(orders.token, token), isNull(orders.cardId), inArray(orders.status, LIVE))),
    ),
    rawStatement(
      `insert into loyalty_cards (id)
      select ? where exists (select 1 from orders where token = ? and card_id = ?)
      on conflict do nothing`,
      cardId,
      token,
      cardId,
    ),
  ]);
}

// The browsers' push services; the app only ever sends to these.
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  ".push.apple.com",
  ".notify.windows.com",
];

function isPushService(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.port &&
      PUSH_HOSTS.some((host) =>
        host.startsWith(".") ? url.hostname.endsWith(host) : url.hostname === host,
      )
    );
  } catch {
    return false;
  }
}

export async function savePushSubscription(token: string, endpoint: string) {
  if (!isPushService(endpoint)) throw new OrderError("That isn't a push service.", 400);
  const order = await orderByToken(token);
  if (!order) throw new OrderError("No such order.", 404);
  if (!LIVE.includes(order.status)) throw new OrderError("This order is closed.");
  await db
    .insert(pushSubscriptions)
    .values({ orderId: order.id, endpoint })
    .onConflictDoUpdate({ target: pushSubscriptions.orderId, set: { endpoint } });
}

// ---- Phone orders -------------------------------------------------------

export const phoneOrderInput = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(40),
    mode: z.enum(["collect", "car", "table"]),
    plate: z.string().trim().max(20).optional(),
    tableCode: z.string().trim().max(20).optional(),
    note: z.string().trim().max(300).optional(),
    cardId: z.string().uuid().optional(),
    items: z
      .array(
        z
          .object({
            itemId: z.string().uuid(),
            size: z.string().trim().max(40).optional(),
            qty: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();

const RATE_LIMIT = 20;

export async function createPhoneOrder(
  input: z.infer<typeof phoneOrderInput>,
  client: string,
) {
  const s = await getSettings();
  const minute = new Date().toISOString().slice(0, 16);
  const [attempt] = await db
    .insert(orderAttempts)
    .values({ client, minute, count: 1 })
    .onConflictDoUpdate({
      target: [orderAttempts.client, orderAttempts.minute],
      set: { count: sql`${orderAttempts.count} + 1` },
    })
    .returning({ count: orderAttempts.count });
  if (attempt.count > RATE_LIMIT)
    throw new OrderError("Too many orders at once. Try again in a minute.", 429);

  await db
    .delete(orderAttempts)
    .where(lt(orderAttempts.minute, new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 16)));

  const closed = orderingClosedReason(s);
  if (closed) throw new OrderError("Not taking orders right now.");
  const enabled = { collect: s.collectEnabled, car: s.carEnabled, table: s.tableEnabled };
  if (!enabled[input.mode]) throw new OrderError("That way of ordering is off.");
  let tableName = "";
  if (input.mode === "car" && !input.plate)
    throw new OrderError("Enter your car's plate.", 400);
  if (input.mode === "table") {
    const table = input.tableCode ? await tableByCode(input.tableCode) : undefined;
    if (!table) throw new OrderError("Scan the code on your table.", 400);
    tableName = table.name;
  }

  const menu = await itemsById([...new Set(input.items.map((i) => i.itemId))]);
  const day = today(s);
  const lines = input.items.map((line) => {
    const item = menu.find((m) => m.id === line.itemId);
    if (!item) throw new OrderError("Something on your order is no longer on the menu.", 400);
    if (item.soldOutOn === day) throw new OrderError(`${item.name} is sold out.`);
    const sizes = parseSizes(item.sizes);
    let price = item.price;
    let size = "";
    if (sizes.length) {
      const chosen = sizes.find((sz) => sz.name === line.size);
      if (!chosen) throw new OrderError(`Choose a size for ${item.name}.`, 400);
      price = chosen.price;
      size = chosen.name;
    }
    return { itemId: item.id, name: item.name, size, price, qty: line.qty };
  });

  const id = crypto.randomUUID();
  const token = randomToken();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(and(eq(orders.source, "phone"), eq(orders.day, day)));
  const number = `P${Number(n) + 1}`;
  await db.batch([
    db.insert(orders).values({
      id,
      token,
      number,
      source: "phone",
      status: "pending",
      mode: input.mode,
      plate: input.mode === "car" ? (input.plate ?? "") : "",
      tableName,
      customerName: input.name,
      note: input.note ?? "",
      day,
    }),
    db.insert(orderItems).values(
      lines.map((line) => ({ id: crypto.randomUUID(), orderId: id, ...line })),
    ),
  ]);
  if (input.cardId) await claimOrder(token, input.cardId);
  return { token, number };
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
