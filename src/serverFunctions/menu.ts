import { createServerFn } from "@tanstack/react-start";
import { isAdmin } from "@every-app/sdk/server";
import { z } from "zod";
import { adminMiddleware, memberMiddleware } from "@/serverFunctions/middleware";
import * as menu from "@/server/menu";

export const getMenu = createServerFn()
  .middleware([memberMiddleware])
  .handler(async ({ context }) => ({
    canEdit: isAdmin(context.user),
    sections: await menu.listMenu(),
  }));

export const saveSection = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((data: unknown) => menu.sectionInput.parse(data))
  .handler(({ data }) => menu.saveSection(data));

export const deleteSection = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((data: unknown) => menu.idInput.parse(data))
  .handler(async ({ data }) => {
    await menu.deleteSection(data.id);
    return { ok: true };
  });

export const moveSection = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((data: unknown) => menu.moveInput.parse(data))
  .handler(async ({ data }) => {
    await menu.moveSection(data.id, data.direction);
    return { ok: true };
  });

export const saveItem = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((data: unknown) => menu.itemInput.parse(data))
  .handler(({ data }) => menu.saveItem(data));

export const deleteItem = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((data: unknown) => menu.idInput.parse(data))
  .handler(async ({ data }) => {
    await menu.deleteItem(data.id);
    return { ok: true };
  });

export const moveItem = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((data: unknown) => menu.moveInput.parse(data))
  .handler(async ({ data }) => {
    await menu.moveItem(data.id, data.direction);
    return { ok: true };
  });

/** Any member: sold out for the rest of the day, or back on. */
export const setSoldOut = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => menu.soldOutInput.parse(data))
  .handler(async ({ data }) => {
    await menu.setSoldOut(data.id, data.soldOut);
    return { ok: true };
  });

const photoInput = z.object({ id: z.string().uuid(), photo: z.instanceof(File) });

export const uploadPhoto = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected a form");
    return photoInput.parse({ id: data.get("id"), photo: data.get("photo") });
  })
  .handler(async ({ data }) => {
    await menu.setPhoto(data.id, data.photo);
    return { ok: true };
  });
