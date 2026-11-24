import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "order-pager",
  name: "Order Pager",
  description:
    "Rings customers' phones when their order is ready, with a menu, phone ordering and a stamp card.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    // Orders, the menu, tables, settings and loyalty cards.
    d1: ["DB"],
    // Menu photos.
    r2: ["files"],
  },
  // Customers aren't members: they open their order, the menu and their
  // card from a code. Everything under /p/ checks its own token or serves
  // only what the menu shows.
  public: [{ path: "/p/**", methods: ["GET", "POST"] }],
  // The scripts and styles those pages load.
  publicAssets: ["/assets/**", "/icon.svg"],
  secrets: [
    {
      name: "VAPID_PRIVATE_KEY",
      generate: true,
      why: "Signs the notifications that ring a customer's phone when their order is ready.",
    },
  ],
});
