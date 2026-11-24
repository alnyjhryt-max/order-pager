import { createFileRoute } from "@tanstack/react-router";
import { listMenu } from "@/server/menu";
import { json } from "@/server/publicApi";
import { tableByCode } from "@/server/tables";
import { getSettings, orderingClosedReason } from "@/server/venue";

// Public: the menu page customers open from a code or link.
export const Route = createFileRoute("/p/api/menu")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const s = await getSettings();
        const code = new URL(request.url).searchParams.get("t");
        const table = code ? await tableByCode(code) : undefined;
        return json({
          venueName: s.venueName,
          sections: await listMenu(),
          ordering: {
            closed: orderingClosedReason(s),
            collect: s.collectEnabled,
            car: s.carEnabled,
            table: s.tableEnabled,
            tableName: table?.name ?? null,
          },
          loyalty: s.loyaltyEnabled
            ? { target: s.stampsNeeded, reward: s.rewardText, shape: s.stampShape }
            : null,
        });
      },
    },
  },
});
