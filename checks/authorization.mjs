import { randomBytes } from "node:crypto";
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { LONG, addItem, addOrder, addSection, replay, saveSettings, serverFnRequest, setSwitch, orderCard } from "./helpers.mjs";

const runtime = await startRuntime({
  bindings: { VAPID_PRIVATE_KEY: { type: "text", value: randomBytes(32).toString("base64url") } },
});
try {
  // Member pages: anonymous and other organizations are refused.
  await runtime.assertPrivateAccess(["/", "/screen", "/menu", "/settings", "/tables"]);

  // X001: no sign-in of the app's own.
  for (const path of ["/login", "/signin", "/signup", "/register", "/logout", "/p/login"]) {
    const response = await runtime.fetch(path, { role: "owner" });
    expect(response.status, path).toBe(404);
  }
  const owner = await (await runtime.context("owner")).newPage();
  await owner.goto("/");
  await expect(owner.getByLabel("Order number")).toBeVisible();
  await expect(owner.locator('input[type="password"]')).toHaveCount(0);

  // Admin-only: settings, menu building and tables. Capture the owner's
  // own requests, then replay them as a member.
  const db = await runtime.database();
  await owner.goto("/settings");
  await owner.getByLabel("Venue name").fill("Corner Bakery");
  await setSwitch(owner, "Collect at counter", true);
  await setSwitch(owner, "Loyalty card", true);
  const [settingsRequest] = await Promise.all([serverFnRequest(owner), owner.getByRole("button", { name: "Save", exact: true }).click()]);
  await expect(owner.getByText("Settings saved")).toBeVisible();
  await db.prepare("UPDATE settings SET venue_name = 'Kept'").run();
  for (const role of ["member", "outsider", undefined]) {
    const response = await replay(runtime, settingsRequest, role);
    expect(response.status, `settings as ${role}`).toBeGreaterThanOrEqual(400);
  }
  expect((await db.prepare("SELECT venue_name AS v FROM settings").first()).v).toBe("Kept");

  await owner.goto("/menu");
  await addSection(owner, "Breads");
  await owner.getByRole("button", { name: "Add section" }).click();
  await owner.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Soups");
  const [sectionRequest] = await Promise.all([serverFnRequest(owner), owner.getByRole("dialog").getByRole("button", { name: "Save" }).click()]);
  await expect(owner.getByRole("heading", { name: "Soups" })).toBeVisible();
  const sectionsBefore = (await db.prepare("SELECT count(*) AS n FROM menu_sections").first()).n;
  expect((await replay(runtime, sectionRequest, "member")).status).toBeGreaterThanOrEqual(400);
  expect((await db.prepare("SELECT count(*) AS n FROM menu_sections").first()).n).toBe(sectionsBefore);
  await addItem(owner, "Breads", { name: "Sourdough loaf", price: "4.50" });

  // A member sees the menu read-only, but can mark sold out.
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/menu");
  await expect(member.getByText("Sourdough loaf")).toBeVisible();
  await expect(member.getByRole("button", { name: "Add section" })).toHaveCount(0);
  await expect(member.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await member.getByRole("switch", { name: "Sold out: Sourdough loaf" }).click();
  await expect(member.getByRole("switch", { name: "Sold out: Sourdough loaf" })).toHaveAttribute("aria-checked", "true");
  await member.goto("/settings");
  await expect(member.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await member.goto("/tables");
  await expect(member.getByRole("button", { name: "Add table" })).toHaveCount(0);

  await owner.goto("/tables");
  await owner.getByLabel("Table name").fill("Patio 2");
  const [tableRequest] = await Promise.all([serverFnRequest(owner), owner.getByRole("button", { name: "Add table" }).click()]);
  await expect(owner.getByTestId("table-row").filter({ hasText: "Patio 2" })).toBeVisible();
  expect((await replay(runtime, tableRequest, "member")).status).toBeGreaterThanOrEqual(400);
  expect((await db.prepare("SELECT count(*) AS n FROM venue_tables").first()).n).toBe(1);

  // Public routes expose only what they should.
  const menuResponse = await runtime.fetch("/p/api/menu");
  expect(menuResponse.status).toBe(200);
  const menuText = await menuResponse.text();
  expect(menuText).toContain("Sourdough loaf");
  expect(menuText).not.toMatch(/@|user_|userId|createdBy|"code"/);

  await owner.goto("/");
  const linkA = await addOrder(owner, "71", "Ana at the bar");
  const linkB = await addOrder(owner, "72", "Ben by the door");
  const tokenA = new URL(linkA).pathname.split("/").pop();
  const tokenB = new URL(linkB).pathname.split("/").pop();
  const orderA = await runtime.fetch(`/p/api/o/${tokenA}`);
  expect(orderA.status).toBe(200);
  const orderAText = await orderA.text();
  expect(orderAText).toContain("71");
  expect(orderAText).not.toContain("72");
  expect(orderAText).not.toContain("Ben by the door");
  expect(orderAText).not.toMatch(/@|createdBy|userId/);
  expect((await runtime.fetch("/p/api/o/not-a-real-token")).status).toBe(404);
  expect((await runtime.fetch("/p/api/orders")).status).not.toBe(200);

  // A card claims an order once; another card can't take it over.
  const cardA = crypto.randomUUID();
  const cardB = crypto.randomUUID();
  const claim = (token, cardId) => runtime.fetch(`/p/api/o/${token}/claim`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId }),
  });
  expect((await claim(tokenA, cardA)).status).toBe(200);
  await claim(tokenA, cardB);
  await expect(orderCard(owner, "71").getByTestId("order-stamps")).toBeVisible(LONG);
  expect((await db.prepare("SELECT card_id AS c FROM orders WHERE number = '71'").first()).c).toBe(cardA);
  expect((await runtime.fetch(`/p/api/card/${cardB}`)).status).toBe(404);
  const cardAResponse = await (await runtime.fetch(`/p/api/card/${cardA}`)).json();
  expect(cardAResponse.count).toBe(2);

  // Customer actions only touch their own live order.
  await orderCard(owner, "72").getByRole("button", { name: "Cancel" }).click();
  await expect(orderCard(owner, "72").getByTestId("order-state")).toHaveText("Cancelled");
  const coming = await runtime.fetch(`/p/api/o/${tokenB}/coming`, { method: "POST" });
  expect(coming.status).toBe(409);
  expect((await runtime.fetch(`/p/api/o/${tokenA}/coming`, { method: "POST" })).status).toBe(409);
  expect((await db.prepare("SELECT delivery AS d FROM orders WHERE number = '71'").first()).d).toBeNull();

  // Staff actions are server functions: anonymous visitors can't use them.
  await owner.goto("/");
  const [readyRequest] = await Promise.all([serverFnRequest(owner), orderCard(owner, "71").getByRole("button", { name: "Ready" }).click()]);
  await expect(orderCard(owner, "71").getByTestId("order-state")).toHaveText("Ready");
  expect((await replay(runtime, readyRequest, undefined)).status).toBeGreaterThanOrEqual(400);
  expect((await replay(runtime, readyRequest, "outsider")).status).toBeGreaterThanOrEqual(400);
  // Ready again doesn't stamp twice.
  expect((await db.prepare("SELECT count(*) AS n FROM stamps WHERE card_id = ?").bind(cardA).first()).n).toBe(1);
  await replay(runtime, readyRequest, "owner");
  expect((await db.prepare("SELECT count(*) AS n FROM stamps WHERE card_id = ?").bind(cardA).first()).n).toBe(1);

  // An anonymous visitor gets no member page and no sign-in form.
  const anonymousPage = await (await runtime.context(null)).newPage();
  const response = await anonymousPage.goto("/");
  expect(response.status()).toBeGreaterThanOrEqual(400);
  await expect(anonymousPage.locator('input[type="password"]')).toHaveCount(0);

  // App users are keyed by the Gateway id, made on first sight.
  const users = await db.prepare("SELECT id, email FROM users").all();
  expect(users.results.length).toBeGreaterThanOrEqual(2);
  for (const user of users.results) expect(user.email).toContain("@");
} finally {
  await runtime.close();
}
