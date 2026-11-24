import { randomBytes } from "node:crypto";
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { LONG, addItem, addOrder, addSection, menuItem, orderCard, saveSettings, setSwitch } from "./helpers.mjs";

const runtime = await startRuntime({
  bindings: { VAPID_PRIVATE_KEY: { type: "text", value: randomBytes(32).toString("base64url") } },
});
try {
  const owner = await (await runtime.context("owner")).newPage();
  const member = await (await runtime.context("member")).newPage();
  const phoneOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  const guest = await (await runtime.context(null, phoneOptions)).newPage();

  // Settings (admin): venue, loyalty card, ordering modes.
  await owner.goto("/settings");
  await owner.getByLabel("Venue name").fill("Harbour Street Coffee");
  await setSwitch(owner, "Loyalty card", true);
  await owner.getByLabel("Stamps needed").fill("6");
  await owner.getByLabel("Reward").fill("A free drink of your choice");
  await owner.getByRole("button", { name: "Star", exact: true }).click();
  await setSwitch(owner, "Collect at counter", true);
  await setSwitch(owner, "Deliver to car", true);
  await setSwitch(owner, "Serve at table", true);
  await setSwitch(owner, "Pause ordering", false);
  await saveSettings(owner);
  await owner.reload();
  await expect(owner.getByLabel("Venue name")).toHaveValue("Harbour Street Coffee");
  await expect(owner.getByRole("switch", { name: "Loyalty card" })).toHaveAttribute("aria-checked", "true");

  // F002: build the menu.
  await owner.goto("/menu");
  await addSection(owner, "Cafés", "Coffee");
  await addSection(owner, "Dulces", "Pastries");
  await addItem(owner, "Cafés", {
    name: "Café con leche", english: "Latte", description: "Double shot with steamed milk",
    price: "3.20", sizes: [{ name: "Regular", price: "3.20" }, { name: "Large", price: "3.90" }],
    calories: "180", caffeine: "130", allergens: "Milk", photo: true,
  });
  await addItem(owner, "Cafés", { name: "Cortado", english: "Cortado", price: "2.40", caffeine: "120", allergens: "Milk" });
  await addItem(owner, "Dulces", { name: "Cruasán", english: "Croissant", price: "2.10", allergens: "Gluten, Milk, Egg", calories: "260" });
  await addItem(owner, "Dulces", { name: "Tostada con tomate", english: "Tomato toast", price: "2.80", highSalt: true });
  await addItem(owner, "Dulces", { name: "Magdalena", price: "1.50" });
  // Reorder: Cortado moves above Café con leche.
  const cafes = owner.getByTestId("menu-section").filter({ has: owner.getByRole("heading", { name: "Cafés", exact: true }) });
  await menuItem(owner, "Cortado").getByRole("button", { name: "Move up" }).click();
  await expect(cafes.getByTestId("menu-item").first()).toContainText("Cortado");
  // Delete.
  await menuItem(owner, "Magdalena").getByRole("button", { name: "Delete" }).click();
  await owner.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(menuItem(owner, "Magdalena")).toHaveCount(0);
  await owner.reload();
  await expect(cafes.getByTestId("menu-item").first()).toContainText("Cortado");
  await expect(menuItem(owner, "Magdalena")).toHaveCount(0);

  // Any member marks an item sold out.
  await member.goto("/menu");
  await member.getByRole("switch", { name: "Sold out: Cruasán" }).click();
  await expect(member.getByRole("switch", { name: "Sold out: Cruasán" })).toHaveAttribute("aria-checked", "true");

  // Public menu on a phone: sections, photo, prices, sold-out mark, language.
  await guest.goto("/p/m");
  await expect(guest.getByRole("heading", { name: "Harbour Street Coffee" })).toBeVisible(LONG);
  await expect(guest.getByRole("heading", { name: "Cafés", exact: true })).toBeVisible();
  const latte = guest.getByTestId("public-item").filter({ hasText: "Café con leche" });
  await expect(latte).toContainText("3.20");
  await expect(latte).toContainText("3.90");
  await expect(latte).toContainText("130 mg caffeine");
  await expect(latte).toContainText("Milk");
  const photo = latte.getByRole("img");
  await expect(photo).toBeVisible();
  const photoUrl = new URL(await photo.getAttribute("src"), `http://${runtime.hostname}`);
  expect(photoUrl.hostname).toBe(runtime.hostname);
  await expect.poll(() => photo.evaluate((img) => (img.complete ? img.naturalWidth : 0))).toBeGreaterThan(0);
  await expect(guest.getByTestId("public-item").filter({ hasText: "Cruasán" })).toContainText("Sold out");
  await expect(guest.getByTestId("public-item").filter({ hasText: "Tostada con tomate" })).toContainText("High in salt");
  await guest.getByRole("button", { name: "English", exact: true }).click();
  await expect(guest.getByRole("heading", { name: "Coffee", exact: true })).toBeVisible();
  await expect(guest.getByTestId("public-item").filter({ hasText: "Latte" })).toBeVisible();
  await guest.getByRole("button", { name: "Original", exact: true }).click();
  await expect(guest.getByRole("heading", { name: "Cafés", exact: true })).toBeVisible();
  // Phone-sized smoke: nothing wider than the screen.
  expect(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Sold out returns the next day: mark it as from an earlier day.
  const db = await runtime.database();
  await db.prepare("UPDATE menu_items SET sold_out_on = '2000-01-01' WHERE name = 'Cruasán'").run();
  await guest.reload();
  await expect(guest.getByTestId("public-item").filter({ hasText: "Cruasán" })).not.toContainText("Sold out", LONG);
  await member.reload();
  await expect(member.getByRole("switch", { name: "Sold out: Cruasán" })).toHaveAttribute("aria-checked", "false");
  // ...or when unmarked.
  await member.getByRole("switch", { name: "Sold out: Cortado" }).click();
  await expect(member.getByRole("switch", { name: "Sold out: Cortado" })).toHaveAttribute("aria-checked", "true");
  await member.getByRole("switch", { name: "Sold out: Cortado" }).click();
  await expect(member.getByRole("switch", { name: "Sold out: Cortado" })).toHaveAttribute("aria-checked", "false");

  // F001 + F003: paging and the loyalty card.
  await owner.goto("/");
  await runtime.assertBackLink(owner);
  const screen = await (await runtime.context("member")).newPage();
  await screen.goto("/screen");

  const link42 = await addOrder(owner, "42", "Window seat");
  expect(new URL(link42).hostname).toBe(runtime.hostname);
  await guest.goto(link42);
  await expect(guest.getByTestId("order-number")).toHaveText("42", LONG);
  await expect(guest.getByTestId("order-status")).toHaveText("Being prepared");
  await expect(guest.getByRole("button", { name: "Turn on alerts" })).toBeVisible();
  await expect(guest.getByTestId("loyalty-count")).toHaveText("2/6", LONG);
  await expect(guest.getByTestId("loyalty-card")).toContainText("A free drink of your choice");
  await expect(orderCard(owner, "42").getByTestId("order-stamps")).toHaveText("2/6", LONG);
  await expect(screen.getByTestId("screen-preparing")).toContainText("42", LONG);

  await orderCard(owner, "42").getByRole("button", { name: "Ready" }).click();
  await expect(orderCard(owner, "42").getByTestId("order-state")).toHaveText("Ready");
  await expect(guest.getByTestId("order-status")).toHaveText("Ready for pickup", LONG);
  await expect(guest.getByTestId("loyalty-count")).toHaveText("3/6", LONG);
  await expect(screen.getByTestId("screen-ready")).toContainText("42", LONG);
  await expect(screen.getByTestId("screen-preparing")).not.toContainText("42");
  await expect(orderCard(owner, "42").getByTestId("order-delivery")).toHaveText("Seen", LONG);
  await guest.getByRole("button", { name: "On my way" }).click();
  await expect(guest.getByText("The staff know you're coming")).toBeVisible();
  await expect(orderCard(owner, "42").getByTestId("order-delivery")).toHaveText("Coming", LONG);
  await orderCard(owner, "42").getByRole("button", { name: "Done" }).click();
  await expect(orderCard(owner, "42").getByTestId("order-state")).toHaveText("Done");
  await expect(guest.getByTestId("order-status")).toHaveText("Collected", LONG);
  await expect(screen.getByTestId("screen-ready")).not.toContainText("42", LONG);

  // A cancelled order takes its stamp back.
  const link43 = await addOrder(owner, "43");
  await guest.goto(link43);
  await expect(guest.getByTestId("loyalty-count")).toHaveText("3/6", LONG);
  await expect(orderCard(owner, "43").getByTestId("order-stamps")).toHaveText("3/6", LONG);
  await orderCard(owner, "43").getByRole("button", { name: "Ready" }).click();
  await expect(guest.getByTestId("loyalty-count")).toHaveText("4/6", LONG);
  await orderCard(owner, "43").getByRole("button", { name: "Cancel" }).click();
  await expect(orderCard(owner, "43").getByTestId("order-state")).toHaveText("Cancelled");
  await expect(guest.getByTestId("order-status")).toHaveText("Cancelled", LONG);
  await expect(guest.getByTestId("loyalty-count")).toHaveText("3/6", LONG);

  // At most three stamps per card per day.
  for (const number of ["44", "45", "46"]) {
    const link = await addOrder(owner, number);
    await guest.goto(link);
    await expect(orderCard(owner, number).getByTestId("order-stamps")).toBeVisible(LONG);
    await orderCard(owner, number).getByRole("button", { name: "Ready" }).click();
    await expect(guest.getByTestId("order-status")).toHaveText("Ready for pickup", LONG);
  }
  await expect(guest.getByTestId("loyalty-count")).toHaveText("5/6", LONG);

  // A full card: staff give the reward on the order and a new round starts.
  await owner.goto("/settings");
  await owner.getByLabel("Stamps needed").fill("5");
  await saveSettings(owner);
  await owner.goto("/");
  await expect(orderCard(owner, "46").getByTestId("order-stamps")).toHaveText("5/5", LONG);
  await orderCard(owner, "46").getByRole("button", { name: "Give reward" }).click();
  await expect(orderCard(owner, "46").getByTestId("order-stamps")).toHaveText("0/5", LONG);
  await expect(guest.getByTestId("loyalty-count")).toHaveText("0/5", LONG);
  expect((await db.prepare("SELECT count(*) AS n FROM rewards").first()).n).toBe(1);
  for (const number of ["44", "45", "46"]) await orderCard(owner, number).getByRole("button", { name: "Done" }).click();

  // The customer's card also shows on the menu.
  await guest.goto("/p/m");
  await expect(guest.getByTestId("loyalty-count")).toHaveText("0/5", LONG);

  // F004: tables and their codes (admin).
  await owner.goto("/tables");
  await owner.getByLabel("Table name").fill("Table 4");
  await owner.getByRole("button", { name: "Add table" }).click();
  const tableRow = owner.getByTestId("table-row").filter({ hasText: "Table 4" });
  await expect(tableRow).toBeVisible();
  const tableLink = await tableRow.getByTestId("table-link").getAttribute("href");
  expect(new URL(tableLink).hostname).toBe(runtime.hostname);
  expect(new URL(tableLink).pathname).toBe("/p/m");
  await owner.getByRole("link", { name: "Print codes" }).click();
  await expect(owner.getByRole("img", { name: "QR code for Table 4" })).toBeVisible(LONG);

  // A customer at the table orders on their phone.
  await guest.goto(tableLink);
  const latteRow = guest.getByTestId("public-item").filter({ hasText: "Café con leche" });
  await latteRow.getByRole("button", { name: "Add Large" }).click();
  await latteRow.getByRole("button", { name: "Add Large" }).click();
  await guest.getByTestId("public-item").filter({ hasText: "Cruasán" }).getByRole("button", { name: "Add" }).click();
  const cart = guest.getByTestId("cart");
  await expect(cart).toContainText("2 × Café con leche (Large)");
  await expect(cart).toContainText("9.90");
  await expect(guest.getByTestId("mode-table")).toHaveAttribute("aria-pressed", "true");
  await expect(guest.getByTestId("mode-table")).toContainText("Table 4");
  await cart.getByLabel("Note").fill("Oat milk in both, please");
  await cart.getByLabel("Your name").fill("Marta");
  await cart.getByRole("button", { name: "Send order" }).click();
  await expect(guest.getByTestId("order-status")).toHaveText("Waiting for the venue to accept", LONG);
  const phoneNumber = (await guest.getByTestId("order-number").textContent()).trim();
  const phoneCard = orderCard(owner, phoneNumber);
  await owner.goto("/");
  await expect(phoneCard.getByTestId("order-state")).toHaveText("New", LONG);
  await expect(phoneCard).toContainText("Marta");
  await expect(phoneCard).toContainText("Table 4");
  await expect(phoneCard).toContainText("2 × Café con leche (Large)");
  await expect(phoneCard).toContainText("Oat milk in both, please");
  await phoneCard.getByRole("button", { name: "Accept" }).click();
  await expect(guest.getByTestId("order-status")).toHaveText("Being prepared", LONG);
  await phoneCard.getByRole("button", { name: "Ready" }).click();
  await expect(guest.getByTestId("order-status")).toHaveText("Ready for pickup", LONG);
  await guest.getByRole("button", { name: "On my way" }).click();
  await expect(phoneCard.getByTestId("order-delivery")).toHaveText("Coming", LONG);

  // Request-level: modes, plate, pause, hours, sold out, reject.
  const menu = await (await runtime.fetch("/p/api/menu")).json();
  const items = menu.sections.flatMap((s) => s.items);
  const cortado = items.find((i) => i.name === "Cortado");
  const croissant = items.find((i) => i.name === "Cruasán");
  const order = (body) => runtime.fetch("/p/api/order", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const base = { name: "Leo", items: [{ itemId: cortado.id, qty: 1 }] };
  expect((await order({ ...base, mode: "car" })).status).toBe(400);
  const carOrder = await order({ ...base, mode: "car", plate: "KL 4021" });
  expect(carOrder.status).toBe(201);
  const carToken = (await carOrder.json()).token;
  expect((await order({ ...base, mode: "collect", items: [{ itemId: cortado.id, qty: 0 }] })).status).toBe(400);
  expect((await order({ ...base, mode: "table", tableCode: "nope" })).status).toBe(400);

  await member.goto("/menu");
  await member.getByRole("switch", { name: "Sold out: Cruasán" }).click();
  await expect(member.getByRole("switch", { name: "Sold out: Cruasán" })).toHaveAttribute("aria-checked", "true");
  expect((await order({ ...base, mode: "collect", items: [{ itemId: croissant.id, qty: 1 }] })).status).toBe(409);

  await owner.goto("/settings");
  await setSwitch(owner, "Deliver to car", false);
  await saveSettings(owner);
  expect((await order({ ...base, mode: "car", plate: "KL 4021" })).status).toBe(409);
  await setSwitch(owner, "Pause ordering", true);
  await saveSettings(owner);
  expect((await order({ ...base, mode: "collect" })).status).toBe(409);
  await guest.goto("/p/m");
  await expect(guest.getByText("Not taking orders right now")).toBeVisible(LONG);
  await setSwitch(owner, "Pause ordering", false);
  const hour = new Date().getUTCHours();
  await owner.getByLabel("Time zone").fill("UTC");
  await owner.getByLabel("Opens").fill(`${String((hour + 2) % 24).padStart(2, "0")}:00`);
  await owner.getByLabel("Closes").fill(`${String((hour + 3) % 24).padStart(2, "0")}:00`);
  await saveSettings(owner);
  expect((await order({ ...base, mode: "collect" })).status).toBe(409);
  await owner.getByLabel("Opens").fill("");
  await owner.getByLabel("Closes").fill("");
  await saveSettings(owner);
  expect((await order({ ...base, mode: "collect" })).status).toBe(201);

  // Staff reject the car order; the customer sees it.
  await guest.goto(`/p/o/${carToken}`);
  await owner.goto("/");
  const carNumber = (await guest.getByTestId("order-number").textContent()).trim();
  await expect(orderCard(owner, carNumber)).toContainText("KL 4021", LONG);
  await orderCard(owner, carNumber).getByRole("button", { name: "Reject" }).click();
  await expect(guest.getByTestId("order-status")).toHaveText("Not accepted", LONG);

  // The board's result, live: a few tickets in each state.
  await addOrder(owner, "51", "Two flat whites");
  await addOrder(owner, "52", "Terrace");
  await orderCard(owner, "52").getByRole("button", { name: "Ready" }).click();
  await expect(orderCard(owner, "52").getByTestId("order-state")).toHaveText("Ready");
  await expect(owner.getByRole("dialog")).toHaveCount(0);
  await runtime.screenshot(owner);
} finally {
  await runtime.close();
}
