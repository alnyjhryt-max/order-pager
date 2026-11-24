import { createFileRoute } from "@tanstack/react-router";
import { getCard } from "@/server/orders";
import { json } from "@/server/publicApi";

// Public: the loyalty card whose id the customer's browser holds.
export const Route = createFileRoute("/p/api/card/$id")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { id: string } }) => {
        if (!/^[0-9a-f-]{36}$/.test(params.id)) return json({ error: "No such card." }, 404);
        const card = await getCard(params.id);
        return card ? json(card) : json({ error: "No such card." }, 404);
      },
    },
  },
});
