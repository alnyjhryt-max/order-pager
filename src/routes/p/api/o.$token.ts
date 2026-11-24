import { createFileRoute } from "@tanstack/react-router";
import { publicOrder } from "@/server/orders";
import { json } from "@/server/publicApi";

// Public: one order, for whoever holds its link.
export const Route = createFileRoute("/p/api/o/$token")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { token: string } }) => {
        const order = await publicOrder(params.token);
        return order ? json(order) : json({ error: "No such order." }, 404);
      },
    },
  },
});
