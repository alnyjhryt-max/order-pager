# Order Pager

Order Pager rings a customer's phone when their order is ready: staff add an order number, the customer scans its code, and their page alerts them when staff press Ready. It also gives the venue a digital menu, phone ordering and a stamp card.

Inspired by https://pingloy.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Page customers: add an order number, show its QR code, press Ready to ring their phone, and follow sent, delivered, seen and on-the-way on a live board and a customer-facing screen.
- Build a menu of sections and items with sizes, photos, calories, caffeine, allergens and an English name, and mark items sold out until the next day.
- Run a stamp card that customers keep in their browser, stamped on each ready order, with a reward when it's full.
- Take orders from customers' phones for collection, car or table, with hours, a pause switch and staff Accept or Reject.

Left out: accounts and sign-in, which your Gateway handles; plans and billing; several branches; POS integrations and an API; WhatsApp messages; menu import from a photo; wallet passes; reports, review prompts and branding; SMS phone verification; native apps.

## Setup

- Install: `pnpm install`
- Run locally: `pnpm dev`
- Test: `pnpm test` for the unit tests; `checks/` holds the release checks, run with oss.new's runtime.
- Deploy: `pnpm run deploy`. The deploy creates the D1 database and the `files` R2 bucket (R2 must be enabled on the Cloudflare account once).
- `VAPID_PRIVATE_KEY` (secret): signs the notifications that ring customers' phones. The deploy generates it; nothing to set by hand.

Admins of your organization edit the menu, tables and settings; every member can run the board and mark items sold out. Customer pages live under `/p/` and are open to anyone with the link or code.

## Limitations

- The board, screen and customer pages refresh every couple of seconds rather than instantly.
- A notification reaches a phone only after the customer taps "Turn on alerts" and allows it; on iPhone this works only in a browser that supports web push. Otherwise the page rings while it's open.
- Push delivery and real deployment were not exercised by the local checks.
- One install serves one venue, in one time zone.
