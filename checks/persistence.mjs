import { randomBytes } from "node:crypto";
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { LONG, addItem, addOrder, addSection, orderCard, saveSettings, setSwitch } from "./helpers.mjs";

const runtime = await startRuntime({
  bindings: { VAPID_PRIVATE_KEY: { type: "text", value: randomBytes(32).toString("base64url") } },
});
try {
  let owner = await (await runtime.context("owner")).newPage();
  await owner.goto("/settings");
  await owner.getByLabel("Venue name").fill("Riverside Kiosk");
  await setSwitch(owner, "Collect at counter", true);
  await setSwitch(owner, "Loyalty card", true);
  await saveSettings(owner);
  await owner.goto("/menu");
  await addSection(owner, "Bebidas", "Drinks");
  await addItem(owner, "Bebidas", { name: "Limonada", english: "Lemonade", price: "2.90", photo: true });
  await owner.goto("/tables");
  await owner.getByLabel("Table name").fill("Bench 1");
  await owner.getByRole("button", { name: "Add table" }).click();
  await expect(owner.getByTestId("table-row").filter({ hasText: "Bench 1" })).toBeVisible();
  await owner.goto("/");
  const link = await addOrder(owner, "18", "Blue umbrella");
  const guest = await (await runtime.context(null)).newPage();
  await guest.goto(link);
  await expect(guest.getByTestId("loyalty-count")).toHaveText(/^2\//, LONG);
  await orderCard(owner, "18").getByRole("button", { name: "Ready" }).click();
  await expect(guest.getByTestId("loyalty-count")).toHaveText(/^3\//, LONG);

  await runtime.restart();

  const menu = await (await runtime.fetch("/p/api/menu")).json();
  expect(menu.venueName).toBe("Riverside Kiosk");
  const item = menu.sections[0].items[0];
  expect(item.name).toBe("Limonada");
  expect(item.nameEn).toBe("Lemonade");
  expect((await runtime.fetch(new URL(item.photoUrl, `http://${runtime.hostname}`).pathname)).status).toBe(200);
  owner = await (await runtime.context("owner")).newPage();
  await owner.goto("/");
  await expect(orderCard(owner, "18").getByTestId("order-state")).toHaveText("Ready", LONG);
  await expect(orderCard(owner, "18").getByTestId("order-stamps")).toHaveText(/^3\//);
  await owner.goto("/tables");
  await expect(owner.getByTestId("table-row").filter({ hasText: "Bench 1" })).toBeVisible();
  const guestAgain = await (await runtime.context(null)).newPage();
  await guestAgain.goto(link);
  await expect(guestAgain.getByTestId("order-status")).toHaveText("Ready for pickup", LONG);
} finally {
  await runtime.close();
}
