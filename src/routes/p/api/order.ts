import { createFileRoute } from "@tanstack/react-router";
import { createPhoneOrder, phoneOrderInput } from "@/server/orders";
import { answer, json } from "@/server/publicApi";

// Public: a customer sends an order from the menu. It waits on the board
// until staff accept it.
export const Route = createFileRoute("/p/api/order")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) =>
        answer(async () => {
          const input = phoneOrderInput.parse(await request.json());
          const client = request.headers.get("cf-connecting-ip") ?? "unknown";
          const order = await createPhoneOrder(input, client);
          return json(order, 201);
        }),
    },
  },
});
