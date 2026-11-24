import { createMiddleware } from "@tanstack/react-start";
import { isAdmin } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { rememberUser } from "@/server/users";

/** A signed-in member, recorded on first sight. */
export const memberMiddleware = createMiddleware({ type: "function" })
  .middleware([ensureUserMiddleware])
  .server(async ({ next, context }) => {
    await rememberUser(context.user);
    return next();
  });

/** An owner or admin of the organization; anyone else gets a 403. */
export const adminMiddleware = createMiddleware({ type: "function" })
  .middleware([memberMiddleware])
  .server(async ({ next, context }) => {
    if (!isAdmin(context.user)) {
      throw new Response("Only admins can change this.", { status: 403 });
    }
    return next();
  });
