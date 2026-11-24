// Rules shared by the server and the pages. No Worker imports here.

export const STAMP_SHAPES = ["cup", "star", "heart", "dot"] as const;
export type StampShape = (typeof STAMP_SHAPES)[number];

export const MAX_STAMPS_PER_DAY = 3;
export const NEW_CARD_STAMPS = 2;

export type OrderStatus =
  | "pending"
  | "waiting"
  | "ready"
  | "done"
  | "cancelled"
  | "rejected";
export type Delivery = "sent" | "delivered" | "seen" | "coming";
export type OrderMode = "collect" | "car" | "table";

/** The venue's calendar day (YYYY-MM-DD) in its time zone. */
export function localDay(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The venue's clock (HH:MM, 24-hour) in its time zone. */
export function localTime(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: safeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("hour")}:${get("minute")}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function safeZone(timeZone: string): string {
  return isValidTimeZone(timeZone) ? timeZone : "UTC";
}

/**
 * Whether ordering hours include `time`. Blank hours mean all day; a
 * closing time before the opening time runs past midnight.
 */
export function withinHours(opensAt: string, closesAt: string, time: string) {
  if (!opensAt || !closesAt || opensAt === closesAt) return true;
  if (opensAt < closesAt) return time >= opensAt && time < closesAt;
  return time >= opensAt || time < closesAt;
}

/** "3.20" or "3,20" as 320 cents; null when it isn't a price. */
export function parsePrice(value: string): number | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

export function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Stamps on the card's current round, as people see them. */
export function cardCount(bonus: number, stamped: number): number {
  return bonus + stamped;
}

/** Which actions staff have on an order in a given state. */
export function nextStatuses(status: OrderStatus): OrderStatus[] {
  switch (status) {
    case "pending":
      return ["waiting", "rejected"];
    case "waiting":
      return ["ready", "cancelled"];
    case "ready":
      return ["done", "cancelled"];
    default:
      return [];
  }
}
