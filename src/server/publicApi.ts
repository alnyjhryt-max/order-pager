import { ZodError } from "zod";
import { OrderError } from "@/server/orders";

/** JSON for the public pages; never cached, never framed. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/** Turns a refusal into the status and message the customer's page shows. */
export async function answer(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof OrderError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json({ error: error.issues[0]?.message ?? "Check the order." }, 400);
    if (error instanceof SyntaxError) return json({ error: "Bad request" }, 400);
    throw error;
  }
}
