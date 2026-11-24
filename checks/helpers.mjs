import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC",
  "base64",
);

export const LONG = { timeout: 15000 };

/** Turns a switch on or off, whatever its state. */
export async function setSwitch(page, name, on) {
  const control = page.getByRole("switch", { name, exact: true });
  const checked = (await control.getAttribute("aria-checked")) === "true";
  if (checked !== on) await control.click();
  await expect(control).toHaveAttribute("aria-checked", on ? "true" : "false");
}

export async function saveSettings(page) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/_serverFn/") && r.request().method() === "POST"),
    page.getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  expect(response.ok()).toBe(true);
  await expect(page.getByText("Settings saved").first()).toBeVisible();
}

export async function addSection(page, name, english) {
  await page.getByRole("button", { name: "Add section" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  if (english) await dialog.getByLabel("English name").fill(english);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(section(page, name)).toBeVisible();
}

export function section(page, name) {
  return page.getByTestId("menu-section").filter({ has: page.getByRole("heading", { name, exact: true }) });
}

export function menuItem(page, name) {
  return page.getByTestId("menu-item").filter({ has: page.getByText(name, { exact: true }) });
}

export async function addItem(page, sectionName, item) {
  await section(page, sectionName).getByRole("button", { name: "Add item" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(item.name);
  if (item.english) await dialog.getByLabel("English name").fill(item.english);
  if (item.description) await dialog.getByLabel("Description").fill(item.description);
  await dialog.getByLabel("Price", { exact: true }).fill(item.price);
  for (const [index, size] of (item.sizes ?? []).entries()) {
    await dialog.getByRole("button", { name: "Add size" }).click();
    await dialog.getByLabel(`Size name ${index + 1}`).fill(size.name);
    await dialog.getByLabel(`Size price ${index + 1}`).fill(size.price);
  }
  if (item.calories) await dialog.getByLabel("Calories").fill(item.calories);
  if (item.caffeine) await dialog.getByLabel("Caffeine (mg)").fill(item.caffeine);
  if (item.allergens) await dialog.getByLabel("Allergens").fill(item.allergens);
  if (item.highSalt) await dialog.getByRole("checkbox", { name: "High in salt" }).click();
  if (item.photo) await dialog.getByLabel("Photo").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden(LONG);
  await expect(menuItem(page, item.name)).toBeVisible();
}

export function orderCard(page, number) {
  return page.locator(`[data-testid="order-card"][data-number="${number}"]`);
}

/** Staff adds an order on the board; returns the customer link the ticket shows. */
export async function addOrder(page, number, label) {
  await page.getByLabel("Order number").fill(number);
  if (label) await page.getByLabel("Label").fill(label);
  await page.getByRole("button", { name: "Add order" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img", { name: `QR code for order ${number}` })).toBeVisible(LONG);
  const link = await dialog.getByTestId("ticket-link").getAttribute("href");
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(dialog).toBeHidden();
  await expect(orderCard(page, number)).toBeVisible();
  return link;
}

/** Replays a server-function request a page made, as another role. */
export async function replay(runtime, request, role) {
  const url = new URL(request.url());
  const headers = {};
  for (const [key, value] of Object.entries(await request.allHeaders())) {
    if (["host", "cookie", "content-length", "connection"].includes(key) || key.startsWith(":")) continue;
    headers[key] = value;
  }
  return runtime.fetch(url.pathname + url.search, {
    role,
    method: request.method(),
    headers,
    body: request.method() === "GET" ? undefined : request.postDataBuffer(),
  });
}

export function serverFnRequest(page) {
  return page.waitForRequest((r) => r.url().includes("/_serverFn/") && r.method() === "POST");
}
