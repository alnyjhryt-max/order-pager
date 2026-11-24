import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import {
  STAMP_SHAPES,
  isValidTimeZone,
  localDay,
  localTime,
  withinHours,
} from "@/shared/rules";

export type Settings = typeof settings.$inferSelect;

const time = z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]);

export const saveSettingsInput = z
  .object({
    venueName: z.string().trim().max(80),
    timeZone: z
      .string()
      .trim()
      .refine(isValidTimeZone, "Unknown time zone, such as Europe/Madrid"),
    loyaltyEnabled: z.boolean(),
    stampsNeeded: z.number().int().min(2).max(30),
    rewardText: z.string().trim().max(120),
    stampShape: z.enum(STAMP_SHAPES),
    collectEnabled: z.boolean(),
    carEnabled: z.boolean(),
    tableEnabled: z.boolean(),
    opensAt: time,
    closesAt: time,
    paused: z.boolean(),
  })
  .strict();

/** The venue's one settings row, made with defaults the first time. */
export async function getSettings(): Promise<Settings> {
  const row = await db.select().from(settings).where(eq(settings.id, 1)).get();
  if (row) return row;
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  return (await db.select().from(settings).where(eq(settings.id, 1)).get())!;
}

export async function saveSettings(
  userId: string,
  input: z.infer<typeof saveSettingsInput>,
): Promise<Settings> {
  await getSettings();
  await db
    .update(settings)
    .set({ ...input, updatedBy: userId })
    .where(eq(settings.id, 1));
  return getSettings();
}

export function today(s: Pick<Settings, "timeZone">, now = new Date()) {
  return localDay(s.timeZone, now);
}

/** Why phone orders are refused right now, or null when they're open. */
export function orderingClosedReason(s: Settings, now = new Date()) {
  if (!s.collectEnabled && !s.carEnabled && !s.tableEnabled) return "off";
  if (s.paused) return "paused";
  if (!withinHours(s.opensAt, s.closesAt, localTime(s.timeZone, now)))
    return "hours";
  return null;
}
