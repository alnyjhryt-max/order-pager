import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  claimOrder,
  customerAction,
  savePushSubscription,
} from "@/server/orders";
import { answer, json } from "@/server/publicApi";

const claimBody = z.object({ cardId: z.string().uuid() });
const pushBody = z.object({ endpoint: z.string().url().max(1000) });

// Public: what the customer's page and its service worker do with their
// own order, and nothing else.
export const Route = createFileRoute("/p/api/o/$token/$action")({
  server: {
    handlers: {
      POST: ({
        request,
        params,
      }: {
        request: Request;
        params: { token: string; action: string };
      }) =>
        answer(async () => {
          switch (params.action) {
            case "claim":
              await claimOrder(params.token, claimBody.parse(await request.json()).cardId);
              return json({ ok: true });
            case "push":
              await savePushSubscription(
                params.token,
                pushBody.parse(await request.json()).endpoint,
              );
              return json({ ok: true });
            case "delivered":
            case "seen":
            case "coming":
              await customerAction(params.token, params.action);
              return json({ ok: true });
            default:
              return json({ error: "Not found" }, 404);
          }
        }),
    },
  },
});
