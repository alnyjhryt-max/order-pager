import { and, asc, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { menuItems, menuSections } from "@/db/schema";
import { getSettings, today } from "@/server/venue";

export interface Size {
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  sectionId: string;
  name: string;
  nameEn: string;
  description: string;
  price: number;
  sizes: Size[];
  photoUrl: string | null;
  calories: number | null;
  caffeineMg: number | null;
  allergens: string;
  highSalt: boolean;
  soldOut: boolean;
}

export interface MenuSection {
  id: string;
  name: string;
  nameEn: string;
  items: MenuItem[];
}

const name = z.string().trim().min(1, "Give it a name").max(80);
const optionalName = z.string().trim().max(80);
const cents = z.number().int().min(0).max(1_000_000);

export const sectionInput = z
  .object({ id: z.string().uuid().optional(), name, nameEn: optionalName })
  .strict();

export const itemInput = z
  .object({
    id: z.string().uuid().optional(),
    sectionId: z.string().uuid(),
    name,
    nameEn: optionalName,
    description: z.string().trim().max(300),
    price: cents,
    sizes: z
      .array(z.object({ name: z.string().trim().min(1).max(40), price: cents }))
      .max(6),
    calories: z.number().int().min(0).max(10000).nullable(),
    caffeineMg: z.number().int().min(0).max(2000).nullable(),
    allergens: z.string().trim().max(200),
    highSalt: z.boolean(),
  })
  .strict();

export type ItemInput = z.infer<typeof itemInput>;

export const idInput = z.object({ id: z.string().uuid() }).strict();
export const moveInput = z
  .object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) })
  .strict();
export const soldOutInput = z
  .object({ id: z.string().uuid(), soldOut: z.boolean() })
  .strict();

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The whole menu in order, with today's sold-out marks. */
export async function listMenu(): Promise<MenuSection[]> {
  const day = today(await getSettings());
  const [sections, items] = await Promise.all([
    db
      .select()
      .from(menuSections)
      .orderBy(asc(menuSections.position), asc(menuSections.createdAt)),
    db
      .select()
      .from(menuItems)
      .orderBy(asc(menuItems.position), asc(menuItems.createdAt)),
  ]);
  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    nameEn: section.nameEn,
    items: items
      .filter((item) => item.sectionId === section.id)
      .map((item) => ({
        id: item.id,
        sectionId: item.sectionId,
        name: item.name,
        nameEn: item.nameEn,
        description: item.description,
        price: item.price,
        sizes: parseSizes(item.sizes),
        photoUrl: item.photoKey ? `/p/img/${item.photoKey}` : null,
        calories: item.calories,
        caffeineMg: item.caffeineMg,
        allergens: item.allergens,
        highSalt: item.highSalt,
        soldOut: item.soldOutOn === day,
      })),
  }));
}

export function parseSizes(json: string): Size[] {
  try {
    const sizes = JSON.parse(json);
    return Array.isArray(sizes) ? sizes : [];
  } catch {
    return [];
  }
}

export async function saveSection(input: z.infer<typeof sectionInput>) {
  if (input.id) {
    await db
      .update(menuSections)
      .set({ name: input.name, nameEn: input.nameEn })
      .where(eq(menuSections.id, input.id));
    return { id: input.id };
  }
  const id = crypto.randomUUID();
  const last = await db
    .select({ position: menuSections.position })
    .from(menuSections)
    .orderBy(asc(menuSections.position));
  await db.insert(menuSections).values({
    id,
    name: input.name,
    nameEn: input.nameEn,
    position: (last.at(-1)?.position ?? -1) + 1,
  });
  return { id };
}

export async function deleteSection(id: string) {
  const photos = await db
    .select({ key: menuItems.photoKey })
    .from(menuItems)
    .where(eq(menuItems.sectionId, id));
  await db.batch([
    db.delete(menuItems).where(eq(menuItems.sectionId, id)),
    db.delete(menuSections).where(eq(menuSections.id, id)),
  ]);
  await deletePhotos(photos.map((p) => p.key));
}

