import { createFileRoute } from "@tanstack/react-router";
import { vapidPublicKey } from "@/server/push";
import { json } from "@/server/publicApi";

// Public: the key a customer's browser subscribes to notifications with.
export const Route = createFileRoute("/p/api/push-key")({
  server: {
    handlers: {
      GET: () => json({ key: vapidPublicKey() }),
    },
  },
});
