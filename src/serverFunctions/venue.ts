import { createServerFn } from "@tanstack/react-start";
import { isAdmin } from "@every-app/sdk/server";
import { adminMiddleware, memberMiddleware } from "@/serverFunctions/middleware";
import * as venue from "@/server/venue";
import * as tables from "@/server/tables";

export const getSettings = createServerFn()
  .middleware([memberMiddleware])
  .handler(async ({ context }) => {
    const s = await venue.getSettings();
    return {
      canEdit: isAdmin(context.user),
      settings: {
        venueName: s.venueName,
        timeZone: s.timeZone,
        loyaltyEnabled: s.loyaltyEnabled,
        stampsNeeded: s.stampsNeeded,
        rewardText: s.rewardText,
        stampShape: s.stampShape as (typeof import("@/shared/rules").STAMP_SHAPES)[number],
        collectEnabled: s.collectEnabled,
        carEnabled: s.carEnabled,
        tableEnabled: s.tableEnabled,
        opensAt: s.opensAt,
        closesAt: s.closesAt,
        paused: s.paused,
      },
    };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((data: unknown) => venue.saveSettingsInput.parse(data))
  .handler(async ({ data, context }) => {
    await venue.saveSettings(context.user.id, data);
    return { ok: true };
  });

export const getTables = createServerFn()
  .middleware([memberMiddleware])
  .handler(async ({ context }) => ({
    canEdit: isAdmin(context.user),
    tables: await tables.listTables(),
  }));

export const createTable = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((data: unknown) => tables.tableInput.parse(data))
  .handler(({ data }) => tables.createTable(data));

export const deleteTable = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((data: unknown) => tables.tableIdInput.parse(data))
  .handler(async ({ data }) => {
    await tables.deleteTable(data.id);
    return { ok: true };
  });