export async function saveItem(input: z.infer<typeof itemInput>) {
  const section = await db
    .select({ id: menuSections.id })
    .from(menuSections)
    .where(eq(menuSections.id, input.sectionId))
    .get();
  if (!section) throw new Error("That section no longer exists.");
  const values = {
    sectionId: input.sectionId,
    name: input.name,
    nameEn: input.nameEn,
    description: input.description,
    price: input.sizes[0]?.price ?? input.price,
    sizes: JSON.stringify(input.sizes),
    calories: input.calories,
    caffeineMg: input.caffeineMg,
    allergens: input.allergens,
    highSalt: input.highSalt,
  };
  if (input.id) {
    await db.update(menuItems).set(values).where(eq(menuItems.id, input.id));
    return { id: input.id };
  }
  const id = crypto.randomUUID();
  const last = await db
    .select({ position: menuItems.position })
    .from(menuItems)
    .where(eq(menuItems.sectionId, input.sectionId))
    .orderBy(asc(menuItems.position));
  await db
    .insert(menuItems)
    .values({ id, ...values, position: (last.at(-1)?.position ?? -1) + 1 });
  return { id };
}

export async function deleteItem(id: string) {
  const item = await db
    .select({ key: menuItems.photoKey })
    .from(menuItems)
    .where(eq(menuItems.id, id))
    .get();
  if (!item) return;
  await db.delete(menuItems).where(eq(menuItems.id, id));
  await deletePhotos([item.key]);
}

/** Swaps an item with its neighbour in the same section. */
export async function moveItem(id: string, direction: "up" | "down") {
  const item = await db.select().from(menuItems).where(eq(menuItems.id, id)).get();
  if (!item) return;
  const siblings = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(eq(menuItems.sectionId, item.sectionId))
    .orderBy(asc(menuItems.position), asc(menuItems.createdAt));
  const order = reorder(siblings.map((s) => s.id), id, direction);
  await db.batch(
    order.map((itemId, position) =>
      db.update(menuItems).set({ position }).where(eq(menuItems.id, itemId)),
    ) as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
  );
}

export async function moveSection(id: string, direction: "up" | "down") {
  const sections = await db
    .select({ id: menuSections.id })
    .from(menuSections)
    .orderBy(asc(menuSections.position), asc(menuSections.createdAt));
  if (!sections.some((s) => s.id === id)) return;
  const order = reorder(sections.map((s) => s.id), id, direction);
  await db.batch(
    order.map((sectionId, position) =>
      db
        .update(menuSections)
        .set({ position })
        .where(eq(menuSections.id, sectionId)),
    ) as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
  );
}

function reorder(ids: string[], id: string, direction: "up" | "down") {
  const index = ids.indexOf(id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Sold out until the venue's next day, or available again. */
export async function setSoldOut(id: string, soldOut: boolean) {
  const day = today(await getSettings());
  await db
    .update(menuItems)
    .set({ soldOutOn: soldOut ? day : null })
    .where(eq(menuItems.id, id));
}

export async function setPhoto(id: string, file: File) {
  if (!PHOTO_TYPES.includes(file.type))
    throw new Error("Use a JPEG, PNG or WebP photo.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Use a photo under 5 MB.");
  const item = await db
    .select({ key: menuItems.photoKey })
    .from(menuItems)
    .where(eq(menuItems.id, id))
    .get();
  if (!item) throw new Error("That item no longer exists.");
  const key = `${crypto.randomUUID()}`;
  await env.files.put(`menu/${key}`, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  await db.update(menuItems).set({ photoKey: key }).where(eq(menuItems.id, id));
  await deletePhotos([item.key]);
}

async function deletePhotos(keys: (string | null)[]) {
  const real = keys.filter((k): k is string => Boolean(k));
  if (real.length) await env.files.delete(real.map((k) => `menu/${k}`));
}

/** A menu photo for the public page; only keys a menu item uses. */
export async function readPhoto(key: string) {
  if (!/^[0-9a-f-]{36}$/.test(key)) return null;
  const used = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.photoKey, key)))
    .get();
  if (!used) return null;
  return env.files.get(`menu/${key}`);
}

export async function itemsById(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(menuItems).where(inArray(menuItems.id, ids));
}
