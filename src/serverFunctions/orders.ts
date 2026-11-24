import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { isAdmin } from "@every-app/sdk/server";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { memberMiddleware } from "@/serverFunctions/middleware";
import * as orders from "@/server/orders";

export const getBoard = createServerFn()
  .middleware([memberMiddleware])
  .handler(async ({ context }) => ({
    canEdit: isAdmin(context.user),
    orders: await orders.listBoard(),
  }));

export const createOrder = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => orders.createOrderInput.parse(data))
  .handler(({ data, context }) => orders.createStaffOrder(context.user.id, data));

export const changeOrder = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => orders.changeInput.parse(data))
  .handler(async ({ data }) => {
    const { pushEndpoint } = await orders.changeStatus(data);
    if (pushEndpoint) {
      const origin = new URL(getRequest().url).origin;
      waitUntil(orders.ringPhone(data.id, pushEndpoint, origin));
    }
    return { ok: true };
  });

export const giveReward = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    await orders.giveReward(data.id, context.user.id);
    return { ok: true };
  });
