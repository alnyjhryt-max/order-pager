import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { venueTables } from "@/db/schema";

export const tableInput = z
  .object({ name: z.string().trim().min(1, "Give it a name").max(40) })
  .strict();
export const tableIdInput = z.object({ id: z.string().uuid() }).strict();

export function listTables() {
  return db
    .select({ id: venueTables.id, name: venueTables.name, code: venueTables.code })
    .from(venueTables)
    .orderBy(asc(venueTables.createdAt), asc(venueTables.name));
}

export async function createTable(input: z.infer<typeof tableInput>) {
  const id = crypto.randomUUID();
  const code = randomCode();
  await db.insert(venueTables).values({ id, name: input.name, code });
  return { id, code };
}

export async function deleteTable(id: string) {
  await db.delete(venueTables).where(eq(venueTables.id, id));
}

export function tableByCode(code: string) {
  return db
    .select({ name: venueTables.name })
    .from(venueTables)
    .where(eq(venueTables.code, code))
    .get();
}

/** 10 characters a customer never has to type. */
function randomCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
