import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`);

/** The app's own record of each member, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

/** One row (id 1): the venue's settings. */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  venueName: text("venue_name").notNull().default(""),
  timeZone: text("time_zone").notNull().default("UTC"),
  loyaltyEnabled: integer("loyalty_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  stampsNeeded: integer("stamps_needed").notNull().default(8),
  rewardText: text("reward_text").notNull().default(""),
  stampShape: text("stamp_shape").notNull().default("cup"),
  collectEnabled: integer("collect_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  carEnabled: integer("car_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  tableEnabled: integer("table_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  opensAt: text("opens_at").notNull().default(""),
  closesAt: text("closes_at").notNull().default(""),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  updatedBy: text("updated_by"),
});

export const menuSections = sqliteTable("menu_sections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
});

export const menuItems = sqliteTable(
  "menu_items",
  {
    id: text("id").primaryKey(),
    sectionId: text("section_id")
      .notNull()
      .references(() => menuSections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameEn: text("name_en").notNull().default(""),
    description: text("description").notNull().default(""),
    /** In cents. */
    price: integer("price").notNull(),
    /** JSON: [{ name, price }] with prices in cents. */
    sizes: text("sizes").notNull().default("[]"),
    photoKey: text("photo_key"),
    calories: integer("calories"),
    caffeineMg: integer("caffeine_mg"),
    allergens: text("allergens").notNull().default(""),
    highSalt: integer("high_salt", { mode: "boolean" })
      .notNull()
      .default(false),
    /** The venue's local day it was marked sold out; sold out only on that day. */
    soldOutOn: text("sold_out_on"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("menu_items_section").on(t.sectionId, t.position)],
);

export const venueTables = sqliteTable("venue_tables", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  createdAt: createdAt(),
});

export const loyaltyCards = sqliteTable("loyalty_cards", {
  id: text("id").primaryKey(),
  /** Stamps the current round started with: 2 for a new card, 0 after a reward. */
  bonus: integer("bonus").notNull().default(2),
  round: integer("round").notNull().default(1),
  createdAt: createdAt(),
});

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    /** The customer's unguessable link token. */
    token: text("token").notNull().unique(),
    number: text("number").notNull(),
    label: text("label").notNull().default(""),
    source: text("source", { enum: ["staff", "phone"] }).notNull(),
    status: text("status", {
      enum: ["pending", "waiting", "ready", "done", "cancelled", "rejected"],
    }).notNull(),
    delivery: text("delivery", {
      enum: ["sent", "delivered", "seen", "coming"],
    }),
    mode: text("mode", { enum: ["collect", "car", "table"] }),
    plate: text("plate").notNull().default(""),
    tableName: text("table_name").notNull().default(""),
    customerName: text("customer_name").notNull().default(""),
    note: text("note").notNull().default(""),
    cardId: text("card_id"),
    day: text("day").notNull(),
    createdBy: text("created_by"),
    readyAt: text("ready_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [index("orders_day").on(t.day, t.status)],
);

export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  itemId: text("item_id"),
  name: text("name").notNull(),
  size: text("size").notNull().default(""),
  price: integer("price").notNull(),
  qty: integer("qty").notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  orderId: text("order_id")
    .primaryKey()
    .references(() => orders.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  createdAt: createdAt(),
});

/** One stamp per order that went ready, on the card attached to it. */
export const stamps = sqliteTable(
  "stamps",
  {
    orderId: text("order_id").primaryKey(),
    cardId: text("card_id").notNull(),
    round: integer("round").notNull(),
    day: text("day").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("stamps_card").on(t.cardId, t.round)],
);

export const rewards = sqliteTable("rewards", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull(),
  orderId: text("order_id").notNull(),
  round: integer("round").notNull(),
  givenBy: text("given_by").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("rewards_card_round").on(t.cardId, t.round)]);

/** Public order attempts per client per minute, to slow down abuse. */
export const orderAttempts = sqliteTable(
  "order_attempts",
  {
    client: text("client").notNull(),
    minute: text("minute").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.client, t.minute] })],
);
